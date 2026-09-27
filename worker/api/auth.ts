// Who is calling the API (D-020, D-021). In order:
//   1. `Authorization: Bearer tsk_…`: an API token; the principal is its owner, and the
//      route's scope must be in the token.
//   2. A Cloudflare Access JWT (browser): its email maps to a Tessera user. An
//      administrator may be viewing as someone else (cookie `tessera_view_as`).
//   3. Bootstrap and mock mode: the Night 1 persona cookie (`tessera_user`) is honored
//      when there's no Access identity to map, or the identity matches no user and the
//      institution has no invitations yet, so the first administrator can get in.
import { ApiError, type Route } from '../../shared/api';
import type { ApiToken, User } from '../../shared/domain';
import type { Repo } from '../../shared/repo';
import { hasScope, hashSecret, isExpired, looksLikeToken } from '../../shared/tokens';
import { verifyAccessJwt } from '../access';
import type { Env } from '../env';

export interface Principal {
  user: User | null;
  token: ApiToken | null;
  /** The Access identity's email, when there is one. */
  email: string | null;
  /** The administrator behind a "view as" session. */
  actingAs: User | null;
  /** The key for rate limiting: the token id, else the user id, else the client IP. */
  rateKey: string;
}

export function bearerToken(request: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec((request.headers.get('authorization') ?? '').trim());
  return m && looksLikeToken(m[1]) ? m[1] : null;
}

/** Whether the request carries any Access credential at all (checked before touching the database). */
export function hasAccessCredential(request: Request): boolean {
  if (request.headers.get('cf-access-jwt-assertion')) return true;
  return readCookie(request.headers.get('cookie'), 'CF_Authorization') !== null;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
  return null;
}

export async function resolvePrincipal(request: Request, env: Env, repo: Repo, route: Route, now: string): Promise<Principal> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'anon';
  const cookies = request.headers.get('cookie');

  // 1. API token
  const secret = bearerToken(request);
  if (secret) {
    const token = await repo.getApiTokenByHash(await hashSecret(secret));
    if (!token || isExpired(token, now)) throw new ApiError('unauthenticated', 'This API token is invalid, expired, or revoked.');
    if (route.browserOnly) throw new ApiError('forbidden', 'Session and demo operations can\'t be called with an API token.');
    if (!hasScope(token, route.scope)) throw new ApiError('forbidden', `This token doesn't have the ${route.scope} scope.`);
    const owner = await repo.getUser(token.ownerId);
    if (!owner) throw new ApiError('unauthenticated', 'The token\'s owner no longer exists.');
    if (!token.lastUsedAt || Date.parse(now) - Date.parse(token.lastUsedAt) > 60_000) await repo.touchApiToken(token.id, now);
    return { user: owner, token, email: null, actingAs: null, rateKey: `tok:${token.id}` };
  }

  // 2. Access identity
  let email: string | null = null;
  if (env.ENVIRONMENT !== 'local') {
    const access = await verifyAccessJwt(request, env);
    if (!access) throw new ApiError('unauthenticated', 'Sign in through Cloudflare Access, or send an API token.');
    email = access.email.toLowerCase();
  }
  const identified = email ? await repo.findUserByEmail(email) : null;

  // 3. Persona cookie: mock/local, or bootstrap before anyone is invited.
  const personaId = readCookie(cookies, 'tessera_user');
  const bootstrap = !identified && (env.ENVIRONMENT === 'local' || !(await repo.hasInvitations()));
  let user: User | null = identified;
  if (!user && bootstrap && personaId) user = await repo.getUser(personaId);

  // Administrators may view as another user.
  let actingAs: User | null = null;
  const viewAsId = readCookie(cookies, 'tessera_view_as');
  if (user && user.role === 'administrator' && viewAsId && viewAsId !== user.id) {
    const target = await repo.getUser(viewAsId);
    if (target) { actingAs = user; user = target; }
  }

  return { user, token: null, email, actingAs, rateKey: user ? `user:${user.id}` : `ip:${ip}` };
}

/** A sliding window of `limit` requests per `windowMs`, per key, kept in isolate memory. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limit = 300, private windowMs = 60_000) {}
  /** Seconds to wait, or 0 when allowed. */
  check(key: string, now = Date.now()): number {
    const from = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > from);
    if (list.length >= this.limit) { this.hits.set(key, list); return Math.max(1, Math.ceil((list[0] + this.windowMs - now) / 1000)); }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.hits.clear();
    return 0;
  }
}

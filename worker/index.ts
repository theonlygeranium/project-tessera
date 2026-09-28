// Tessera Worker (D-014, D-020): /api/v1/* is the JSON API (/api/* is an alias during
// Night 2), /app/* is the React app, and every other path is a static asset.
import { createAiClient } from './ai';
import { createDocumentEngine } from './access/engine';
import { RateLimiter, bearerToken, hasAccessCredential, readCookie, resolvePrincipal } from './api/auth';
import { findFileRoute } from './api/files';
import { D1Repo } from './d1-repo';
import type { Env } from './env';
import { API_PREFIX, ApiError, ROUTES, matchPath, type Operation, type SessionInfo } from '../shared/api';
import type { Repo } from '../shared/repo';
import { seedData } from '../shared/seed';
import { dispatch, service, type ServiceContext } from '../shared/service';
import { coerceQuery, validateInput } from '../shared/schema';

const SESSION_COOKIE = 'tessera_user';
const VIEW_AS_COOKIE = 'tessera_view_as';
/** 30 days. */
const SESSION_MAX_AGE = 2592000;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const rateLimiter = new RateLimiter(300, 60_000);

// One seed check per database object. An isolate has a single D1 binding;
// keying by that object also lets tests use a fresh database each time.
const seeding = new WeakMap<object, Promise<void>>();

function ensureSeeded(db: D1Database, repo: Repo): Promise<void> {
  const existing = seeding.get(db);
  if (existing) return existing;
  const promise = (async () => {
    if (await repo.isEmpty()) await repo.reset(seedData());
  })().catch((error: unknown) => {
    seeding.delete(db);
    throw error;
  });
  seeding.set(db, promise);
  return promise;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return handleApi(request, env);
    if (url.pathname === '/app' || url.pathname.startsWith('/app/')) return handleApp(request, env);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

// Durable Object classes must be exported from the main module.
export { OcrContainer } from './ocr';

/** Strips the version prefix (or the unversioned alias) from an API path. */
export function apiRelativePath(pathname: string): string {
  const rel = pathname.startsWith(API_PREFIX) ? pathname.slice(API_PREFIX.length) : pathname.replace(/^\/api/, '');
  return rel === '' ? '/' : rel;
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  const withId = (res: Response) => { res.headers.set('x-request-id', requestId); return res; };
  try {
    // Reject anonymous production traffic before touching the database.
    if (env.ENVIRONMENT !== 'local' && !bearerToken(request) && !hasAccessCredential(request)) {
      return withId(fail(401, 'unauthenticated', 'Sign in through Cloudflare Access, or send an API token.'));
    }
    const repo = new D1Repo(env.DB);
    await ensureSeeded(env.DB, repo);

    const url = new URL(request.url);
    const rel = apiRelativePath(url.pathname);
    const fileRoute = findFileRoute(request.method, rel);
    const found = fileRoute ? null : findRoute(request.method, rel);
    if (!found && !fileRoute) return withId(fail(404, 'not-found', `No route matches ${request.method} ${url.pathname}.`));
    const now = new Date().toISOString();

    const principal = await resolvePrincipal(request, env, repo, fileRoute ? fileRoute.route : ROUTES[found!.op], now);
    const wait = rateLimiter.check(principal.rateKey);
    if (wait > 0) {
      const res = fail(429, 'rate-limited', `Too many requests. Try again in ${wait} seconds.`);
      res.headers.set('retry-after', String(wait));
      return withId(res);
    }
    const ctx: ServiceContext = {
      repo,
      ai: createAiClient(env),
      user: principal.user,
      token: principal.token,
      now: () => new Date().toISOString(),
      newId: (prefix) => prefix + '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
      documents: createDocumentEngine(env),
    };

    // Idempotent creates (D-020): the same key from the same principal replays the first response.
    const idempotencyKey = request.method === 'POST' ? request.headers.get('idempotency-key') : null;
    const idemPrincipal = principal.token ? `tok:${principal.token.id}` : principal.user ? `user:${principal.user.id}` : null;
    if (idempotencyKey && idemPrincipal) {
      const replay = await env.DB.prepare('SELECT status, body, created_at FROM idempotency_keys WHERE key = ? AND principal = ?').bind(idempotencyKey, idemPrincipal).first<{ status: number; body: string; created_at: string }>();
      if (replay && Date.now() - Date.parse(replay.created_at) < IDEMPOTENCY_TTL_MS) {
        return withId(json(JSON.parse(replay.body), replay.status, new Headers({ 'idempotency-replayed': 'true' })));
      }
    }

    // Binary file routes (upload, content) answer directly; a successful upload is stored
    // for replay like any other create.
    if (fileRoute) {
      if (!principal.user) throw new ApiError('unauthenticated', 'Sign in first.');
      const res = await fileRoute.handle(request, ctx, env.FILES, fileRoute.params);
      if (idempotencyKey && idemPrincipal && res.status === 201) {
        const body = await res.clone().text();
        await env.DB.prepare('INSERT OR REPLACE INTO idempotency_keys (key, principal, status, body, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(idempotencyKey, idemPrincipal, 201, body, now).run();
      }
      return withId(res);
    }
    if (!found) throw new ApiError('not-found', 'No route matches.');

    const input = validateInput(found.op, coerceQuery(found.op, await readInput(request, found.params)));
    let output: unknown;
    if (found.op === 'whoAmI') {
      output = { email: principal.email, user: principal.user, viewingAs: principal.actingAs ? principal.user : null };
    } else {
      output = await dispatch(service, ctx, found.op, input as never);
    }

    const headers = new Headers();
    if (found.op === 'signIn') {
      const signedIn = (output as SessionInfo).user;
      if (signedIn) headers.set('set-cookie', sessionCookie(SESSION_COOKIE, signedIn.id, env, SESSION_MAX_AGE));
    } else if (found.op === 'signOut') {
      headers.append('set-cookie', sessionCookie(SESSION_COOKIE, '', env, 0));
      headers.append('set-cookie', sessionCookie(VIEW_AS_COOKIE, '', env, 0));
    } else if (found.op === 'viewAs') {
      const target = (input as { userId?: string | null }).userId;
      headers.set('set-cookie', sessionCookie(VIEW_AS_COOKIE, target ?? '', env, target ? SESSION_MAX_AGE : 0));
    }
    if (idempotencyKey && idemPrincipal) {
      await env.DB.prepare('INSERT OR REPLACE INTO idempotency_keys (key, principal, status, body, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(idempotencyKey, idemPrincipal, 200, JSON.stringify(output), now).run();
    }
    return withId(json(output, 200, headers));
  } catch (error) {
    if (error instanceof ApiError) return withId(fail(error.status, error.code, error.message, error.details));
    console.error(requestId, error);
    return withId(fail(500, 'internal', 'Something went wrong.'));
  }
}

async function handleApp(request: Request, env: Env): Promise<Response> {
  const asset = await env.ASSETS.fetch(request);
  const accept = request.headers.get('accept') ?? '';
  if (asset.status !== 404 || request.method !== 'GET' || !accept.toLowerCase().includes('text/html')) return asset;
  // Fetch the app's entry as `/app/`: with html_handling "auto-trailing-slash" the
  // assets binding answers `/app/index.html` with a redirect whose body is empty.
  const index = await env.ASSETS.fetch(new Request(new URL('/app/', request.url), { headers: request.headers }));
  if (!index.ok) return index;
  return new Response(index.body, { status: 200, headers: new Headers(index.headers) });
}

function findRoute(method: string, relPath: string): { op: Operation; params: Record<string, string> } | null {
  for (const op of Object.keys(ROUTES) as Operation[]) {
    const route = ROUTES[op];
    if (route.method !== method) continue;
    const params = matchPath(route.path, relPath);
    if (params) return { op, params };
  }
  return null;
}

async function readInput(request: Request, params: Record<string, string>): Promise<Record<string, unknown>> {
  if (request.method === 'GET' || request.method === 'DELETE') {
    const query: Record<string, string> = {};
    new URL(request.url).searchParams.forEach((value, key) => {
      query[key] = value;
    });
    return { ...query, ...params };
  }
  const text = await request.text();
  if (text.trim() === '') return { ...params };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError('invalid', 'Request body is not valid JSON.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError('invalid', 'Request body must be a JSON object.');
  }
  return { ...(parsed as Record<string, unknown>), ...params };
}

function json(body: unknown, status: number, headers = new Headers()): Response {
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}

function fail(status: number, code: string, message: string, details?: unknown): Response {
  const error: { code: string; message: string; details?: unknown } = { code, message };
  if (details !== undefined) error.details = details;
  return json({ error }, status);
}

function sessionCookie(name: string, value: string, env: Env, maxAge: number): string {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (env.ENVIRONMENT !== 'local') parts.push('Secure');
  return parts.join('; ');
}

export { readCookie };

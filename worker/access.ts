// Cloudflare Access JWT check (D-014). No npm dependencies: RS256 via WebCrypto.
// Certs are cached per isolate for 10 minutes; a kid miss refetches once.
import type { Env } from './env';

const KEY_TTL_MS = 10 * 60 * 1000;
const LEEWAY_SECONDS = 60;

interface AccessJwk extends JsonWebKey {
  kid?: string;
}

interface KeyCache {
  url: string;
  fetchedAt: number;
  keys: Map<string, AccessJwk>;
}

let cache: KeyCache | null = null;

export function clearAccessKeyCache(): void {
  cache = null;
}

export type AccessEnv = Pick<Env, 'ACCESS_TEAM_DOMAIN' | 'ACCESS_AUD'>;

/** The Access identity, or null when the token is missing or does not check out. */
export async function verifyAccessJwt(request: Request, env: AccessEnv): Promise<{ email: string } | null> {
  try {
    return await verify(request, env);
  } catch (error) {
    console.error('Access JWT verification failed', error);
    return null;
  }
}

async function verify(request: Request, env: AccessEnv): Promise<{ email: string } | null> {
  const token = accessToken(request);
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  if (!headerPart || !payloadPart || !signaturePart) return null;

  let header: unknown;
  let payload: unknown;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    header = decodeJson(headerPart);
    payload = decodeJson(payloadPart);
    signature = bytesOf(signaturePart);
  } catch {
    return null;
  }
  if (!isRecord(header) || !isRecord(payload)) return null;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid === '') return null;

  const jwk = await keyFor(env, header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    signature,
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) return null;
  if (!audienceAllows(payload.aud, env.ACCESS_AUD)) return null;
  if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
  if (!fresh(payload)) return null;
  if (typeof payload.email !== 'string' || payload.email === '') return null;
  return { email: payload.email };
}

function accessToken(request: Request): string | null {
  const header = request.headers.get('cf-access-jwt-assertion');
  if (header && header.trim()) return header.trim();
  return readCookie(request.headers.get('cookie'), 'CF_Authorization');
}

async function keyFor(env: AccessEnv, kid: string): Promise<AccessJwk | null> {
  let keys = await loadKeys(env, false);
  if (!keys.has(kid)) keys = await loadKeys(env, true);
  return keys.get(kid) ?? null;
}

async function loadKeys(env: AccessEnv, force: boolean): Promise<Map<string, AccessJwk>> {
  const url = `https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
  if (!force && cache && cache.url === url && Date.now() - cache.fetchedAt < KEY_TTL_MS) return cache.keys;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cloudflare Access certs responded ${response.status}`);
  const body = (await response.json()) as { keys?: AccessJwk[] };
  const keys = new Map<string, AccessJwk>();
  for (const key of body.keys ?? []) {
    if (key && typeof key.kid === 'string') keys.set(key.kid, key);
  }
  cache = { url, fetchedAt: Date.now(), keys };
  return keys;
}

function audienceAllows(aud: unknown, expected: string): boolean {
  if (typeof aud === 'string') return aud === expected;
  return Array.isArray(aud) && aud.some((value) => value === expected);
}

function fresh(payload: Record<string, unknown>): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return false;
  if (payload.exp < now - LEEWAY_SECONDS) return false;
  if (payload.nbf == null) return true;
  return typeof payload.nbf === 'number' && Number.isFinite(payload.nbf) && payload.nbf <= now + LEEWAY_SECONDS;
}

function decodeJson(segment: string): unknown {
  return JSON.parse(new TextDecoder().decode(bytesOf(segment)));
}

function bytesOf(segment: string): Uint8Array<ArrayBuffer> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (segment.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

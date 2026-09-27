import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAccessKeyCache, verifyAccessJwt, type AccessEnv } from './access';
import { createTestKey, signJwt, tamper } from './test/jwt';

const DOMAIN = 'team.test.cloudflareaccess.com';
const AUD = 'aud-test';
const env: AccessEnv = { ACCESS_TEAM_DOMAIN: DOMAIN, ACCESS_AUD: AUD };

let key: Awaited<ReturnType<typeof createTestKey>>;
let fetchCalls = 0;

function claims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { aud: AUD, iss: `https://${DOMAIN}`, exp: now + 3600, email: 'jeff@jgeronimo.com', ...overrides };
}

function request(headers: Record<string, string> = {}) {
  return new Request('https://tessera.example/api/session', { headers });
}

beforeAll(async () => {
  key = await createTestKey('key-1');
});

beforeEach(() => {
  clearAccessKeyCache();
  fetchCalls = 0;
  vi.stubGlobal('fetch', async (url: string) => {
    fetchCalls += 1;
    expect(String(url)).toBe(`https://${DOMAIN}/cdn-cgi/access/certs`);
    return new Response(JSON.stringify({ keys: [key.jwk] }), { status: 200 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verifyAccessJwt', () => {
  it('accepts a valid token and caches the certs', async () => {
    const token = await signJwt(key.privateKey, key.kid, claims());
    const headers = { 'cf-access-jwt-assertion': token };
    expect(await verifyAccessJwt(request(headers), env)).toEqual({ email: 'jeff@jgeronimo.com' });
    expect(await verifyAccessJwt(request(headers), env)).toEqual({ email: 'jeff@jgeronimo.com' });
    expect(fetchCalls).toBe(1);
  });

  it('accepts an audience array that includes the app', async () => {
    const token = await signJwt(key.privateKey, key.kid, claims({ aud: ['someone-else', AUD] }));
    expect(await verifyAccessJwt(request({ 'cf-access-jwt-assertion': token }), env)).toEqual({ email: 'jeff@jgeronimo.com' });
  });

  it('rejects a wrong audience', async () => {
    const token = await signJwt(key.privateKey, key.kid, claims({ aud: 'not-the-app' }));
    expect(await verifyAccessJwt(request({ 'cf-access-jwt-assertion': token }), env)).toBeNull();
  });

  it('rejects an expired token and allows one inside the leeway', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = await signJwt(key.privateKey, key.kid, claims({ exp: now - 120 }));
    const recent = await signJwt(key.privateKey, key.kid, claims({ exp: now - 30 }));
    expect(await verifyAccessJwt(request({ 'cf-access-jwt-assertion': expired }), env)).toBeNull();
    expect(await verifyAccessJwt(request({ 'cf-access-jwt-assertion': recent }), env)).toEqual({ email: 'jeff@jgeronimo.com' });
  });

  it('rejects a token that is not valid yet', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(key.privateKey, key.kid, claims({ nbf: now + 120 }));
    expect(await verifyAccessJwt(request({ 'cf-access-jwt-assertion': token }), env)).toBeNull();
  });

  it('rejects a bad signature', async () => {
    const token = tamper(await signJwt(key.privateKey, key.kid, claims()));
    expect(await verifyAccessJwt(request({ 'cf-access-jwt-assertion': token }), env)).toBeNull();
  });

  it('rejects a missing token without fetching certs', async () => {
    expect(await verifyAccessJwt(request(), env)).toBeNull();
    expect(fetchCalls).toBe(0);
  });

  it('falls back to the CF_Authorization cookie', async () => {
    const token = await signJwt(key.privateKey, key.kid, claims());
    const response = await verifyAccessJwt(request({ cookie: `theme=light; CF_Authorization=${token}; other=1` }), env);
    expect(response).toEqual({ email: 'jeff@jgeronimo.com' });
  });

  it('rejects a token from the wrong team', async () => {
    const token = await signJwt(key.privateKey, key.kid, claims({ iss: 'https://other.cloudflareaccess.com' }));
    expect(await verifyAccessJwt(request({ 'cf-access-jwt-assertion': token }), env)).toBeNull();
  });

  it('refetches certs once when the key id is not cached', async () => {
    const other = await createTestKey('key-2');
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      const keys = calls === 1 ? [key.jwk] : [key.jwk, other.jwk];
      return new Response(JSON.stringify({ keys }), { status: 200 });
    });
    const token = await signJwt(other.privateKey, other.kid, claims());
    expect(await verifyAccessJwt(request({ 'cf-access-jwt-assertion': token }), env)).toEqual({ email: 'jeff@jgeronimo.com' });
    expect(calls).toBe(2);
  });
});

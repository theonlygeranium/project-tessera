import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../index';
import { D1Repo } from '../d1-repo';
import { createTestDb } from '../test/d1-shim';
import { seedData } from '../../shared/seed';
import { MemoryRepo } from '../../shared/service/memory-repo';
import { resolveLtiUser } from '../../shared/service/interop/identity';
import { findAsciiUserByEmail } from '../../shared/service/interop/ascii-email';
import { clearAccessKeyCache } from '../access';
import { createTestKey, signJwt } from '../test/jwt';

const DOMAIN = 'ascii-collision.cloudflareaccess.com', AUD = 'ascii-collision-aud';
const env = (db: ReturnType<typeof createTestDb>) => ({ DB: db, ASSETS: { fetch: async () => new Response('missing', { status: 404 }) }, ENVIRONMENT: 'production' as const, ACCESS_TEAM_DOMAIN: DOMAIN, ACCESS_AUD: AUD, OWNER_EMAILS: 'owner@meridian.edu' });
const call = (e: ReturnType<typeof env>, path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://tessera.example${path}`, init), e as never, {} as never);
let key: Awaited<ReturnType<typeof createTestKey>>;
beforeAll(async () => { key = await createTestKey('ascii-collision'); });
afterEach(() => { vi.unstubAllGlobals(); clearAccessKeyCache(); });
async function jwt(email: string) {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ keys: [key.jwk] }), { status: 200 }));
  return signJwt(key.privateKey, key.kid, { aud: AUD, iss: `https://${DOMAIN}`, exp: Math.floor(Date.now() / 1000) + 3600, email });
}

describe('Rejecting the first lookup hit can hide a legitimate ASCII account', () => {
  it('finds the ASCII account after a Unicode collision on both repos', async () => {
    const unicode = { id: 'u-kate-unicode', name: 'Kelvin Kate', email: 'Kate@meridian.edu', role: 'instructor' as const, initials: 'KK', profile: null };
    const ascii = { id: 'u-kate-ascii', name: 'Kate', email: 'kate@meridian.edu', role: 'student' as const, initials: 'K', profile: null };
    for (const repo of [new MemoryRepo(seedData()), (() => { const r = new D1Repo(createTestDb() as never); return r; })()]) {
      if (repo instanceof D1Repo) await repo.reset(seedData());
      await repo.putUser(unicode);
      await repo.putUser(ascii);
      expect(await findAsciiUserByEmail(repo, 'KATE@MERIDIAN.EDU')).toMatchObject({ id: 'u-kate-ascii' });
      let n = 0;
      const suggestion = await resolveLtiUser({ repo, now: () => '2026-09-28T00:00:00.000Z', newId: (p) => `${p}-${++n}` }, { platformId: 'p', sub: `s-${repo.constructor.name}`, email: 'KATE@MERIDIAN.EDU', roles: [] });
      expect(suggestion.suggestion?.targetUserId).toBe('u-kate-ascii');
    }
  });

  it('Access JWT for the ASCII email authenticates that user despite an earlier Unicode collision', async () => {
    const db = createTestDb(), repo = new D1Repo(db as never);
    await repo.reset(seedData());
    await repo.putUser({ id: 'u-kate-unicode', name: 'Kelvin Kate', email: 'Kate@meridian.edu', role: 'instructor', initials: 'KK', profile: null });
    await repo.putUser({ id: 'u-kate-ascii', name: 'Kate', email: 'kate@meridian.edu', role: 'student', initials: 'K', profile: null });
    const e = env(db);
    const token = await jwt('KATE@MERIDIAN.EDU');
    const res = await call(e, '/api/v1/me', { headers: { 'cf-access-jwt-assertion': token } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { id: string } }).user.id).toBe('u-kate-ascii');
  });
});

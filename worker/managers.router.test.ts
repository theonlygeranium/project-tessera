import { describe, expect, it } from 'vitest';
import { SEED_NOW } from '../shared/seed';
import { hashSecret } from '../shared/tokens';
import { D1Repo } from './d1-repo';
import worker from './index';
import { createTestDb } from './test/d1-shim';

function envFor(db: object) {
  return { DB: db, ASSETS: { fetch: async () => new Response('missing', { status: 404 }) }, ENVIRONMENT: 'local', ACCESS_TEAM_DOMAIN: 'team.test.cloudflareaccess.com', ACCESS_AUD: 'aud-test', OWNER_EMAILS: 'jeff@jgeronimo.com' };
}
const call = (env: object, path: string, init: RequestInit = {}) => worker.fetch(new Request(`http://localhost${path}`, init), env as never, {} as never);

describe('manager view token scope', () => {
  it('refuses a token without people:read, refuses a token opting someone in, and allows a browser session or a token that has people:read', async () => {
    const db = createTestDb();
    const env = envFor(db);
    await call(env, '/api/v1/session');
    const repo = new D1Repo(db as never);
    const narrow = 'tsk_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const reader = 'tsk_cccccccccccccccccccccccccccccccccccccccc';
    await repo.putApiToken({ id: 'tok-narrow', name: 'narrow', prefix: 'tsk_bbbb', scopes: ['courses:read'], ownerId: 'u-sam', createdAt: SEED_NOW, expiresAt: null, lastUsedAt: null, revokedAt: null, hash: await hashSecret(narrow) });
    await repo.putApiToken({ id: 'tok-people', name: 'people', prefix: 'tsk_cccc', scopes: ['people:read'], ownerId: 'u-sam', createdAt: SEED_NOW, expiresAt: null, lastUsedAt: null, revokedAt: null, hash: await hashSecret(reader) });
    const denied = await call(env, '/api/v1/me/team', { headers: { authorization: `Bearer ${narrow}` } });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: { code: 'forbidden' } });
    const opted = await call(env, '/api/v1/me/visibility/u-sam', { method: 'PUT', headers: { authorization: `Bearer ${reader}`, 'content-type': 'application/json' }, body: JSON.stringify({ sharing: true }) });
    expect(opted.status).toBe(403);
    const allowed = await call(env, '/api/v1/me/team', { headers: { authorization: `Bearer ${reader}` } });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ rows: [], notSharingCount: 1 });
    const browser = await call(env, '/api/v1/me/team', { headers: { cookie: 'tessera_user=u-sam' } });
    expect(browser.status).toBe(200);
    expect(await browser.json()).toEqual({ rows: [], notSharingCount: 1 });
  });
});

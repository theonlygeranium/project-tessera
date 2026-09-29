import { describe, expect, it } from 'vitest';
import worker, { apiRelativePath } from '../index';
import { createTestDb } from '../test/d1-shim';
import { RateLimiter } from './auth';

const env = (db: object, environment: 'local' | 'production' = 'local') => ({
  DB: db,
  ASSETS: { fetch: async () => new Response('missing', { status: 404 }) },
  ENVIRONMENT: environment,
  ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
  ACCESS_AUD: 'aud',
});
const call = (e: ReturnType<typeof env>, path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(`http://localhost${path}`, init), e as never, {} as never);
const admin = { cookie: 'tessera_user=u-admin' };
const json = (body: unknown) => ({ 'content-type': 'application/json' });

describe('API paths (D-020)', () => {
  it('strips the version prefix and the unversioned alias', () => {
    expect(apiRelativePath('/api/v1/courses/x')).toBe('/courses/x');
    expect(apiRelativePath('/api/courses/x')).toBe('/courses/x');
    expect(apiRelativePath('/api/v1')).toBe('/');
  });

  it('serves the same route at /api/v1 and /api, with a request id', async () => {
    const e = env(createTestDb());
    const a = await call(e, '/api/v1/session');
    const b = await call(e, '/api/session');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('API tokens (D-020)', () => {
  async function createToken(e: ReturnType<typeof env>, scopes: string[], extra: Record<string, unknown> = {}) {
    const res = await call(e, '/api/v1/tokens', { method: 'POST', headers: { ...admin, ...json({}) }, body: JSON.stringify({ name: 'CI', scopes, ...extra }) });
    expect(res.status).toBe(200);
    return (await res.json()) as { token: { id: string; prefix: string }; secret: string };
  }

  it('creates a token whose secret is shown once and never stored', async () => {
    const e = env(createTestDb());
    const { token, secret } = await createToken(e, ['courses:read']);
    expect(secret).toMatch(/^tsk_[A-Za-z0-9]{40}$/);
    expect(token.prefix).toBe(secret.slice(4, 12));
    const list = await (await call(e, '/api/v1/tokens', { headers: admin })).json() as { id: string }[];
    expect(list.map((t) => t.id)).toEqual([token.id]);
    expect(JSON.stringify(list)).not.toContain(secret);
  });

  it('authenticates a token as its owner, in production, without an Access session', async () => {
    const local = env(createTestDb());
    const { secret } = await createToken(local, ['courses:read']);
    const prod = { ...local, ENVIRONMENT: 'production' as const };
    const denied = await call(prod, '/api/v1/courses');
    expect(denied.status).toBe(401);
    const ok = await call(prod, '/api/v1/courses', { headers: { authorization: `Bearer ${secret}` } });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as unknown[]).length).toBe(3);
  });

  it('enforces scopes, revocation, and expiry', async () => {
    const e = env(createTestDb());
    const { token, secret } = await createToken(e, ['courses:read']);
    const write = await call(e, '/api/v1/courses', { method: 'POST', headers: { authorization: `Bearer ${secret}`, ...json({}) }, body: JSON.stringify({ code: 'X 1', title: 'X', term: 'Now' }) });
    expect(write.status).toBe(403);
    expect(((await write.json()) as { error: { message: string } }).error.message).toContain('courses:write');

    const revoke = await call(e, `/api/v1/tokens/${token.id}`, { method: 'DELETE', headers: admin });
    expect(revoke.status).toBe(200);
    const after = await call(e, '/api/v1/courses', { headers: { authorization: `Bearer ${secret}` } });
    expect(after.status).toBe(401);

    const expired = await createToken(e, ['courses:read'], { expiresInDays: 1 });
    // Simulate time passing by rewriting the expiry in the database.
    await (e.DB as unknown as { prepare(sql: string): { bind(...a: unknown[]): { run(): Promise<unknown> } } })
      .prepare('UPDATE api_tokens SET expires_at = ? WHERE id = ?').bind('2000-01-01T00:00:00.000Z', expired.token.id).run();
    expect((await call(e, '/api/v1/courses', { headers: { authorization: `Bearer ${expired.secret}` } })).status).toBe(401);
  });

  it('refuses to manage tokens with a token, and bad secrets never match', async () => {
    const e = env(createTestDb());
    const { secret } = await createToken(e, ['people:read']);
    const viaToken = await call(e, '/api/v1/tokens', { headers: { authorization: `Bearer ${secret}` } });
    expect(viaToken.status).toBe(403);
    const fake = await call(e, '/api/v1/courses', { headers: { authorization: 'Bearer tsk_' + 'A'.repeat(40) } });
    expect(fake.status).toBe(401);
  });

  it('replays an idempotent create', async () => {
    const e = env(createTestDb());
    const { secret } = await createToken(e, ['people:write', 'people:read']);
    const headers = { authorization: `Bearer ${secret}`, 'idempotency-key': 'abc-1', ...json({}) };
    const body = JSON.stringify({ name: 'Data Learner', email: 'data.learner@example.test', role: 'student' });
    const first = await call(e, '/api/v1/users', { method: 'POST', headers, body });
    const second = await call(e, '/api/v1/users', { method: 'POST', headers, body });
    expect(first.status).toBe(200);
    expect(second.headers.get('idempotency-replayed')).toBe('true');
    expect(await second.json()).toEqual(await first.json());
    const list = (await (await call(e, '/api/v1/users', { headers: { authorization: `Bearer ${secret}` } })).json()) as { email: string }[];
    expect(list.filter((u) => u.email === 'data.learner@example.test')).toHaveLength(1);
  });
});

describe('View as (D-021)', () => {
  it('lets an administrator act as another user and records who is behind it', async () => {
    const e = env(createTestDb());
    const res = await call(e, '/api/v1/me', { headers: { cookie: 'tessera_user=u-admin; tessera_view_as=u-priya' } });
    const me = (await res.json()) as { user: { id: string }; viewingAs: { id: string } | null };
    expect(me.user.id).toBe('u-priya');
    expect(me.viewingAs?.id).toBe('u-priya');
    const student = await call(e, '/api/v1/me', { headers: { cookie: 'tessera_user=u-priya; tessera_view_as=u-admin' } });
    expect(((await student.json()) as { user: { id: string } }).user.id).toBe('u-priya');
  });
});

describe('RateLimiter', () => {
  it('allows the limit, then asks to wait', () => {
    const rl = new RateLimiter(3, 1000);
    expect([rl.check('k', 0), rl.check('k', 1), rl.check('k', 2)]).toEqual([0, 0, 0]);
    expect(rl.check('k', 3)).toBeGreaterThan(0);
    expect(rl.check('k', 1001)).toBe(0);
    expect(rl.check('other', 3)).toBe(0);
  });
});

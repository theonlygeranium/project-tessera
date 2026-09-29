// Orchestrator adversarial probes for the tool-session credential and identity v2 (D-045, D-046, D-048, D-052).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../index';
import { D1Repo } from '../d1-repo';
import { createTestDb } from '../test/d1-shim';
import { seedData } from '../../shared/seed';
import { MemoryRepo } from '../../shared/service/memory-repo';
import { mintToolSession, verifyToolSession } from '../../shared/service/interop/tool-sessions';
import { resolveLtiUser } from '../../shared/service/interop/identity';
import { jitProvisionAccessUser } from '../../shared/service/interop/sso';
import { clearAccessKeyCache } from '../access';
import { createTestKey, signJwt } from '../test/jwt';

const DOMAIN = 'probe.cloudflareaccess.com', AUD = 'probe-aud';
const env = (db: ReturnType<typeof createTestDb>) => ({ DB: db, ASSETS: { fetch: async () => new Response('missing', { status: 404 }) }, ENVIRONMENT: 'production' as const, ACCESS_TEAM_DOMAIN: DOMAIN, ACCESS_AUD: AUD, OWNER_EMAILS: 'owner@meridian.edu' });
const call = (e: ReturnType<typeof env>, path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://tessera.example${path}`, init), e as never, {} as never);
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
const jsonBody = (t: string, method: string, body: unknown) => ({ method, headers: { ...bearer(t), 'content-type': 'application/json' }, body: JSON.stringify(body) });
async function setup(userId = 'u-priya', role: 'student' | 'instructor' = 'student', courseId = 'c-stat110') {
  const db = createTestDb(), repo = new D1Repo(db as never);
  await repo.reset(seedData());
  const deps = { repo, now: () => new Date().toISOString(), newId: (p: string) => `${p}-${crypto.randomUUID()}` };
  const minted = await mintToolSession(deps, { userId, courseId, role, platformId: 'p', contextId: 'ctx' });
  return { e: env(db), repo, deps, ...minted };
}
let key: Awaited<ReturnType<typeof createTestKey>>;
beforeAll(async () => { key = await createTestKey('probe-key'); });
afterEach(() => { vi.unstubAllGlobals(); clearAccessKeyCache(); });
async function jwt(email: string) {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ keys: [key.jwk] }), { status: 200 }));
  return signJwt(key.privateKey, key.kid, { aud: AUD, iss: `https://${DOMAIN}`, exp: Math.floor(Date.now() / 1000) + 3600, email });
}

describe('probe: tool session scope and escalation', () => {
  it('student session cannot use instructor writes in its own course', async () => {
    const { e, token } = await setup();
    expect((await call(e, '/api/v1/lessons/l-stat-1/blocks', jsonBody(token, 'PUT', { blocks: [] }))).status).toBe(403);
    expect((await call(e, '/api/v1/lessons/l-stat-1/publish', jsonBody(token, 'POST', {}))).status).toBe(403);
    expect((await call(e, '/api/v1/lessons/l-stat-3', { headers: bearer(token) })).status).toBe(403); // draft lesson via staff route
  });
  it('instructor session cannot manage people, enrolments, tokens, view-as, or other courses', async () => {
    const { e, token } = await setup('u-okafor', 'instructor');
    for (const [p, m, b] of [
      ['/api/v1/courses/c-stat110/enrollments', 'PUT', { userIds: ['u-priya'] }],
      ['/api/v1/courses/c-stat110/instructors', 'PUT', { userIds: ['u-okafor'] }],
      ['/api/v1/tokens', 'POST', { name: 'x', scopes: ['courses:read'] }],
      ['/api/v1/session/view-as', 'POST', { userId: 'u-admin' }],
      ['/api/v1/institution/sso', 'PUT', { domains: ['evil.example'] }],
      ['/api/v1/session', 'POST', { userId: 'u-admin' }],
      ['/api/v1/lessons/l-comm-1/publish', 'POST', {}],
    ] as const) expect([p, (await call(e, p, jsonBody(token, m, b))).status]).toEqual([p, 403]);
    // u-okafor teaches c-comm120's sibling? the session is bound to c-stat110 regardless of stored instructorIds
    expect((await call(e, '/api/v1/courses/c-comm120', { headers: bearer(token) })).status).toBe(403);
  });
  it('path parameter wins over a smuggled query courseId', async () => {
    const { e, token } = await setup();
    expect((await call(e, '/api/v1/courses/c-comm120?courseId=c-stat110', { headers: bearer(token) })).status).toBe(403);
    const ok = await call(e, '/api/v1/courses/c-stat110?courseId=c-comm120', { headers: bearer(token) });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { course: { id: string } }).course.id).toBe('c-stat110');
  });
  it('answerCheck cannot pair an in-course lesson with an out-of-course block', async () => {
    const { e, token } = await setup();
    const res = await call(e, '/api/v1/me/lessons/l-stat-1/checks/b-c1-3', jsonBody(token, 'POST', { optionId: 'a' }));
    expect(res.status).toBe(403);
  });
  it('a stored administrator launched as student sees only the student effective role', async () => {
    const { e, token } = await setup('u-admin', 'student');
    const me = (await (await call(e, '/api/v1/me', { headers: bearer(token) })).json()) as { user: { role: string }; viewingAs: unknown };
    expect(me.user.role).toBe('student');
    expect(me.viewingAs).toBeNull();
    expect((await call(e, '/api/v1/overview', { headers: bearer(token) })).status).toBe(403);
  });
  it('case and format tricks on the credential do not authenticate', async () => {
    const { e, token } = await setup();
    for (const h of [`Bearer ${token.toUpperCase()}`, `Bearer ${token} extra`, `Basic ${token}`, `Bearer ${token.slice(0, 20)}`]) {
      expect([h.slice(0, 12), (await call(e, '/api/v1/session', { headers: { authorization: h } })).status]).toEqual([h.slice(0, 12), 401]);
    }
  });
  it('cross-site cookie with forged-looking Origin of another host is ignored; missing signals ignored', async () => {
    const { e, token } = await setup();
    const cookie = `tessera_tool_session=${token}`;
    expect((await call(e, '/api/v1/session', { headers: { cookie, origin: 'https://lms.example' } })).status).toBe(401);
    expect((await call(e, '/api/v1/session', { headers: { cookie } })).status).toBe(401);
    expect((await call(e, '/api/v1/session', { headers: { cookie, origin: 'https://tessera.example.evil.test' } })).status).toBe(401);
  });
  it('an invalid tool bearer never falls through to a valid Access identity', async () => {
    const { e } = await setup();
    const access = await jwt('alex.rivera@meridian.example.edu');
    const res = await call(e, '/api/v1/users', { headers: { authorization: 'Bearer tts_' + 'Z'.repeat(40), 'cf-access-jwt-assertion': access } });
    expect(res.status).toBe(401);
  });
  it('tool session cannot be replayed after revocation even with sliding', async () => {
    const { deps, token, session, repo } = await setup();
    expect(await verifyToolSession(deps, token)).not.toBeNull();
    await repo.revokeToolSessions({ userId: session.userId, contextId: session.contextId }, deps.now());
    expect(await verifyToolSession(deps, token)).toBeNull();
    expect(await repo.extendToolSession(session.id, '2999-01-01T00:00:00.000Z', deps.now())).toBe(false);
  });
});

describe('probe: identity takeover and JIT', () => {
  const deps = () => { const repo = new MemoryRepo(seedData()); let n = 0; return { repo, now: () => '2026-09-28T00:00:00.000Z', newId: (p: string) => `${p}-p${++n}` }; };
  it('platform asserting the administrator email gets its own student, a suggestion, and nothing else', async () => {
    const d = deps();
    const r = await resolveLtiUser(d, { platformId: 'p', sub: 'attacker', email: 'ALEX.RIVERA@meridian.example.edu ', name: 'Alex Rivera', roles: ['http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator', 'http://purl.imsglobal.org/vocab/lis/v2/system/person#SysAdmin'] });
    expect(r.user.id).not.toBe('u-admin');
    expect(r.user.role).toBe('student');
    expect(r.user.email).toMatch(/@lti\.invalid$/);
    expect(r.courseRole).toBeNull();
    expect(r.suggestion?.targetUserId).toBe('u-admin');
    expect(await d.repo.findUserByEmail('alex.rivera@meridian.example.edu')).toMatchObject({ id: 'u-admin', role: 'administrator' });
  });
  it('same sub on a different platform is a different user', async () => {
    const d = deps();
    const a = await resolveLtiUser(d, { platformId: 'p1', sub: 's', roles: ['Learner'] });
    const b = await resolveLtiUser(d, { platformId: 'p2', sub: 's', roles: ['Learner'] });
    expect(a.user.id).not.toBe(b.user.id);
  });
  it('key-splitting: platform "p" sub "x|y" cannot collide with another platform', async () => {
    const d = deps();
    const a = await resolveLtiUser(d, { platformId: 'p', sub: 'x|y', roles: [] });
    await expect(resolveLtiUser(d, { platformId: 'p|x', sub: 'y', roles: [] })).rejects.toThrow();
    expect(a.created).toBe(true);
  });
  it('JIT refuses lookalike domains, trailing dots, multiple @, and never grants a non-student role', async () => {
    const d = deps();
    await d.repo.putInstitution({ ...(await d.repo.getInstitution()), sso: { domains: ['meridian.edu'], defaultRole: 'administrator' as never } });
    for (const email of ['a@meridian.edu.', 'a@meridian.edu@evil.test', 'a@evil.test@meridian.edu', 'a@meridian.edu.evil.test', 'a@xmeridian.edu', '@meridian.edu', 'a@']) {
      expect([email, await jitProvisionAccessUser(d, email)]).toEqual([email, null]);
    }
    const ok = await jitProvisionAccessUser(d, 'new@meridian.edu');
    expect(ok?.role).toBe('student');
  });
  it('JIT does not touch an existing user whose email differs only in case', async () => {
    const db = createTestDb(), repo = new D1Repo(db as never); await repo.reset(seedData());
    await repo.putInstitution({ ...(await repo.getInstitution()), sso: { domains: ['meridian.example.edu'], defaultRole: 'student' } });
    const e = env(db);
    const access = await jwt('ALEX.RIVERA@MERIDIAN.EXAMPLE.EDU');
    const me = (await (await call(e, '/api/v1/me', { headers: { 'cf-access-jwt-assertion': access } })).json()) as { user: { id: string; role: string } };
    expect(me.user).toMatchObject({ id: 'u-admin', role: 'administrator' });
    expect((await repo.listUsers()).filter((u) => u.email.toLowerCase() === 'alex.rivera@meridian.example.edu')).toHaveLength(1);
  });
});

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../index';
import { D1Repo } from '../d1-repo';
import { createTestDb } from '../test/d1-shim';
import { seedData } from '../../shared/seed';
import { mintToolSession } from '../../shared/service/interop/tool-sessions';
import { jitProvisionAccessUser } from '../../shared/service/interop/sso';
import { toolSessionCookie } from './tool-session';
import { clearAccessKeyCache } from '../access';
import { createTestKey, signJwt } from '../test/jwt';

const DOMAIN = 'interop.test.cloudflareaccess.com', AUD = 'interop-aud';
const env = (db: ReturnType<typeof createTestDb>) => ({DB:db,ASSETS:{fetch:async()=>new Response('missing',{status:404})},ENVIRONMENT:'production' as const,ACCESS_TEAM_DOMAIN:DOMAIN,ACCESS_AUD:AUD,OWNER_EMAILS:'owner@meridian.edu'});
const call = (e: ReturnType<typeof env>, path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://tessera.example${path}`,init),e as never,{} as never);
async function setup(userId = 'u-priya', role: 'student'|'instructor' = 'student') {
  const db = createTestDb(), repo = new D1Repo(db as never);
  await repo.reset(seedData());
  const deps = {repo,now:()=>new Date().toISOString(),newId:(p:string)=>`${p}-${crypto.randomUUID()}`};
  const minted = await mintToolSession(deps,{userId,courseId:'c-stat110',role,platformId:'p',contextId:'ctx'});
  return {e:env(db),repo,deps,...minted};
}
const bearer = (token: string) => ({authorization:`Bearer ${token}`});
let key: Awaited<ReturnType<typeof createTestKey>>;
beforeAll(async () => { key = await createTestKey('interop-key'); });
afterEach(() => {vi.unstubAllGlobals();clearAccessKeyCache();});
async function jwt(email: string) {
  vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({keys:[key.jwk]}),{status:200}));
  return signJwt(key.privateKey,key.kid,{aud:AUD,iss:`https://${DOMAIN}`,exp:Math.floor(Date.now()/1000)+3600,email});
}

describe('course-bound tool credential', () => {
  it("P1 — A tool session's progress update writes outside its course", async () => {
    const {e,repo,token} = await setup('u-admin','student');
    const at = new Date().toISOString();
    await repo.putRequirement({id:'req-cross-course',target:{kind:'course',courseId:'c-comm120'},audience:{kind:'role',role:'student'},dueAt:null,recurrence:'none',createdBy:'u-admin',createdAt:at});
    const before = await repo.listCompletionEvents({userId:'u-admin'});
    const res = await call(e,'/api/v1/me/lessons/l-stat-1/progress',{method:'POST',headers:{...bearer(token),'content-type':'application/json'},body:JSON.stringify({state:'in-progress'})});
    expect(res.status).toBe(200);
    expect((await repo.getProgress('u-admin','l-stat-1'))?.state).toBe('in-progress');
    expect(await repo.listEnrollments({userId:'u-admin'})).toEqual([]);
    expect(await repo.listCompletionEvents({userId:'u-admin'})).toEqual(before);
    expect(await repo.listCertificates({userId:'u-admin'})).toEqual([]);
    const instructor = await mintToolSession({repo,now:()=>new Date().toISOString(),newId:(p:string)=>`${p}-${crypto.randomUUID()}`},{userId:'u-admin',courseId:'c-stat110',role:'instructor',platformId:'p',contextId:'instructor'});
    expect((await call(e,'/api/v1/me/lessons/l-stat-1',{headers:bearer(instructor.token)})).status).toBe(200);
    expect(await repo.listEnrollments({userId:'u-admin'})).toEqual([]);
    expect(await repo.listCompletionEvents({userId:'u-admin'})).toEqual(before);
    await repo.putRequirement({id:'req-session-course',target:{kind:'course',courseId:'c-stat110'},audience:{kind:'role',role:'student'},dueAt:null,recurrence:'none',createdBy:'u-admin',createdAt:at});
    const own = await mintToolSession({repo,now:()=>new Date().toISOString(),newId:(p:string)=>`${p}-${crypto.randomUUID()}`},{userId:'u-priya',courseId:'c-stat110',role:'student',platformId:'p',contextId:'own'});
    expect((await call(e,'/api/v1/me/lessons/l-stat-1/progress',{method:'POST',headers:{...bearer(own.token),'content-type':'application/json'},body:JSON.stringify({state:'in-progress'})})).status).toBe(200);
    expect((await repo.listCompletionEvents({userId:'u-priya',courseId:'c-stat110'})).some(event=>event.requirementId==='req-session-course' && event.kind==='started')).toBe(true);
    expect((await repo.listCompletionEvents({userId:'u-priya',courseId:'c-stat110'})).some(event=>event.requirementId==='req-session-course' && event.kind==='assigned')).toBe(false);
  });
  it('P1 — Tool lesson adaptation cannot read a variant stored in another course', async () => {
    const {e,repo,token} = await setup();
    const master = (await repo.getLesson('l-stat-1'))!;
    await repo.putLesson({...master,id:'l-cross-course-variant',courseId:'c-comm120',moduleId:'m-comm-1',status:'published',variantOf:{lessonId:master.id,audience:'plain',syncedAt:new Date().toISOString()}});
    const student = (await repo.getUser('u-priya'))!;
    student.profile = {...(await repo.getUser('u-marcus'))!.profile!,readingLevel:'plain'};
    await repo.putUser(student);
    const res = await call(e,'/api/v1/me/lessons/l-stat-1',{headers:bearer(token)});
    expect(res.status).toBe(200);
    const body = await res.json() as {lesson:{id:string;courseId:string};variantAvailable:unknown};
    expect(body.lesson).toMatchObject({id:'l-stat-1',courseId:'c-stat110'});
    expect(body.variantAvailable).toBeNull();
  });
  it('P1 — Tool course outline and lesson details reject mismatched module course links', async () => {
    const {e,repo,token} = await setup();
    const foreign = (await repo.getLesson('l-comm-1'))!;
    await repo.putLesson({...foreign,id:'l-foreign-in-stat-module',moduleId:'m-stat-1'});
    const outline = await (await call(e,'/api/v1/courses/c-stat110',{headers:bearer(token)})).json() as {modules:{lessons:{id:string}[]}[]};
    expect(outline.modules.flatMap(module=>module.lessons.map(lesson=>lesson.id))).not.toContain('l-foreign-in-stat-module');
    const local = (await repo.getLesson('l-stat-1'))!;
    await repo.putLesson({...local,moduleId:'m-comm-1'});
    expect((await call(e,'/api/v1/me/lessons/l-stat-1',{headers:bearer(token)})).status).toBe(403);
    const instructor = await mintToolSession({repo,now:()=>new Date().toISOString(),newId:(p:string)=>`${p}-${crypto.randomUUID()}`},{userId:'u-admin',courseId:'c-stat110',role:'instructor',platformId:'p',contextId:'course-links'});
    expect((await call(e,'/api/v1/lessons/l-stat-1',{headers:bearer(instructor.token)})).status).toBe(403);
  });
  it('reaches the launched course and presents the effective user', async () => {
    const {e,token} = await setup();
    expect((await call(e,'/api/v1/courses/c-stat110',{headers:bearer(token)})).status).toBe(200);
    const session = await (await call(e,'/api/v1/session',{headers:{...bearer(token),cookie:'tessera_view_as=u-admin; tessera_user=u-admin'}})).json() as {user:{id:string;role:string}};
    expect(session.user).toMatchObject({id:'u-priya',role:'student'});
    expect((await call(e,'/api/v1/me',{headers:bearer(token)})).status).toBe(200);
  });
  it('denies another course, admin and broad operations, binary and certificate routes', async () => {
    const {e,token} = await setup('u-admin','student');
    expect((await call(e,'/api/v1/courses/c-stat110',{headers:bearer(token)})).status).toBe(200);
    for (const path of ['/api/v1/courses/c-comm120','/api/v1/me/lessons/l-comm-1','/api/v1/me/lessons/missing','/api/v1/users','/api/v1/courses','/api/v1/files/fake/content','/api/v1/certificates/fake/pdf']) {
      expect((await call(e,path,{headers:bearer(token)})).status).toBe(403);
    }
    for (const [path,method,body] of [
      ['/api/v1/courses','POST',{code:'NEW',title:'New',term:'Now'}],
      ['/api/v1/courses/c-stat110/instructors','PUT',{userIds:[]}],
      ['/api/v1/demo/reset','POST',{}],
    ] as const) expect((await call(e,path,{method,headers:{...bearer(token),'content-type':'application/json'},body:JSON.stringify(body)})).status).toBe(403);
  });
  it('permits course-bound assignment and submission reads by effective role', async () => {
    const student = await setup();
    expect((await call(student.e,'/api/v1/courses/c-stat110/assignments',{headers:bearer(student.token)})).status).toBe(200);
    expect((await call(student.e,'/api/v1/assignments/asg-stat-1',{headers:bearer(student.token)})).status).toBe(200);
    expect((await call(student.e,'/api/v1/assignments/asg-stat-1/submissions/me',{headers:bearer(student.token)})).status).toBe(200);
    expect((await call(student.e,'/api/v1/assignments/asg-stat-1/submissions',{headers:bearer(student.token)})).status).toBe(403);
    const instructor = await setup('u-admin','instructor');
    expect((await call(instructor.e,'/api/v1/lessons/l-stat-1',{headers:bearer(instructor.token)})).status).toBe(200);
    expect((await call(instructor.e,'/api/v1/assignments/asg-stat-1/submissions',{headers:bearer(instructor.token)})).status).toBe(200);
  });
  it('rejects bad, expired, revoked, and replaced tokens without persona fall-through', async () => {
    const {e,repo,deps,token,session} = await setup();
    const fallback = 'tessera_user=u-admin';
    const access = await jwt('alex.rivera@meridian.example.edu');
    for (const bad of [token.slice(0,-1)+(token.endsWith('A')?'B':'A'),'tts_'+'A'.repeat(40)]) expect((await call(e,'/api/v1/session',{headers:{...bearer(bad),cookie:fallback,'cf-access-jwt-assertion':access}})).status).toBe(401);
    await repo.revokeToolSessions({userId:session.userId,contextId:session.contextId},deps.now());
    expect((await call(e,'/api/v1/session',{headers:{...bearer(token),cookie:fallback}})).status).toBe(401);
    const next = await mintToolSession(deps,{userId:'u-priya',courseId:'c-stat110',role:'student',platformId:'p',contextId:'ctx'});
    expect((await call(e,'/api/v1/session',{headers:bearer(next.token)})).status).toBe(200);
    const latest = await mintToolSession(deps,{userId:'u-priya',courseId:'c-stat110',role:'student',platformId:'p',contextId:'ctx'});
    expect((await call(e,'/api/v1/session',{headers:bearer(next.token)})).status).toBe(401);
    await e.DB.prepare('UPDATE tool_sessions SET expires_at=? WHERE id=?').bind('2000-01-01T00:00:00.000Z',latest.session.id).run();
    expect((await call(e,'/api/v1/session',{headers:bearer(latest.token)})).status).toBe(401);
  });
  it('P2 — A malformed tool bearer falls through to Access', async () => {
    const {e,token} = await setup();
    const access = await jwt('alex.rivera@meridian.example.edu');
    const cookie = `tessera_tool_session=${token}; tessera_user=u-admin`;
    for (const authorization of [`Bearer ${token} extra`,`bearer ${token} extra`,`Bearer  ${token}`,`Bearer\t${token}`,`Bearer tts_short`,`Bearer ${token.slice(0,-1)}!`]) {
      const res = await call(e,'/api/v1/users',{headers:{authorization,'cf-access-jwt-assertion':access,cookie,'sec-fetch-site':'same-origin'}});
      expect([authorization,res.status,(await res.json() as {error:{code:string}}).error.code]).toEqual([authorization,401,'unauthenticated']);
    }
  });
  it('P2 — Cookie sessions die at 2 h despite sliding', async () => {
    const {e,repo,token,session} = await setup();
    const now = Date.now();
    const createdAt = new Date(now-90*60_000).toISOString();
    const expiresAt = new Date(now+30*60_000).toISOString();
    await e.DB.prepare('UPDATE tool_sessions SET created_at=?, expires_at=? WHERE id=?').bind(createdAt,expiresAt,session.id).run();
    const cookie = `tessera_tool_session=${token}`;
    const res = await call(e,'/api/v1/session',{headers:{cookie,'sec-fetch-site':'same-origin'}});
    expect(res.status).toBe(200);
    const refreshed = res.headers.get('set-cookie') ?? '';
    expect(refreshed).toMatch(/^tessera_tool_session=tts_[A-Za-z0-9]{40}; Path=\/api; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=\d+$/);
    const age = Number(refreshed.match(/Max-Age=(\d+)/)?.[1]);
    expect(age).toBeGreaterThan(7100);
    expect(age).toBeLessThanOrEqual(7200);
    expect(Date.parse((await repo.getToolSessionByHash(session.tokenHash))!.expiresAt)).toBeLessThanOrEqual(Date.parse(createdAt)+8*60*60_000);
    expect((await call(e,'/api/v1/session',{headers:bearer(token)})).headers.get('set-cookie')).toBeNull();
    await e.DB.prepare('UPDATE tool_sessions SET created_at=?, expires_at=? WHERE id=?').bind(new Date(now-7*60*60_000-50*60_000).toISOString(),new Date(now+10*60_000).toISOString(),session.id).run();
    const capped = await call(e,'/api/v1/session',{headers:{cookie,'sec-fetch-site':'same-origin'}});
    expect(Number(capped.headers.get('set-cookie')?.match(/Max-Age=(\d+)/)?.[1])).toBeLessThanOrEqual(600);
  });
  it('P3 — A void-input operation would re-read a consumed body', async () => {
    const {e,token} = await setup();
    const each = URLSearchParams.prototype.forEach;
    let voidReads = 0;
    URLSearchParams.prototype.forEach = function (...args) { voidReads++; return each.apply(this,args); };
    try {
      expect((await call(e,'/api/v1/session',{headers:bearer(token)})).status).toBe(200);
    } finally {
      URLSearchParams.prototype.forEach = each;
    }
    expect(voidReads).toBe(1);
    const request = new Request('https://tessera.example/api/v1/me/lessons/l-stat-1/progress',{method:'POST',headers:{...bearer(token),'content-type':'application/json'},body:JSON.stringify({state:'in-progress'})});
    const read = request.text.bind(request);
    let reads = 0;
    Object.defineProperty(request,'text',{value:()=>{reads++;return read();}});
    const response = await worker.fetch(request,e as never,{} as never);
    expect(response.status).toBe(200);
    expect(reads).toBe(1);
  });
  it('accepts partitioned cookie only with same-origin evidence and rejects MCP', async () => {
    const {e,token} = await setup();
    expect(toolSessionCookie(token)).toBe(`tessera_tool_session=${token}; Path=/api; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=7200`);
    const cookie = `tessera_tool_session=${token}`;
    expect((await call(e,'/api/v1/session',{headers:{cookie,'sec-fetch-site':'same-origin'}})).status).toBe(200);
    expect((await call(e,'/api/v1/session',{headers:{cookie,origin:'https://tessera.example'}})).status).toBe(200);
    expect((await call(e,'/api/v1/session',{headers:{cookie,'sec-fetch-site':'cross-site'}})).status).toBe(401);
    expect((await call(e,'/mcp',{method:'POST',headers:{...bearer(token),'content-type':'application/json'},body:'{}'})).status).toBe(401);
    expect((await call(e,'/mcp',{method:'POST',headers:{cookie,'sec-fetch-site':'same-origin','content-type':'application/json'},body:'{}'})).status).toBe(401);
  });
  it('preserves tsk authentication', async () => {
    const {e,repo} = await setup();
    const secret = 'tsk_'+'B'.repeat(40);
    const {hashSecret} = await import('../../shared/tokens');
    await repo.putApiToken({id:'tok-inter',name:'Test',prefix:'BBBBBBBB',hash:await hashSecret(secret),scopes:['courses:read'],ownerId:'u-priya',createdAt:new Date().toISOString(),expiresAt:null,lastUsedAt:null,revokedAt:null});
    expect((await call(e,'/api/v1/courses',{headers:bearer(secret)})).status).toBe(200);
  });
});

describe('Access SSO JIT router', () => {
  it('P1 — Unicode email case-folding diverges between MemoryRepo and D1Repo: JIT refuses Unicode', async () => {
    const {repo} = await setup();
    await repo.putUser({id:'u-emile',name:'Émile',email:'Émile@meridian.edu',role:'instructor',initials:'É',profile:null});
    await repo.putInstitution({...await repo.getInstitution(),sso:{domains:['meridian.edu'],defaultRole:'student'}});
    const result = await jitProvisionAccessUser({repo,now:()=>new Date().toISOString(),newId:()=> 'u-duplicate'},'émile@meridian.edu');
    expect(result).toBeNull();
    expect((await repo.listUsers()).filter(user=>user.email.includes('meridian.edu'))).toEqual([expect.objectContaining({id:'u-emile',role:'instructor'})]);
  });
  it('provisions exactly one student for concurrent signed requests; refuses other domains and owners', async () => {
    const {e,repo} = await setup();
    await repo.putInstitution({...await repo.getInstitution(),sso:{domains:['meridian.edu'],defaultRole:'student'}});
    const signed = await jwt('new.student@meridian.edu');
    const [a,b] = await Promise.all([call(e,'/api/v1/session',{headers:{'cf-access-jwt-assertion':signed}}),call(e,'/api/v1/session',{headers:{'cf-access-jwt-assertion':signed}})]);
    const users = await Promise.all([a.json(),b.json()]) as {user:{id:string;role:string}}[];
    expect(users[0].user.id).toBe(users[1].user.id);
    expect(users[0].user.role).toBe('student');
    expect((await repo.listUsers()).filter(u=>u.email==='new.student@meridian.edu')).toHaveLength(1);
    for (const email of ['a@evil-meridian.edu','a@x.meridian.edu','owner@meridian.edu']) {
      const token = await jwt(email);
      const res = await call(e,'/api/v1/session',{headers:{'cf-access-jwt-assertion':token}});
      expect(((await res.json()) as {user:unknown}).user).toBeNull();
    }
  });
  it('requires an administrator and validates the domain configuration', async () => {
    const {e} = await setup();
    const admin = await jwt('alex.rivera@meridian.example.edu');
    const student = await jwt('priya.n@meridian.example.edu');
    const send = (token:string,domains:string[]) => call(e,'/api/v1/institution/sso',{method:'PUT',headers:{'cf-access-jwt-assertion':token,'content-type':'application/json'},body:JSON.stringify({domains})});
    expect((await send(student,['meridian.edu'])).status).toBe(403);
    expect((await send(admin,['*.meridian.edu'])).status).toBe(400);
    const ok = await send(admin,['MERIDIAN.EDU','meridian.edu']);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as {sso:{domains:string[]}}).sso.domains).toEqual(['meridian.edu']);
  });
});

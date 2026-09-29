import { describe, expect, it } from 'vitest';
import { SEED_NOW } from '../shared/seed';
import { hashSecret } from '../shared/tokens';
import { ROUTES } from '../shared/api';
import { D1Repo } from './d1-repo';
import worker from './index';
import { createTestDb } from './test/d1-shim';

const operations=['getWorkerColumnMap','saveWorkerColumnMap','previewWorkerImport','applyWorkerImport','listWorkerRecords','listWorkerLinkSuggestions','confirmWorkerLink','previewRule','applyRule'] as const;
const envFor=(db:object)=>({DB:db,ASSETS:{fetch:async()=>new Response('missing',{status:404})},ENVIRONMENT:'local',ACCESS_TEAM_DOMAIN:'team.test.cloudflareaccess.com',ACCESS_AUD:'aud-test',OWNER_EMAILS:'owner@example.test'});
const call=(env:object,path:string,init:RequestInit={})=>worker.fetch(new Request(`http://localhost${path}`,init),env as never,{} as never);
describe('HRIS routes and scope',()=>{
  it('marks each operation administrator-only with the correct people scope',()=>{
    for(const op of operations){expect(ROUTES[op].access).toEqual(['administrator']);expect(ROUTES[op].scope).toBe(['getWorkerColumnMap','listWorkerRecords','listWorkerLinkSuggestions'].includes(op)?'people:read':'people:write');}
  });
  it('rejects an administrator token lacking the route scope',async()=>{
    const db=createTestDb(),env=envFor(db);await call(env,'/api/v1/session');const repo=new D1Repo(db as never);
    const narrow='tsk_dddddddddddddddddddddddddddddddddddddddd';
    await repo.putApiToken({id:'tok-hr-narrow',name:'hr narrow',prefix:'tsk_dddd',scopes:['courses:read'],ownerId:'u-admin',createdAt:SEED_NOW,expiresAt:null,lastUsedAt:null,revokedAt:null,hash:await hashSecret(narrow)});
    for(const [path,init] of [['/api/v1/hr/records',{}],['/api/v1/hr/imports/preview',{method:'POST',body:JSON.stringify({source:{format:'json',records:[]}}),headers:{'content-type':'application/json'}}]] as const){
      const response=await call(env,path,{...init,headers:{...init.headers,authorization:`Bearer ${narrow}`}});
      expect(response.status).toBe(403);expect(await response.json()).toMatchObject({error:{code:'forbidden'}});
    }
  });
  it('never caches HR previews or replays them from an idempotency key',async()=>{
    const db=createTestDb(),env=envFor(db),headers={cookie:'tessera_user=u-admin','content-type':'application/json','idempotency-key':'hr-preview'};
    const body=JSON.stringify({source:{format:'json',records:[]}});
    const first=await call(env,'/api/v1/hr/imports/preview',{method:'POST',headers,body});
    const second=await call(env,'/api/v1/hr/imports/preview',{method:'POST',headers,body});
    expect(first.status).toBe(200);expect(second.status).toBe(200);
    expect(second.headers.get('idempotency-replayed')).toBeNull();
    const row=await db.prepare('SELECT count(*) AS n FROM idempotency_keys').first<{n:number}>();expect(row?.n).toBe(0);
  });
  it('rechecks current role before a cached create and isolates keys by operation',async()=>{
    const db=createTestDb(),env=envFor(db),repo=new D1Repo(db as never),headers={cookie:'tessera_user=u-admin','content-type':'application/json','idempotency-key':'shared-key'};
    const create=(path:string,body:object)=>call(env,path,{method:'POST',headers,body:JSON.stringify(body)});
    expect((await create('/api/v1/programs',{name:'Facilities orientation'})).status).toBe(200);
    const other=await create('/api/v1/requirements',{target:{kind:'course',courseId:'c-ops101'},audience:{kind:'role',role:'student'}});
    expect(other.status).toBe(200);expect(other.headers.get('idempotency-replayed')).toBeNull();
    const prior=await repo.getUser('u-admin');expect(prior).not.toBeNull();await repo.putUser({...prior!,role:'student'});
    const replay=await create('/api/v1/programs',{name:'Facilities orientation'});
    expect(replay.status).toBe(403);expect(replay.headers.get('idempotency-replayed')).toBeNull();
  });
  it('does not replay an instructor module after course access is revoked, while admin creates replay',async()=>{
    const db=createTestDb(),env=envFor(db),repo=new D1Repo(db as never);
    const instructorHeaders={cookie:'tessera_user=u-chen','content-type':'application/json','idempotency-key':'module-key'};
    const moduleBody=JSON.stringify({title:'Safety review'});
    const first=await call(env,'/api/v1/courses/c-comm120/modules',{method:'POST',headers:instructorHeaders,body:moduleBody});
    expect(first.status).toBe(200);
    const course=(await repo.getCourse('c-comm120'))!;
    await repo.putCourse({...course,instructorIds:course.instructorIds.filter(id=>id!=='u-chen')});
    const revoked=await call(env,'/api/v1/courses/c-comm120/modules',{method:'POST',headers:instructorHeaders,body:moduleBody});
    expect(revoked.status).toBe(403);expect(revoked.headers.get('idempotency-replayed')).toBeNull();
    const adminHeaders={cookie:'tessera_user=u-admin','content-type':'application/json','idempotency-key':'user-key'};
    const create=()=>call(env,'/api/v1/users',{method:'POST',headers:adminHeaders,body:JSON.stringify({name:'Avery Chen',email:'avery.chen@example.test',role:'student'})});
    expect((await create()).status).toBe(200);
    expect((await create()).headers.get('idempotency-replayed')).toBe('true');
    const admin=(await repo.getUser('u-admin'))!;await repo.putUser({...admin,role:'student'});
    expect((await create()).status).toBe(403);
  });
});

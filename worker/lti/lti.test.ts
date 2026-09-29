import { afterEach, expect, it, vi } from 'vitest';
import { D1Repo } from '../d1-repo';
import { createTestDb } from '../test/d1-shim';
import { createTestKey, signJwt } from '../test/jwt';
import worker from '../index';

const issuer = 'https://canvas.meridian.example';
const base = 'http://localhost:8787';
const deploy = 'https://purl.imsglobal.org/spec/lti/claim/deployment_id';
const message = 'https://purl.imsglobal.org/spec/lti/claim/message_type';
const context = 'https://purl.imsglobal.org/spec/lti/claim/context';
const resource = 'https://purl.imsglobal.org/spec/lti/claim/resource_link';
const roles = 'https://purl.imsglobal.org/spec/lti/claim/roles';
afterEach(() => vi.unstubAllGlobals());

async function fixture() {
  const db = createTestDb(), key = await createTestKey(crypto.randomUUID());
  const env = {
    DB:db,ENVIRONMENT:'local',ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',ACCESS_AUD:'aud',
    ASSETS:{fetch:async () => new Response('<html><head></head><body><script src="/app/assets/app.js"></script></body></html>',{headers:{'content-type':'text/html'}})},
  };
  const call = (path:string,init:RequestInit={}) => worker.fetch(new Request(base+path,init),env as never,{} as never);
  await call('/api/v1/session'); // seeds D1
  const repo = new D1Repo(db as never);
  await repo.putLtiPlatform({id:'lp-meridian',name:'Meridian State Canvas',issuer,clientId:'tessera-local',deploymentIds:['meridian-state-2026'],authLoginUrl:'https://canvas.meridian.example/login',authTokenUrl:'https://canvas.meridian.example/token',jwksUrl:'https://canvas.meridian.example/jwks/'+key.kid,registeredVia:'manual',status:'active',services:{ags:false,nrps:false,deepLinking:false},createdBy:'u-admin',createdAt:new Date().toISOString(),lastLaunchAt:null});
  vi.stubGlobal('fetch',vi.fn(async () => new Response(JSON.stringify({keys:[key.jwk]}),{headers:{'content-type':'application/json'}})));
  const login = async () => {
    const query = new URLSearchParams({iss:issuer,client_id:'tessera-local',target_link_uri:base+'/lti/launch',login_hint:'priya'});
    const response = await call('/lti/login?'+query);
    const redirect = new URL(response.headers.get('location')!);
    return {state:redirect.searchParams.get('state')!,nonce:redirect.searchParams.get('nonce')!,cookie:response.headers.get('set-cookie')!.split(';')[0]};
  };
  const token = async (nonce:string,overrides:Record<string,unknown>={}) => {
    const now = Math.floor(Date.now()/1000);
    return signJwt(key.privateKey,key.kid,{iss:issuer,sub:'priya-001',aud:'tessera-local',iat:now,exp:now+300,nonce,
      [deploy]:'meridian-state-2026',[message]:'LtiResourceLinkRequest',
      [context]:{id:'stat110-fall',title:'Statistics 110',label:'STAT 110'},
      [resource]:{id:'stat110-course'},[roles]:['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
      ...overrides});
  };
  const launch = (state:string,cookie:string,idToken:string) => call('/lti/launch',{method:'POST',headers:{cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({state,id_token:idToken}).toString()});
  return {call,repo,login,token,launch};
}

it('accepts a signed launch only after the administrator links its first context',async () => {
  const f = await fixture();
  const first = await f.login(), signed = await f.token(first.nonce);
  const unlinked = await f.launch(first.state,first.cookie,signed);
  expect(unlinked.status).toBe(409);
  expect(await unlinked.text()).toContain('Course link needed');
  const ctx = await f.repo.getLtiContext('lp-meridian','meridian-state-2026','stat110-fall');
  expect(ctx?.courseId).toBeNull();
  const link = await f.call('/lti/contexts/'+ctx!.id+'/link',{method:'POST',headers:{cookie:'tessera_user=u-admin','content-type':'application/json'},body:JSON.stringify({courseId:'c-stat110'})});
  expect(link.status).toBe(200);
  const second = await f.login(), token = await f.token(second.nonce);
  const success = await f.launch(second.state,second.cookie,token);
  expect(success.status).toBe(200);
  expect(success.headers.get('set-cookie')).toContain('tessera_tool_session=');
  expect(await success.text()).toContain('/embed/courses/c-stat110');
  const replay = await f.launch(second.state,second.cookie,token);
  expect(replay.status).toBe(401);
  expect((await replay.json()).error.code).toBe('launch-nonce-reused');
});

it.each([
  ['wrong audience',{aud:'another-tool'},'launch-wrong-audience'],
  ['unknown deployment',{[deploy]:'unregistered'},'launch-unknown-deployment'],
  ['expired',{exp:Math.floor(Date.now()/1000)-500},'launch-expired'],
])('rejects %s',async (_name,overrides,code) => {
  const f = await fixture(), login = await f.login();
  const response = await f.launch(login.state,login.cookie,await f.token(login.nonce,overrides));
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe(code);
});

it('publishes only the tool public key and serves the embed bundle outside /app',async () => {
  const db = createTestDb(), pair = await createTestKey('tessera-key');
  const privateJwk = {...await crypto.subtle.exportKey('jwk',pair.privateKey),kid:pair.kid};
  const calls:string[] = [];
  const env = {DB:db,ENVIRONMENT:'local',ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',ACCESS_AUD:'aud',LTI_PRIVATE_JWK:JSON.stringify(privateJwk),
    ASSETS:{fetch:async (request:Request) => { calls.push(new URL(request.url).pathname); return new Response('asset',{headers:{'content-type':'text/javascript'}}); }}};
  const call = (path:string) => worker.fetch(new Request(base+path),env as never,{} as never);
  const jwks = await call('/lti/jwks');
  expect(jwks.status).toBe(200);
  const published = (await jwks.json()).keys[0];
  expect(published.kid).toBe('tessera-key');
  expect(published.d).toBeUndefined();
  const asset = await call('/embed/assets/app.js');
  expect(asset.status).toBe(200);
  expect(calls).toEqual(['/app/assets/app.js']);
});

it('registers manual and dynamic platforms for an administrator',async () => {
  const db = createTestDb(), pair = await createTestKey('tool-key');
  const privateJwk = {...await crypto.subtle.exportKey('jwk',pair.privateKey),kid:pair.kid};
  const env = {DB:db,ENVIRONMENT:'local',ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',ACCESS_AUD:'aud',LTI_PRIVATE_JWK:JSON.stringify(privateJwk),
    ASSETS:{fetch:async () => new Response('asset')}};
  const post = (body:unknown) => worker.fetch(new Request(base+'/lti/register',{method:'POST',headers:{cookie:'tessera_user=u-admin','content-type':'application/json'},body:JSON.stringify(body)}),env as never,{} as never);
  const manual = await post({name:'Meridian State Canvas',issuer,clientId:'manual-client',deploymentIds:['manual-deploy'],authLoginUrl:issuer+'/login',authTokenUrl:issuer+'/token',jwksUrl:issuer+'/jwks'});
  expect(manual.status).toBe(201);
  expect((await manual.json()).registeredVia).toBe('manual');
  vi.stubGlobal('fetch',vi.fn(async (url:string,init?:RequestInit) => {
    if (url === issuer+'/configuration') return new Response(JSON.stringify({issuer,registration_endpoint:issuer+'/register',authorization_endpoint:issuer+'/login',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks'}));
    expect(url).toBe(issuer+'/register');
    expect(init?.headers).toMatchObject({authorization:'Bearer registration-token'});
    return new Response(JSON.stringify({client_id:'dynamic-client'}));
  }));
  const dynamic = await post({mode:'dynamic',name:'Meridian State Canvas dynamic',configurationUrl:issuer+'/configuration',registrationToken:'registration-token',deploymentIds:['dynamic-deploy']});
  expect(dynamic.status).toBe(201);
  expect((await dynamic.json()).registeredVia).toBe('dynamic');
  const repo = new D1Repo(db as never);
  expect((await repo.listLtiPlatforms()).map(x=>x.clientId)).toEqual(['manual-client','dynamic-client']);
});

import { ApiError, ROUTES } from '../../shared/api';
import type { LtiPlatform } from '../../shared/domain';
import type { Repo } from '../../shared/repo';
import { finishLtiLaunch, linkLtiContext, prepareLtiLaunch, registerPlatform, type LtiDeps } from '../../shared/service/interop/lti-core';
import { D1Repo } from '../d1-repo';
import type { Env } from '../env';
import { resolvePrincipal } from '../api/auth';
import { toolSessionCookie } from '../identity/tool-session';
import { LtiFailure, randomToken, safeUrl, toolJwks, verifyPlatformJwt } from './jwt';

const DEPLOYMENT = 'https://purl.imsglobal.org/spec/lti/claim/deployment_id';
const MESSAGE = 'https://purl.imsglobal.org/spec/lti/claim/message_type';
const CONTEXT = 'https://purl.imsglobal.org/spec/lti/claim/context';
const RESOURCE = 'https://purl.imsglobal.org/spec/lti/claim/resource_link';
const ROLES = 'https://purl.imsglobal.org/spec/lti/claim/roles';
const NRPS = 'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice';
const AGS = 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint';
const NEW_ID = (prefix: string) => prefix + '-' + crypto.randomUUID().replace(/-/g,'').slice(0,12);
const deps = (repo: Repo): LtiDeps => ({repo,now:() => new Date().toISOString(),newId:NEW_ID});
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const object = (value: unknown): Record<string,unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const fail = (error: LtiFailure) => json({error:{code:error.code,message:error.message}},401);
const htmlEscape = (value: string) => value.replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

async function params(request: Request): Promise<URLSearchParams> {
  if (request.method === 'GET') return new URL(request.url).searchParams;
  if (!(request.headers.get('content-type') ?? '').startsWith('application/x-www-form-urlencoded')) throw new LtiFailure('launch-invalid-request','The LMS must send form data.');
  const body = await request.text();
  if (body.length > 65536) throw new LtiFailure('launch-invalid-request','The LMS request is too large.');
  return new URLSearchParams(body);
}
async function admin(request: Request, env: Env, repo: Repo) {
  const principal = await resolvePrincipal(request,env,repo,ROUTES.getSession,new Date().toISOString());
  if (principal.token || principal.toolSession || principal.user?.role !== 'administrator') throw new ApiError('forbidden','An administrator must register or link an LMS.');
  return principal.user;
}
function registrationFields(data: Record<string,unknown>, via: 'manual' | 'dynamic', adminId: string, local: boolean): Omit<LtiPlatform,'id'|'createdAt'|'lastLaunchAt'> {
  const issuer = safeUrl(text(data.issuer),local).href.replace(/\/$/,'');
  const authLoginUrl = safeUrl(text(data.authLoginUrl),local).href;
  const authTokenUrl = safeUrl(text(data.authTokenUrl),local).href;
  const jwksUrl = safeUrl(text(data.jwksUrl),local).href;
  const deploymentIds = Array.isArray(data.deploymentIds) ? data.deploymentIds.filter((x):x is string => typeof x === 'string') : [];
  return {name:text(data.name).trim(),issuer,clientId:text(data.clientId),deploymentIds,authLoginUrl,authTokenUrl,jwksUrl,registeredVia:via,status:'active',services:{ags:!!object(data.services).ags,nrps:!!object(data.services).nrps,deepLinking:!!object(data.services).deepLinking},createdBy:adminId};
}
async function register(request: Request, env: Env, repo: Repo): Promise<Response> {
  const user = await admin(request,env,repo);
  const body = await request.json() as Record<string,unknown>;
  const local = env.ENVIRONMENT === 'local';
  if (body.mode !== 'dynamic') return json(await registerPlatform(deps(repo),registrationFields(body,'manual',user.id,local)),201);
  const configUrl = safeUrl(text(body.configurationUrl),local);
  const configResponse = await fetch(configUrl.href,{signal:AbortSignal.timeout(5000)});
  if (!configResponse.ok) throw new LtiFailure('registration-unavailable','The LMS registration configuration could not be loaded.');
  const config = await configResponse.json() as Record<string,unknown>;
  const endpoint = safeUrl(text(config.registration_endpoint),local);
  if (!env.LTI_PRIVATE_JWK) throw new LtiFailure('tool-key-invalid','The Tessera signing key is not configured.');
  const origin = new URL(request.url).origin;
  const metadata = {
    application_type:'web',response_types:['id_token'],grant_types:['implicit','client_credentials'],
    initiate_login_uri:origin+'/lti/login',redirect_uris:[origin+'/lti/launch'],
    client_name:'Tessera',jwks_uri:origin+'/lti/jwks',token_endpoint_auth_method:'private_key_jwt',
    scope:'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem https://purl.imsglobal.org/spec/lti-ags/scope/score https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
    'https://purl.imsglobal.org/spec/lti-tool-configuration':{domain:new URL(origin).host,target_link_uri:origin+'/lti/launch',claims:['iss','sub','aud','exp','iat','nonce',DEPLOYMENT,CONTEXT,RESOURCE,ROLES]},
  };
  const response = await fetch(endpoint.href,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+text(body.registrationToken)},body:JSON.stringify(metadata),signal:AbortSignal.timeout(5000)});
  if (!response.ok) throw new LtiFailure('registration-rejected','The LMS rejected Tessera registration. Check its registration token and configuration.');
  const registered = await response.json() as Record<string,unknown>;
  return json(await registerPlatform(deps(repo),registrationFields({
    name:body.name ?? config.issuer,issuer:config.issuer,clientId:registered.client_id,
    deploymentIds:body.deploymentIds,authLoginUrl:config.authorization_endpoint,
    authTokenUrl:config.token_endpoint,jwksUrl:config.jwks_uri,
    services:body.services ?? {ags:true,nrps:true,deepLinking:true},
  },'dynamic',user.id,local)),201);
}
async function login(request: Request, env: Env, repo: Repo): Promise<Response> {
  const p = await params(request);
  const issuer = p.get('iss') ?? '', clientId = p.get('client_id') ?? '';
  const platform = await repo.getLtiPlatform(issuer,clientId);
  if (!platform || platform.status !== 'active') throw new LtiFailure('login-unknown-platform','This LMS is not registered or enabled in Tessera.');
  const target = p.get('target_link_uri') ?? '';
  if (target !== new URL('/lti/launch',request.url).href) throw new LtiFailure('login-invalid-target','The LMS launch target does not match Tessera.');
  const state = randomToken(), nonce = randomToken();
  const redirect = safeUrl(platform.authLoginUrl,env.ENVIRONMENT === 'local');
  for (const [key,value] of Object.entries({scope:'openid',response_type:'id_token',response_mode:'form_post',prompt:'none',client_id:clientId,redirect_uri:target,login_hint:p.get('login_hint') ?? '',state,nonce,lti_message_hint:p.get('lti_message_hint') ?? ''})) redirect.searchParams.set(key,value);
  return new Response(null,{status:302,headers:{location:redirect.href,'set-cookie':`lti_state_${state}=${nonce}; Path=/lti; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=600`,'cache-control':'no-store'}});
}
function readNonce(request: Request, state: string): string | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return null;
  return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('lti_state_'+state+'='))?.split('=')[1] ?? null;
}
async function launch(request: Request, env: Env, repo: Repo): Promise<Response> {
  const form = await params(request), state = form.get('state') ?? '', nonce = readNonce(request,state);
  if (!nonce) throw new LtiFailure('launch-state-mismatch','The LMS launch state did not match this browser. Relaunch from the LMS.');
  const idToken = form.get('id_token') ?? '';
  let unsigned: Record<string,unknown>;
  try { unsigned = JSON.parse(new TextDecoder().decode((await import('./jwt')).fromB64url(idToken.split('.')[1] ?? ''))); }
  catch { throw new LtiFailure('launch-invalid-jwt','The LMS launch token is malformed.'); }
  const aud = Array.isArray(unsigned.aud) ? unsigned.aud : [unsigned.aud];
  const platform = (await Promise.all(aud.filter((x):x is string=>typeof x==='string').map(x=>repo.getLtiPlatform(text(unsigned.iss),x)))).find(Boolean)
    ?? (await repo.listLtiPlatforms()).find(x=>x.issuer===unsigned.iss);
  if (!platform || platform.status !== 'active') throw new LtiFailure('launch-unknown-platform','This LMS is not registered or enabled in Tessera.');
  const claims = await verifyPlatformJwt(idToken,platform,fetch,Date.now(),env.ENVIRONMENT==='local');
  if (claims.nonce !== nonce) throw new LtiFailure('launch-state-mismatch','The LMS launch nonce did not match this browser.');
  const deploymentId = text(claims[DEPLOYMENT]);
  if (!platform.deploymentIds.includes(deploymentId)) throw new LtiFailure('launch-unknown-deployment','This LMS deployment is not registered in Tessera.');
  if (claims[MESSAGE] !== 'LtiResourceLinkRequest') throw new LtiFailure('launch-wrong-message','This LMS message is not a resource link launch.');
  const context = object(claims[CONTEXT]), resource = object(claims[RESOURCE]);
  if (!text(claims.sub) || !text(context.id) || !text(resource.id)) throw new LtiFailure('launch-missing-claim','The LMS launch is missing a user, course, or resource link.');
  const now = new Date().toISOString(), expiry = new Date(Date.now()+3600_000).toISOString();
  if (!await repo.claimLtiReplay('state',platform.id+':'+state,expiry,now) || !await repo.claimLtiReplay('nonce',platform.id+':'+nonce,expiry,now)) throw new LtiFailure('launch-nonce-reused','This LMS launch was already used. Relaunch from the LMS.');
  const nrps = object(claims[NRPS]), ags = object(claims[AGS]);
  const result = await prepareLtiLaunch(deps(repo),{
    platform,sub:text(claims.sub),roles:claims[ROLES],email:text(claims.email) || null,name:text(claims.name) || null,
    deploymentId,contextId:text(context.id),contextTitle:text(context.title),contextLabel:text(context.label),
    resourceLinkId:text(resource.id),returnUrl:text(claims['https://purl.imsglobal.org/spec/lti/claim/launch_presentation'] && object(claims['https://purl.imsglobal.org/spec/lti/claim/launch_presentation']).return_url) || null,
    nrpsUrl:text(nrps.context_memberships_url) || null,agsLineItemsUrl:text(ags.lineitems) || null,
  });
  if (!result.context.courseId) {
    return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Link this course</title><body><main><h1>Course link needed</h1><p>The LMS course ${htmlEscape(result.context.title || result.context.contextId)} was recognized. Ask a Tessera administrator to link it to a Tessera course, then relaunch from the LMS.</p><p>Context ID: <code>${htmlEscape(result.context.id)}</code></p></main></body></html>`,{status:409,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  }
  if (!result.role) throw new LtiFailure('launch-role-unmapped','The LMS did not send an instructor or learner role for this course.');
  const minted = await finishLtiLaunch(deps(repo),{context:result.context,userId:result.userId,role:result.role,resourceLinkId:text(resource.id),returnUrl:null});
  const path = result.role === 'student' ? `/embed/courses/${encodeURIComponent(result.context.courseId)}` : `/embed/teach/courses/${encodeURIComponent(result.context.courseId)}`;
  const page = await embedPage(request,env,minted.token,path);
  page.headers.append('set-cookie',toolSessionCookie(minted.token));
  page.headers.append('set-cookie',`lti_state_${state}=; Path=/lti; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=0`);
  return page;
}
async function embedPage(request: Request, env: Env, token: string | null, path: string): Promise<Response> {
  const asset = await env.ASSETS.fetch(new Request(new URL('/app/',request.url),{headers:request.headers}));
  if (!asset.ok) return asset;
  let body = await asset.text();
  body = body.replaceAll('/app/','/embed/');
  if (token) body = body.replace('</head>',`<script>window.__TESSERA_TOOL_SESSION__=${JSON.stringify(token)};history.replaceState(null,'',${JSON.stringify(path)});</script></head>`);
  return new Response(body,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'}});
}
export async function handleLti(request: Request, env: Env, ensureSeeded: (db:D1Database,repo:Repo)=>Promise<void>): Promise<Response> {
  try {
    const path = new URL(request.url).pathname;
    if (path === '/lti/jwks' && request.method === 'GET') return json(await toolJwks(env.LTI_PRIVATE_JWK ?? ''));
    if (path.startsWith('/embed/') && request.method === 'GET') {
      if (path.startsWith('/embed/assets/')) return env.ASSETS.fetch(new Request(new URL(path.replace(/^\/embed\//,'/app/'),request.url),{headers:request.headers}));
      return embedPage(request,env,null,path);
    }
    const repo = new D1Repo(env.DB); await ensureSeeded(env.DB,repo);
    if (path === '/lti/login' && ['GET','POST'].includes(request.method)) return await login(request,env,repo);
    if (path === '/lti/launch' && request.method === 'POST') return await launch(request,env,repo);
    if (path === '/lti/register' && request.method === 'POST') return await register(request,env,repo);
    if (path.startsWith('/lti/contexts/') && path.endsWith('/link') && request.method === 'POST') {
      const user = await admin(request,env,repo);
      const id = path.split('/')[3], context = await repo.getLtiContextById(id);
      if (!context) throw new ApiError('not-found','LMS context not found.');
      const body = await request.json() as {courseId?:unknown};
      if (typeof body.courseId !== 'string') throw new ApiError('invalid','Choose a Tessera course.');
      return json(await linkLtiContext(deps(repo),{context,courseId:body.courseId,actorId:user.id}));
    }
    if (path === '/lti/platforms' && request.method === 'GET') { await admin(request,env,repo); return json(await repo.listLtiPlatforms()); }
    if (path.startsWith('/lti/platforms/') && path.endsWith('/contexts') && request.method === 'GET') { await admin(request,env,repo); return json(await repo.listLtiContexts(path.split('/')[3])); }
    return json({error:{code:'not-found',message:'No LTI route matches this request.'}},404);
  } catch (error) {
    if (error instanceof LtiFailure) return fail(error);
    if (error instanceof ApiError) return json({error:{code:error.code,message:error.message}},error.status);
    console.error('LTI request failed',error);
    return json({error:{code:'internal',message:'The LMS request could not be completed. Try again.'}},500);
  }
}

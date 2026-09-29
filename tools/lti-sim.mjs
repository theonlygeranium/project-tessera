#!/usr/bin/env node
// Fictional Meridian State Canvas LTI 1.3 platform for local Worker testing.
import { createServer } from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';

const port = Number(process.env.LTI_SIM_PORT ?? 9900);
const tool = process.env.LTI_TOOL_ORIGIN ?? 'http://localhost:8787';
const clientId = process.env.LTI_CLIENT_ID ?? 'tessera-local';
const issuer = 'https://canvas.meridian.example';
const deploymentId = 'meridian-state-2026';
const {privateKey,publicKey} = generateKeyPairSync('rsa',{modulusLength:2048});
const jwk = {...publicKey.export({format:'jwk'}),kid:'meridian-sim-1',alg:'RS256',use:'sig'};
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const send = (res,status,body,type='text/html; charset=utf-8') => { res.writeHead(status,{'content-type':type,'cache-control':'no-store'}); res.end(body); };
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const registration = {
  name:'Meridian State Canvas',issuer,clientId,deploymentIds:[deploymentId],
  authLoginUrl:`http://localhost:${port}/authorize`,authTokenUrl:`http://localhost:${port}/token`,
  jwksUrl:`http://localhost:${port}/jwks`,services:{ags:false,nrps:false,deepLinking:false},
};
createServer((req,res) => {
  const url = new URL(req.url,`http://localhost:${port}`);
  if (url.pathname === '/jwks') return send(res,200,JSON.stringify({keys:[jwk]}),'application/json');
  if (url.pathname === '/registration') return send(res,200,JSON.stringify(registration,null,2),'application/json');
  if (url.pathname === '/start') {
    const login = new URL('/lti/login',tool);
    for (const [key,value] of Object.entries({iss:issuer,client_id:clientId,target_link_uri:new URL('/lti/launch',tool).href,login_hint:'meridian-priya',lti_message_hint:'stat110'})) login.searchParams.set(key,value);
    res.writeHead(302,{location:login.href}); return res.end();
  }
  if (url.pathname === '/authorize') {
    const now = Math.floor(Date.now()/1000);
    const role = url.searchParams.get('role') === 'instructor' ? 'Instructor' : 'Learner';
    const payload = {
      iss:issuer,sub:role === 'Instructor' ? 'okafor-001' : 'priya-001',aud:clientId,iat:now,exp:now+300,
      nonce:url.searchParams.get('nonce'),name:role === 'Instructor' ? 'Dr. Okafor' : 'Priya Natarajan',
      email:role === 'Instructor' ? 'okafor@meridian.example' : 'priya@meridian.example',
      'https://purl.imsglobal.org/spec/lti/claim/deployment_id':deploymentId,
      'https://purl.imsglobal.org/spec/lti/claim/message_type':'LtiResourceLinkRequest',
      'https://purl.imsglobal.org/spec/lti/claim/version':'1.3.0',
      'https://purl.imsglobal.org/spec/lti/claim/roles':[`http://purl.imsglobal.org/vocab/lis/v2/membership#${role}`],
      'https://purl.imsglobal.org/spec/lti/claim/context':{id:'stat110-fall-2026',title:'Statistics 110',label:'STAT 110 · Fall 2026'},
      'https://purl.imsglobal.org/spec/lti/claim/resource_link':{id:'stat110-course-link',title:'Open Tessera course'},
    };
    const content = encode({alg:'RS256',kid:jwk.kid,typ:'JWT'})+'.'+encode(payload);
    const jwt = content+'.'+sign('RSA-SHA256',Buffer.from(content),privateKey).toString('base64url');
    const destination = url.searchParams.get('redirect_uri');
    if (destination !== new URL('/lti/launch',tool).href) return send(res,400,'Invalid redirect URI.','text/plain');
    return send(res,200,`<!doctype html><html lang="en"><meta charset="utf-8"><title>Launching Tessera</title><body><form id="launch" method="post" action="${escape(destination)}"><input type="hidden" name="state" value="${escape(url.searchParams.get('state'))}"><input type="hidden" name="id_token" value="${escape(jwt)}"><button>Launch Tessera</button></form><script>document.getElementById('launch').submit()</script></body></html>`);
  }
  send(res,404,'Not found.','text/plain');
}).listen(port,'127.0.0.1',() => {
  process.stdout.write(`Meridian State Canvas simulator: http://localhost:${port}/start\n`);
  process.stdout.write(`Registration fields: http://localhost:${port}/registration\n`);
  process.stdout.write(`POST these fields to ${tool}/lti/register with cookie tessera_user=u-admin.\n`);
});

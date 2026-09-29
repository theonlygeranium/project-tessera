import type { LtiPlatform } from '../../shared/domain';

const encoder = new TextEncoder();
type LtiJwk = JsonWebKey & {kid?:string; use?:string; alg?:string; n?:string; e?:string; d?:string};
const cache = new Map<string,{until:number; keys:LtiJwk[]}>();
export class LtiFailure extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export const b64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export function fromB64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new LtiFailure('launch-invalid-jwt','The LMS launch token has invalid encoding.');
  const raw = atob(value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-value.length%4)%4));
  return Uint8Array.from(raw,c => c.charCodeAt(0));
}
export function randomToken(): string { return b64url(crypto.getRandomValues(new Uint8Array(32))); }
export function safeUrl(value: string, local = false): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new LtiFailure('registration-invalid-url','The LMS URL is invalid.'); }
  if (url.username || url.password || !(url.protocol === 'https:' || local && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new LtiFailure('registration-invalid-url','LMS URLs must use HTTPS.');
  return url;
}
export async function platformKeys(platform: LtiPlatform, fetcher: typeof fetch = fetch, local = false): Promise<LtiJwk[]> {
  const url = safeUrl(platform.jwksUrl,local).href;
  const found = cache.get(url);
  if (found && found.until > Date.now()) return found.keys;
  const response = await fetcher(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(5000)});
  if (!response.ok) throw new LtiFailure('launch-jwks-unavailable','The LMS signing keys could not be loaded. Ask the administrator to check its JWKS URL.');
  const body = await response.json() as {keys?:unknown};
  if (!Array.isArray(body.keys) || body.keys.length > 32) throw new LtiFailure('launch-jwks-invalid','The LMS signing keys are invalid.');
  const keys = body.keys as LtiJwk[];
  cache.set(url,{until:Date.now()+600_000,keys});
  return keys;
}
export async function verifyPlatformJwt(token: string, platform: LtiPlatform, fetcher: typeof fetch = fetch, now = Date.now(), local = false): Promise<Record<string,unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(x => !x)) throw new LtiFailure('launch-invalid-jwt','The LMS launch token is malformed.');
  let header: Record<string,unknown>, claims: Record<string,unknown>;
  try {
    header = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
  } catch { throw new LtiFailure('launch-invalid-jwt','The LMS launch token is malformed.'); }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) throw new LtiFailure('launch-invalid-jwt','The LMS launch uses an unsupported signing key.');
  const keys = await platformKeys(platform,fetcher,local);
  const key = keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256'));
  if (!key) throw new LtiFailure('launch-invalid-signature','The LMS signing key is unknown.');
  let valid = false;
  try {
    const imported = await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5',imported,fromB64url(parts[2]),encoder.encode(parts[0]+'.'+parts[1]));
  } catch { /* invalid key or signature */ }
  if (!valid) throw new LtiFailure('launch-invalid-signature','The LMS launch signature is invalid.');
  const seconds = now/1000;
  if (claims.iss !== platform.issuer || (claims.aud !== platform.clientId && (!Array.isArray(claims.aud) || !claims.aud.includes(platform.clientId))) || (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== platform.clientId)) throw new LtiFailure('launch-wrong-audience','The LMS launch is addressed to another tool.');
  if (typeof claims.exp !== 'number' || claims.exp < seconds-300 || typeof claims.iat !== 'number' || claims.iat > seconds+300 || claims.iat < seconds-300 || (typeof claims.nbf === 'number' && claims.nbf > seconds+300)) throw new LtiFailure('launch-expired','The LMS launch has expired. Relaunch from the LMS.');
  return claims;
}
export async function toolJwks(privateJwk: string): Promise<{keys:LtiJwk[]}> {
  let key: LtiJwk;
  try { key = JSON.parse(privateJwk); } catch { throw new LtiFailure('tool-key-invalid','The Tessera signing key is not configured.'); }
  if (key.kty !== 'RSA' || !key.kid || !key.n || !key.e || !key.d) throw new LtiFailure('tool-key-invalid','The Tessera signing key is invalid.');
  const {kty,kid,n,e,alg} = key;
  return {keys:[{kty,kid,n,e,alg:alg ?? 'RS256',use:'sig'}]};
}

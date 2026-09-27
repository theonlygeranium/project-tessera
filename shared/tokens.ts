// API token primitives (D-020), shared by the service (create, list, revoke) and the
// Worker (verify). A token is `tsk_` + 40 characters; only its SHA-256 is stored, and
// `prefix` (the 8 characters after `tsk_`) identifies it in lists.
import type { ApiToken, Scope } from './domain';

export const TOKEN_PREFIX = 'tsk_';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// `crypto` is global in Workers, browsers, and Node 19+; shared/ compiles without those types.
declare const crypto: { getRandomValues(a: Uint8Array): Uint8Array; subtle: { digest(alg: string, data: Uint8Array): Promise<ArrayBuffer> } };
declare class TextEncoder { encode(s: string): Uint8Array }

export function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(40));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return TOKEN_PREFIX + out;
}

export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function prefixOf(secret: string): string {
  return secret.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + 8);
}

export function looksLikeToken(value: string): boolean {
  return value.startsWith(TOKEN_PREFIX) && value.length === TOKEN_PREFIX.length + 40;
}

export function isExpired(token: Pick<ApiToken, 'expiresAt' | 'revokedAt'>, now: string): boolean {
  if (token.revokedAt) return true;
  return !!token.expiresAt && token.expiresAt <= now;
}

export function hasScope(token: Pick<ApiToken, 'scopes'>, scope: Scope | null): boolean {
  return scope === null || token.scopes.includes(scope);
}

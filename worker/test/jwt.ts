// RS256 tokens for Access tests. The public JWK is what the certs endpoint returns.

export async function createTestKey(kid = 'test-key') {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  jwk.kid = kid;
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  return { kid, privateKey: pair.privateKey, jwk };
}

export async function signJwt(privateKey: CryptoKey, kid: string, payload: Record<string, unknown>): Promise<string> {
  const header = { alg: 'RS256', kid, typ: 'JWT' };
  const encodedHeader = base64Url(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signed = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  return `${encodedHeader}.${encodedPayload}.${base64Url(new Uint8Array(signed))}`;
}

/** Flips a signature character so the token still decodes but no longer verifies. */
export function tamper(token: string): string {
  const [header, payload, signature] = token.split('.');
  const flipped = signature[0] === 'A' ? 'B' : 'A';
  return `${header}.${payload}.${flipped}${signature.slice(1)}`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

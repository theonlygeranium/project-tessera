import { looksLikeToolSessionToken } from '../../shared/service/interop/tool-sessions';

/** A tool bearer has priority. The partitioned cookie is accepted only on same-origin requests. */
export function toolSessionCredential(request: Request): string | null {
  const bearer = toolSessionBearerToken(request);
  if (bearer) return bearer;
  const site = request.headers.get('sec-fetch-site');
  const origin = request.headers.get('origin');
  if (site !== 'same-origin' && (!origin || origin !== new URL(request.url).origin)) return null;
  const cookie = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith('tessera_tool_session='));
  if (!cookie) return null;
  const token = cookie.slice('tessera_tool_session='.length);
  return token.startsWith('tts_') ? token : null;
}

export function toolSessionBearerToken(request: Request): string | null {
  return /^(?:[Bb][Ee][Aa][Rr][Ee][Rr]) (tts_[A-Za-z0-9]{40})$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? null;
}

/** A malformed tool bearer is still a tool credential attempt, never Access fallback. */
export function isToolSessionBearerAttempt(request: Request): boolean {
  return /^(?:[Bb][Ee][Aa][Rr][Ee][Rr])[ \t]+tts_/.test(request.headers.get('authorization') ?? '');
}

export function toolSessionCookie(token: string, maxAge = 7200): string {
  if (!looksLikeToolSessionToken(token)) throw new Error('Invalid tool session token.');
  return `tessera_tool_session=${token}; Path=/api; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${Math.max(0, Math.min(7200, Math.floor(maxAge)))}`;
}

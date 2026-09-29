import { ApiError } from '../../api';
import type { Id, Timestamp, ToolSession } from '../../domain';
import type { Repo } from '../../repo';
import { generateSecret, hashSecret } from '../../tokens';

type Deps = { repo: Repo; now(): Timestamp; newId(prefix: string): Id };
const HOUR = 60 * 60 * 1000;
export const looksLikeToolSessionToken = (value: string): boolean => /^tts_[A-Za-z0-9]{40}$/.test(value);

export async function mintToolSession(deps: Deps, input: { userId: Id; courseId: Id; role: 'instructor' | 'student'; platformId: Id; contextId: Id; resourceLinkId?: string | null; returnUrl?: string | null }): Promise<{ token: string; session: ToolSession }> {
  if (input.role !== 'instructor' && input.role !== 'student') throw new ApiError('invalid', 'Invalid tool-session role.');
  if (input.returnUrl !== null && input.returnUrl !== undefined) {
    try { if (new URL(input.returnUrl).protocol !== 'https:') throw new Error(); }
    catch { throw new ApiError('invalid', 'Return URL must use HTTPS.'); }
  }
  const token = `tts_${generateSecret().slice(4)}`;
  const createdAt = deps.now();
  const session: ToolSession = { id:deps.newId('tts'), tokenHash:await hashSecret(token), userId:input.userId, courseId:input.courseId, role:input.role, platformId:input.platformId, contextId:input.contextId, resourceLinkId:input.resourceLinkId ?? null, createdAt, expiresAt:new Date(Date.parse(createdAt)+2*HOUR).toISOString(), returnUrl:input.returnUrl ?? null, revokedAt:null };
  await deps.repo.replaceToolSession(session);
  return { token, session };
}

export async function verifyToolSession(deps: Pick<Deps, 'repo' | 'now'>, token: string): Promise<ToolSession | null> {
  if (!looksLikeToolSessionToken(token)) return null;
  const session = await deps.repo.getToolSessionByHash(await hashSecret(token));
  const now = deps.now();
  if (!session || session.revokedAt || session.expiresAt <= now || Date.parse(now) >= Date.parse(session.createdAt)+8*HOUR) return null;
  const proposed = Math.min(Date.parse(session.createdAt)+8*HOUR, Date.parse(now)+2*HOUR);
  if (proposed >= Date.parse(session.expiresAt)+60_000 && await deps.repo.extendToolSession(session.id,new Date(proposed).toISOString(),now)) session.expiresAt = new Date(proposed).toISOString();
  return session;
}

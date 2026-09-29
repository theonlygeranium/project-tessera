import { ApiError } from '../../api';
import type { Id, IdentityLinkSuggestion, Timestamp, User } from '../../domain';
import type { Repo } from '../../repo';
import { initialsFor } from '../../policy';
import { mapLisRoles } from './roles';
import { asciiLower } from './ascii';
import { findAsciiUserByEmail } from './ascii-email';

type Deps = { repo: Repo; now(): Timestamp; newId(prefix: string): Id };
export function ltiIdentityKey(platformId: Id, sub: string): string {
  if (typeof platformId !== 'string' || !platformId.trim() || platformId.includes('|') || typeof sub !== 'string' || !sub.trim() || sub.length > 255) throw new ApiError('invalid', 'Invalid LTI platform or subject.');
  return `${platformId}|${sub}`;
}

export async function resolveLtiUser(deps: Deps, claims: { platformId: Id; sub: string; email?: string | null; name?: string | null; roles: unknown }): Promise<{ user: User; created: boolean; courseRole: 'instructor' | 'student' | null; suggestion: IdentityLinkSuggestion | null }> {
  const key = ltiIdentityKey(claims.platformId, claims.sub);
  const courseRole = mapLisRoles(claims.roles);
  const existing = await deps.repo.getUserIdentity('lti', key);
  if (existing) {
    const user = await deps.repo.getUser(existing.userId);
    if (!user) throw new ApiError('unauthenticated', 'Linked user no longer exists.');
    await deps.repo.touchUserIdentity('lti', key, deps.now());
    return { user, created: false, courseRole, suggestion: null };
  }
  const id = deps.newId('u');
  const name = claims.name?.trim() || 'LMS user';
  const proposed: User = { id, name, initials: initialsFor(name), email: `lti-${id}@lti.invalid`, role: courseRole ?? 'student', profile: null };
  const now = deps.now();
  const result = await deps.repo.insertUserWithIdentity(proposed, { userId: id, kind: 'lti', key, linkedAt: now, linkedBy: 'first-sign-in', lastSeenAt: now });
  const user = result.user;
  let suggestion: IdentityLinkSuggestion | null = null;
  const assertedEmail = claims.email?.trim();
  const email = assertedEmail ? asciiLower(assertedEmail) : undefined;
  if (email && /^[\x00-\x7F]*$/.test(assertedEmail!) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const target = await findAsciiUserByEmail(deps.repo, email);
    if (target && !/^lti-.+@lti\.invalid$/i.test(target.email) && target.id !== user.id) {
      const candidate: IdentityLinkSuggestion = { id: deps.newId('ils'), identityKind: 'lti', identityKey: key, fromUserId: user.id, targetUserId: target.id, email, createdAt: now, resolvedAt: null };
      await deps.repo.putIdentityLinkSuggestion(candidate);
      suggestion = (await deps.repo.listIdentityLinkSuggestions({})).find(s => s.identityKind === 'lti' && s.identityKey === key && s.targetUserId === target.id) ?? candidate;
    }
  }
  return { user, created: result.inserted, courseRole, suggestion };
}

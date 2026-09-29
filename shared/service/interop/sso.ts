import { ApiError } from '../../api';
import type { Id, Timestamp, User } from '../../domain';
import type { Repo } from '../../repo';
import { initialsFor } from '../../policy';
import { asciiLower } from './ascii';

const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export function normalizeSsoDomains(domains: string[]): string[] {
  if (!Array.isArray(domains) || domains.length > 50) throw new ApiError('invalid', 'SSO domains must contain at most 50 hostnames.');
  const out = domains.map(raw => {
    const domain = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!HOST.test(domain)) throw new ApiError('invalid', `Invalid SSO domain: ${String(raw)}`);
    return domain;
  });
  return [...new Set(out)].sort();
}

export async function jitProvisionAccessUser(deps: { repo: Repo; now(): Timestamp; newId(prefix: string): Id }, email: string): Promise<User | null> {
  if (typeof email !== 'string') return null;
  // Access identities in scope use ASCII email. Reject Unicode before any lookup or folding.
  if (!/^[\x00-\x7F]*$/.test(email)) return null;
  const normalized = asciiLower(email.trim());
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1 || normalized.indexOf('@') !== at) return null;
  const institution = await deps.repo.getInstitution();
  if (!institution.sso?.domains.includes(normalized.slice(at+1))) return null;
  const local = normalized.slice(0,at);
  const name = local.replace(/[._+-]+/g,' ').trim() || 'Student';
  const id = deps.newId('u');
  const user: User = { id, name, email:normalized, role:'student', initials:initialsFor(name), profile:null };
  return (await deps.repo.insertUserWithIdentity(user,{ userId:id,kind:'access-email',key:normalized,linkedAt:deps.now(),linkedBy:'first-sign-in',lastSeenAt:deps.now() })).user;
}

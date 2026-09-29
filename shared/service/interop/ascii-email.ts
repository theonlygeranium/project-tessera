import type { User } from '../../domain';
import type { Repo } from '../../repo';
import { asciiLower } from './ascii';

const isAscii = (value: string): boolean => /^[\x00-\x7F]*$/.test(value);

/**
 * Find a user by an ASCII email, matching only ASCII-stored emails via
 * asciiLower. Survives a Unicode collision that findUserByEmail may return
 * first under JavaScript case folding (MemoryRepo) but not under SQLite.
 */
export async function findAsciiUserByEmail(repo: Repo, email: string): Promise<User | null> {
  if (!isAscii(email)) return null;
  const want = asciiLower(email.trim());
  if (!want) return null;
  const hit = await repo.findUserByEmail(email);
  if (hit && isAscii(hit.email) && asciiLower(hit.email) === want) return hit;
  return (await repo.listUsers()).find((user) => isAscii(user.email) && asciiLower(user.email) === want) ?? null;
}

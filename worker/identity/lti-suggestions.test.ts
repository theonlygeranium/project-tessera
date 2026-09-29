import { describe, expect, it } from 'vitest';
import { seedData } from '../../shared/seed';
import { MemoryRepo } from '../../shared/service/memory-repo';
import { resolveLtiUser } from '../../shared/service/interop/identity';
import { D1Repo } from '../d1-repo';
import { createTestDb } from '../test/d1-shim';

describe('LTI email suggestion interop', () => {
  it('suggests only ASCII email matches on both repositories', async () => {
    const d1 = new D1Repo(createTestDb() as never);
    await d1.reset(seedData());
    for (const repo of [new MemoryRepo(seedData()), d1]) {
      const ascii = { id: 'u-emile-ascii', name: 'Emile', email: 'Emile@meridian.edu', role: 'instructor' as const, initials: 'E', profile: null };
      const unicode = { id: 'u-emile-unicode', name: 'Émile', email: 'Émile@meridian.edu', role: 'instructor' as const, initials: 'É', profile: null };
      await repo.putUser(ascii);
      await repo.putUser(unicode);
      let next = 0;
      const deps = { repo, now: () => '2026-09-28T00:00:00.000Z', newId: (prefix: string) => `${prefix}-interop-${++next}` };
      const matched = await resolveLtiUser(deps, { platformId: 'p', sub: 'ascii', email: ' EMILE@MERIDIAN.EDU ', roles: [] });
      expect(matched.suggestion).toMatchObject({ targetUserId: ascii.id, email: 'emile@meridian.edu' });
      const untrusted = await resolveLtiUser(deps, { platformId: 'p', sub: 'unicode', email: unicode.email, roles: [] });
      expect(untrusted.suggestion).toBeNull();
      expect(await repo.listIdentityLinkSuggestions({})).toHaveLength(1);
      expect(await repo.getUser(unicode.id)).toEqual(unicode);
      expect(await repo.listUserIdentities(unicode.id)).toEqual([]);
    }
  });
});

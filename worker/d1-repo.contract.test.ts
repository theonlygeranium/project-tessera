// The shared Repo conformance suite (shared/service/repo-contract.ts) against D1Repo,
// so the Worker's storage behaves exactly like the mock's MemoryRepo.
import { seedData } from '../shared/seed';
import { describeRepoContract } from '../shared/service/repo-contract';
import { D1Repo } from './d1-repo';
import { createTestDb } from './test/d1-shim';
import { expect, it } from 'vitest';

describeRepoContract('D1Repo', async () => {
  const repo = new D1Repo(createTestDb() as never);
  await repo.reset(seedData());
  return repo;
});

it('migration 0006 refuses updates to completion events', async () => {
  const db = createTestDb();
  const repo = new D1Repo(db as never);
  await repo.reset(seedData());
  await repo.appendCompletionEvent({ id: 'event-1', at: '2026-09-27T00:00:00Z', userId: 'u-priya', courseId: 'c-stat110', requirementId: null, kind: 'completed', actorId: null, detail: 'Finished.' });
  await expect(db.prepare('UPDATE completion_events SET detail = ? WHERE id = ?').bind('Changed.', 'event-1').run()).rejects.toThrow(/append-only/);
});

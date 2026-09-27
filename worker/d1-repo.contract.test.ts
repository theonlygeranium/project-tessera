// The shared Repo conformance suite (shared/service/repo-contract.ts) against D1Repo,
// so the Worker's storage behaves exactly like the mock's MemoryRepo.
import { seedData } from '../shared/seed';
import { describeRepoContract } from '../shared/service/repo-contract';
import { D1Repo } from './d1-repo';
import { createTestDb } from './test/d1-shim';

describeRepoContract('D1Repo', async () => {
  const repo = new D1Repo(createTestDb() as never);
  await repo.reset(seedData());
  return repo;
});

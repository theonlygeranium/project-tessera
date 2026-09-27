import { MemoryRepo } from './memory-repo';
import { seedData } from '../seed';
import { describeRepoContract } from './repo-contract';

describeRepoContract('MemoryRepo contract', async () => new MemoryRepo(seedData()));

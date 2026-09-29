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

it('migration 0013 refuses updates to immutable worker versions', async () => {
  const db=createTestDb(),repo=new D1Repo(db as never);await repo.reset(seedData());
  await repo.insertWorkerRecord({employeeId:'MS-901',email:'avery@example.test',name:'Avery Chen',jobCode:'FL-1',jobTitle:'Facilities staff',department:'Facilities and Operations',location:'North Campus Facilities',employmentType:'full-time',managerEmployeeId:null,hireDate:null,status:'active',effectiveAt:'2026-09-28T00:00:00.000Z',receivedAt:'2026-09-28T12:00:00.000Z',source:'csv',importId:'imp-test'});
  await expect(db.prepare('UPDATE worker_records SET job_code = ? WHERE employee_id = ?').bind('FL-2','MS-901').run()).rejects.toThrow(/append-only/);
});

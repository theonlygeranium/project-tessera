import { describe, expect, it } from 'vitest';
import { seedData } from '../shared/seed';
import { D1Repo } from './d1-repo';
import { GenerationWorkflow } from './generation-workflow';
import { createTestDb } from './test/d1-shim';

/** Runs step callbacks inline, like a Workflow with no failures. */
const step = { do: async (_name: string, _config: unknown, fn: () => Promise<unknown>) => fn() };

describe('GenerationWorkflow (carry-over 4)', () => {
  it('advances a workflow-owned job to done, one batch per step', async () => {
    const db = createTestDb();
    const repo = new D1Repo(db);
    await repo.reset(seedData());
    const now = '2026-09-27T12:00:00.000Z';
    await repo.putGenerationJob({ id: 'gj-w', courseId: 'c-stat110', requestedBy: 'u-okafor', state: 'running', done: 0, total: 3, lessonIds: [], error: null,
      work: [{ lessonId: 'l-stat-1', type: 'text' }, { lessonId: 'l-stat-2', type: 'text' }, { lessonId: 'l-stat-2', type: 'check' }], instruction: '', failures: [], createdAt: now, updatedAt: now, runner: 'workflow' });
    const workflow = new GenerationWorkflow({} as never, { DB: db, ENVIRONMENT: 'local' } as never);
    const result = await workflow.run({ payload: { jobId: 'gj-w' } } as never, step as never);
    expect(result).toBe('done');
    const job = (await repo.getGenerationJob('gj-w'))!;
    expect([job.done, job.state, job.runner]).toEqual([3, 'done', 'workflow']);
  });

  it('stops when polling has taken the job over', async () => {
    const db = createTestDb();
    const repo = new D1Repo(db);
    await repo.reset(seedData());
    const now = '2026-09-27T12:00:00.000Z';
    await repo.putGenerationJob({ id: 'gj-p', courseId: 'c-stat110', requestedBy: 'u-okafor', state: 'running', done: 0, total: 1, lessonIds: [], error: null,
      work: [{ lessonId: 'l-stat-1', type: 'text' }], instruction: '', failures: [], createdAt: now, updatedAt: now });
    const workflow = new GenerationWorkflow({} as never, { DB: db, ENVIRONMENT: 'local' } as never);
    expect(await workflow.run({ payload: { jobId: 'gj-p' } } as never, step as never)).toBe('stopped');
    expect((await repo.getGenerationJob('gj-p'))?.done).toBe(0);
  });
});

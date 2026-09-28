import { describe, expect, it } from 'vitest';
import { seedData } from '../shared/seed';
import { D1Repo } from './d1-repo';
import { GenerationWorkflow } from './generation-workflow';
import { createTestDb } from './test/d1-shim';

/** Runs step callbacks inline, like a Workflow with no failures. */
const step = { do: async (_name: string, config: unknown, fn?: () => Promise<unknown>) => (fn ?? config as () => Promise<unknown>)() };

describe('GenerationWorkflow (carry-over 4)', () => {
  it('schedules a continuation when more than 120 durable steps remain', async () => {
    const db = createTestDb();
    const repo = new D1Repo(db);
    await repo.reset(seedData());
    const work = Array.from({ length: 241 }, () => ({ lessonId: 'missing', type: 'text' as const }));
    await repo.putGenerationJob({ id: 'gj-long', courseId: 'c-stat110', requestedBy: 'u-okafor', state: 'running', done: 0, total: work.length, lessonIds: [], error: null,
      work, instruction: '', failures: [], createdAt: '2026-09-28T12:00:00Z', updatedAt: '2026-09-28T12:00:00Z', runner: 'workflow' });
    const created: { id: string; params: { jobId: string } }[] = [];
    const env = { DB: db, ENVIRONMENT: 'local', GENERATION: { create: async (value: { id: string; params: { jobId: string } }) => { created.push(value); } } };
    const workflow = new GenerationWorkflow({} as never, env as never);
    expect(await workflow.run({ payload: { jobId: 'gj-long' } } as never, step as never)).toBe('running');
    expect((await repo.getGenerationJob('gj-long'))?.work).toHaveLength(1);
    expect(created).toHaveLength(1);
    expect(created[0].params.jobId).toBe('gj-long');
    expect(await workflow.run({ payload: created[0].params } as never, step as never)).toBe('failed');
    expect((await repo.getGenerationJob('gj-long'))?.done).toBe(241);
  });
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

import { describe, expect, it, vi } from 'vitest';
import { fixtureAi } from '../ai';
import { seedData } from '../seed';
import type { ServiceContext } from './context';
import { advanceGenerationJob, WORKFLOW_STALL_MS } from './generation';
import { MemoryRepo, service } from './index';

let clock = Date.parse('2026-09-27T12:00:00.000Z');
async function ctxFor(background: ServiceContext['background'] = null): Promise<ServiceContext> {
  const repo = new MemoryRepo(seedData());
  let n = 0;
  return { repo, ai: fixtureAi, user: await repo.getUser('u-okafor'), now: () => new Date(clock).toISOString(), newId: (p) => `${p}-${++n}`, background };
}
const scope = { courseId: 'c-stat110', scope: { lessonIds: ['l-stat-1', 'l-stat-2'], elementTypes: ['text' as const, 'check' as const] } };

describe('generation runner (carry-over 4)', () => {
  it('without a background runner, each poll advances the job (previews, local, demo)', async () => {
    const ctx = await ctxFor();
    const { jobId } = await service.generateAtScope(ctx, scope);
    expect((await ctx.repo.getGenerationJob(jobId))?.runner).toBeUndefined();
    const first = await service.getGenerationJob(ctx, { jobId });
    expect(first.done).toBe(2);
  });

  it('hands the job to the background runner, and polls only report progress', async () => {
    const startGeneration = vi.fn(async () => {});
    const ctx = await ctxFor({ startGeneration });
    const { jobId } = await service.generateAtScope(ctx, scope);
    expect(startGeneration).toHaveBeenCalledWith(jobId);
    expect((await ctx.repo.getGenerationJob(jobId))?.runner).toBe('workflow');
    expect((await service.getGenerationJob(ctx, { jobId })).done).toBe(0);
    // The runner advances it.
    let job = (await ctx.repo.getGenerationJob(jobId))!;
    while (job.state === 'running') job = await advanceGenerationJob(ctx, job);
    expect(job.state).toBe('done');
    expect((await service.getGenerationJob(ctx, { jobId })).done).toBe(4);
    // Drafts, never published content (D-003).
    const blocks = await ctx.repo.listBlocks('l-stat-1');
    expect(blocks.filter((b) => b.origin === 'ai').every((b) => b.aiState === 'draft')).toBe(true);
  });

  it('falls back to polling when the runner can\'t start or has stalled', async () => {
    const failing = await ctxFor({ startGeneration: async () => { throw new Error('no workflow'); } });
    const a = await service.generateAtScope(failing, scope);
    expect((await failing.repo.getGenerationJob(a.jobId))?.runner).toBe('poll');
    expect((await service.getGenerationJob(failing, { jobId: a.jobId })).done).toBe(2);

    const ctx = await ctxFor({ startGeneration: async () => {} });
    const b = await service.generateAtScope(ctx, scope);
    clock += WORKFLOW_STALL_MS + 1000;
    expect((await service.getGenerationJob(ctx, { jobId: b.jobId })).done).toBe(2);
    expect((await ctx.repo.getGenerationJob(b.jobId))?.runner).toBe('poll');
  });
});

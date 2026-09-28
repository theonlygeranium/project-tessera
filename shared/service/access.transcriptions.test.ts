import { describe, expect, it, vi } from 'vitest';
import { fixtureAi } from '../ai';
import type { FileRecord, PageTranscription } from '../domain';
import { seedData } from '../seed';
import { access } from './access';
import type { DocumentEngine, ServiceContext } from './context';
import { MemoryRepo } from './memory-repo';

async function setup() {
  const repo = new MemoryRepo(seedData());
  const file: FileRecord = { id: 'file-review', courseId: 'c-stat110', name: 'Meridian State guide.pdf', kind: 'pdf', mime: 'application/pdf', size: 100, key: 'file', version: 3, uploadedBy: 'u-okafor', uploadedAt: '2026-09-27T00:00:00.000Z', scan: null };
  await repo.putFile(file);
  const draft: PageTranscription = { fileId: file.id, version: 3, page: 2, confidence: 42, text: 'Fictional course text', provenance: { model: 'palmyra-x5', task: 'element', generatedAt: '2026-09-27T00:00:00.000Z', sources: [{ id: file.id, name: file.name }], summary: 'Transcribed page 2 of Meridian State guide.pdf' }, state: 'pending', reviewedBy: null, reviewedByName: null, reviewedAt: null };
  const review = vi.fn(async (_file, _page, _decision, reviewer, now) => [{ ...draft, state: 'kept' as const, reviewedBy: reviewer.id, reviewedByName: reviewer.name, reviewedAt: now }]);
  const documents = { listTranscriptions: async () => [draft], reviewTranscription: review } as unknown as DocumentEngine;
  const ctx: ServiceContext = { repo, ai: fixtureAi, user: await repo.getUser('u-okafor'), documents, now: () => '2026-09-27T12:00:00.000Z', newId: () => 'x' };
  return { ctx, file, draft, review };
}

describe('file transcription review service', () => {
  it('lets assigned instructors review, records the signed-in name, and invalidates learner formats', async () => {
    const { ctx, file, review } = await setup();
    for (const format of ['reading', 'epub'] as const) await ctx.repo.putFormat({ fileId: file.id, version: file.version, format, state: 'ready', outputKey: `old-${format}`, generatedAt: ctx.now(), error: null });
    const result = await access.reviewTranscription(ctx, { fileId: file.id, page: 2, decision: 'keep' });
    expect(result[0]).toMatchObject({ reviewedBy: 'u-okafor', reviewedByName: 'Dr. Amara Okafor', state: 'kept' });
    expect(review).toHaveBeenCalledWith(file, 2, 'keep', ctx.user, ctx.now());
    for (const format of ['reading', 'epub'] as const) expect((await ctx.repo.getFormat(file.id, file.version, format))?.state).toBe('none');
  });

  it('lets reachable staff list, refuses unassigned reviewers, and returns [] in mock mode', async () => {
    const { ctx, file } = await setup();
    expect(await access.listTranscriptions(ctx, { fileId: file.id })).toHaveLength(1);
    const admin = { ...ctx, user: await ctx.repo.getUser('u-admin') };
    expect(await access.listTranscriptions(admin, { fileId: file.id })).toHaveLength(1);
    await expect(access.reviewTranscription(admin, { fileId: file.id, page: 2, decision: 'discard' })).rejects.toMatchObject({ code: 'forbidden' });
    expect(await access.listTranscriptions({ ...ctx, documents: null }, { fileId: file.id })).toEqual([]);
    await expect(access.listTranscriptions(ctx, { fileId: 'missing' })).rejects.toMatchObject({ code: 'not-found' });
  });
});

import { describe, expect, it } from 'vitest';
import { fixtureAi } from '../ai';
import type { Block, BlockContent } from '../domain';
import { seedData, SEED_NOW } from '../seed';
import { dispatch, MemoryRepo, service, type ServiceContext } from './index';
import { masterHash } from './variants';

let next = 0;
async function ctx(repo: MemoryRepo, userId: string, now = SEED_NOW): Promise<ServiceContext> {
  return { repo, ai: fixtureAi, user: await repo.getUser(userId), now: () => now, newId: prefix => `${prefix}-variant-test-${++next}` };
}
const masterId = 'l-stat-1';
const courseId = 'c-stat110';
const later = '2026-09-28T18:00:00.000Z';
const later2 = '2026-09-29T18:00:00.000Z';
const blockInput = (b: Block): { id: string } & BlockContent => ({ ...b });
async function keepAll(repo: MemoryRepo, teacher: ServiceContext, lessonId: string) {
  for (const b of await repo.listBlocks(lessonId)) if (b.aiState === 'draft') await dispatch(service, teacher, 'keepBlock', { blockId: b.id });
}

describe('persona variants', () => {
  it('hashes content only and enforces access, policy, and AI validation', async () => {
    const repo = new MemoryRepo(seedData()), teacher = await ctx(repo, 'u-okafor'), other = await ctx(repo, 'u-chen'), student = await ctx(repo, 'u-priya');
    const source = (await repo.getBlock('b-s1-2'))!;
    expect(masterHash({ ...source, id: 'other', position: 90, updatedAt: later, source: { blockId: 'x', hash: 'old' } })).toBe(masterHash(source));
    expect(masterHash({ ...source, text: `${(source as Extract<Block, { type: 'text' }>).text} ` } as Block)).not.toBe(masterHash(source));
    await expect(dispatch(service, other, 'createVariant', { lessonId: masterId, audience: 'plain' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(dispatch(service, student, 'listVariants', { lessonId: masterId })).rejects.toMatchObject({ code: 'forbidden' });
    const institution = await repo.getInstitution(); institution.policy.aiAuthoring = false; await repo.putInstitution(institution);
    await expect(dispatch(service, teacher, 'createVariant', { lessonId: masterId, audience: 'plain' })).rejects.toMatchObject({ code: 'ai-disabled' });
    institution.policy.aiAuthoring = true; await repo.putInstitution(institution);
    const bad = { ...teacher, ai: { run: async () => ({ output: { title: 'Bad', minutes: 12, blocks: [{ sourceBlockId: 'b-s1-2', content: { type: 'unknown' } }] }, model: 'broken' }) } as unknown as ServiceContext['ai'] };
    await expect(dispatch(service, bad, 'createVariant', { lessonId: masterId, audience: 'plain' })).rejects.toMatchObject({ code: 'ai-failed' });
    expect(await repo.listVariantLessons(masterId)).toHaveLength(0);
  });
  it('creates one draft per audience, tracks content hashes, and keeps plain non-text blocks in order', async () => {
    const repo = new MemoryRepo(seedData()), teacher = await ctx(repo, 'u-okafor');
    const master = await repo.getLesson(masterId);
    await repo.putBlock({ id: 'b-extra-link', lessonId: masterId, position: 5, origin: 'human', aiState: null, provenance: null, previous: null, updatedAt: SEED_NOW, type: 'link', href: 'https://meridian.example.edu/help', text: 'Course help', description: 'Help for this lesson' });
    const plain = await dispatch(service, teacher, 'createVariant', { lessonId: masterId, audience: 'plain' });
    const micro = await dispatch(service, teacher, 'createVariant', { lessonId: masterId, audience: 'micro' });
    expect(plain.lesson).toMatchObject({ moduleId: master?.moduleId, courseId, position: master?.position, status: 'draft', variantOf: { lessonId: masterId, audience: 'plain', syncedAt: SEED_NOW } });
    expect(micro.lesson.minutes).toBeLessThanOrEqual(15);
    expect(plain.blocks.map(b => b.type)).toEqual((await repo.listBlocks(masterId)).map(b => b.type));
    expect(plain.blocks.at(-1)).toMatchObject({ type: 'link', origin: 'human', aiState: null });
    for (const b of plain.blocks) {
      const source = (await repo.listBlocks(masterId)).find(x => x.id === b.source?.blockId);
      expect(source).toBeDefined(); expect(b.source?.hash).toBe(masterHash(source!));
      if (b.type !== 'link') expect(b).toMatchObject({ origin: 'ai', aiState: 'draft', provenance: { task: 'variant', model: 'fixture' } });
    }
    expect(micro.blocks[0]).toMatchObject({ type: 'callout', origin: 'ai', aiState: 'draft' });
    expect(micro.blocks[0].source).toBeUndefined();
    expect((await dispatch(service, teacher, 'listVariants', { lessonId: masterId })).map(v => v.audience)).toEqual(['micro', 'plain']);
    await expect(dispatch(service, teacher, 'createVariant', { lessonId: masterId, audience: 'plain' })).rejects.toMatchObject({ code: 'conflict' });
    await expect(dispatch(service, teacher, 'createVariant', { lessonId: plain.lesson.id, audience: 'micro' })).rejects.toMatchObject({ code: 'invalid' });
    const outline = await dispatch(service, teacher, 'getCourseOutline', { courseId });
    expect(outline.modules.flatMap(m => m.lessons).map(l => l.id)).not.toContain(plain.lesson.id);
    expect(outline.modules.flatMap(m => m.lessons).map(l => l.id)).not.toContain(micro.lesson.id);
    await expect(dispatch(service, teacher, 'publishLesson', { lessonId: plain.lesson.id })).rejects.toMatchObject({ code: 'not-ready' });
    expect((await dispatch(service, teacher, 'getLesson', { lessonId: plain.lesson.id })).lesson.id).toBe(plain.lesson.id);
    await dispatch(service, teacher, 'deleteLesson', { lessonId: plain.lesson.id });
    expect(await repo.getLesson(plain.lesson.id)).toBeNull();
    expect(await repo.getLesson(masterId)).not.toBeNull();
  });

  it('shows divergence and new blocks, supports per-block and all resync, keep, and preserves lineage through edits', async () => {
    const repo = new MemoryRepo(seedData()), teacher = await ctx(repo, 'u-okafor');
    const created = await dispatch(service, teacher, 'createVariant', { lessonId: masterId, audience: 'plain' });
    const variantId = created.lesson.id;
    const variantBlock = created.blocks.find(b => b.source?.blockId === 'b-s1-2')!;
    const firstHash = variantBlock.source!.hash;
    const edited = await ctx(repo, 'u-okafor', later);
    const masterBlocks = await repo.listBlocks(masterId);
    await dispatch(service, edited, 'saveBlocks', { lessonId: masterId, blocks: masterBlocks.map(b => b.id === 'b-s1-2' && b.type === 'text' ? { ...blockInput(b), text: `${b.text} Updated for the class.` } : blockInput(b)) });
    const newContent: BlockContent = { type: 'text', text: 'A new note about variability.' };
    const current = await repo.listBlocks(masterId);
    await dispatch(service, edited, 'saveBlocks', { lessonId: masterId, blocks: [...current.map(blockInput), newContent] });
    let diff = await dispatch(service, edited, 'getVariantDiff', { variantId });
    expect(diff.variant).toMatchObject({ divergedBlocks: 1, uncoveredBlocks: 1 });
    expect(diff.rows.map(r => r.state)).toContain('diverged');
    expect(diff.rows.map(r => r.state)).toContain('new-in-master');
    expect(diff.rows.some(r => r.state === 'in-sync')).toBe(true);
    await expect(dispatch(service, edited, 'resyncVariant', { variantId, blockIds: ['wrong'] })).rejects.toMatchObject({ code: 'invalid' });
    const partial = await dispatch(service, edited, 'resyncVariant', { variantId, blockIds: [variantBlock.id] });
    const rewritten = partial.blocks.find(b => b.id === variantBlock.id)!;
    expect(rewritten).toMatchObject({ aiState: 'draft', previous: { type: 'text' }, source: { blockId: 'b-s1-2' } });
    expect(rewritten.source?.hash).not.toBe(firstHash);
    expect(partial.lesson.variantOf?.syncedAt).toBe(later);
    const newMaster = (await repo.listBlocks(masterId)).at(-1)!;
    expect(partial.blocks.some(b => b.source?.blockId === newMaster.id)).toBe(false);
    // Another master edit makes the uncovered item visible after the partial sync timestamp.
    const laterCtx = await ctx(repo, 'u-okafor', later2);
    await repo.putBlock({ ...newMaster, updatedAt: later2 });
    const all = await dispatch(service, laterCtx, 'resyncVariant', { variantId });
    expect(all.blocks.some(b => b.source?.blockId === newMaster.id && b.aiState === 'draft')).toBe(true);
    expect(all.lesson.variantOf?.syncedAt).toBe(later2);
    expect((await dispatch(service, laterCtx, 'getVariantDiff', { variantId })).variant.uncoveredBlocks).toBe(0);
    const saved = await dispatch(service, laterCtx, 'saveBlocks', { lessonId: variantId, blocks: all.blocks.map(blockInput) });
    expect(saved.blocks.find(b => b.id === rewritten.id)?.source).toEqual(rewritten.source);
    const changedAgain = await ctx(repo, 'u-okafor', '2026-09-30T18:00:00.000Z');
    const source = (await repo.listBlocks(masterId)).find(b => b.id === 'b-s1-2')!;
    await repo.putBlock({ ...source, text: 'Changed again', updatedAt: changedAgain.now() } as Block);
    const kept = await dispatch(service, changedAgain, 'keepVariant', { variantId, blockIds: [rewritten.id] });
    expect(kept.blocks.find(b => b.id === rewritten.id)?.source?.hash).toBe(masterHash((await repo.getBlock(source.id))!));
    expect(kept.lesson.variantOf?.syncedAt).toBe(changedAgain.now());
    await repo.deleteBlock('b-s1-1');
    expect((await dispatch(service, changedAgain, 'getVariantDiff', { variantId })).rows.some(r => r.state === 'master-removed')).toBe(true);
  });

  it('serves only published matching variants, offers full, and stores progress and checks on the master', async () => {
    const repo = new MemoryRepo(seedData()), teacher = await ctx(repo, 'u-okafor'), student = await ctx(repo, 'u-priya');
    const user = (await repo.getUser('u-priya'))!; user.profile = { ...(await repo.getUser('u-marcus'))!.profile!, readingLevel: 'plain' }; await repo.putUser(user);
    const plain = await dispatch(service, teacher, 'createVariant', { lessonId: masterId, audience: 'plain' });
    const micro = await dispatch(service, teacher, 'createVariant', { lessonId: masterId, audience: 'micro' });
    expect((await dispatch(service, student, 'getStudentLesson', { lessonId: masterId })).lesson.id).toBe(masterId);
    await expect(dispatch(service, student, 'getStudentLesson', { lessonId: plain.lesson.id })).rejects.toMatchObject({ code: 'not-found' });
    await keepAll(repo, teacher, plain.lesson.id); await keepAll(repo, teacher, micro.lesson.id);
    await dispatch(service, teacher, 'publishLesson', { lessonId: plain.lesson.id });
    await dispatch(service, teacher, 'publishLesson', { lessonId: micro.lesson.id });
    const auto = await dispatch(service, student, 'getStudentLesson', { lessonId: masterId });
    expect(auto.lesson.id).toBe(plain.lesson.id);
    expect(auto.variant).toMatchObject({ audience: 'plain', fullLessonId: masterId });
    expect(auto.previousLessonId).toBeNull(); expect(auto.nextLessonId).toBe('l-stat-2');
    const full = await dispatch(service, student, 'getStudentLesson', { lessonId: masterId, version: 'full' });
    expect(full.lesson.id).toBe(masterId); expect(full.variantAvailable).toMatchObject({ lessonId: plain.lesson.id });
    const check = auto.blocks.find(b => b.type === 'check')!;
    await dispatch(service, student, 'answerCheck', { lessonId: plain.lesson.id, blockId: check.id, optionId: check.options[0].id });
    await dispatch(service, student, 'setLessonProgress', { lessonId: plain.lesson.id, state: 'completed' });
    expect((await repo.getProgress('u-priya', masterId))?.state).toBe('completed');
    expect(await repo.getProgress('u-priya', plain.lesson.id)).toBeNull();
    user.profile = { ...user.profile!, readingLevel: 'standard', sessionMinutes: 15 }; await repo.putUser(user);
    expect((await dispatch(service, student, 'getStudentLesson', { lessonId: masterId })).variant?.audience).toBe('micro');
    await dispatch(service, teacher, 'unpublishLesson', { lessonId: micro.lesson.id });
    await expect(dispatch(service, student, 'getStudentLesson', { lessonId: micro.lesson.id })).rejects.toMatchObject({ code: 'not-found' });
    expect((await dispatch(service, student, 'getStudentLesson', { lessonId: masterId })).lesson.id).toBe(masterId);
  });

  it('resyncs a micro-path in its AI order and keeps it within fifteen minutes', async () => {
    const repo = new MemoryRepo(seedData()), teacher = await ctx(repo, 'u-okafor');
    const created = await dispatch(service, teacher, 'createVariant', { lessonId: masterId, audience: 'micro' });
    const sourced = created.blocks.find(b => b.source?.blockId === 'b-s1-2')!;
    const before = { ...sourced };
    const master = (await repo.getBlock('b-s1-2'))!;
    await repo.putBlock({ ...master, text: 'Now describe why the answer varies.', updatedAt: later } as Block);
    const edited = await ctx(repo, 'u-okafor', later);
    const result = await dispatch(service, edited, 'resyncVariant', { variantId: created.lesson.id, blockIds: [sourced.id] });
    expect(result.lesson.minutes).toBeLessThanOrEqual(15);
    expect(result.blocks.map(b => b.id)).toEqual(created.blocks.map(b => b.id));
    expect(result.blocks.find(b => b.id === sourced.id)).toMatchObject({ previous: { type: before.type }, aiState: 'draft', source: { blockId: master.id, hash: masterHash((await repo.getBlock(master.id))!) } });
  });
  it('copies a new non-text master block into a plain variant without sending it to AI', async () => {
    const repo = new MemoryRepo(seedData()), teacher = await ctx(repo, 'u-okafor');
    const plain = await dispatch(service, teacher, 'createVariant', { lessonId: masterId, audience: 'plain' });
    const link: Block = { id: 'b-new-link', lessonId: masterId, position: 2, origin: 'human', aiState: null, provenance: null, previous: null, updatedAt: later, type: 'link', href: 'https://meridian.example.edu/help', text: 'Course help', description: 'Help for this lesson' };
    await repo.putBlock(link);
    const edited = await ctx(repo, 'u-okafor', later);
    expect((await dispatch(service, edited, 'getVariantDiff', { variantId: plain.lesson.id })).variant.uncoveredBlocks).toBe(1);
    const result = await dispatch(service, edited, 'resyncVariant', { variantId: plain.lesson.id });
    expect(result.blocks.find(b => b.source?.blockId === link.id)).toMatchObject({ type: 'link', origin: 'human', source: { hash: masterHash(link) } });
  });
});

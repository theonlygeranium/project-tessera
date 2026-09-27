import { describe, expect, it } from 'vitest';
import { fixtureAi, type AiClient } from '../ai';
import { seedData, SEED_NOW } from '../seed';
import { validateBlockContent } from './validate';
import { dispatch, MemoryRepo, service, type ServiceContext } from './index';
import type { BlockType } from '../domain';

let next = 0;
function setup(userId = 'u-okafor', ai: AiClient = fixtureAi) {
  const repo = new MemoryRepo(seedData());
  const ctx: ServiceContext = { repo, ai, user: seedData().users.find(u => u.id === userId)!, now: () => SEED_NOW, newId: prefix => `${prefix}-generation-${++next}` };
  return { repo, ctx };
}
const start = (ctx: ServiceContext, scope: Parameters<typeof service.generateAtScope>[1]['scope']) => dispatch(service, ctx, 'generateAtScope', { courseId: 'c-stat110', scope });

describe('generation service', () => {
  it('resolves whole course, modules, lessons, and their union in course order', async () => {
    for (const [scope, expected] of [
      [{ wholeCourse: true }, ['l-stat-1', 'l-stat-2', 'l-stat-3']],
      [{ moduleIds: ['m-stat-2'] }, ['l-stat-3']],
      [{ lessonIds: ['l-stat-2'] }, ['l-stat-2']],
      [{ moduleIds: ['m-stat-2'], lessonIds: ['l-stat-2', 'l-stat-3'] }, ['l-stat-2', 'l-stat-3']],
    ] as [{ wholeCourse?: boolean; moduleIds?: string[]; lessonIds?: string[] }, string[]][]) {
      const { repo, ctx } = setup();
      const { jobId } = await start(ctx, { ...scope, elementTypes: ['text'] });
      expect((await repo.getGenerationJob(jobId))?.work.map(item => item.lessonId)).toEqual(expected);
    }
  });
  it('rejects unsupported types, empty scope, and more than 60 elements', async () => {
    const { repo, ctx } = setup();
    for (const type of ['heading', 'image', 'file', 'video', 'link'] as BlockType[]) {
      await expect(start(ctx, { wholeCourse: true, elementTypes: [type] })).rejects.toMatchObject({ code: 'invalid' });
      await expect(dispatch(service, ctx, 'generateElement', { lessonId: 'l-stat-1', type })).rejects.toMatchObject({ code: 'invalid' });
    }
    await expect(start(ctx, {})).rejects.toMatchObject({ code: 'invalid' });
    const seed = seedData();
    for (let i = 0; i < 11; i++) seed.lessons.push({ ...seed.lessons[0], id: `l-added-${i}`, position: 10 + i });
    await repo.reset(seed);
    await expect(start(ctx, { wholeCourse: true, elementTypes: ['text', 'check', 'document', 'scenario', 'table'] })).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('70') });
  });
  it('advances two items per poll and appends draft blocks with provenance', async () => {
    const { repo, ctx } = setup();
    const original = await repo.listBlocks('l-stat-1');
    const { jobId } = await start(ctx, { lessonIds: ['l-stat-1'], elementTypes: ['text', 'check', 'document', 'scenario', 'table'] });
    expect(await repo.listBlocks('l-stat-1')).toEqual(original);
    expect((await dispatch(service, ctx, 'getGenerationJob', { jobId })).done).toBe(2);
    expect((await dispatch(service, ctx, 'getGenerationJob', { jobId })).done).toBe(4);
    const last = await dispatch(service, ctx, 'getGenerationJob', { jobId });
    expect(last).toMatchObject({ state: 'done', done: 5, total: 5, lessonIds: ['l-stat-1'] });
    const blocks = await repo.listBlocks('l-stat-1');
    expect(blocks.slice(0, original.length)).toEqual(original);
    expect(blocks.slice(original.length).map(block => block.type)).toEqual(['text', 'check', 'document', 'scenario', 'table']);
    for (const block of blocks.slice(original.length)) expect(block).toMatchObject({ origin: 'ai', aiState: 'draft', previous: null, provenance: { task: 'element', model: 'fixture', sources: [], generatedAt: SEED_NOW } });
  });
  it('records a failed item and continues', async () => {
    const failing: AiClient = { run: (async (task: string, input: { type?: string }) => {
      if (task === 'element' && input.type === 'check') throw new Error('Check unavailable');
      return fixtureAi.run(task as 'element', input as Parameters<typeof fixtureAi.run<'element'>>[1]);
    }) as AiClient['run'] };
    const { repo, ctx } = setup('u-okafor', failing);
    const { jobId } = await start(ctx, { lessonIds: ['l-stat-1'], elementTypes: ['text', 'check', 'table'] });
    await dispatch(service, ctx, 'getGenerationJob', { jobId });
    const result = await dispatch(service, ctx, 'getGenerationJob', { jobId });
    expect(result).toMatchObject({ state: 'done', done: 3, error: "1 of 3 elements couldn't be generated." });
    expect(result).toMatchObject({ failures: [{ lessonId: 'l-stat-1', type: 'check', message: 'Check unavailable' }] });
    expect((await repo.getGenerationJob(jobId))?.failures).toMatchObject([{ lessonId: 'l-stat-1', type: 'check', message: 'Check unavailable' }]);
    expect((await repo.listBlocks('l-stat-1')).slice(-2).map(block => block.type)).toEqual(['text', 'table']);
  });
  it('refuses students, other instructors, and AI authoring disabled', async () => {
    const { repo, ctx } = setup();
    const { jobId } = await start(ctx, { lessonIds: ['l-stat-1'] });
    const student = { ...ctx, user: await repo.getUser('u-priya') };
    const other = { ...ctx, user: await repo.getUser('u-chen') };
    for (const denied of [student, other]) {
      await expect(start(denied, { lessonIds: ['l-stat-1'] })).rejects.toMatchObject({ code: 'forbidden' });
      await expect(dispatch(service, denied, 'getGenerationJob', { jobId })).rejects.toMatchObject({ code: 'forbidden' });
    }
    const institution = await repo.getInstitution(); institution.policy.aiAuthoring = false; await repo.putInstitution(institution);
    await expect(start(ctx, { lessonIds: ['l-stat-1'] })).rejects.toMatchObject({ code: 'ai-disabled' });
    await expect(dispatch(service, ctx, 'generateElement', { lessonId: 'l-stat-1', type: 'text' })).rejects.toMatchObject({ code: 'ai-disabled' });
  });
  it('inserts one element at a position', async () => {
    const { repo, ctx } = setup();
    const old = await repo.listBlocks('l-stat-1');
    const detail = await dispatch(service, ctx, 'generateElement', { lessonId: 'l-stat-1', type: 'scenario', position: 1 });
    expect(detail.blocks[1]).toMatchObject({ type: 'scenario', origin: 'ai', aiState: 'draft' });
    expect(detail.blocks[2].id).toBe(old[1].id);
    expect(detail.blocks.map(block => block.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('imports validated human blocks in order and writes nothing for a bad block', async () => {
    const { repo, ctx } = setup('u-admin');
    const input = { course: { code: 'BIO 100', title: 'Biology basics', term: 'Fall 2026' }, modules: [{ title: 'Foundations', lessons: [{ title: 'Cells', blocks: [{ type: 'text' as const, text: 'Cells have parts.' }] }, { title: 'Practice', blocks: [{ type: 'check' as const, question: 'Choose one', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a', feedbackCorrect: 'Yes', feedbackIncorrect: 'Try again' }] }] }] };
    const before = await repo.listCourses();
    await expect(dispatch(service, ctx, 'importCourse', { ...input, modules: [{ ...input.modules[0], lessons: [
      input.modules[0].lessons[0], input.modules[0].lessons[1],
      { title: 'Third', blocks: [] }, { title: 'Fourth', blocks: [] },
      { title: 'Bad fifth lesson', blocks: [{ type: 'text' as const, text: '' }] },
    ] }] })).rejects.toMatchObject({ code: 'invalid' });
    expect(await repo.listCourses()).toEqual(before);
    const result = await dispatch(service, ctx, 'importCourse', input);
    expect(result.course).toMatchObject({ code: 'BIO 100', instructorIds: [] });
    expect(result.modules[0].lessons.map(lesson => lesson.title)).toEqual(['Cells', 'Practice']);
    expect((await repo.listBlocks(result.modules[0].lessons[0].id))[0]).toMatchObject({ origin: 'human', aiState: null, text: 'Cells have parts.' });
  });
});

it('fixture elements validate for every generatable type', async () => {
  for (const type of ['text', 'callout', 'check', 'document', 'table', 'scenario'] as BlockType[]) {
    const { output } = await fixtureAi.run('element', { courseTitle: 'Course', moduleTitle: 'Module', lessonTitle: 'Lesson', lessonText: '', type, instruction: '' });
    expect(validateBlockContent(output.block).type).toBe(type);
  }
});

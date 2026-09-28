import { expect, it } from 'vitest';
import { fixtureAi } from '../ai';
import { seedData, SEED_NOW } from '../seed';
import { dispatch, MemoryRepo, service, type ServiceContext } from './index';

let n = 0;
async function setup(userId = 'u-okafor') { const repo = new MemoryRepo(seedData()); const ctx: ServiceContext = { repo, ai: fixtureAi, user: await repo.getUser(userId), now: () => SEED_NOW, newId: p => `${p}-${++n}` }; return { repo, ctx }; }
it('preserves outcome ids and links across reorder, removes links on delete, and syncs course updates', async () => {
  const { repo, ctx } = await setup(); const courseId = 'c-stat110';
  const original = await dispatch(service, ctx, 'listOutcomes', { courseId });
  const check = (await repo.listBlocks('l-stat-1')).find(b => b.type === 'check')!;
  await dispatch(service, ctx, 'setOutcomeLinks', { courseId, targetKind: 'block', targetId: check.id, outcomeIds: [original[0].id] });
  const changed = await dispatch(service, ctx, 'saveOutcomes', { courseId, outcomes: [{ id: original[1].id, text: 'Revised second outcome' }, { id: original[0].id, text: 'Revised first outcome' }] });
  expect(changed.map(o => [o.id, o.code])).toEqual([[original[1].id, 'O1'], [original[0].id, 'O2']]);
  expect((await dispatch(service, ctx, 'listOutcomeLinks', { courseId })).map(l => l.outcomeId)).toEqual([original[0].id]);
  await dispatch(service, ctx, 'saveOutcomes', { courseId, outcomes: [{ id: original[1].id, text: 'Only one now' }] });
  expect(await dispatch(service, ctx, 'listOutcomeLinks', { courseId })).toEqual([]);
  const course = await dispatch(service, ctx, 'updateCourse', { courseId, outcomes: ['First text', 'Second text'] });
  expect(course.outcomes).toEqual(['First text', 'Second text']);
  expect((await repo.listOutcomes(courseId))[0].id).toBe(original[1].id);
  await expect(dispatch(service, ctx, 'saveOutcomes', { courseId, outcomes: [{ text: '  ' }] })).rejects.toMatchObject({ code: 'invalid' });
});
it('validates tagging targets, course ownership, and visibility', async () => {
  const { ctx, repo } = await setup(); const courseId = 'c-stat110'; const outcome = (await repo.listOutcomes(courseId))[0];
  await expect(dispatch(service, ctx, 'setOutcomeLinks', { courseId, targetKind: 'block', targetId: 'b-stat-1', outcomeIds: ['elsewhere'] })).rejects.toMatchObject({ code: 'invalid' });
  const text = (await repo.listBlocks('l-stat-1')).find(b => b.type === 'text')!;
  await expect(dispatch(service, ctx, 'setOutcomeLinks', { courseId, targetKind: 'block', targetId: text.id, outcomeIds: [outcome.id] })).rejects.toMatchObject({ code: 'invalid' });
  await expect(dispatch(service, ctx, 'setOutcomeLinks', { courseId, targetKind: 'assignment', targetId: 'missing', outcomeIds: [outcome.id] })).rejects.toMatchObject({ code: 'invalid' });
  const student = { ...ctx, user: await repo.getUser('u-priya') };
  expect((await dispatch(service, student, 'listOutcomes', { courseId })).length).toBeGreaterThan(0);
  await expect(dispatch(service, student, 'listOutcomeLinks', { courseId })).rejects.toMatchObject({ code: 'forbidden' });
});
it('creates outcome entities during course import', async () => {
  const { ctx, repo } = await setup('u-admin');
  const imported = await dispatch(service, ctx, 'importCourse', { course: { code: 'ART 110', title: 'Art basics', term: 'Fall 2026', outcomes: ['Describe a work of art.', 'Compare two materials.'] }, modules: [] });
  expect((await repo.listOutcomes(imported.course.id)).map(o => o.text)).toEqual(imported.course.outcomes);
});

import { describe, expect, it } from 'vitest';
import { ApiError, type Input, type Operation } from './api';
import { fixtureAi } from './ai';
import type { LearningGoal, LearningProfile } from './domain';
import { PRESETS, recommendPreset } from './presets';
import { SEED_NOW, seedData } from './seed';
import { dispatch, MemoryRepo, service, type ServiceContext } from './service';

const base = seedData().users.find(user => user.id === 'u-marcus')!.profile!;
const profile = (goals: LearningGoal[], weeklyMinutes: number): LearningProfile => ({ ...base, goals, weeklyMinutes });

function harness(studentId = 'u-marcus') {
  const seed = seedData();
  const repo = new MemoryRepo(seed);
  let next = 0;
  const ctx: ServiceContext = { repo, ai: fixtureAi, user: seed.users.find(u => u.id === studentId)!, now: () => SEED_NOW, newId: prefix => `${prefix}-test-${++next}` };
  const call = <K extends Operation>(op: K, input?: Input<K>) => dispatch(service, ctx, op, input as Input<K>);
  const callAs = async <K extends Operation>(userId: string, op: K, input?: Input<K>) => dispatch(service, { ...ctx, user: await repo.getUser(userId) }, op, input as Input<K>);
  return { repo, call, callAs };
}

async function expectCode(work: Promise<unknown>, code: ApiError['code']) {
  await expect(work).rejects.toMatchObject({ code });
}

describe('preset recommendation', () => {
  it.each([
    [['compliance', 'finish-degree'], 600, 'compliance'],
    [['career-change'], 180, 'working-learner'],
    [['upskill'], 120, 'working-learner'],
    [['finish-degree'], 360, 'undergraduate'],
    [['finish-degree'], 359, 'working-learner'],
    [['curiosity'], 600, 'working-learner'],
    [['upskill'], 240, 'undergraduate'],
    [[], 120, 'undergraduate'],
  ] as [LearningGoal[], number, string][] )('selects %s at %i minutes', (goals, minutes, id) => {
    expect(recommendPreset(profile(goals, minutes)).preset.id).toBe(id);
  });
  it('requires a completed profile and returns rule provenance', async () => {
    await expectCode(harness('u-priya').call('suggestPreset'), 'not-ready');
    expect(await harness().call('suggestPreset')).toMatchObject({ preset: { id: 'working-learner' }, provenance: null });
  });
  it('avoids unsupported style labels in all presets and reasons', () => {
    const text = [...PRESETS.flatMap(p => [p.title, p.description]), ...[
      profile(['compliance'], 120), profile(['career-change'], 120), profile(['upskill'], 120),
      profile(['finish-degree'], 360), profile(['finish-degree'], 120), profile(['curiosity'], 120), profile([], 120),
    ].map(p => recommendPreset(p).why)].join(' ').toLowerCase();
    expect(text).not.toMatch(/learning styles?|visual learner|auditory|kinesthetic/);
  });
});

describe('applying and undoing a setup', () => {
  it('records only changed fields, updates profile, and does nothing on repeat', async () => {
    const h = harness();
    const changes = await h.call('applyPreset', { presetId: 'working-learner' });
    expect(changes.map(c => c.kind)).toEqual(['session-length', 'reminders']);
    expect(changes[0]).toMatchObject({ before: undefined, after: 15, studentId: 'u-marcus', undoneAt: null });
    expect(changes[0].why).toMatch(/Today puts tasks that fit/);
    expect((await h.repo.getUser('u-marcus'))?.profile).toMatchObject({ sessionMinutes: 15, reminders: 'daily', readingLevel: 'standard' });
    expect(await h.call('applyPreset', { presetId: 'working-learner' })).toEqual([]);
    expect((await h.call('listAdaptations')).map(c => c.id)).toEqual(changes.map(c => c.id).reverse());
  });
  it('restores an unset session length and rejects a second undo', async () => {
    const h = harness();
    const [change] = await h.call('applyPreset', { presetId: 'working-learner' });
    const undone = await h.call('undoAdaptation', { adaptationId: change.id });
    expect(undone.undoneAt).toBe(SEED_NOW);
    expect((await h.repo.getUser('u-marcus'))?.profile?.sessionMinutes).toBeUndefined();
    await expectCode(h.call('undoAdaptation', { adaptationId: change.id }), 'conflict');
  });
  it('restores reminder and reading preferences independently', async () => {
    const h = harness();
    const changes = await h.call('applyPreset', { presetId: 'compliance' });
    expect(changes.map(c => c.kind)).toEqual(['session-length', 'reading-level']);
    await h.call('undoAdaptation', { adaptationId: changes[1].id });
    expect((await h.repo.getUser('u-marcus'))?.profile).toMatchObject({ sessionMinutes: 20, reminders: 'weekly', readingLevel: 'standard' });
    const next = await h.call('applyPreset', { presetId: 'working-learner' });
    const reminder = next.find(c => c.kind === 'reminders')!;
    await h.call('undoAdaptation', { adaptationId: reminder.id });
    expect((await h.repo.getUser('u-marcus'))?.profile?.reminders).toBe('weekly');
  });
  it('refuses undo after a manual edit and for another student', async () => {
    const h = harness();
    const [change] = await h.call('applyPreset', { presetId: 'working-learner' });
    await expectCode(h.callAs('u-priya', 'undoAdaptation', { adaptationId: change.id }), 'not-found');
    expect(await h.callAs('u-priya', 'listAdaptations')).toEqual([]);
    const stored = (await h.repo.getUser('u-marcus'))!;
    await h.call('saveProfile', { ...stored.profile!, sessionMinutes: 40 });
    await expectCode(h.call('undoAdaptation', { adaptationId: change.id }), 'conflict');
    expect((await h.repo.getAdaptation(change.id))?.undoneAt).toBeNull();
  });
  it('keeps every Today task and moves fitting tasks first only when a session length is set', async () => {
    const h = harness('u-priya');
    const original = await h.call('getToday');
    expect(original.doNext).toHaveLength(2);
    for (const [index, task] of original.doNext.entries()) {
      const lesson = (await h.repo.getLesson(task.lessonId))!;
      await h.repo.putLesson({ ...lesson, minutes: index === 0 ? 40 : 10 });
    }
    const noPreference = await h.call('getToday');
    expect(noPreference.doNext.map(t => t.id)).toEqual(original.doNext.map(t => t.id));
    const stored = (await h.repo.getUser('u-priya'))!;
    await h.repo.putUser({ ...stored, profile: { ...base, sessionMinutes: 15 } });
    const withPreference = await h.call('getToday');
    expect(withPreference.doNext.map(t => t.id)).toEqual([original.doNext[1].id, original.doNext[0].id]);
    expect(new Set(withPreference.doNext.map(t => t.id))).toEqual(new Set(original.doNext.map(t => t.id)));
  });
});

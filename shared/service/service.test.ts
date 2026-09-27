import { describe, expect, it } from 'vitest';
import { ApiError, type Input, type Operation } from '../api';
import { fixtureAi } from '../ai';
import { SEED_NOW, seedData } from '../seed';
import { dispatch, service, MemoryRepo, type ServiceContext } from './index';

function harness(userId: string | null = 'u-okafor') {
  const seed = seedData(), repo = new MemoryRepo(seed); let next = 0;
  const ctx: ServiceContext = { repo, ai: fixtureAi, user: seed.users.find(x => x.id === userId) ?? null, now: () => SEED_NOW, newId: prefix => `${prefix}-test-${++next}` };
  const call = <K extends Operation>(op: K, input?: Input<K>) => dispatch(service, ctx, op, input as Input<K>);
  return { repo, ctx, call };
}
async function code(promise: Promise<unknown>, expected: ApiError['code']) {
  try { await promise; throw new Error('Expected ApiError'); } catch (e) { expect(e).toBeInstanceOf(ApiError); expect((e as ApiError).code).toBe(expected); return e as ApiError; }
}

describe('service permissions and student isolation', () => {
  it('enforces route and course access', async () => {
    await code(harness('u-priya').call('getLesson', { lessonId: 'l-stat-1' }), 'forbidden');
    await code(harness('u-okafor').call('updateCourse', { courseId: 'c-comm120', title: 'No' }), 'forbidden');
    await code(harness(null).call('listCourses'), 'unauthenticated');
  });
  it('hides drafts and answer keys', async () => {
    const h = harness('u-priya');
    await code(h.call('getStudentLesson', { lessonId: 'l-stat-3' }), 'not-found');
    const lesson = await h.call('getStudentLesson', { lessonId: 'l-stat-1' });
    expect(lesson.blocks.find(x => x.type === 'check')).not.toHaveProperty('correctOptionId');
    expect(lesson.blocks.find(x => x.type === 'check')).not.toHaveProperty('feedbackCorrect');
    await h.repo.putBlock({ id: 'b-ai-test', lessonId: 'l-stat-1', position: 20, type: 'text', text: 'Secret draft', origin: 'ai', aiState: 'draft', provenance: null, previous: null, updatedAt: SEED_NOW });
    expect((await h.call('getStudentLesson', { lessonId: 'l-stat-1' })).blocks.map(x => x.id)).not.toContain('b-ai-test');
  });
  it('builds Today tasks and tracks check attempts', async () => {
    const h = harness('u-priya'), today = await h.call('getToday');
    expect(today.doNext.map(x => [x.courseId,x.kind])).toEqual([['c-stat110','resume'],['c-comm120','start']]);
    expect(today.unreadCount).toBe(2);
    expect(await h.call('answerCheck', { lessonId: 'l-stat-1', blockId: 'b-s1-4', optionId: 'a' })).toMatchObject({ correct: false, attempts: 1 });
    expect(await h.call('answerCheck', { lessonId: 'l-stat-1', blockId: 'b-s1-4', optionId: 'b' })).toMatchObject({ correct: true, attempts: 2 });
    await code(h.call('answerCheck', { lessonId: 'l-stat-1', blockId: 'b-s1-4', optionId: 'missing' }), 'invalid');
  });
});

describe('authoring and administration', () => {
  it('gates publishing AI drafts until kept, and deletes fresh AI blocks on revert', async () => {
    const h = harness();
    const created = await h.call('createBuilderSession', { courseId: 'c-stat110', prompt: 'Teach data reasoning', sources: [{ name: 'Notes', text: 'Variability matters.' }] });
    const outline = await h.call('generateOutline', { sessionId: created.id }); expect(outline.stage).toBe('outline');
    const drafted = await h.call('generateDrafts', { sessionId: created.id }); expect(drafted.stage).toBe('review'); expect(drafted.lessonIds).toHaveLength(4);
    const id = drafted.lessonIds[0], report = await code(h.call('publishLesson', { lessonId: id }), 'not-ready');
    expect(report.details).toMatchObject({ ready: false, aiBlocks: 4, keptAiBlocks: 0 });
    const blocks = (await h.call('getLesson', { lessonId: id })).blocks;
    for (const b of blocks) await h.call('keepBlock', { blockId: b.id });
    expect((await h.call('publishLesson', { lessonId: id })).status).toBe('published');
    const other = (await h.call('getLesson', { lessonId: drafted.lessonIds[1] })).blocks[0];
    await h.call('revertBlock', { blockId: other.id }); expect(await h.repo.getBlock(other.id)).toBeNull();
  });
  it('reports incomplete checks at publish time', async () => {
    const h = harness();
    const lesson = await h.call('createLesson', { moduleId: 'm-stat-1', title: 'Practice' });
    await h.call('saveBlocks', { lessonId: lesson.id, blocks: [{ type: 'check', question: '', options: [{ id: 'a', text: '' }, { id: 'b', text: 'Other' }], correctOptionId: '', feedbackCorrect: '', feedbackIncorrect: '' }] });
    const error = await code(h.call('publishLesson', { lessonId: lesson.id }), 'not-ready');
    expect(error.details).toMatchObject({ issues: [{ code: 'check-incomplete' }] });
  });
  it('applies the institution accessibility policy at publish time (D-022)', async () => {
    const h = harness();
    const lesson = await h.call('createLesson', { moduleId: 'm-stat-1', title: 'Links' });
    await h.call('saveBlocks', { lessonId: lesson.id, blocks: [{ type: 'text', text: 'Read the guide.' }, { type: 'link', href: 'https://example.edu/guide', text: 'click here', description: '' }] });
    const inst = await h.repo.getInstitution(); inst.accessPolicy = { minimumScore: 100, blockingSeverities: ['critical'] }; await h.repo.putInstitution(inst);
    const error = await code(h.call('publishLesson', { lessonId: lesson.id }), 'not-ready');
    expect(error.details).toMatchObject({ ready: false, accessPolicy: { score: 92 } });
    inst.accessPolicy = { minimumScore: 0, blockingSeverities: ['critical'] }; await h.repo.putInstitution(inst);
    expect((await h.call('publishLesson', { lessonId: lesson.id })).status).toBe('published');
  });
  it('records previous content when an AI block is edited', async () => {
    const h = harness();
    const s = await h.call('createBuilderSession', { courseId: 'c-stat110', prompt: 'Data', sources: [] });
    await h.call('generateOutline', { sessionId: s.id }); const drafts = await h.call('generateDrafts', { sessionId: s.id });
    const id = drafts.lessonIds[0], blocks = (await h.call('getLesson', { lessonId: id })).blocks;
    const [first] = blocks; if (first.type !== 'heading') throw new Error('Fixture changed');
    const changed = await h.call('saveBlocks', { lessonId: id, blocks: blocks.map(b => b.id === first.id ? { id: b.id, type: 'heading', level: 2, text: 'Edited' } : b) });
    expect(changed.blocks[0]).toMatchObject({ aiState: 'draft', previous: { type: 'heading', text: first.text } });
    await code(h.call('saveBlocks', { lessonId: id, blocks: [{ id: 'wrong', type: 'text', text: 'x' }] }), 'invalid');
  });
  it('imports valid rows and reports invalid and duplicate rows', async () => {
    const h = harness('u-admin');
    const result = await h.call('importUsers', { csv: 'name,email,role\nAda Example,ada@example.test,student\nBad Email,nope,student\nBad Role,role@example.test,teacher\nAda Again,ADA@example.test,student' });
    expect(result.created).toHaveLength(1); expect(result.errors.map(x => x.line)).toEqual([3,4,5]);
  });
  it('renumbers structure and protects nonempty modules', async () => {
    const h = harness();
    await h.call('updateModule', { moduleId: 'm-stat-2', position: 0 });
    expect((await h.repo.listModules('c-stat110')).map(x => [x.id,x.position])).toEqual([['m-stat-2',0],['m-stat-1',1]]);
    await h.call('updateLesson', { lessonId: 'l-stat-2', position: 0 });
    expect((await h.repo.listLessons({ moduleId: 'm-stat-1' })).map(x => [x.id,x.position])).toEqual([['l-stat-2',0],['l-stat-1',1]]);
    await code(h.call('deleteModule', { moduleId: 'm-stat-1' }), 'conflict');
  });
  it('normalizes policy modes and announcement reads', async () => {
    const admin = harness('u-admin');
    const inst = await admin.call('updatePolicy', { aiAuthoring: true, tutorModes: { graded: ['open'], practice: [] } });
    expect(inst.policy.tutorModes).toEqual({ graded: ['off'], practice: ['off'] });
    const student = harness('u-priya');
    const feed = await student.call('listAnnouncements', {}); expect(feed.every(x => x.status === 'published')).toBe(true);
    expect(feed.find(x => x.id === 'a-stat-welcome')?.read).toBe(true);
    await student.call('markAnnouncementRead', { announcementId: 'a-stat-office' });
    expect((await student.call('getToday')).unreadCount).toBe(1);
    const instructor = harness(); const draft = await instructor.call('draftAnnouncement', { courseId: 'c-stat110', prompt: 'Class meets tomorrow.' });
    const published = await instructor.call('createAnnouncement', { courseId: 'c-stat110', title: draft.title, body: draft.body, pinned: false, publish: true, aiDraft: draft.provenance });
    expect(published).toMatchObject({ origin: 'ai', aiState: 'kept', status: 'published' });
  });
});

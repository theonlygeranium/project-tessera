import { describe, expect, it } from 'vitest';
import { fixtureAi } from '../ai';
import { DEFAULT_READINESS_POLICY, TESSERA_RUBRIC_ID } from '../quality';
import { seedData, SEED_NOW } from '../seed';
import { dispatch, MemoryRepo, service, type ServiceContext } from './index';
import { courseSnapshot } from './readiness';

let n = 0;
async function setup(userId = 'u-admin') { const repo = new MemoryRepo(seedData()); const ctx: ServiceContext = { repo, ai: fixtureAi, user: await repo.getUser(userId), now: () => SEED_NOW, newId: prefix => `${prefix}-${++n}` }; return { repo, ctx }; }
const courseId = 'c-stat110';
const find = (result: Awaited<ReturnType<typeof service.getCourseReadiness>>, number: string) => result.standards.flatMap(s => s.items).find(i => i.number === number)!;

describe('readiness service', () => {
  it('lists built-ins first, protects them, and gives custom items stable numbered ids', async () => {
    const { ctx } = await setup();
    const rubrics = await dispatch(service, ctx, 'listRubrics', undefined);
    expect(rubrics.slice(0, 2).map(r => r.source)).toEqual(['tessera', 'oscqr']);
    await expect(dispatch(service, ctx, 'updateRubric', { rubricId: TESSERA_RUBRIC_ID, name: 'Changed' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(dispatch(service, ctx, 'deleteRubric', { rubricId: TESSERA_RUBRIC_ID })).rejects.toMatchObject({ code: 'forbidden' });
    const created = await dispatch(service, ctx, 'createRubric', { name: 'Course team rubric', standards: [{ number: '1', title: 'Start', items: [{ number: '1.1', text: 'Has outcomes', kind: 'automatic', check: 'outcomes-present' }, { number: '1.2', text: 'Review', kind: 'attestation' }] }] });
    expect(created.standards[0].items[0].id).toBe(`${created.id}-i1.1`);
    const changed = await dispatch(service, ctx, 'updateRubric', { rubricId: created.id, standards: [{ number: '1', title: 'Updated', items: [{ number: '1.1', text: 'Has good outcomes', kind: 'automatic', check: 'outcomes-present' }] }] });
    expect(changed.standards[0].items[0].id).toBe(created.standards[0].items[0].id);
    await expect(dispatch(service, ctx, 'createRubric', { name: 'Invalid', standards: [{ number: '1', title: 'A', items: [{ number: '1.1', text: 'Broken', kind: 'automatic' }] }] })).rejects.toMatchObject({ code: 'invalid' });
    await dispatch(service, ctx, 'updateReadinessPolicy', { rubricId: created.id, minimumPercent: null });
    await expect(dispatch(service, ctx, 'deleteRubric', { rubricId: created.id })).rejects.toMatchObject({ code: 'conflict' });
    await dispatch(service, ctx, 'updateReadinessPolicy', DEFAULT_READINESS_POLICY);
    expect(await dispatch(service, ctx, 'deleteRubric', { rubricId: created.id })).toEqual({ ok: true });
  });
  it('defaults to advisory, shows seed statuses, and keeps AI findings draft until review', async () => {
    const { ctx } = await setup('u-okafor');
    let result = await dispatch(service, ctx, 'getCourseReadiness', { courseId });
    expect(result.rubricId).toBe(TESSERA_RUBRIC_ID); expect(result.blocksPublishing).toBe(false);
    expect(find(result, '2.1').status).toBe('met'); expect(find(result, '2.2').status).toBe('needs-review');
    result = await dispatch(service, ctx, 'runReadinessAi', { courseId, itemIds: ['tsr-2.2'] });
    expect(find(result, '2.2')).toMatchObject({ status: 'needs-review', finding: { state: 'draft', reviewedBy: null } });
    result = await dispatch(service, ctx, 'reviewFinding', { courseId, itemId: 'tsr-2.2', decision: 'accept' });
    expect(find(result, '2.2').finding?.state).toBe('accepted');
    result = await dispatch(service, ctx, 'reviewFinding', { courseId, itemId: 'tsr-2.2', decision: 'dismiss' });
    expect(find(result, '2.2').status).toBe('needs-review');
    result = await dispatch(service, ctx, 'runReadinessAi', { courseId, itemIds: ['tsr-2.2'] });
    expect(find(result, '2.2').finding).toMatchObject({ state: 'draft', reviewedBy: null, reviewedAt: null });
    await expect(dispatch(service, ctx, 'runReadinessAi', { courseId, itemIds: ['tsr-2.1'] })).rejects.toMatchObject({ code: 'invalid' });
  });
  it('uses the latest course accessibility summary in its snapshot', async () => {
    const { ctx } = await setup('u-okafor');
    expect((await courseSnapshot(ctx, courseId)).access.score).toBeNull();
    const access = await dispatch(service, ctx, 'getCourseAccess', { courseId });
    expect((await courseSnapshot(ctx, courseId)).access.score).toBe(access.summary.score);
  });
  it('enforces attestation rules and a minimum only when set', async () => {
    const { ctx, repo } = await setup('u-okafor');
    await expect(dispatch(service, ctx, 'attestItem', { courseId, itemId: 'tsr-2.1', status: 'attested', note: '' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(dispatch(service, ctx, 'attestItem', { courseId, itemId: 'tsr-2.1', status: 'not-applicable', note: '' })).rejects.toMatchObject({ code: 'invalid' });
    let result = await dispatch(service, ctx, 'attestItem', { courseId, itemId: 'tsr-4.1', status: 'attested', note: 'Checked sources.' });
    expect(find(result, '4.1')).toMatchObject({ status: 'attested', attestation: { byName: 'Dr. Amara Okafor' } });
    result = await dispatch(service, ctx, 'clearAttestation', { courseId, itemId: 'tsr-4.1' });
    expect(find(result, '4.1').status).toBe('needs-review');
    result = await dispatch(service, ctx, 'attestItem', { courseId, itemId: 'tsr-2.1', status: 'not-applicable', note: 'This course uses a different outcomes record.' });
    expect(find(result, '2.1').status).toBe('not-applicable');
    result = await dispatch(service, ctx, 'clearAttestation', { courseId, itemId: 'tsr-2.1' });
    expect(find(result, '2.1').status).toBe('met');
    const institution = await repo.getInstitution(); institution.readinessPolicy = { rubricId: TESSERA_RUBRIC_ID, minimumPercent: 100 }; await repo.putInstitution(institution);
    await expect(dispatch(service, ctx, 'publishLesson', { lessonId: 'l-stat-1' })).rejects.toMatchObject({ code: 'not-ready', details: { rubric: { minimum: 100 } } });
    institution.readinessPolicy = DEFAULT_READINESS_POLICY; await repo.putInstitution(institution);
    const report = await dispatch(service, ctx, 'getCourseReadiness', { courseId }); expect(report.blocksPublishing).toBe(false);
    expect((await dispatch(service, ctx, 'publishLesson', { lessonId: 'l-stat-1' })).status).toBe('published');
  });
  it('restricts course reports to its staff and rejects AI when disabled', async () => {
    const { repo, ctx } = await setup('u-priya');
    await expect(dispatch(service, ctx, 'getCourseReadiness', { courseId })).rejects.toMatchObject({ code: 'forbidden' });
    const teacher = { ...ctx, user: await repo.getUser('u-okafor') };
    const institution = await repo.getInstitution(); institution.policy.aiAuthoring = false; await repo.putInstitution(institution);
    await expect(dispatch(service, teacher, 'runReadinessAi', { courseId })).rejects.toMatchObject({ code: 'ai-disabled' });
  });
  it('keeps successful AI drafts if another check fails and reports failures when all fail', async () => {
    const { ctx } = await setup('u-okafor');
    const original = ctx.ai;
    ctx.ai = { run: (async (task, input) => {
      if (task === 'readiness-item' && (input as { item?: { number?: string } }).item?.number === '1.3') throw new Error('Model unavailable for item 1.3');
      return original.run(task, input);
    }) as typeof original.run };
    const result = await dispatch(service, ctx, 'runReadinessAi', { courseId, itemIds: ['tsr-1.3', 'tsr-2.2'] });
    expect(find(result, '1.3').finding).toBeNull();
    expect(find(result, '2.2').finding?.state).toBe('draft');
    await expect(dispatch(service, ctx, 'runReadinessAi', { courseId, itemIds: ['tsr-1.3'] })).rejects.toMatchObject({ code: 'ai-failed', details: { failures: [{ itemId: 'tsr-1.3' }] } });
  });
  it('unblocks publishing when the selected attestation rubric reaches its minimum', async () => {
    const { repo, ctx } = await setup();
    const rubric = await dispatch(service, ctx, 'createRubric', { name: 'Human review', standards: [{ number: '1', title: 'Review', items: [{ number: '1.1', text: 'Course team review', kind: 'attestation' }] }] });
    await dispatch(service, ctx, 'updateReadinessPolicy', { rubricId: rubric.id, minimumPercent: 100 });
    const teacher = { ...ctx, user: await repo.getUser('u-okafor') };
    await expect(dispatch(service, teacher, 'publishLesson', { lessonId: 'l-stat-1' })).rejects.toMatchObject({ code: 'not-ready', details: { rubric: { rubricName: 'Human review', percent: 0, minimum: 100 } } });
    await dispatch(service, teacher, 'attestItem', { courseId, itemId: rubric.standards[0].items[0].id, status: 'attested', note: 'Reviewed.' });
    expect((await dispatch(service, teacher, 'getCourseReadiness', { courseId })).blocksPublishing).toBe(false);
    expect((await dispatch(service, teacher, 'publishLesson', { lessonId: 'l-stat-1' })).status).toBe('published');
  });
});

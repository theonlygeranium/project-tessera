import { describe, expect, it } from 'vitest';
import { MANAGER_NEVER_SEES, MANAGER_SEES, assertManagerSafe } from '../managers/policy';
import { ManagerViewSchema } from '../schema/domain';
import { seedData, SEED_NOW } from '../seed';
import { dispatch, MemoryRepo, service, type ServiceContext } from './index';

let next = 0;
async function ctx(repo: MemoryRepo, id: string, at = SEED_NOW): Promise<ServiceContext> {
  return { repo, ai: { run: async () => { throw new Error('AI unused'); } } as never, user: await repo.getUser(id), now: () => at, newId: (p) => `${p}-${++next}` };
}
const answers = [{ itemId: 'q1', optionId: 'a' }, { itemId: 'q2', optionId: 'a' }, { itemId: 'q3', optionId: 'b' }, { itemId: 'q4', optionId: 'a' }];
const forbidden = /"score"|"percent"|"points"|"grade"|"attempt"|"attempts"|"tutor"|"email"|"messages"|"profile"|"hintsUsed"/;

describe('reporting lines and manager visibility', () => {
  it('lets an administrator add a line between two different people and refuses anything else', async () => {
    const repo = new MemoryRepo(seedData());
    const admin = await ctx(repo, 'u-admin');
    const line = await dispatch(service, admin, 'addReportingLine', { managerId: 'u-jordan', reportId: 'u-sam' });
    expect(line).toMatchObject({ managerId: 'u-jordan', reportId: 'u-sam', createdBy: 'u-admin', createdAt: SEED_NOW });
    expect(await dispatch(service, admin, 'listReportingLines', { managerId: 'u-sam' })).toEqual([
      { managerId: 'u-sam', reportId: 'u-dana', createdBy: 'u-admin', createdAt: '2026-09-15T15:00:00.000Z' },
    ]);
    expect(await dispatch(service, admin, 'listReportingLines', { reportId: 'u-sam' })).toEqual([line]);
    await expect(dispatch(service, admin, 'addReportingLine', { managerId: 'u-sam', reportId: 'u-sam' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(dispatch(service, admin, 'addReportingLine', { managerId: 'u-missing', reportId: 'u-sam' })).rejects.toMatchObject({ code: 'not-found' });
    await expect(dispatch(service, admin, 'addReportingLine', { managerId: 'u-sam', reportId: 'u-dana' })).rejects.toMatchObject({ code: 'conflict' });
    await expect(dispatch(service, await ctx(repo, 'u-okafor'), 'addReportingLine', { managerId: 'u-jordan', reportId: 'u-sofia' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(dispatch(service, await ctx(repo, 'u-dana'), 'listReportingLines', {})).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('shows the signed-in person their managers, the choice, and exactly what is shared', async () => {
    const repo = new MemoryRepo(seedData());
    const dana = await ctx(repo, 'u-dana');
    const before = await dispatch(service, dana, 'getMyVisibility', undefined);
    expect(before.managers).toEqual([{ manager: { id: 'u-sam', name: 'Sam Ortiz', initials: 'SO' }, sharing: false, since: null }]);
    expect(before.sees).toEqual(MANAGER_SEES);
    expect(before.neverSees).toEqual(MANAGER_NEVER_SEES);
    const shared = await dispatch(service, dana, 'setManagerSharing', { managerId: 'u-sam', sharing: true });
    expect(shared.managers[0]).toEqual({ manager: { id: 'u-sam', name: 'Sam Ortiz', initials: 'SO' }, sharing: true, since: SEED_NOW });
    await expect(dispatch(service, dana, 'setManagerSharing', { managerId: 'u-jordan', sharing: true })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('gives a manager with no reports an empty view', async () => {
    const repo = new MemoryRepo(seedData());
    expect(await dispatch(service, await ctx(repo, 'u-sofia'), 'getManagerView', undefined)).toEqual({ rows: [], notSharingCount: 0 });
    expect(await dispatch(service, await ctx(repo, 'u-sam'), 'getManagerView', undefined)).toEqual({ rows: [], notSharingCount: 1 });
  });

  it('shows completion and the certificate while sharing, then nothing after opting out', async () => {
    const repo = new MemoryRepo(seedData());
    const dana = await ctx(repo, 'u-dana');
    const sam = await ctx(repo, 'u-sam');
    await repo.setEnrollments('c-stat110', [...(await repo.listEnrollments({ courseId: 'c-stat110' })).map((row) => row.userId), 'u-dana']);
    await dispatch(service, dana, 'setManagerSharing', { managerId: 'u-sam', sharing: true });
    const before = await dispatch(service, sam, 'getManagerView', undefined);
    const mine = await dispatch(service, dana, 'listMyTraining', undefined);
    expect(before.rows).toEqual([{
      person: { id: 'u-dana', name: 'Dana Whitfield', initials: 'DW' },
      training: mine.map((row) => ({ courseId: row.courseId, courseTitle: row.courseTitle, dueAt: row.dueAt, status: row.status, completedAt: row.completedAt, certificate: null })),
    }]);
    expect(before.rows[0].training.map((row) => row.courseId)).toEqual(['c-ops101']);
    expect(before.notSharingCount).toBe(0);
    const passed = await dispatch(service, dana, 'takeTestOut', { courseId: 'c-ops101', answers });
    const shared = await dispatch(service, sam, 'getManagerView', undefined);
    expect(shared.rows[0].training[0]).toMatchObject({ status: 'tested-out', certificate: { id: passed.certificate!.id, code: passed.certificate!.code } });
    expect(JSON.stringify(shared)).not.toContain('dana.whitfield');
    expect(JSON.stringify(shared)).not.toMatch(forbidden);
    assertManagerSafe(shared);
    expect(ManagerViewSchema.parse(shared)).toEqual(shared);
    const opened = await dispatch(service, sam, 'getCertificate', { certificateId: passed.certificate!.id });
    expect(opened).toMatchObject({ code: passed.certificate!.code, learnerName: 'Dana Whitfield' });
    await dispatch(service, dana, 'setManagerSharing', { managerId: 'u-sam', sharing: false });
    expect(await dispatch(service, sam, 'getManagerView', undefined)).toEqual({ rows: [], notSharingCount: 1 });
    await expect(dispatch(service, sam, 'getCertificate', { certificateId: passed.certificate!.id })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('starts private again when a line is removed and added back, even if an old consent remains', async () => {
    const repo = new MemoryRepo(seedData());
    const admin = await ctx(repo, 'u-admin');
    const dana = await ctx(repo, 'u-dana');
    await dispatch(service, dana, 'setManagerSharing', { managerId: 'u-sam', sharing: true });
    await dispatch(service, admin, 'removeReportingLine', { managerId: 'u-sam', reportId: 'u-dana' });
    expect(await repo.listManagerConsents({ managerId: 'u-sam', reportId: 'u-dana' })).toEqual([]);
    const later = '2026-09-27T00:00:00.000Z';
    const readded = await dispatch(service, await ctx(repo, 'u-admin', later), 'addReportingLine', { managerId: 'u-sam', reportId: 'u-dana' });
    expect(readded.createdAt).toBe(later);
    await repo.putManagerConsent({ managerId: 'u-sam', reportId: 'u-dana', sharing: true, at: SEED_NOW });
    expect((await dispatch(service, dana, 'getMyVisibility', undefined)).managers[0]).toMatchObject({ sharing: false, since: null });
    expect(await dispatch(service, await ctx(repo, 'u-sam'), 'getManagerView', undefined)).toEqual({ rows: [], notSharingCount: 1 });
    await expect(dispatch(service, admin, 'removeReportingLine', { managerId: 'u-jordan', reportId: 'u-sam' })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('does not let one manager\'s consent reveal a person to another manager', async () => {
    const repo = new MemoryRepo(seedData());
    const admin = await ctx(repo, 'u-admin');
    const dana = await ctx(repo, 'u-dana');
    await dispatch(service, admin, 'addReportingLine', { managerId: 'u-jordan', reportId: 'u-dana' });
    await dispatch(service, dana, 'setManagerSharing', { managerId: 'u-sam', sharing: true });
    const sam = await dispatch(service, await ctx(repo, 'u-sam'), 'getManagerView', undefined);
    const jordan = await dispatch(service, await ctx(repo, 'u-jordan'), 'getManagerView', undefined);
    expect(sam.rows.map((row) => row.person.id)).toEqual(['u-dana']);
    expect(jordan).toEqual({ rows: [], notSharingCount: 1 });
    expect(JSON.stringify(jordan)).not.toContain('Dana');
    expect(JSON.stringify(sam)).not.toMatch(forbidden);
  });
});

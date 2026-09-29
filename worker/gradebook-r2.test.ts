import { describe, expect, it } from 'vitest';
import { fixtureAi } from '../shared/ai';
import type { GradeWrite, GradeWriteResult, Repo } from '../shared/repo';
import type { GradeBatch, GradeSnapshot } from '../shared/repo';
import type { GradeEvent } from '../shared/domain';
import { seedData } from '../shared/seed';
import { MemoryRepo, dispatch, service, type ServiceContext } from '../shared/service';
import { D1Repo } from './d1-repo';
import { createTestDb } from './test/d1-shim';

const courseId = 'stat110-04';
const assignmentId = 'ec';
const studentId = 'u-aguilar';

for (const [name, create] of [
  ['MemoryRepo', async (): Promise<Repo> => new MemoryRepo(seedData())],
  ['D1Repo', async (): Promise<Repo> => {
    const repo = new D1Repo(createTestDb() as never);
    await repo.reset(seedData());
    return repo;
  }]
] as const) {
  describe(`gradebook round 2 regressions: ${name}`, () => {
    let counter = 0;
    const context = async (repo: Repo, userId = 'u-okafor', date = '2026-02-01T00:00:00.000Z'): Promise<ServiceContext> => ({
      repo,
      ai: fixtureAi,
      user: await repo.getUser(userId),
      now: () => date,
      newId: prefix => `${prefix}-r2-${name}-${++counter}`
    });
    const score = (batchId: string, expectedVersion: number, value = 3, item = assignmentId) => ({
      courseId,
      batchId,
      changes: [{ assignmentId: item, studentId, op: 'score' as const, value, reason: 'Instructor correction', expectedVersion }]
    });
    const event = async (repo: Repo, batchId: string) => (await repo.listGradeEvents({ courseId, batchId })).items[0];

    it('revives a tombstone for student submit and rejects an old cell revision', async () => {
      const repo = await create();
      const teacher = await context(repo);
      const recorded = await dispatch(service, teacher, 'updateGradeCells', score('record-submit', 0));
      expect(recorded.cells[0]).toHaveProperty('version', 1);
      const first = await event(repo, 'record-submit');
      await dispatch(service, teacher, 'undoGradeEvent', { eventId: first.id });
      const tombstone = (await repo.listSubmissions({ assignmentId, studentId, includeDeleted: true }))[0];
      expect(tombstone).toMatchObject({ deleted: true, version: 2 });
      const assignment = (await repo.getAssignment(assignmentId))!;
      await repo.putAssignment({ ...assignment, dueAt: '2026-03-01T00:00:00.000Z' });
      const student = await context(repo, studentId, '2026-02-02T00:00:00.000Z');
      const submitted = await dispatch(service, student, 'submit', { assignmentId, text: 'Actual work' });
      expect(submitted).toMatchObject({ id: tombstone.id, version: 3, attempt: 1, text: 'Actual work' });
      expect(submitted).not.toHaveProperty('deleted');
      const graded = await dispatch(service, teacher, 'gradeSubmission', {
        submissionId: submitted.id, criteria: [], score: 3, feedback: '', feedbackOrigin: 'human'
      });
      expect(graded.version).toBe(4);
      const stale = await dispatch(service, teacher, 'updateGradeCells', score('stale-submit', 1, 99));
      expect(stale.cells[0]).toHaveProperty('conflict', true);
      expect((await repo.getSubmission(submitted.id))?.grade?.score).toBe(3);
    });

    it('gives only one concurrent replacement of a version-zero submission the next revision', async () => {
      const base = await create();
      const assignment = (await base.getAssignment(assignmentId))!;
      await base.putAssignment({ ...assignment, dueAt: '2026-03-01T00:00:00.000Z' });
      const student = await context(base, studentId);
      const original = await dispatch(service, student, 'submit', { assignmentId, text: 'First' });
      expect(original.version).toBe(0);
      let release!: () => void;
      let paused!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const entered = new Promise<void>(resolve => { paused = resolve; });
      let first = true;
      const repo = new Proxy(base, {
        get(target, key) {
          if (key === 'applyGradeWrites') return async (
            writes: GradeWrite[], events: GradeEvent[], snapshot?: GradeSnapshot, batch?: GradeBatch
          ): Promise<GradeWriteResult> => {
            if (first) {
              first = false;
              paused();
              await gate;
            }
            return target.applyGradeWrites(writes, events, snapshot, batch);
          };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
      const concurrent = await context(repo, studentId);
      const pending = dispatch(service, concurrent, 'submit', { assignmentId, text: 'Second A' });
      await entered;
      const winner = await dispatch(service, concurrent, 'submit', { assignmentId, text: 'Second B' });
      expect(winner.version).toBe(1);
      release();
      await expect(pending).rejects.toMatchObject({ code: 'conflict' });
      const rows = await base.listSubmissions({ assignmentId, studentId });
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ id: winner.id, version: 1, text: 'Second B' });
    });

    it('rejects undo of an earlier clear after another set and clear', async () => {
      const repo = await create();
      const teacher = await context(repo);
      const set = (percent: number, expectedVersion: number) => dispatch(service, teacher, 'setFinalOverride', {
        courseId, studentId, letter: null, percent, reason: 'Instructor adjustment', expectedVersion
      });
      const clear = (expectedVersion: number) => dispatch(service, teacher, 'clearFinalOverride', {
        courseId, studentId, reason: 'Cleared by instructor', expectedVersion
      });
      await set(91, 0);
      await clear(1);
      const firstClear = (await repo.listGradeEvents({ courseId, studentId, kind: 'final-override' })).items[0];
      expect((firstClear.after as { version: number }).version).toBe(2);
      await set(75, 2);
      await clear(3);
      await expect(dispatch(service, teacher, 'undoGradeEvent', { eventId: firstClear.id }))
        .rejects.toMatchObject({ code: 'conflict' });
      expect(await repo.getFinalOverride(courseId, studentId)).toBeNull();
      expect((await repo.listFinalOverrideRevisions(courseId)).find(x => x.studentId === studentId)?.version).toBe(4);
    });

    it('reserves a batch ID within the atomic write across interleaved requests', async () => {
      const base = await create();
      let release!: () => void;
      let paused!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const entered = new Promise<void>(resolve => { paused = resolve; });
      let first = true;
      const repo = new Proxy(base, {
        get(target, key) {
          if (key === 'applyGradeWrites') return async (
            writes: GradeWrite[], events: GradeEvent[], snapshot?: GradeSnapshot, batch?: GradeBatch
          ): Promise<GradeWriteResult> => {
            if (first && batch?.batchId === 'interleaved') {
              first = false;
              paused();
              await gate;
            }
            return target.applyGradeWrites(writes, events, snapshot, batch);
          };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
      const teacher = await context(repo);
      const pending = dispatch(service, teacher, 'updateGradeCells', score('interleaved', 0, 3, 'ec'));
      await entered;
      const winner = await dispatch(service, teacher, 'updateGradeCells', score('interleaved', 0, 4, 'hw2'));
      expect(winner.cells[0]).toHaveProperty('ok', true);
      release();
      await expect(pending).rejects.toMatchObject({ code: 'conflict' });
      const events = (await base.listGradeEvents({ courseId, batchId: 'interleaved' })).items;
      expect(events).toHaveLength(1);
      expect(events[0].assignmentId).toBe('hw2');
      const batch = await base.getGradeBatch(courseId, 'interleaved');
      expect(batch).toMatchObject({ by: 'u-okafor', fingerprint: events[0].requestFingerprint });
    });

    it('undoes a revived recorded score and restores its tombstone', async () => {
      const repo = await create();
      const teacher = await context(repo);
      await dispatch(service, teacher, 'updateGradeCells', score('first-score', 0));
      await dispatch(service, teacher, 'undoGradeEvent', { eventId: (await event(repo, 'first-score')).id });
      const tombstone = (await repo.listSubmissions({ assignmentId, studentId, includeDeleted: true }))[0];
      const revival = await dispatch(service, teacher, 'updateGradeCells', score('revival', tombstone.version!, 4));
      expect(revival.cells[0]).toHaveProperty('version', 3);
      const revived = (await event(repo, 'revival')).after as { deleted: boolean };
      expect(revived.deleted).toBe(false);
      const undo = await dispatch(service, teacher, 'undoGradeEvent', { eventId: (await event(repo, 'revival')).id });
      expect(undo).toEqual({ ok: true });
      const current = (await repo.listSubmissions({ assignmentId, studentId, includeDeleted: true }))[0];
      expect(current).toMatchObject({ deleted: true, version: 4 });
      expect(await repo.getSubmission(current.id)).toBeNull();
    });
  });
}

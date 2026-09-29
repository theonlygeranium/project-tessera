import { describe, expect, it } from 'vitest';
import { fixtureAi } from '../shared/ai';
import type { GradeEvent } from '../shared/domain';
import type { Repo } from '../shared/repo';
import { seedData } from '../shared/seed';
import { MemoryRepo, dispatch, service, type ServiceContext } from '../shared/service';
import { D1Repo } from './d1-repo';
import { createTestDb } from './test/d1-shim';
import worker from './index';

const courseId = 'stat110-04';
const assignmentId = 'ec';
const studentId = 'u-aguilar';
const oldAt = '2026-02-01T00:00:00.000Z';
const freshAt = '2026-03-10T00:00:00.000Z';
const createRepos = [
  ['MemoryRepo', async (): Promise<Repo> => new MemoryRepo(seedData())],
  ['D1Repo', async (): Promise<Repo> => {
    const repo = new D1Repo(createTestDb() as never);
    await repo.reset(seedData());
    return repo;
  }]
] as const;

const counters = new WeakMap<Repo, number>();
function context(repo: Repo, userId = 'u-okafor', at = oldAt): Promise<ServiceContext> {
  return repo.getUser(userId).then(person => ({
    repo, ai: fixtureAi, user: person, now: () => at, newId: prefix => {
      const next = (counters.get(repo) ?? 0) + 1;
      counters.set(repo, next);
      return `${prefix}-r3-${next}`;
    }
  }));
}
const score = (batchId: string) => ({
  courseId, batchId,
  changes: [{ assignmentId, studentId, op: 'score' as const, value: 3, expectedVersion: 0 }]
});
const fabricated = (id: string, batchId: string, at: string, fingerprint?: string): GradeEvent => ({
  id, courseId, studentId, assignmentId: 'hw2', kind: 'missing', before: null, after: null,
  reason: null, by: 'u-okafor', at, batchId, undoOf: null, rulesVersion: 1,
  ...(fingerprint ? { requestFingerprint: fingerprint } : {})
});

for (const [name, create] of createRepos) {
  describe(`gradebook round 3: ${name}`, () => {
    it('reserves release IDs and refuses a later cell edit that reuses one', async () => {
      const repo = await create();
      const feb = await context(repo);
      expect((await dispatch(service, feb, 'updateGradeCells', score('record-before-release'))).cells[0]).toHaveProperty('version', 1);
      await dispatch(service, feb, 'releaseGrades', { assignmentId });
      const release = (await repo.listGradeEvents({ courseId, kind: 'release' })).items.find(e => e.assignmentId === assignmentId)!;
      expect(release.batchId).toBeTruthy();
      expect(await repo.getGradeBatch(courseId, release.batchId!)).toMatchObject({ batchId: release.batchId, fingerprint: release.requestFingerprint });
      const mar = await context(repo, 'u-okafor', freshAt);
      const state = (await repo.listStudentItemStates({ courseId, assignmentId: 'hw2', studentId }))[0];
      await expect(dispatch(service, mar, 'updateGradeCells', {
        courseId, batchId: release.batchId!,
        changes: [{ assignmentId: 'hw2', studentId, op: 'mark-missing', expectedVersion: state?.version ?? 0 }]
      })).rejects.toMatchObject({ code: 'conflict' });
      expect((await repo.listGradeEvents({ courseId, batchId: release.batchId! })).items).toHaveLength(1);
      await expect(dispatch(service, mar, 'undoGradeEvent', { eventId: release.id })).rejects.toMatchObject({ code: 'conflict' });
    });

    it('checks the undo window for every event in a reserved batch', async () => {
      const repo = await create();
      const fingerprint = 'mixed-age-request';
      const old = fabricated('old-event', 'mixed-age', oldAt, fingerprint);
      const fresh = fabricated('fresh-event', 'mixed-age', freshAt, fingerprint);
      expect((await repo.applyGradeWrites([], [old, fresh], undefined, {
        courseId, batchId: 'mixed-age', by: 'u-okafor', fingerprint, result: { ok: true }, at: freshAt
      })).ok).toBe(true);
      await expect(dispatch(service, await context(repo, 'u-okafor', freshAt), 'undoGradeEvent', { eventId: fresh.id }))
        .rejects.toMatchObject({ code: 'conflict' });
      expect((await repo.listGradeEvents({ courseId, kind: 'undo' })).items).toHaveLength(0);
    });

    it('refuses a co-mingled event with another fingerprint', async () => {
      let repo: Repo;
      const db = name === 'D1Repo' ? createTestDb() : null;
      if (db) {
        repo = new D1Repo(db as never);
        await repo.reset(seedData());
      } else repo = new MemoryRepo(seedData());
      const owned = fabricated('owned-event', 'shared-batch', freshAt, 'owned-request');
      const foreign = { ...fabricated('foreign-event', 'shared-batch', freshAt, 'other-request'), seq: 2 };
      expect((await repo.applyGradeWrites([], [owned], undefined, {
        courseId, batchId: 'shared-batch', by: 'u-okafor', fingerprint: 'owned-request', result: { ok: true }, at: freshAt
      })).ok).toBe(true);
      if (db) await db.prepare('INSERT INTO grade_events(id,course_id,seq,student_id,assignment_id,kind,data,by_user,at,batch_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(foreign.id, foreign.courseId, foreign.seq, foreign.studentId, foreign.assignmentId, foreign.kind,
          JSON.stringify(foreign), foreign.by, foreign.at, foreign.batchId).run();
      else (repo as unknown as { gradeEvents: GradeEvent[] }).gradeEvents.push(foreign);
      await expect(dispatch(service, await context(repo, 'u-okafor', freshAt), 'undoGradeEvent', { eventId: owned.id }))
        .rejects.toMatchObject({ code: 'conflict' });
      expect((await repo.listGradeEvents({ courseId, kind: 'undo' })).items).toHaveLength(0);
    });

    it('refuses undo of a legacy batch event without a reservation', async () => {
      const seed = seedData();
      const legacy = { ...fabricated('legacy-event', 'legacy-batch', freshAt), seq: 1 };
      seed.gradeEvents = [legacy];
      let repo: Repo;
      if (name === 'D1Repo') {
        const db = createTestDb();
        repo = new D1Repo(db as never);
        await repo.reset(seedData());
        await db.prepare('INSERT INTO grade_events(id,course_id,seq,student_id,assignment_id,kind,data,by_user,at,batch_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .bind(legacy.id, legacy.courseId, legacy.seq, legacy.studentId, legacy.assignmentId, legacy.kind,
            JSON.stringify(legacy), legacy.by, legacy.at, legacy.batchId).run();
      } else repo = new MemoryRepo(seed);
      await expect(dispatch(service, await context(repo, 'u-okafor', freshAt), 'undoGradeEvent', { eventId: legacy.id }))
        .rejects.toMatchObject({ code: 'conflict' });
    });

    it('does not count an undone recorded score as the student first attempt', async () => {
      const repo = await create();
      const assignment = (await repo.getAssignment(assignmentId))!;
      await repo.putAssignment({ ...assignment, dueAt: '2026-04-01T00:00:00.000Z' });
      const teacher = await context(repo);
      await dispatch(service, teacher, 'updateGradeCells', score('recorded-attempt'));
      const recorded = (await repo.listGradeEvents({ courseId, batchId: 'recorded-attempt' })).items[0];
      await dispatch(service, teacher, 'undoGradeEvent', { eventId: recorded.id });
      const student = await context(repo, studentId, '2026-02-02T00:00:00.000Z');
      const first = await dispatch(service, student, 'submit', { assignmentId, text: 'My first work' });
      expect(first.attempt).toBe(1);
      expect(first).not.toHaveProperty('deleted');
      const second = await dispatch(service, student, 'submit', { assignmentId, text: 'My replacement' });
      expect(second.attempt).toBe(2);
      await expect(dispatch(service, student, 'submit', { assignmentId, text: 'Third' }))
        .rejects.toMatchObject({ code: 'conflict' });
    });

    it('reserves setup, final override, unrelease, and undo event IDs', async () => {
      const repo = await create();
      const teacher = await context(repo);
      const setup = await dispatch(service, teacher, 'getGradebookSetup', { courseId });
      const preview = await dispatch(service, teacher, 'previewGradebookSetup', { courseId, setup });
      await dispatch(service, teacher, 'saveGradebookSetup', {
        courseId, setup, expectedVersion: setup.version, hash: preview.changeSet.hash
      });
      await dispatch(service, teacher, 'setFinalOverride', {
        courseId, studentId, letter: null, percent: 90, reason: 'Instructor adjustment', expectedVersion: 0
      });
      await dispatch(service, teacher, 'clearFinalOverride', {
        courseId, studentId, reason: 'Adjustment cleared', expectedVersion: 1
      });
      await dispatch(service, teacher, 'updateGradeCells', score('score-for-unrelease'));
      await dispatch(service, teacher, 'releaseGrades', { assignmentId });
      await dispatch(service, teacher, 'unreleaseGrades', { assignmentId });
      const scoreEvent = (await repo.listGradeEvents({ courseId, batchId: 'score-for-unrelease' })).items[0];
      // The release cycle changes this score, so undo a separate cell event.
      const marked = await dispatch(service, teacher, 'updateGradeCells', {
        courseId, batchId: 'mark-for-undo',
        changes: [{ assignmentId: 'hw2', studentId, op: 'mark-missing', expectedVersion: 0 }]
      });
      expect(marked.cells[0]).toHaveProperty('version');
      const markEvent = (await repo.listGradeEvents({ courseId, batchId: 'mark-for-undo' })).items[0];
      expect(scoreEvent).toBeTruthy();
      await dispatch(service, teacher, 'undoGradeEvent', { eventId: markEvent.id });
      const events = (await repo.listGradeEvents({ courseId, limit: 100 })).items;
      for (const kind of ['setup', 'final-override', 'unrelease', 'undo'] as const) {
        const matching = events.filter(e => e.kind === kind);
        expect(matching.length).toBeGreaterThan(0);
        for (const e of matching) {
          expect(e.batchId).toBeTruthy();
          expect(await repo.getGradeBatch(courseId, e.batchId!)).toMatchObject({ fingerprint: e.requestFingerprint });
        }
      }
    });
  });
}

it('keeps direct and HTTP student submission JSON identical across repositories', async () => {
  const [memory, d1] = await Promise.all(createRepos.map(([, create]) => create()));
  const assignment = (await memory.getAssignment(assignmentId))!;
  for (const repo of [memory, d1]) await repo.putAssignment({ ...assignment, dueAt: '2027-04-01T00:00:00.000Z' });
  const submit = async (repo: Repo) => {
    const student = await context(repo, studentId);
    const created = await dispatch(service, student, 'submit', { assignmentId, text: 'First work' });
    const mine = await dispatch(service, student, 'getMySubmission', { assignmentId });
    return { created, mine, stored: await repo.getSubmission(created.id) };
  };
  const memoryValues = await submit(memory);
  const d1Values = await submit(d1);
  expect(JSON.stringify(memoryValues)).toBe(JSON.stringify(d1Values));
  expect(JSON.stringify(memoryValues)).not.toContain('"deleted"');
  const db = createTestDb();
  const httpRepo = new D1Repo(db as never);
  await httpRepo.reset(seedData());
  await httpRepo.putAssignment({ ...assignment, dueAt: '2027-04-01T00:00:00.000Z' });
  const env = { DB: db, ASSETS: { fetch: async () => new Response('missing', { status: 404 }) },
    ENVIRONMENT: 'local', ACCESS_TEAM_DOMAIN: 'team.test.cloudflareaccess.com', ACCESS_AUD: 'aud-test', OWNER_EMAILS: 'jeff@jgeronimo.com' };
  const path = `/api/v1/assignments/${assignmentId}/submissions`;
  const post = await worker.fetch(new Request(`http://localhost${path}`, {
    method: 'POST', headers: { cookie: `tessera_user=${studentId}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'First work' })
  }), env as never, {} as never);
  expect(post.status).toBe(200);
  const get = await worker.fetch(new Request(`http://localhost${path}/me`, {
    headers: { cookie: `tessera_user=${studentId}` }
  }), env as never, {} as never);
  expect(get.status).toBe(200);
  const posted = await post.json();
  const fetched = await get.json();
  expect(JSON.stringify(posted)).toBe(JSON.stringify(fetched));
  expect(JSON.stringify(fetched)).not.toContain('"deleted"');
  const tombstone = { ...memoryValues.created, deleted: true };
  for (const repo of [memory, d1]) await repo.putSubmission(tombstone);
  const memoryTombstone = (await memory.listSubmissions({ assignmentId, studentId, includeDeleted: true }))[0];
  const d1Tombstone = (await d1.listSubmissions({ assignmentId, studentId, includeDeleted: true }))[0];
  expect(memoryTombstone.deleted).toBe(true);
  expect(JSON.stringify(memoryTombstone)).toBe(JSON.stringify(d1Tombstone));
});

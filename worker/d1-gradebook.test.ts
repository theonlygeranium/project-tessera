import { expect, it } from 'vitest';
import { fixtureAi } from '../shared/ai';
import { seedData } from '../shared/seed';
import { dispatch, service, type ServiceContext } from '../shared/service';
import { D1Repo } from './d1-repo';
import { createTestDb } from './test/d1-shim';
it('uses migration 0011 and rolls back a stale multi-write with its event', async () => {
  const db = createTestDb(),
    repo = new D1Repo(db as never);
  await repo.reset(seedData());
  let n = 0;
  const ctx: ServiceContext = {
    repo,
    ai: fixtureAi,
    user: await repo.getUser('u-okafor'),
    now: () => '2026-02-01T00:00:00.000Z',
    newId: p => `${p}-d1-${++n}`
  };
  const before = await repo.getSubmission('sub-stat110-04-u-priya-hw1');
  const response = await dispatch(service, ctx, 'updateGradeCells', {
    courseId: 'stat110-04',
    batchId: 'd1-stale',
    changes: [{
      assignmentId: 'hw1',
      studentId: 'u-priya',
      op: 'score',
      value: 8,
      reason: 'Correction',
      expectedVersion: 0
    }, {
      assignmentId: 'hw2',
      studentId: 'u-priya',
      op: 'score',
      value: 8,
      reason: 'Correction',
      expectedVersion: 99
    }]
  });
  expect(response.cells[0]).toHaveProperty('conflict', true);
  expect(await repo.getSubmission(before!.id)).toEqual(before);
  expect((await repo.listGradeEvents({
    courseId: 'stat110-04',
    batchId: 'd1-stale'
  })).items).toEqual([]);
  const saved = await dispatch(service, ctx, 'updateGradeCells', {
    courseId: 'stat110-04',
    batchId: 'd1-valid',
    changes: [{
      assignmentId: 'hw1',
      studentId: 'u-priya',
      op: 'score',
      value: 8,
      reason: 'Correction',
      expectedVersion: 0
    }]
  });
  expect(saved.cells[0]).toHaveProperty('ok', true);
  expect((await repo.listGradeEvents({
    courseId: 'stat110-04',
    batchId: 'd1-valid'
  })).items).toHaveLength(1);
});
it('undoes a newly recorded submission in D1', async () => {
  const repo = new D1Repo(createTestDb() as never);
  await repo.reset(seedData());
  let n = 0;
  const ctx: ServiceContext = {
    repo,
    ai: fixtureAi,
    user: await repo.getUser('u-okafor'),
    now: () => '2026-02-01T00:00:00.000Z',
    newId: p => `${p}-d1-undo-${++n}`
  };
  await dispatch(service, ctx, 'updateGradeCells', {
    courseId: 'stat110-04',
    batchId: 'd1-record',
    changes: [{
      assignmentId: 'ec',
      studentId: 'u-aguilar',
      op: 'score',
      value: 3,
      expectedVersion: 0
    }]
  });
  const event = (await repo.listGradeEvents({
    courseId: 'stat110-04',
    batchId: 'd1-record'
  })).items[0];
  const submission = (await repo.listSubmissions({
    courseId: 'stat110-04',
    studentId: 'u-aguilar'
  })).find(s => s.assignmentId === 'ec')!;
  await dispatch(service, ctx, 'undoGradeEvent', {
    eventId: event.id
  });
  expect(await repo.getSubmission(submission.id)).toBeNull();
});
it('checks the CAS guard again inside the D1 batch', async () => {
  const db = createTestDb(),
    base = new D1Repo(db as never);
  await base.reset(seedData());
  let interfere = true;
  const wrapped = new Proxy(db, {
    get(target, property) {
      if (property === 'batch') return async (statements: Parameters<typeof db.batch>[0]) => {
        if (interfere) {
          interfere = false;
          await db.prepare('UPDATE submissions SET version=1 WHERE id=?').bind('sub-stat110-04-u-priya-hw1').run();
        }
        return db.batch(statements);
      };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  const repo = new D1Repo(wrapped as never);
  const before = (await repo.getSubmission('sub-stat110-04-u-priya-hw1'))!;
  const after = {
    ...before,
    version: 1,
    grade: {
      ...before.grade!,
      score: 8
    }
  };
  const event = {
    id: 'ge-concurrent',
    courseId: 'stat110-04',
    studentId: 'u-priya',
    assignmentId: 'hw1',
    kind: 'score' as const,
    before,
    after,
    reason: null,
    by: 'u-okafor',
    at: '2026-02-01T00:00:00.000Z',
    batchId: 'concurrent',
    undoOf: null,
    rulesVersion: 1
  };
  const result = await repo.applyGradeWrites([{
    kind: 'submission',
    value: after,
    expectedVersion: 0
  }], [event]);
  expect(result.ok).toBe(false);
  expect((await repo.getSubmission(before.id))?.grade?.score).toBe(before.grade?.score);
  expect(await repo.getGradeEvent(event.id)).toBeNull();
});
it('checks the full release snapshot inside the D1 batch', async () => {
  const db = createTestDb();
  const base = new D1Repo(db as never);
  await base.reset(seedData());
  let interfere = true;
  const wrapped = new Proxy(db, {
    get(target, property) {
      if (property === 'batch') return async (statements: Parameters<typeof db.batch>[0]) => {
        if (interfere) {
          interfere = false;
          await db.prepare('UPDATE assignments SET points=points+1 WHERE id=?').bind('draft').run();
        }
        return db.batch(statements);
      };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  const repo = new D1Repo(wrapped as never);
  let next = 0;
  const ctx: ServiceContext = {
    repo,
    ai: fixtureAi,
    user: await repo.getUser('u-okafor'),
    now: () => '2026-02-01T00:00:00.000Z',
    newId: prefix => `${prefix}-snapshot-${++next}`
  };
  const preview = await dispatch(service, ctx, 'previewRelease', {
    assignmentId: 'draft'
  });
  await expect(dispatch(service, ctx, 'releaseGrades', {
    assignmentId: 'draft',
    hash: preview.hash
  })).rejects.toMatchObject({
    code: 'conflict'
  });
  expect(interfere).toBe(false);
  expect((await repo.listGradeEvents({
    courseId: 'stat110-04',
    kind: 'release'
  })).items).toEqual([]);
  expect((await repo.getSubmission('sub-stat110-04-u-priya-draft'))?.state).toBe('graded');
});

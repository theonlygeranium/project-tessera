import { describe, expect, it } from 'vitest';
import { fixtureAi } from '../ai';
import { goldenInput, goldenNames } from '../grading/golden.fixture';
import { calculate, cellDisplays, exportRow } from '../grading';
import { seedData } from '../seed';
import { MemoryRepo, dispatch, service, type ServiceContext } from './index';
import { resetWhatIfRateLimit } from './gradebook';
import { OPERATIONS } from '../schema/operations';
const courseId = 'stat110-04';
let sequence = 0;
const time = '2026-02-01T00:00:00.000Z';
async function ctx(repo: MemoryRepo, id: string, now = time): Promise<ServiceContext> {
  return {
    repo,
    ai: fixtureAi,
    user: await repo.getUser(id),
    now: () => now,
    newId: prefix => `${prefix}-gradebook-${++sequence}`
  };
}
async function fixture() {
  const repo = new MemoryRepo(seedData());
  return {
    repo,
    teacher: await ctx(repo, 'u-okafor'),
    priya: await ctx(repo, 'u-priya'),
    admin: await ctx(repo, 'u-admin'),
    other: await ctx(repo, 'u-chen'),
    manager: await ctx(repo, 'u-sam')
  };
}
describe('gradebook service', () => {
  it('shows AI feedback origin only after review and release', async () => {
    const { repo, teacher, priya } = await fixture();
    const submission = (await repo.listSubmissions({ courseId, assignmentId: 'draft' })).find(s => s.studentId === 'u-priya')!;
    const draft = await dispatch(service, teacher, 'draftFeedback', { submissionId: submission.id, criteria: submission.grade!.criteria });
    const held = await dispatch(service, priya, 'getMyGrade', { courseId });
    expect(held.items.find(item => item.assignmentId === 'draft')).toMatchObject({ feedback: null });
    expect(held.items.find(item => item.assignmentId === 'draft')).not.toHaveProperty('feedbackOrigin');
    expect(held.items.find(item => item.assignmentId === 'draft')).not.toHaveProperty('feedbackProvenance');
    await dispatch(service, teacher, 'gradeSubmission', { submissionId: submission.id, criteria: submission.grade!.criteria, score: submission.grade!.score, feedback: draft.feedback, feedbackOrigin: 'ai', feedbackProvenance: draft.provenance });
    const kept = await dispatch(service, priya, 'getMyGrade', { courseId });
    expect(kept.items.find(item => item.assignmentId === 'draft')).not.toHaveProperty('feedbackOrigin');
    await dispatch(service, teacher, 'releaseGrades', { assignmentId: 'draft' });
    const released = await dispatch(service, priya, 'getMyGrade', { courseId });
    expect(released.items.find(item => item.assignmentId === 'draft')).toMatchObject({ feedback: draft.feedback, feedbackOrigin: 'ai', feedbackProvenance: draft.provenance });
    expect(OPERATIONS.getMyGrade.output.parse(released)).toEqual(released);
  });
  it('uses the M1 result for every seeded grid, trace, student, what-if and export surface', async () => {
    const {
      teacher,
      priya,
      repo
    } = await fixture();
    const grid = await dispatch(service, teacher, 'getGradebook', {
      courseId
    });
    const output = await dispatch(service, teacher, 'exportGradebook', {
      courseId,
      format: 'json'
    });
    const csv = await dispatch(service, teacher, 'exportGradebook', {
      courseId,
      format: 'csv'
    });
    expect(grid.rows).toHaveLength(12);
    expect(output).toHaveLength(12);
    for (const [id] of goldenNames) {
      const expected = calculate(goldenInput(id));
      const row = grid.rows.find(r => r.student.id === id)!;
      const explained = await dispatch(service, teacher, 'explainGrade', {
        courseId,
        studentId: id
      });
      const person = await ctx(repo, id);
      const mine = await dispatch(service, person, 'getMyGrade', {
        courseId
      });
      const plan = await dispatch(service, person, 'whatIfMyGrade', {
        courseId,
        scores: []
      });
      expect(row.result).toEqual({
        percent: expected.totals.rounded,
        letter: expected.totals.letter
      });
      expect(row.cells.map(c => c.display?.adjusted)).toEqual([...cellDisplays(expected).map(c => c.adjusted), null, null, null]);
      expect(explained.trace.totals.rounded).toBe(expected.totals.rounded);
      expect(mine.trace.totals.rounded).toBe(expected.totals.rounded);
      expect(plan.trace.totals.rounded).toBe(expected.totals.rounded);
      expect((output as Extract<typeof output, unknown[]>).find(x => x.studentId === id)?.percent).toBe(expected.totals.rounded);
      const lines = ('csv' in csv ? csv.csv : '').split('\n');
      const columns = lines[0].split(',');
      const exportLine = lines.find(line => line.startsWith(`${row.student.name},`))!.split(',');
      expect(Number(exportLine[columns.indexOf('Current %')])).toBe(expected.totals.rounded);
      expect(exportLine[columns.indexOf('Letter')]).toBe(expected.totals.letter);
      expect(exportRow(expected, goldenInput(id).items).at(-3)).toBe(expected.totals.rounded);
    }
    const my = await dispatch(service, priya, 'getMyGrade', {
      courseId
    });
    const what = await dispatch(service, priya, 'whatIfMyGrade', {
      courseId,
      scores: []
    });
    expect(my.trace.totals.rounded).toBe(88.1);
    expect(my.trace.totals.letter).toBe('B+');
    expect(what.trace.totals.rounded).toBe(my.trace.totals.rounded);
    const held = await dispatch(service, teacher, 'getGradebook', {
      courseId,
      view: 'held'
    });
    expect(held.rows.find(x => x.student.id === 'u-priya')?.result).toEqual({
      percent: 86.7,
      letter: 'B'
    });
    for (const [id, percent, letter] of [
      ['u-ramirez', 66.3, 'D'], ['u-brooks', 79.9, 'C+'],
      ['u-ellis', 58.5, 'F'], ['u-asante', 72.3, 'C-'],
      ['u-whitaker', 73.2, 'C']
    ] as const) {
      expect(grid.rows.find(x => x.student.id === id)?.result).toEqual({ percent, letter });
    }
    expect(held.rows.find(x => x.student.id === 'u-ramirez')?.result).toEqual({
      percent: 70.2,
      letter: 'C-'
    });
    expect(Math.round(grid.rows.reduce((sum, row) => sum + (row.result?.percent ?? 0), 0) / grid.rows.length * 10) / 10).toBe(82.1);
  });
  it('lets Priya plan the phone mockup scores without changing her released grade', async () => {
    const { priya, repo } = await fixture();
    const other = await ctx(repo, 'u-ramirez');
    const mine = await dispatch(service, priya, 'getMyGrade', { courseId });
    const theirs = await dispatch(service, other, 'getMyGrade', { courseId });
    expect([mine.trace.studentId, mine.trace.totals.rounded, mine.trace.totals.letter]).toEqual(['u-priya', 88.1, 'B+']);
    expect(theirs.trace.studentId).toBe('u-ramirez');
    expect(JSON.stringify(theirs)).not.toContain('u-priya');
    await expect(dispatch(service, priya, 'previewRelease', { assignmentId: 'draft' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(dispatch(service, priya, 'listGradeEvents', { courseId })).rejects.toMatchObject({ code: 'forbidden' });
    const scores = [{ assignmentId: 'hw5', score: 9 }, { assignmentId: 'q4', score: 17 }, { assignmentId: 'final', score: 36 }];
    const plan = await dispatch(service, priya, 'whatIfMyGrade', { courseId, scores });
    expect([plan.trace.totals.rounded, plan.trace.totals.letter]).toEqual([88.4, 'B+']);
    expect(plan.trace.categories.find(c => c.categoryId === 'quiz')?.items.filter(i => i.state === 'dropped').map(i => i.assignmentId)).toContain('q1');
    const target = await dispatch(service, priya, 'whatIfMyGrade', { courseId, scores: scores.filter(s => s.assignmentId !== 'final'), target: { letter: 'A-' }, solveFor: 'final' });
    expect(target.needed).toEqual({ assignmentId: 'final', score: 38.3 });
  });
  it('blocks cross-course, manager and student staff access', async () => {
    const {
      teacher,
      priya,
      other,
      manager,
      repo
    } = await fixture();
    await expect(dispatch(service, other, 'getGradebook', {
      courseId
    })).rejects.toMatchObject({
      code: 'forbidden'
    });
    await expect(dispatch(service, manager, 'getGradebook', {
      courseId
    })).rejects.toMatchObject({
      code: 'forbidden'
    });
    await repo.addEnrollment(courseId, 'u-sam');
    await expect(dispatch(service, manager, 'getMyGrade', {
      courseId
    })).rejects.toMatchObject({
      code: 'forbidden'
    });
    await expect(dispatch(service, manager, 'whatIfMyGrade', {
      courseId,
      scores: []
    })).rejects.toMatchObject({
      code: 'forbidden'
    });
    await expect(dispatch(service, priya, 'getGradebookSetup', {
      courseId
    })).rejects.toMatchObject({
      code: 'forbidden'
    });
    await expect(dispatch(service, teacher, 'getMyGrade', {
      courseId
    })).rejects.toMatchObject({
      code: 'forbidden'
    });
  });
  it('refuses managers on every staff gradebook operation', async () => {
    const {
      manager
    } = await fixture();
    for (const op of [
      'getGradebook', 'exportGradebook', 'getGradebookSetup', 'previewGradebookSetup',
      'saveGradebookSetup', 'dismissSetupCheck', 'updateGradeCells', 'setFinalOverride',
      'clearFinalOverride', 'explainGrade', 'previewRelease', 'releaseGrades',
      'unreleaseGrades', 'listGradeEvents', 'undoGradeEvent'
    ] as const) await expect(dispatch(service, manager, op, {
      courseId,
      assignmentId: 'draft',
      studentId: 'u-priya',
      eventId: 'missing'
    } as never)).rejects.toMatchObject({
      code: 'forbidden'
    });
  });
  it('keeps held score and staff reasons out of student output and rejects released what-if items', async () => {
    const {
      priya
    } = await fixture();
    const grade = await dispatch(service, priya, 'getMyGrade', {
      courseId
    });
    const payload = JSON.stringify(grade);
    expect(payload).not.toContain('Fixture');
    expect(grade.trace.categories.flatMap(c => c.items).find(i => i.assignmentId === 'draft')?.raw).toBeNull();
    expect(grade.items.find(i => i.assignmentId === 'draft')?.score).toBeNull();
    const what = await dispatch(service, priya, 'whatIfMyGrade', {
      courseId,
      scores: []
    });
    expect(what.trace.categories.flatMap(c => c.items).find(i => i.assignmentId === 'draft')?.raw).toBeNull();
    const hypothetical = await dispatch(service, priya, 'whatIfMyGrade', {
      courseId,
      scores: [{
        assignmentId: 'draft',
        score: 35
      }]
    });
    expect(hypothetical.trace.categories.flatMap(c => c.items).find(i => i.assignmentId === 'draft')).toMatchObject({
      raw: null,
      adjusted: 35,
      state: 'what-if'
    });
    expect(JSON.stringify(hypothetical)).not.toContain('Fixture');
    await expect(dispatch(service, priya, 'whatIfMyGrade', {
      courseId,
      scores: [{
        assignmentId: 'hw1',
        score: 10
      }]
    })).rejects.toMatchObject({
      code: 'invalid'
    });
  });
  it('redacts an unkept feedback draft in the existing student submission route', async () => {
    const {
      repo,
      priya
    } = await fixture();
    const s = (await repo.listSubmissions({
      courseId,
      assignmentId: 'draft'
    })).find(x => x.studentId === 'u-priya')!;
    await repo.putSubmission({
      ...s,
      feedbackDraft: {
        text: 'Staff draft only',
        provenance: {
          model: 'fixture',
          task: 'feedback',
          generatedAt: time,
          sources: [],
          summary: 'Draft'
        },
        createdAt: time
      }
    });
    const mine = await dispatch(service, priya, 'getMySubmission', {
      assignmentId: 'draft'
    });
    expect(JSON.stringify(mine)).not.toContain('Staff draft only');
    expect(mine?.grade).toBeNull();
  });
  it('enforces what-if rate limit via the context clock', async () => {
    resetWhatIfRateLimit();
    const {
      priya
    } = await fixture();
    for (let i = 0; i < 30; i++) await dispatch(service, priya, 'whatIfMyGrade', {
      courseId,
      scores: []
    });
    await expect(dispatch(service, priya, 'whatIfMyGrade', {
      courseId,
      scores: []
    })).rejects.toMatchObject({
      code: 'rate-limited'
    });
    resetWhatIfRateLimit();
  });
  it('refuses setup fixes and stale preview, and records a valid setup', async () => {
    const {
      teacher,
      repo
    } = await fixture();
    const saved = await dispatch(service, teacher, 'getGradebookSetup', {
      courseId
    });
    const broken = {
      ...saved,
      categories: saved.categories.map((x, i) => i === 0 ? {
        ...x,
        weight: 55
      } : x)
    };
    const bad = await dispatch(service, teacher, 'previewGradebookSetup', {
      courseId,
      setup: broken
    });
    expect(bad.checks.some(c => c.code === 'weights-not-100' && c.severity === 'fix')).toBe(true);
    await expect(dispatch(service, teacher, 'saveGradebookSetup', {
      courseId,
      setup: broken,
      expectedVersion: saved.version,
      hash: bad.changeSet.hash
    })).rejects.toMatchObject({
      code: 'invalid'
    });
    const preview = await dispatch(service, teacher, 'previewGradebookSetup', {
      courseId,
      setup: saved
    });
    await expect(dispatch(service, teacher, 'saveGradebookSetup', {
      courseId,
      setup: saved,
      expectedVersion: 999,
      hash: preview.changeSet.hash
    })).rejects.toMatchObject({
      code: 'conflict'
    });
    await expect(dispatch(service, teacher, 'saveGradebookSetup', {
      courseId,
      setup: saved,
      expectedVersion: saved.version,
      hash: 'stale'
    })).rejects.toMatchObject({
      code: 'conflict'
    });
    const next = await dispatch(service, teacher, 'saveGradebookSetup', {
      courseId,
      setup: saved,
      expectedVersion: saved.version,
      hash: preview.changeSet.hash
    });
    expect(next.version).toBe(2);
    expect((await repo.listGradeEvents({
      courseId,
      kind: 'setup'
    })).items).toHaveLength(1);
  });
  it('dismisses only review setup checks', async () => {
    const {
      teacher
    } = await fixture();
    await expect(dispatch(service, teacher, 'dismissSetupCheck', {
      courseId,
      code: 'weights-not-100',
      target: ''
    })).rejects.toMatchObject({
      code: 'invalid'
    });
    const setup = await dispatch(service, teacher, 'dismissSetupCheck', {
      courseId,
      code: 'category-empty',
      target: 'participation'
    });
    expect(setup.dismissedChecks).toHaveLength(1);
    expect(setup.version).toBe(2);
    expect(setup.rulesVersion).toBe(1);
  });
  it('makes a batch atomic, requires reasons, and replays batch IDs', async () => {
    const {
      teacher,
      repo
    } = await fixture();
    const changes = [{
      assignmentId: 'hw1',
      studentId: 'u-priya',
      op: 'score' as const,
      value: 8,
      reason: 'Correction',
      expectedVersion: 0
    }, {
      assignmentId: 'hw2',
      studentId: 'u-priya',
      op: 'score' as const,
      value: 7,
      reason: 'Correction',
      expectedVersion: 99
    }];
    const before = await repo.getSubmission('sub-stat110-04-u-priya-hw1');
    const result = await dispatch(service, teacher, 'updateGradeCells', {
      courseId,
      batchId: 'batch-stale',
      changes
    });
    expect(result.cells[0]).toHaveProperty('conflict', true);
    expect(await repo.getSubmission(before!.id)).toEqual(before);
    expect((await repo.listGradeEvents({
      courseId,
      batchId: 'batch-stale'
    })).items).toHaveLength(0);
    await expect(dispatch(service, teacher, 'updateGradeCells', {
      courseId,
      batchId: 'batch-reason',
      changes: [{
        assignmentId: 'hw1',
        studentId: 'u-priya',
        op: 'override',
        value: 8,
        expectedVersion: 0
      }]
    })).rejects.toMatchObject({
      code: 'invalid'
    });
    const accepted = await dispatch(service, teacher, 'updateGradeCells', {
      courseId,
      batchId: 'batch-good',
      changes: [{
        assignmentId: 'hw1',
        studentId: 'u-priya',
        op: 'score',
        value: 8,
        reason: 'Correction',
        expectedVersion: 0
      }]
    });
    expect(accepted.cells[0]).toHaveProperty('ok', true);
    expect((await repo.getSubmission(before!.id))?.grade?.score).toBe(before?.grade?.score);
    const replay = await dispatch(service, teacher, 'updateGradeCells', {
      courseId,
      batchId: 'batch-good',
      changes: [{
        assignmentId: 'hw1',
        studentId: 'u-priya',
        op: 'score',
        value: 8,
        reason: 'Correction',
        expectedVersion: 0
      }]
    });
    expect(replay.cells[0]).toHaveProperty('ok', true);
    expect((await repo.listGradeEvents({
      courseId,
      batchId: 'batch-good'
    })).items).toHaveLength(1);
  });
  it('records a score without a submission, keeps it held, and removes it on undo', async () => {
    const {
      teacher,
      priya,
      repo
    } = await fixture();
    const result = await dispatch(service, teacher, 'updateGradeCells', {
      courseId,
      batchId: 'recorded',
      changes: [{
        assignmentId: 'ec',
        studentId: 'u-aguilar',
        op: 'score',
        value: 3,
        expectedVersion: 0
      }]
    });
    expect(result.cells[0]).toHaveProperty('ok', true);
    const rows = await repo.listSubmissions({
      courseId,
      studentId: 'u-aguilar'
    });
    const recorded = rows.find(s => s.assignmentId === 'ec');
    expect(recorded).toMatchObject({
      source: 'recorded',
      state: 'graded',
      attempt: 1,
      text: '',
      version: 1
    });
    expect(recorded?.grade?.releasedAt).toBeNull();
    expect((await dispatch(service, priya, 'getMyGrade', {
      courseId
    })).trace.view).toBe('student');
    const event = (await repo.listGradeEvents({
      courseId,
      batchId: 'recorded'
    })).items[0];
    await dispatch(service, teacher, 'undoGradeEvent', {
      eventId: event.id
    });
    expect(await repo.getSubmission(recorded!.id)).toBeNull();
  });
  it('previews release, skips unkept AI drafts, un-releases, and refuses a stale hash', async () => {
    const {
      teacher,
      repo
    } = await fixture();
    const draft = (await repo.listSubmissions({
      courseId,
      assignmentId: 'draft'
    })).find(s => s.studentId === 'u-priya')!;
    await repo.putSubmission({
      ...draft,
      feedbackDraft: {
        text: 'Draft feedback',
        provenance: {
          model: 'fixture',
          task: 'feedback',
          generatedAt: time,
          sources: [],
          summary: 'Draft'
        },
        createdAt: time
      }
    });
    const preview = await dispatch(service, teacher, 'previewRelease', {
      assignmentId: 'draft'
    });
    expect(preview.notSent.map(x => x.studentId)).toContain('u-priya');
    expect(preview.changes.length).toBeGreaterThan(0);
    await expect(dispatch(service, teacher, 'releaseGrades', {
      assignmentId: 'draft',
      hash: 'stale'
    })).rejects.toMatchObject({
      code: 'conflict'
    });
    const released = await dispatch(service, teacher, 'releaseGrades', {
      assignmentId: 'draft',
      hash: preview.hash
    });
    expect(released.notSent?.map(x => x.studentId)).toContain('u-priya');
    expect(released.released).not.toContain(draft.id);
    expect((await repo.getSubmission(draft.id))?.grade?.releasedAt).toBeNull();
    await dispatch(service, teacher, 'unreleaseGrades', {
      assignmentId: 'draft'
    });
    for (const id of released.released ?? []) expect((await repo.getSubmission(id))?.grade?.releasedAt).toBeNull();
  });
  it('undoes a whole batch, rejects stale undo and double undo, and enforces 30 days', async () => {
    const {
      teacher,
      repo
    } = await fixture();
    await dispatch(service, teacher, 'updateGradeCells', {
      courseId,
      batchId: 'undo-batch',
      changes: [{
        assignmentId: 'hw1',
        studentId: 'u-priya',
        op: 'mark-missing',
        expectedVersion: 0
      }, {
        assignmentId: 'hw2',
        studentId: 'u-priya',
        op: 'mark-missing',
        expectedVersion: 0
      }]
    });
    const events = (await repo.listGradeEvents({
      courseId,
      batchId: 'undo-batch'
    })).items;
    expect(events).toHaveLength(2);
    await dispatch(service, teacher, 'undoGradeEvent', {
      eventId: events[0].id
    });
    expect((await repo.listStudentItemStates({
      courseId,
      studentId: 'u-priya',
      assignmentId: 'hw2'
    }))[0].missing).toBeNull();
    await expect(dispatch(service, teacher, 'undoGradeEvent', {
      eventId: events[0].id
    })).rejects.toMatchObject({
      code: 'conflict'
    });
    const undoEvent = (await repo.listGradeEvents({
      courseId,
      kind: 'undo'
    })).items[0];
    await expect(dispatch(service, teacher, 'undoGradeEvent', {
      eventId: undoEvent.id
    })).rejects.toMatchObject({
      code: 'invalid'
    });
    await dispatch(service, teacher, 'updateGradeCells', {
      courseId,
      batchId: 'undo-conflict',
      changes: [{
        assignmentId: 'hw1',
        studentId: 'u-priya',
        op: 'mark-missing',
        expectedVersion: 2
      }]
    });
    const changed = (await repo.listGradeEvents({
      courseId,
      batchId: 'undo-conflict'
    })).items[0];
    await dispatch(service, teacher, 'updateGradeCells', {
      courseId,
      batchId: 'later',
      changes: [{
        assignmentId: 'hw1',
        studentId: 'u-priya',
        op: 'clear-missing',
        expectedVersion: 3
      }]
    });
    await expect(dispatch(service, teacher, 'undoGradeEvent', {
      eventId: changed.id
    })).rejects.toMatchObject({
      code: 'conflict'
    });
    const old = await ctx(repo, 'u-okafor', '2026-04-01T00:00:00.000Z');
    await expect(dispatch(service, old, 'undoGradeEvent', {
      eventId: changed.id
    })).rejects.toMatchObject({
      code: 'conflict'
    });
  });
  it('handles partial CAS and final override with staff-only reasons', async () => {
    const {
      teacher,
      priya,
      repo
    } = await fixture();
    const partial = await dispatch(service, teacher, 'updateGradeCells', {
      courseId,
      batchId: 'partial',
      partial: true,
      changes: [{
        assignmentId: 'hw1',
        studentId: 'u-priya',
        op: 'mark-missing',
        expectedVersion: 0
      }, {
        assignmentId: 'hw2',
        studentId: 'u-priya',
        op: 'mark-missing',
        expectedVersion: 99
      }]
    });
    expect(partial.cells[0]).toHaveProperty('ok', true);
    expect(partial.cells[1]).toHaveProperty('conflict', true);
    await expect(dispatch(service, teacher, 'setFinalOverride', {
      courseId,
      studentId: 'u-priya',
      letter: 'X',
      reason: 'Appeal',
      expectedVersion: 0
    })).rejects.toMatchObject({
      code: 'invalid'
    });
    await expect(dispatch(service, teacher, 'setFinalOverride', {
      courseId,
      studentId: 'u-priya',
      letter: 'A',
      reason: ' ',
      expectedVersion: 0
    })).rejects.toMatchObject({
      code: 'invalid'
    });
    const set = await dispatch(service, teacher, 'setFinalOverride', {
      courseId,
      studentId: 'u-priya',
      letter: 'A',
      reason: 'Appeal review',
      expectedVersion: 0
    });
    expect(set.version).toBe(1);
    expect(JSON.stringify(await dispatch(service, priya, 'getMyGrade', {
      courseId
    }))).not.toContain('Appeal review');
    expect((await dispatch(service, priya, 'getMyGrade', {
      courseId
    })).trace.totals.letter).toBe('A');
    await dispatch(service, teacher, 'clearFinalOverride', {
      courseId,
      studentId: 'u-priya',
      reason: 'Review complete',
      expectedVersion: 1
    });
    expect(await repo.getFinalOverride(courseId, 'u-priya')).toBeNull();
  });
  it('undoes setup and release events', async () => {
    const {
      teacher,
      repo
    } = await fixture();
    const saved = await dispatch(service, teacher, 'getGradebookSetup', {
      courseId
    });
    const preview = await dispatch(service, teacher, 'previewGradebookSetup', {
      courseId,
      setup: saved
    });
    await dispatch(service, teacher, 'saveGradebookSetup', {
      courseId,
      setup: saved,
      expectedVersion: 1,
      hash: preview.changeSet.hash
    });
    const setupEvent = (await repo.listGradeEvents({
      courseId,
      kind: 'setup'
    })).items[0];
    await dispatch(service, teacher, 'undoGradeEvent', {
      eventId: setupEvent.id
    });
    expect((await repo.getGradebookSetup(courseId))?.rulesVersion).toBe(2);
    const released = await dispatch(service, teacher, 'releaseGrades', {
      assignmentId: 'draft'
    });
    expect(released.released?.length).toBeGreaterThan(0);
    const releaseEvent = (await repo.listGradeEvents({
      courseId,
      assignmentId: 'draft',
      kind: 'release'
    })).items[0];
    await dispatch(service, teacher, 'undoGradeEvent', {
      eventId: releaseEvent.id
    });
    for (const id of released.released ?? []) expect((await repo.getSubmission(id))?.grade?.releasedAt).toBeNull();
  });
});

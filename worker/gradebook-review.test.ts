import { describe, expect, it } from 'vitest';
import type { Repo } from '../shared/repo';
import { fixtureAi } from '../shared/ai';
import { seedData } from '../shared/seed';
import { dispatch, MemoryRepo, service, type ServiceContext } from '../shared/service';
import { D1Repo } from './d1-repo';
import { createTestDb } from './test/d1-shim';
const courseId = 'stat110-04';
const time = '2026-02-01T00:00:00.000Z';
const sources: [string, () => Repo][] = [['Memory', () => new MemoryRepo(seedData())], ['D1', () => {
  const repo = new D1Repo(createTestDb() as never);
  return repo;
}]];
let sequence = 0;
async function context(repo: Repo, userId = 'u-okafor'): Promise<ServiceContext> {
  return {
    repo,
    ai: fixtureAi,
    user: await repo.getUser(userId),
    now: () => time,
    newId: prefix => `${prefix}-review-${++sequence}`
  };
}
async function fixture(make: () => Repo) {
  const repo = make();
  await repo.reset(seedData());
  return {
    repo,
    teacher: await context(repo)
  };
}
const score = (assignmentId: string, studentId: string, value: number, expectedVersion: number) => ({
  assignmentId,
  studentId,
  op: 'score' as const,
  value,
  expectedVersion
});
const missing = (assignmentId: string, studentId: string, expectedVersion: number, op: 'mark-missing' | 'clear-missing' = 'mark-missing') => ({
  assignmentId,
  studentId,
  op,
  expectedVersion
});
for (const [name, make] of sources) {
  describe(`${name} M2 review regressions`, () => {
    it('authorizes before replay and binds batch IDs to user and request fingerprint', async () => {
      const {
        repo,
        teacher
      } = await fixture(make);
      const changes = [missing('hw1', 'u-priya', 0)];
      const accepted = await dispatch(service, teacher, 'updateGradeCells', {
        courseId,
        batchId: 'replay',
        changes
      });
      expect((await dispatch(service, teacher, 'updateGradeCells', {
        courseId,
        batchId: 'replay',
        changes
      })).cells).toEqual(accepted.cells);
      await expect(dispatch(service, teacher, 'updateGradeCells', {
        courseId,
        batchId: 'replay',
        changes: [missing('hw1', 'u-priya', 1)]
      })).rejects.toMatchObject({
        code: 'conflict'
      });
      const course = (await repo.getCourse(courseId))!;
      await repo.putCourse({
        ...course,
        instructorIds: [...course.instructorIds, 'u-chen']
      });
      const otherTeacher = await context(repo, 'u-chen');
      await expect(dispatch(service, otherTeacher, 'updateGradeCells', {
        courseId,
        batchId: 'replay',
        changes
      })).rejects.toMatchObject({
        code: 'conflict'
      });
      const student = await context(repo, 'u-priya');
      await expect(dispatch(service, student, 'updateGradeCells', {
        courseId,
        batchId: 'replay',
        changes
      })).rejects.toMatchObject({
        code: 'forbidden'
      });
      expect((await repo.listGradeEvents({
        courseId,
        batchId: 'replay'
      })).items).toHaveLength(1);
    });
    it('keeps final override and recorded submission revisions after clearing', async () => {
      const {
        repo,
        teacher
      } = await fixture(make);
      const first = await dispatch(service, teacher, 'setFinalOverride', {
        courseId,
        studentId: 'u-priya',
        percent: 91,
        reason: 'Appeal',
        expectedVersion: 0
      });
      expect(first.version).toBe(1);
      const clear = await dispatch(service, teacher, 'clearFinalOverride', {
        courseId,
        studentId: 'u-priya',
        reason: 'Resolved',
        expectedVersion: 1
      });
      expect(clear.version).toBe(2);
      expect(await repo.getFinalOverride(courseId, 'u-priya')).toBeNull();
      const restored = await dispatch(service, teacher, 'setFinalOverride', {
        courseId,
        studentId: 'u-priya',
        percent: 75,
        reason: 'New appeal',
        expectedVersion: 2
      });
      expect(restored.version).toBe(3);
      await expect(dispatch(service, teacher, 'setFinalOverride', {
        courseId,
        studentId: 'u-priya',
        percent: 99,
        reason: 'Stale',
        expectedVersion: 1
      })).rejects.toMatchObject({
        code: 'conflict'
      });
      expect((await repo.getFinalOverride(courseId, 'u-priya'))?.percent).toBe(75);
      const grid = await dispatch(service, teacher, 'getGradebook', {
        courseId
      });
      expect(grid.rows.find(row => row.student.id === 'u-priya')?.finalOverrideVersion).toBe(3);
      const recorded = await dispatch(service, teacher, 'updateGradeCells', {
        courseId,
        batchId: 'recorded',
        changes: [score('ec', 'u-aguilar', 3, 0)]
      });
      expect(recorded.cells[0]).toHaveProperty('version', 1);
      const created = (await repo.listSubmissions({
        courseId,
        studentId: 'u-aguilar'
      })).find(s => s.assignmentId === 'ec')!;
      const event = (await repo.listGradeEvents({
        courseId,
        batchId: 'recorded'
      })).items[0];
      await dispatch(service, teacher, 'undoGradeEvent', {
        eventId: event.id
      });
      expect(await repo.getSubmission(created.id)).toBeNull();
      expect((await repo.listSubmissions({
        courseId,
        studentId: 'u-aguilar'
      })).some(s => s.id === created.id)).toBe(false);
      expect((await repo.listSubmissions({
        courseId,
        studentId: 'u-aguilar',
        includeDeleted: true
      })).find(s => s.id === created.id)).toMatchObject({
        deleted: true,
        version: 2
      });
      const afterUndo = await dispatch(service, teacher, 'getGradebook', {
        courseId
      });
      expect(afterUndo.rows.find(row => row.student.id === 'u-aguilar')?.cells.find(cell => cell.assignmentId === 'ec')?.submissionVersion).toBe(2);
      const revived = await dispatch(service, teacher, 'updateGradeCells', {
        courseId,
        batchId: 'revived',
        changes: [score('ec', 'u-aguilar', 4, 2)]
      });
      expect(revived.cells[0]).toHaveProperty('version', 3);
      await expect(dispatch(service, teacher, 'updateGradeCells', {
        courseId,
        batchId: 'stale-revival',
        changes: [score('ec', 'u-aguilar', 99, 1)]
      })).resolves.toMatchObject({
        cells: [{
          conflict: true
        }]
      });
      expect((await repo.getSubmission(created.id))?.grade?.score).toBe(4);
    });
    it('rejects invalid calendar extensions before any write', async () => {
      const {
        repo,
        teacher
      } = await fixture(make);
      await expect(dispatch(service, teacher, 'updateGradeCells', {
        courseId,
        batchId: 'bad-date',
        changes: [{
          assignmentId: 'hw1',
          studentId: 'u-priya',
          op: 'extend',
          value: '2026-02-30T00:00:00Z',
          expectedVersion: 0
        }]
      })).rejects.toMatchObject({
        code: 'invalid',
        message: expect.stringContaining('changes.0.value')
      });
      expect(await repo.listStudentItemStates({
        courseId,
        studentId: 'u-priya',
        assignmentId: 'hw1'
      })).toEqual([]);
      expect((await repo.listGradeEvents({
        courseId,
        batchId: 'bad-date'
      })).items).toEqual([]);
      await dispatch(service, teacher, 'getGradebook', {
        courseId
      });
    });
    it('rejects invalid assignment dueAt before persistence', async () => {
      const { repo, teacher } = await fixture(make);
      const before = await repo.getAssignment('draft');
      await expect(dispatch(service, teacher, 'updateAssignment', {
        assignmentId: 'draft',
        dueAt: '2026-02-30T00:00:00Z'
      })).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('dueAt') });
      expect(await repo.getAssignment('draft')).toEqual(before);
    });
    it('keeps the item-state revision after undo returns it to defaults', async () => {
      const {
        repo,
        teacher
      } = await fixture(make);
      await dispatch(service, teacher, 'updateGradeCells', {
        courseId,
        batchId: 'missing-then-undo',
        changes: [missing('hw1', 'u-priya', 0)]
      });
      const event = (await repo.listGradeEvents({
        courseId,
        batchId: 'missing-then-undo'
      })).items[0];
      await dispatch(service, teacher, 'undoGradeEvent', {
        eventId: event.id
      });
      const state = (await repo.listStudentItemStates({
        courseId,
        studentId: 'u-priya',
        assignmentId: 'hw1'
      }))[0];
      expect(state).toMatchObject({
        missing: null,
        version: 2
      });
      const grid = await dispatch(service, teacher, 'getGradebook', {
        courseId
      });
      expect(grid.rows.find(row => row.student.id === 'u-priya')?.cells.find(cell => cell.assignmentId === 'hw1')?.itemStateVersion).toBe(2);
      const stale = await dispatch(service, teacher, 'updateGradeCells', {
        courseId,
        batchId: 'stale-item-state',
        changes: [missing('hw1', 'u-priya', 0)]
      });
      expect(stale.cells[0]).toHaveProperty('conflict', true);
    });
    it('refuses parent deletes that would cascade through CAS history', async () => {
      const { repo } = await fixture(make);
      const assignment = (await repo.getAssignment('draft'))!;
      const submission = (await repo.listSubmissions({ assignmentId: assignment.id }))[0];
      await expect(repo.deleteAssignment(assignment.id)).rejects.toMatchObject({ code: 'conflict' });
      await expect(repo.deleteModule(assignment.moduleId)).rejects.toMatchObject({ code: 'conflict' });
      expect(await repo.getSubmission(submission.id)).not.toBeNull();
    });
    it('restores a cleared final override at a new revision on undo', async () => {
      const {
        repo,
        teacher
      } = await fixture(make);
      await dispatch(service, teacher, 'setFinalOverride', {
        courseId,
        studentId: 'u-priya',
        percent: 91,
        reason: 'Appeal',
        expectedVersion: 0
      });
      await dispatch(service, teacher, 'clearFinalOverride', {
        courseId,
        studentId: 'u-priya',
        reason: 'Resolved',
        expectedVersion: 1
      });
      const clear = (await repo.listGradeEvents({
        courseId,
        kind: 'final-override'
      })).items[0];
      await dispatch(service, teacher, 'undoGradeEvent', {
        eventId: clear.id
      });
      expect(await repo.getFinalOverride(courseId, 'u-priya')).toMatchObject({
        percent: 91,
        version: 3
      });
      await expect(dispatch(service, teacher, 'setFinalOverride', {
        courseId,
        studentId: 'u-priya',
        percent: 99,
        reason: 'Stale',
        expectedVersion: 1
      })).rejects.toMatchObject({
        code: 'conflict'
      });
    });
    it('uses event sequence when release timestamps tie', async () => {
      const {
        repo,
        teacher
      } = await fixture(make);
      const priya = (await repo.listSubmissions({
        courseId,
        assignmentId: 'draft'
      })).find(s => s.studentId === 'u-priya')!;
      await repo.putSubmission({
        ...priya,
        feedbackDraft: {
          text: 'Needs review',
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
      const first = await dispatch(service, teacher, 'releaseGrades', {
        assignmentId: 'draft'
      });
      expect(first.released!.length).toBeGreaterThan(0);
      expect(first.released).not.toContain(priya.id);
      await repo.putSubmission({
        ...priya,
        feedbackDraft: null
      });
      const second = await dispatch(service, teacher, 'releaseGrades', {
        assignmentId: 'draft'
      });
      expect(second.released).toContain(priya.id);
      const releases = (await repo.listGradeEvents({
        courseId,
        assignmentId: 'draft',
        kind: 'release'
      })).items;
      expect(releases[0].seq).toBeGreaterThan(releases[1].seq!);
      await dispatch(service, teacher, 'unreleaseGrades', {
        assignmentId: 'draft'
      });
      expect((await repo.getSubmission(priya.id))?.state).toBe('graded');
      expect((await repo.getSubmission(first.released![0]))?.state).toBe('returned');
    });
    const staleCases: {
      name: string;
      before?: (repo: Repo, teacher: ServiceContext) => Promise<void>;
      change: (repo: Repo, teacher: ServiceContext) => Promise<void>;
    }[] = [{
      name: 'score change',
      change: async (_repo, teacher) => {
        await dispatch(service, teacher, 'updateGradeCells', {
          courseId,
          batchId: 'score-change',
          changes: [score('draft', 'u-priya', 35, 0)]
        });
      }
    }, {
      name: 'new item state',
      change: async (_repo, teacher) => {
        await dispatch(service, teacher, 'updateGradeCells', {
          courseId,
          batchId: 'new-state',
          changes: [missing('hw1', 'u-priya', 0)]
        });
      }
    }, {
      name: 'item state below maximum revision',
      before: async (_repo, teacher) => {
        for (const [batchId, change] of [
          ['high-1', missing('hw2', 'u-priya', 0)],
          ['high-2', missing('hw2', 'u-priya', 1, 'clear-missing')],
          ['high-3', missing('hw2', 'u-priya', 2)],
          ['low-1', missing('hw1', 'u-priya', 0)]
        ] as const) await dispatch(service, teacher, 'updateGradeCells', {
          courseId,
          batchId,
          changes: [change]
        });
      },
      change: async (_repo, teacher) => {
        await dispatch(service, teacher, 'updateGradeCells', {
          courseId,
          batchId: 'low-2',
          changes: [missing('hw1', 'u-priya', 1, 'clear-missing')]
        });
      }
    }, {
      name: 'final override set',
      change: async (_repo, teacher) => {
        await dispatch(service, teacher, 'setFinalOverride', {
          courseId,
          studentId: 'u-priya',
          percent: 83,
          reason: 'Appeal',
          expectedVersion: 0
        });
      }
    }, {
      name: 'final override clear',
      before: async (_repo, teacher) => {
        await dispatch(service, teacher, 'setFinalOverride', {
          courseId,
          studentId: 'u-priya',
          percent: 83,
          reason: 'Appeal',
          expectedVersion: 0
        });
      },
      change: async (_repo, teacher) => {
        await dispatch(service, teacher, 'clearFinalOverride', {
          courseId,
          studentId: 'u-priya',
          reason: 'Resolved',
          expectedVersion: 1
        });
      }
    }, {
      name: 'assignment points change',
      change: async repo => {
        const assignment = (await repo.getAssignment('draft'))!;
        await repo.putAssignment({
          ...assignment,
          points: assignment.points + 1
        });
      }
    }, {
      name: 'new enrollment',
      change: async repo => {
        await repo.addEnrollment(courseId, 'u-sam');
      }
    }];
    for (const scenario of staleCases) {
      it(`invalidates setup and release previews after ${scenario.name}`, async () => {
        for (const kind of ['setup', 'release'] as const) {
          const {
            repo,
            teacher
          } = await fixture(make);
          await scenario.before?.(repo, teacher);
          const setup = kind === 'setup' ? await dispatch(service, teacher, 'getGradebookSetup', {
            courseId
          }) : null;
          const preview = kind === 'setup' ? await dispatch(service, teacher, 'previewGradebookSetup', {
            courseId,
            setup: setup!
          }) : await dispatch(service, teacher, 'previewRelease', {
            assignmentId: 'draft'
          });
          await scenario.change(repo, teacher);
          if (kind === 'setup') await expect(dispatch(service, teacher, 'saveGradebookSetup', {
            courseId,
            setup: setup!,
            expectedVersion: setup!.version,
            hash: 'changeSet' in preview ? preview.changeSet.hash : ''
          })).rejects.toMatchObject({
            code: 'conflict'
          });else await expect(dispatch(service, teacher, 'releaseGrades', {
            assignmentId: 'draft',
            hash: 'hash' in preview ? preview.hash : ''
          })).rejects.toMatchObject({
            code: 'conflict'
          });
        }
      });
    }
    it('rejects an edit interleaved after snapshot validation, including release without a hash', async () => {
      for (const kind of ['setup', 'release', 'release-no-hash'] as const) {
        const {
          repo,
          teacher
        } = await fixture(make);
        const setup = await dispatch(service, teacher, 'getGradebookSetup', {
          courseId
        });
        const setupPreview = await dispatch(service, teacher, 'previewGradebookSetup', {
          courseId,
          setup
        });
        const releasePreview = await dispatch(service, teacher, 'previewRelease', {
          assignmentId: 'draft'
        });
        let injected = false;
        const wrapped = new Proxy(repo, {
          get(target, property) {
            if (property === 'applyGradeWrites') return async (...args: Parameters<Repo['applyGradeWrites']>) => {
              if (args[2] && !injected) {
                injected = true;
                if (kind === 'setup') await dispatch(service, teacher, 'updateGradeCells', {
                  courseId,
                  batchId: 'interleaved-state',
                  changes: [missing('hw1', 'u-priya', 0)]
                });else await dispatch(service, teacher, 'updateGradeCells', {
                  courseId,
                  batchId: 'interleaved-score',
                  changes: [score('draft', 'u-priya', 35, 0)]
                });
              }
              return target.applyGradeWrites(...args);
            };
            const value = Reflect.get(target, property);
            return typeof value === 'function' ? value.bind(target) : value;
          }
        });
        const intercepted = {
          ...teacher,
          repo: wrapped
        };
        if (kind === 'setup') await expect(dispatch(service, intercepted, 'saveGradebookSetup', {
          courseId,
          setup,
          expectedVersion: setup.version,
          hash: setupPreview.changeSet.hash
        })).rejects.toMatchObject({
          code: 'conflict'
        });else await expect(dispatch(service, intercepted, 'releaseGrades', {
          assignmentId: 'draft',
          ...(kind === 'release' ? {
            hash: releasePreview.hash
          } : {})
        })).rejects.toMatchObject({
          code: 'conflict'
        });
        expect(injected).toBe(true);
        expect((await repo.listGradeEvents({
          courseId,
          kind: kind === 'setup' ? 'setup' : 'release'
        })).items).toEqual([]);
      }
    });
    it('replays the exact version of the updated entity', async () => {
      const {
        teacher
      } = await fixture(make);
      await dispatch(service, teacher, 'updateGradeCells', {
        courseId,
        batchId: 'extension',
        changes: [{
          assignmentId: 'draft',
          studentId: 'u-priya',
          op: 'extend',
          value: '2026-02-10T00:00:00Z',
          expectedVersion: 0
        }]
      });
      await dispatch(service, teacher, 'updateGradeCells', {
        courseId,
        batchId: 'score-one',
        changes: [score('draft', 'u-priya', 33, 0)]
      });
      const changes = [score('draft', 'u-priya', 34, 1)];
      const original = await dispatch(service, teacher, 'updateGradeCells', {
        courseId,
        batchId: 'score-two',
        changes
      });
      await dispatch(service, teacher, 'updateGradeCells', {
        courseId,
        batchId: 'score-three',
        changes: [score('draft', 'u-priya', 35, 2)]
      });
      const replay = await dispatch(service, teacher, 'updateGradeCells', {
        courseId,
        batchId: 'score-two',
        changes
      });
      expect(original.cells[0]).toHaveProperty('version', 2);
      expect(replay).toEqual(original);
    });
    it('replays the original mixed partial result after later edits', async () => {
      const { teacher } = await fixture(make);
      const changes = [
        missing('hw1', 'u-priya', 0),
        missing('hw2', 'u-priya', 99)
      ];
      const original = await dispatch(service, teacher, 'updateGradeCells', {
        courseId, batchId: 'partial-replay', partial: true, changes
      });
      expect(original.cells[0]).toHaveProperty('version', 1);
      expect(original.cells[1]).toHaveProperty('conflict', true);
      await dispatch(service, teacher, 'updateGradeCells', {
        courseId, batchId: 'later-partial', changes: [missing('hw1', 'u-priya', 1, 'clear-missing')]
      });
      const replay = await dispatch(service, teacher, 'updateGradeCells', {
        courseId, batchId: 'partial-replay', partial: true, changes
      });
      expect(replay).toEqual(original);
    });
  });
}

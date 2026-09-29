import { describe, expect, it } from 'vitest';
import { fixtureAi } from '../../../../shared/ai';
import { seedData } from '../../../../shared/seed';
import { MemoryRepo, dispatch, service, type ServiceContext } from '../../../../shared/service/index';

const courseId = 'stat110-04';
let sequence = 0;
async function ctx(repo: MemoryRepo, id: string): Promise<ServiceContext> {
  return { repo, ai: fixtureAi, user: await repo.getUser(id), now: () => '2026-10-20T19:00:00.000Z', newId: prefix => `${prefix}-m3-${++sequence}` };
}

describe('gradebook M3 regressions', () => {
  it('saving an unchanged late raw score does not re-apply the late penalty', async () => {
    const repo = new MemoryRepo(seedData());
    const teacher = await ctx(repo, 'u-okafor');
    const held = await dispatch(service, teacher, 'getGradebook', { courseId, view: 'held' });
    const diego = held.rows.find(r => r.student.id === 'u-ramirez')!;
    const prop = diego.cells.find(c => c.assignmentId === 'prop' || c.display?.state === 'late') ?? diego.cells.find(c => (c.display?.label || '').includes('late'));
    expect(prop?.display?.state).toBe('late');
    const beforeAdjusted = prop!.display!.adjusted;
    const beforeCurrent = diego.result?.percent;
    const raw = prop!.display!.raw ?? prop!.display!.adjusted;
    expect(raw).not.toBeNull();
    const batchId = 'm3-late-resave';
    const result = await dispatch(service, teacher, 'updateGradeCells', {
      courseId,
      batchId,
      changes: [{ assignmentId: prop!.assignmentId, studentId: 'u-ramirez', op: prop!.released ? 'override' : 'score', value: raw!, reason: prop!.released ? 'unchanged late resave' : undefined, expectedVersion: prop!.released ? prop!.itemStateVersion ?? 0 : prop!.submissionVersion ?? 0 }],
    });
    expect(result.cells[0]).toMatchObject({ ok: true });
    const after = await dispatch(service, teacher, 'getGradebook', { courseId, view: 'held' });
    const diegoAfter = after.rows.find(r => r.student.id === 'u-ramirez')!;
    const propAfter = diegoAfter.cells.find(c => c.assignmentId === prop!.assignmentId)!;
    expect(propAfter.display?.adjusted).toBe(beforeAdjusted);
    expect(diegoAfter.result?.percent).toBe(beforeCurrent);
  });

  it('exposes raw on late cells so the grid can edit without compounding penalties', async () => {
    const repo = new MemoryRepo(seedData());
    const teacher = await ctx(repo, 'u-okafor');
    const held = await dispatch(service, teacher, 'getGradebook', { courseId, view: 'held' });
    const late = held.rows.flatMap(r => r.cells.map(c => ({ student: r.student.id, cell: c }))).find(x => x.cell.display?.state === 'late');
    expect(late?.cell.display?.raw).not.toBeNull();
    expect(late?.cell.display?.raw).not.toBe(late?.cell.display?.adjusted);
  });
});

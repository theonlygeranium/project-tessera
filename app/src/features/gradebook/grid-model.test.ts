import { describe, expect, it } from 'vitest';
import type { GradebookRow } from '../../../../shared/domain';
import { filterCounts, parseGradeValue } from './grid-model';
describe('gradebook grid inputs', () => {
  it('parses scores, fractions, percentages, EX, and clear', () => {
    expect(parseGradeValue('8', 10)).toEqual({ kind: 'score', value: 8 });
    expect(parseGradeValue('8/10', 10)).toEqual({ kind: 'score', value: 8 });
    expect(parseGradeValue('80%', 10)).toEqual({ kind: 'score', value: 8 });
    expect(parseGradeValue('EX', 10)).toEqual({ kind: 'excuse' });
    expect(parseGradeValue('-', 10)).toEqual({ kind: 'clear' });
    expect(parseGradeValue('8/20', 10)).toEqual({ kind: 'score', value: 4 });
    expect(parseGradeValue('11', 10)).toEqual({ kind: 'score', value: 11 });
    expect(parseGradeValue('8/0', 10)).toBeNull();
  });
  it('counts matching students once per filter', () => {
    const rows = [{ student: { id: 'a', name: 'A', email: 'a@example.edu' }, cells: [{ assignmentId: 'one', score: 0, state: 'missing', released: false, display: { state: 'missing', adjusted: 0, label: 'missing' } }, { assignmentId: 'two', score: 0, state: 'missing', released: false, display: { state: 'missing', adjusted: 0, label: 'missing' } }], total: 0, possible: 0 }] as GradebookRow[];
    expect(filterCounts(rows, ['one', 'two']).missing).toBe(1);
    expect(filterCounts(rows, ['one', 'two']).late).toBe(0);
  });
});

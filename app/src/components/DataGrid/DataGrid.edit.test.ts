import { describe, expect, it } from 'vitest';

/** Mirrors DataGrid edit-binding: commit must use the bound identity, not the focused cell. */
function resolveCommitTarget(edit: { rowKey: string; columnKey: string; value: string } | null, rows: { id: string }[], columns: { key: string }[], focus: { row: number; col: number }) {
  if (!edit) return null;
  const row = rows.find(r => r.id === edit.rowKey);
  const column = columns.find(c => c.key === edit.columnKey);
  if (!row || !column) return { cancelled: true as const };
  return { studentId: row.id, assignmentId: column.key, value: edit.value, focusedStudentId: rows[focus.row]?.id };
}

describe('DataGrid edit binding', () => {
  it('keeps an unfinished edit on the original student when focus moves', () => {
    const rows = [{ id: 'u-priya' }, { id: 'u-ramirez' }];
    const columns = [{ key: 'hw1' }];
    const edit = { rowKey: 'u-priya', columnKey: 'hw1', value: '8' };
    const focusMoved = { row: 1, col: 0 };
    const result = resolveCommitTarget(edit, rows, columns, focusMoved);
    expect(result).toEqual({ studentId: 'u-priya', assignmentId: 'hw1', value: '8', focusedStudentId: 'u-ramirez' });
  });
});

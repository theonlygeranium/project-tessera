import type { GradebookRow } from '../../../../shared/domain';
export type Filter = 'to-grade' | 'missing' | 'late' | 'excused' | 'feedback-draft';
export const filters: { key: Filter; label: string }[] = [
  { key: 'to-grade', label: 'To grade' }, { key: 'missing', label: 'Missing' },
  { key: 'late', label: 'Late' }, { key: 'excused', label: 'Excused' },
  { key: 'feedback-draft', label: 'Feedback drafts' },
];
export function parseGradeValue(input: string, points: number): { kind: 'score'; value: number } | { kind: 'excuse' } | { kind: 'clear' } | null {
  const value = input.trim().toUpperCase();
  if (value === 'EX') return { kind: 'excuse' };
  if (value === '-') return { kind: 'clear' };
  let score: number;
  if (/^\d+(?:\.\d+)?%$/.test(value)) score = Number(value.slice(0, -1)) * points / 100;
  else if (/^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(value)) {
    const [earned, possible] = value.split('/').map(Number);
    if (possible <= 0) return null;
    score = earned / possible * points;
  } else if (/^\d+(?:\.\d+)?$/.test(value)) score = Number(value);
  else return null;
  return Number.isFinite(score) && score >= 0 ? { kind: 'score', value: score } : null;
}
export function cellMatches(row: GradebookRow, assignmentId: string, filter: Filter) {
  const cell = row.cells.find(c => c.assignmentId === assignmentId);
  if (!cell) return false;
  return filter === 'feedback-draft' ? false : cell.display?.state === filter;
}
export function filterCounts(rows: GradebookRow[], assignmentIds: string[]) {
  return Object.fromEntries(filters.map(f => [f.key, rows.reduce((count, row) => count + Number(assignmentIds.some(id => cellMatches(row, id, f.key))), 0)])) as Record<Filter, number>;
}

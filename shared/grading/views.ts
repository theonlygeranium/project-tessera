import type { CalcItem, CalculationTrace, CellState, CourseGradeResult } from './types';
import { R } from './rational';

export function toCourseGradeResult(trace: CalculationTrace): CourseGradeResult { return { studentId: trace.studentId, percent: trace.totals.rounded, letter: trace.totals.letter, rulesVersion: trace.rulesVersion, trace }; }
export function cellDisplays(trace: CalculationTrace): { assignmentId: string; state: CellState; adjusted: number | null; raw: number | null; label: string }[] {
  return trace.categories.flatMap(c => c.items.map(i => {
    const late = i.reasons.find(r => r.code === 'late-penalty');
    const lateLabel = late ? `late ${late.params.periods}${late.params.period === 'hour' ? 'h' : 'd'}` : '';
    const label = i.state === 'excused' ? 'EX' : i.state === 'missing' ? 'MISSING' : i.state === 'not-due' ? 'Not due' : i.state === 'not-submitted' ? 'Not submitted' : i.state === 'to-grade' ? 'To grade' : i.state === 'held' ? 'Held' : i.state === 'dropped' ? (late ? `${lateLabel}, dropped` : 'Dropped') : i.state === 'override' ? 'Override' : i.state === 'what-if' ? 'What-if' : i.state === 'extra-credit' ? 'Extra credit' : i.state === 'late' ? lateLabel : '';
    return { assignmentId: i.assignmentId, state: i.state, adjusted: i.adjusted, raw: i.raw, label };
  }));
}
function csvValue(value: string | number | null): string { const text = value === null ? '' : typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
export interface ExportMeta { items: { assignmentId: string; title: string }[]; categories: { categoryId: string; name: string }[]; students?: { studentId: string; name: string; email: string }[] }
export function exportRow(trace: CalculationTrace, items: CalcItem[] | ExportMeta['items']): (string | number | null)[] {
  const cells = new Map(trace.categories.flatMap(c => c.items.map(i => [i.assignmentId, i] as const)));
  const adjusted = items.map(item => {
    const cell = cells.get(item.assignmentId);
    if (!cell) return '';
    if (cell.state === 'excused') return 'EX';
    if (cell.state === 'missing') return 'MISSING';
    return cell.adjusted === null ? '' : R(cell.adjusted).roundHalfUp(2).toNumber();
  });
  return [...adjusted, ...trace.categories.map(c => c.percent === null ? '' : R(c.percent).roundHalfUp(2).toNumber()), trace.totals.rounded, trace.totals.letter, trace.rulesVersion];
}
export function exportCsv(traces: CalculationTrace[], meta: ExportMeta): string {
  const student = new Map((meta.students ?? []).map(s => [s.studentId, s]));
  const header = ['Student', 'Email', ...meta.items.map(i => i.title), ...meta.categories.map(c => c.name), 'Current %', 'Letter', 'Rules version'];
  const lines = [header.map(csvValue).join(',')];
  for (const trace of traces) {
    const s = student.get(trace.studentId);
    const row = exportRow(trace, meta.items);
    const itemCount = meta.items.length;
    const byCategory = new Map(trace.categories.map(c => [c.categoryId, c.percent]));
    const fields = [s?.name ?? trace.studentId, s?.email ?? '', ...row.slice(0, itemCount), ...meta.categories.map(c => { const value = byCategory.get(c.categoryId); return value == null ? '' : R(value).roundHalfUp(2).toNumber(); }), ...row.slice(-3)];
    lines.push(fields.map(csvValue).join(','));
  }
  return lines.join('\n');
}

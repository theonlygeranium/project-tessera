import type { CalcInput, CalculationTrace } from './types';
import { calculate } from './engine';
import { R } from './rational';

export function whatIf(input: CalcInput, scores: { assignmentId: string; score: number }[], options?: { arithmetic?: 'exact' | 'fast' }): { trace: CalculationTrace; base: CalculationTrace; delta: number | null; changedReasons: string[]; finalOverrideActive: boolean } {
  const student = { ...input, view: 'student' as const, finalOverride: null };
  const base = calculate(student, options);
  const seen = new Set<string>();
  for (const entry of scores) {
    if (!Number.isFinite(entry.score) || entry.score < 0) throw new RangeError(`Invalid hypothetical score for ${entry.assignmentId}`);
    if (seen.has(entry.assignmentId)) throw new RangeError(`Duplicate hypothetical for ${entry.assignmentId}`);
    seen.add(entry.assignmentId);
    const item = input.items.find(i => i.assignmentId === entry.assignmentId);
    if (!item) throw new RangeError(`Unknown assignment ${entry.assignmentId}`);
    if (item.itemState?.excused) throw new RangeError(`Excused assignment ${entry.assignmentId}`);
    if (item.submission?.released && ((item.submission.state === 'graded' || item.submission.state === 'returned') && item.submission.score !== null || item.itemState?.override)) throw new RangeError(`Released score already counts for ${entry.assignmentId}`);
    if (!item.submission && item.itemState?.override) throw new RangeError(`Recorded score already counts for ${entry.assignmentId}`);
  }
  const byId = new Map(scores.map(s => [s.assignmentId, s.score]));
  const trace = calculate({ ...student, items: input.items.map(i => ({ ...i, hypothetical: byId.get(i.assignmentId) ?? i.hypothetical })) }, options);
  const baseReasons = new Set(base.steps.map(s => `${s.code}:${s.target.assignmentId ?? s.target.categoryId ?? ''}`));
  const changedReasons = [...new Set(trace.steps.map(s => `${s.code}:${s.target.assignmentId ?? s.target.categoryId ?? ''}`).filter(x => !baseReasons.has(x)))];
  const delta = trace.totals.rounded === null || base.totals.rounded === null ? null : R(trace.totals.rounded).sub(R(base.totals.rounded)).toNumber();
  return { trace, base, delta, changedReasons, finalOverrideActive: input.finalOverride !== null };
}

export function solveNeeded(input: CalcInput, scores: { assignmentId: string; score: number }[], solveFor: string, target: { letter: string } | { percent: number }, options?: { arithmetic?: 'exact' | 'fast' }): { score: number; finalOverrideActive: boolean } | { unreachable: true; finalOverrideActive: boolean } {
  const item = input.items.find(i => i.assignmentId === solveFor);
  if (!item) throw new RangeError(`Unknown assignment ${solveFor}`);
  const other = scores.filter(s => s.assignmentId !== solveFor);
  const finalOverrideActive = input.finalOverride !== null;
  const reaches = (tenths: bigint): boolean => {
    const score = Number(`${tenths / 10n}.${tenths % 10n}`);
    const result = whatIf(input, [...other, { assignmentId: solveFor, score }], options).trace;
    const rounded = result.totals.rounded;
    if (rounded === null) return false;
    if ('percent' in target) return rounded >= target.percent;
    const band = input.setup.scheme.bands.find(b => b.letter === target.letter);
    if (!band) throw new RangeError(`Unknown target letter ${target.letter}`);
    return rounded >= band.min;
  };
  const steps = R(item.points).mul(R(10));
  const max = steps.n / steps.d;
  if (!reaches(max)) return { unreachable: true, finalOverrideActive };
  let lo = 0n, hi = max;
  while (lo < hi) { const mid = (lo + hi) / 2n; if (reaches(mid)) hi = mid; else lo = mid + 1n; }
  return { score: Number(`${lo / 10n}.${lo % 10n}`), finalOverrideActive };
}

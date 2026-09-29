import type { CalculationTrace, TraceReason } from './types';
import { R } from './rational';

function fmt(value: number, decimals = 2): string { return R(value).roundHalfUp(decimals).toNumber().toString(); }
function unit(reason: TraceReason): string { return reason.params.period === 'hour' ? 'hour' : 'day'; }
function sentence(reason: TraceReason, title: string, audience: 'staff' | 'student', name: string, raw: number | null, points: number): string | null {
  const p = reason.params;
  switch (reason.code) {
    case 'base-score': return `${title}: ${fmt(Number(p.score))} of ${fmt(points)} recorded.`;
    case 'category-total': return `${title}: ${fmt(Number(p.earned))} of ${fmt(Number(p.possible))}, ${fmt(Number(p.percent))}%.`;
    case 'course-total': return `Current computed grade: ${fmt(Number(p.percent), 1)}%.`;
    case 'rounding': return `Rounded ${fmt(Number(p.from), 1)}% to ${fmt(Number(p.to), 1)}%.`;
    case 'late-penalty': return `${title} was ${p.periods} ${unit(reason)}${Number(p.periods) === 1 ? '' : 's'} late; ${fmt(Number(p.percent))}% was deducted.`;
    case 'late-waived': return `${title}'s late penalty was waived.`;
    case 'late-over-max': return `${title} exceeded the late limit.`;
    case 'dropped': return p.rule === 'lowest' ? (p.equalPoints === 1 ? `Lowest score dropped: ${title}${raw === null ? '' : `, ${fmt(raw)}`}.` : `${title} dropped to give ${audience === 'student' ? 'you' : name} the highest category score.`) : `Highest score dropped: ${title}.`;
    case 'drop-limited-by-keep': {
      const noun = title.toLowerCase().replace(/zzes$/, 'z').replace(/ies$/, 'y').replace(/s$/, '');
      return Number(p.applied) === 0 ? `No ${noun} dropped: the rule keeps at least ${p.keep} scores.` : `Only ${p.applied} ${noun} ${Number(p.applied) === 1 ? 'score was' : 'scores were'} dropped: the rule keeps at least ${p.keep} scores.`;
    }
    case 'drop-not-beneficial': return `No further score was dropped because it would lower the category grade.`;
    case 'excused': return `${title} excused.`;
    case 'held': return audience === 'student' ? `${title} is held, so it isn't counted until your instructor releases it.` : `${title} (${raw === null ? 'ungraded' : `${fmt(raw)} / ${fmt(points)}`}) is held, so it isn't counted until you release it.`;
    case 'missing-zero': return `${title} counts as missing zero.`;
    case 'missing-not-droppable': return `${title} is missing and cannot be dropped.`;
    case 'extra-credit': return `${title} adds extra credit without adding possible points.`;
    case 'extra-credit-capped': return `Extra credit is capped at ${fmt(Number(p.cap))}.`;
    case 'category-empty-shared': return `No items yet, so its ${fmt(Number(p.weight))}% is shared across the other categories.`;
    case 'override': return `${title}'s score was updated by an instructor.`;
    case 'extension': return `${title} uses an extended due date.`;
    case 'final-override': return audience === 'staff' && p.reason !== undefined ? `Final grade override for ${name}: ${p.reason}.` : `Final grade set by your instructor.`;
    case 'not-counted': return `${title} does not count toward the grade.`;
    case 'what-if': return `${title} uses a what-if score of ${fmt(Number(p.score))}.`;
  }
}
export function explain(trace: CalculationTrace, audience: 'staff' | 'student', name: string): string[] {
  const items = new Map(trace.categories.flatMap(c => c.items.map(i => [i.assignmentId, i] as const)));
  const categories = new Map(trace.categories.map(c => [c.categoryId, c] as const));
  return trace.steps.map(s => {
    const item = s.target.assignmentId ? items.get(s.target.assignmentId) : undefined;
    const category = s.target.categoryId ? categories.get(s.target.categoryId) : undefined;
    if (s.code === 'dropped' && item && s.params.rule === 'lowest' && s.params.equalPoints === 1) {
      const late = item.reasons.find(r => r.code === 'late-penalty');
      if (late && item.raw !== null) return `Lowest score dropped: ${item.title}, ${fmt(item.raw)} less ${fmt(Number(late.params.percent))}% for ${late.params.periods} ${unit(late)}${Number(late.params.periods) === 1 ? '' : 's'} late.`;
    }
    return sentence({ code: s.code, params: s.params }, item?.title ?? category?.name ?? 'Course', audience, name, item?.raw ?? null, item?.points ?? 0);
  }).filter((x): x is string => x !== null);
}
export function arithmeticLine(trace: CalculationTrace, audience: 'staff' | 'student' = 'student'): string {
  const totals = trace.totals;
  const override = trace.steps.some(step => step.code === 'final-override');
  const suffix = override ? ` · ${audience === 'student' ? 'final grade set by your instructor' : 'final grade override'}: ${totals.rounded === null ? '—' : `${totals.rounded.toFixed(1)}%`} → ${totals.letter ?? '—'}` : '';
  if (totals.computed.rounded === null) return `No graded work yet.${suffix}`;
  if (trace.mode === 'points') return `${totals.weightedEarned.toFixed(2)} ÷ ${totals.weightedPossible.toFixed(2)} = ${totals.computed.rounded.toFixed(1)}% → ${totals.computed.letter ?? '—'}${suffix}`;
  const parts = trace.categories.filter(c => c.contribution !== null).map(c => R(c.contribution!).roundHalfUp(2).toNumber().toFixed(2));
  const earned = R(totals.weightedEarned).roundHalfUp(2).toNumber().toFixed(2);
  const possible = R(totals.weightedPossible).roundHalfUp(2).toNumber().toFixed(2);
  const band = override ? null : totals.band;
  return `${parts.join(' + ')} = ${earned} of ${fmt(totals.weightedPossible)} · ${earned} ÷ ${fmt(totals.weightedPossible)} = ${totals.computed.rounded.toFixed(1)}% → ${totals.computed.letter}${band ? ` (${band.min.toFixed(1)} to ${band.max.toFixed(1)})` : ''}${suffix}`;
}

import type { Output } from '../../../../shared/api';
import { explain } from '../../../../shared/grading/explain';

type Item = Output<'getMyGrade'>['items'][number];

/** A held grade is intentionally indistinguishable from other un-released work here. */
export const whatIfEligible = (item: Item) => item.state !== 'excused' &&
  (item.score === null || ['held', 'missing', 'to-grade', 'not-submitted', 'not-due'].includes(item.state));

export function whatIfScores(items: Item[], values: Record<string, string>, points: ReadonlyMap<string, number>) {
  return items.filter(whatIfEligible).flatMap(item => {
    const raw = values[item.assignmentId]?.trim();
    if (!raw) return [];
    const score = Number(raw);
    const max = points.get(item.assignmentId);
    return Number.isFinite(score) && score >= 0 && max !== undefined && score <= max ? [{ assignmentId: item.assignmentId, score }] : [];
  });
}

export function changedReasonSentences(result: Output<'whatIfMyGrade'>): string[] {
  const changed = new Set(result.changedReasons);
  const sentences = explain(result.trace, 'student', 'you');
  return result.trace.steps.flatMap((step, index) =>
    changed.has(`${step.code}:${step.target.assignmentId ?? step.target.categoryId ?? ''}`) && sentences[index]
      ? [sentences[index]] : []);
}

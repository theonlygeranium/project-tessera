// Readiness scoring (D-029, #25). One function turns a rubric, a course snapshot, and the
// stored findings and attestations into the report. The rules:
//
// - Automatic items are computed now. A reviewer can mark one "not applicable" (with a
//   note) but can't attest past it: automatic results are fixed by fixing the course.
// - AI-assisted items are "needs review" until a person reviews the finding (D-003: AI
//   never passes an item). An accepted "likely met" finding counts as met; an accepted
//   "likely not met" counts as not met; dismissed or "unclear" findings need review.
//   A reviewer's attestation overrides the finding.
// - Attestation items are "needs review" until a named reviewer attests them.
// - Score: met and attested items ÷ applicable items (not-applicable items don't count),
//   rounded down. A standard with no applicable items is "not applicable".
// - Publishing is blocked only when the policy sets a minimum and the score is below it.
import type { Attestation, ItemResult, ItemStatus, ReadinessPolicy, ReadinessResult, Rubric, RubricItem, StandardResult } from '../domain';
import type { StoredReadinessItem } from '../repo';
import { AUTOMATIC_CHECKS, type CheckOutcome } from './checks';
import type { CourseSnapshot } from './snapshot';

type Stored = Pick<StoredReadinessItem, 'itemId' | 'finding' | 'attestation'>;

/** Whether a reviewer may record this attestation on this item. */
export function canAttest(item: Pick<RubricItem, 'kind'>, status: Attestation['status']): boolean {
  return item.kind !== 'automatic' || status === 'not-applicable';
}

export function itemStatus(item: RubricItem, automatic: CheckOutcome | null, stored: Stored | undefined): ItemStatus {
  const attestation = stored?.attestation ?? null;
  if (attestation && canAttest(item, attestation.status)) return attestation.status;
  if (item.kind === 'automatic') return automatic?.status ?? 'not-met';
  if (item.kind === 'attestation') return 'needs-review';
  const finding = stored?.finding;
  if (finding?.state === 'accepted') {
    if (finding.verdict === 'likely-met') return 'met';
    if (finding.verdict === 'likely-not-met') return 'not-met';
  }
  return 'needs-review';
}

const counts = (status: ItemStatus) => status === 'met' || status === 'attested';

export function evaluateReadiness(
  rubric: Rubric,
  snapshot: CourseSnapshot,
  stored: Stored[],
  policy: ReadinessPolicy | null,
  now: string,
): ReadinessResult {
  const byItem = new Map(stored.map((s) => [s.itemId, s]));
  const cache = new Map<string, CheckOutcome>();
  const run = (item: RubricItem): CheckOutcome | null => {
    if (item.kind !== 'automatic' || !item.check) return null;
    if (!cache.has(item.check)) cache.set(item.check, AUTOMATIC_CHECKS[item.check](snapshot));
    return cache.get(item.check)!;
  };

  const standards: StandardResult[] = rubric.standards.map((standard) => {
    const items: ItemResult[] = standard.items.map((item) => {
      const automatic = run(item);
      const s = byItem.get(item.id);
      const status = itemStatus(item, automatic, s);
      const attestation = s?.attestation && canAttest(item, s.attestation.status) ? s.attestation : null;
      const finding = item.kind === 'ai' ? s?.finding ?? null : null;
      const evidence = [
        ...(automatic?.evidence ?? []),
        ...(finding && finding.state !== 'dismissed' && finding.evidence ? [finding.evidence] : []),
        ...(attestation ? [`${attestation.status === 'attested' ? 'Attested' : 'Marked not applicable'} by ${attestation.byName}${attestation.note ? `: ${attestation.note}` : '.'}`] : []),
      ];
      return {
        itemId: item.id,
        number: item.number,
        text: item.text,
        kind: item.kind,
        status,
        evidence,
        fixes: status === 'not-met' || status === 'needs-review' ? automatic?.fixes ?? [] : [],
        finding,
        attestation,
      };
    });
    const applicable = items.filter((i) => i.status !== 'not-applicable');
    const metCount = applicable.filter((i) => counts(i.status)).length;
    const status: StandardResult['status'] =
      applicable.length === 0 ? 'not-applicable' : metCount === applicable.length ? 'met' : metCount === 0 ? 'not-met' : 'partly-met';
    return { standardId: standard.id, number: standard.number, title: standard.title, met: metCount, applicable: applicable.length, status, items };
  });

  const all = standards.flatMap((s) => s.items);
  const applicable = all.filter((i) => i.status !== 'not-applicable').length;
  const metTotal = all.filter((i) => counts(i.status)).length;
  const percent = applicable === 0 ? 0 : Math.floor((metTotal / applicable) * 100);
  const minimum = policy && policy.rubricId === rubric.id ? policy.minimumPercent : null;
  return {
    courseId: snapshot.course.id,
    rubricId: rubric.id,
    rubricName: rubric.name,
    attribution: rubric.attribution,
    computedAt: now,
    met: metTotal,
    applicable,
    percent,
    needsReview: all.filter((i) => i.status === 'needs-review').length,
    standards,
    blocksPublishing: minimum !== null && percent < minimum,
  };
}

/** Items whose fix links point into one lesson: what the lesson editor's readiness panel shows. */
export function itemsForLesson(result: ReadinessResult, lessonId: string): ItemResult[] {
  return result.standards
    .flatMap((s) => s.items)
    .filter((i) => i.fixes.some((f) => (f.target.kind === 'block' || f.target.kind === 'lesson') && f.target.lessonId === lessonId));
}

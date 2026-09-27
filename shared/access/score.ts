// The Tessera Access score (D-022). The formula is published:
//   score = max(0, 100 − Σ penalty(severity) × min(count, 3))
//   penalties: critical 30, serious 15, moderate 8, minor 3
// so three or more of the same issue count as three. Grades: Perfect ≥ 90,
// Good ≥ 75, Moderate ≥ 50, Low ≥ 25, else Very low. Adapted from Luma Access.
import type { AccessIssue, AccessPolicy, AccessSeverity, AccessSummary, Timestamp } from '../domain';

export const PENALTY: Record<AccessSeverity, number> = { critical: 30, serious: 15, moderate: 8, minor: 3 };

export function scoreOf(issues: Pick<AccessIssue, 'severity' | 'count'>[]): number {
  const penalty = issues.reduce((sum, i) => sum + PENALTY[i.severity] * Math.min(Math.max(i.count, 1), 3), 0);
  return Math.max(0, 100 - penalty);
}

export function gradeOf(score: number): AccessSummary['grade'] {
  if (score >= 90) return 'Perfect';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Moderate';
  if (score >= 25) return 'Low';
  return 'Very low';
}

export function summarize(issues: AccessIssue[], scannedAt: Timestamp): AccessSummary {
  const bySeverity: Record<AccessSeverity, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const i of issues) bySeverity[i.severity] += i.count;
  const score = scoreOf(issues);
  return { score, grade: gradeOf(score), issueCount: issues.reduce((n, i) => n + i.count, 0), bySeverity, scannedAt };
}

/** The mean of several summaries (a course, an institution). Null when there's nothing scanned. */
export function combine(summaries: AccessSummary[], scannedAt: Timestamp): AccessSummary | null {
  if (summaries.length === 0) return null;
  const bySeverity: Record<AccessSeverity, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let issueCount = 0;
  for (const s of summaries) {
    issueCount += s.issueCount;
    for (const k of Object.keys(bySeverity) as AccessSeverity[]) bySeverity[k] += s.bySeverity[k];
  }
  const score = Math.round(summaries.reduce((n, s) => n + s.score, 0) / summaries.length);
  return { score, grade: gradeOf(score), issueCount, bySeverity, scannedAt };
}

/** Whether the administrator's policy blocks publishing (D-022). Returns the reasons. */
export function policyBlocks(summary: AccessSummary, issues: AccessIssue[], policy: AccessPolicy): string[] {
  const reasons: string[] = [];
  if (summary.score < policy.minimumScore) reasons.push(`The accessibility score is ${summary.score}; your institution requires at least ${policy.minimumScore}.`);
  const blocked = issues.filter((i) => policy.blockingSeverities.includes(i.severity));
  if (blocked.length) reasons.push(`${blocked.reduce((n, i) => n + i.count, 0)} ${blocked.length === 1 ? 'issue' : 'issues'} at a severity your institution blocks (${[...new Set(blocked.map((i) => i.severity))].join(', ')}).`);
  return reasons;
}

import type { GradebookSetup } from '../../../../shared/grading/types';

function comparableSetup(setup: GradebookSetup) {
  const { courseId, mode, categories, late, missing, extraCredit, scheme, emptyCategory, source, studentNotes } = setup;
  return { courseId, mode, categories, late, missing, extraCredit, scheme, emptyCategory, source, studentNotes };
}

export function reconcileDismissedSetup(draft: GradebookSetup | null, next: GradebookSetup):
  { ok: true; setup: GradebookSetup } | { stale: true } {
  if (!draft || JSON.stringify(comparableSetup(draft)) !== JSON.stringify(comparableSetup(next))) return { stale: true };
  return { ok: true, setup: next };
}

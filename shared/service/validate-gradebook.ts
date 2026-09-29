import type { GradebookSetup } from '../domain';
import { fail } from './helpers';
import { GradebookSetupSchema } from '../schema/gradebook';
import { parseTimestamp } from '../grading';
const invalid = (path: string, message: string): never => fail('invalid', `${path}: ${message}`);
export function validateGradebookSetup(setup: GradebookSetup, courseId: string, assignmentIds: Set<string>): void {
  const parsed = GradebookSetupSchema.safeParse(setup);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    invalid(issue.path.join('.'), issue.message);
  }
  if (setup.courseId !== courseId) invalid('setup.courseId', 'Course does not match.');
  const ids = new Set<string>();
  for (const [index, c] of setup.categories.entries()) {
    if (c.courseId !== courseId) invalid(`setup.categories.${index}.courseId`, 'Course does not match.');
    if (ids.has(c.id)) invalid(`setup.categories.${index}.id`, 'Duplicate category id.');
    ids.add(c.id);
  }
  for (const [index, note] of setup.studentNotes.entries()) if (!ids.has(note.categoryId)) invalid(`setup.studentNotes.${index}.categoryId`, 'Unknown category.');
  if (assignmentIds.size > 2000) invalid('setup', 'Course has too many assignments.');
}
export function validateReason(reason: unknown, path = 'reason'): string {
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) return invalid(path, 'A reason of at most 500 characters is required.');
  return reason.trim();
}
export function validateScore(value: unknown, path = 'value'): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return invalid(path, 'Score must be finite and nonnegative.');
  return value;
}
export function validateExtension(value: unknown, path = 'value'): string {
  if (typeof value !== 'string') return invalid(path, 'Use a zoned ISO timestamp.');
  try {
    parseTimestamp(value, path);
  } catch {
    return invalid(path, 'Use a valid calendar timestamp with timezone.');
  }
  return value;
}
export function validateStudentNote(value: unknown, path = 'studentNote'): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || value.trim().length > 500) return invalid(path, 'Student note must be at most 500 characters.');
  return value.trim() || null;
}

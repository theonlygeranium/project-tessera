import type { GradeChangeSet, Submission } from '../../../../shared/domain';

export const readyForRelease = (submissions: Submission[], preview: GradeChangeSet) => {
  const notSent = new Set(preview.notSent.map(item => item.submissionId));
  return submissions.filter(s => s.state === 'graded' && !!s.grade && !s.feedbackDraft && !notSent.has(s.id));
};
export const releaseRequest = (assignmentId: string, preview: GradeChangeSet) => ({ assignmentId, hash: preview.hash });
export const releaseCompletion = (request: ReturnType<typeof releaseRequest>, at: number) => ({ assignmentId: request.assignmentId, at });
export const undoReleaseRequest = (released: { assignmentId: string }) => ({ assignmentId: released.assignmentId });
export const releaseConflict = (cause: unknown) => (cause as { code?: string } | null)?.code === 'conflict';

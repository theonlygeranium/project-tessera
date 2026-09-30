import type { GradebookSetup } from './types';

export type SyllabusAssessment = { name: string; weightPercent: number; page?: number | null };

/** Draft the stated weights without normalizing them; Setup check owns validation. */
export function draftSetupFromSyllabusAssessments(
  courseId: string,
  assessments: SyllabusAssessment[],
  designSessionId: string | null = null,
): Pick<GradebookSetup, 'categories' | 'source'> & { pageHint: number | null } {
  return {
    categories: assessments.map((assessment, position) => ({
      id: `syllabus-${position + 1}`,
      courseId,
      name: assessment.name,
      position,
      weight: assessment.weightPercent,
      drop: { lowest: 0, highest: 0, keepAtLeast: 1 },
      lateApplies: true,
    })),
    source: { kind: 'syllabus', designSessionId },
    pageHint: assessments.find(a => a.page != null)?.page ?? null,
  };
}

import type { CourseOutline, ReadinessResult } from '../../../shared/domain';
import { SETUP_STEPS } from './courseSetup';

export type SetupRole = keyof typeof SETUP_STEPS;
export type SetupFacts = { outline?: CourseOutline | null; enrollments?: { userIds: string[] } | null; readiness?: ReadinessResult | null };
export function setupStepStates(role: SetupRole, facts: SetupFacts) {
  const course = facts.outline?.course;
  const lessons = facts.outline?.modules.flatMap(module => module.lessons) ?? [];
  const complete: Record<string, boolean> = role === 'admin' ? {
    created: true,
    instructor: Boolean(course?.instructorIds.length),
    students: Boolean(facts.enrollments?.userIds.length),
    content: lessons.length > 0,
    published: lessons.some(lesson => lesson.status === 'published'),
  } : {
    home: Boolean(course?.welcome.trim() && course.outcomes.some(outcome => outcome.trim())),
    outline: lessons.length > 0,
    drafts: lessons.length > 0 && lessons.every(lesson => lesson.draftBlockCount === 0),
    readiness: Boolean(facts.readiness && facts.readiness.standards.every(standard => standard.items.every(item => item.status !== 'not-met'))),
    published: lessons.length > 0 && lessons.every(lesson => lesson.status === 'published'),
  };
  const firstIncomplete = SETUP_STEPS[role].find(step => !complete[step.id])?.id;
  return SETUP_STEPS[role].map(step => ({ ...step, state: complete[step.id] ? 'complete' as const : step.id === firstIncomplete ? 'current' as const : 'upcoming' as const }));
}

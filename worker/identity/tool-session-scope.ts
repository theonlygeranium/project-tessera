import type { Operation } from '../../shared/api';
import type { Id, ToolSession } from '../../shared/domain';
import type { Repo } from '../../shared/repo';

type Resolver = (repo: Repo, input: Record<string, unknown>, session: ToolSession) => Promise<Id | null>;
const sessionCourse: Resolver = async (_repo, _input, session) => session.courseId;
const direct: Resolver = async (_repo, input) => typeof input.courseId === 'string' ? input.courseId : null;
const lesson: Resolver = async (repo, input) => typeof input.lessonId === 'string' ? (await repo.getLesson(input.lessonId))?.courseId ?? null : null;
const assignment: Resolver = async (repo, input) => typeof input.assignmentId === 'string' ? (await repo.getAssignment(input.assignmentId))?.courseId ?? null : null;
const check: Resolver = async (repo, input) => {
  if (typeof input.lessonId !== 'string' || typeof input.blockId !== 'string') return null;
  const [foundLesson, block] = await Promise.all([repo.getLesson(input.lessonId), repo.getBlock(input.blockId)]);
  return foundLesson && block?.lessonId === foundLesson.id ? foundLesson.courseId : null;
};

/** Explicit course-bound operations. All other operations are denied by default. */
export const TOOL_SESSION_OPERATIONS: Partial<Record<Operation, Resolver>> = {
  getSession: sessionCourse,
  whoAmI: sessionCourse,
  getCourseOutline: direct,
  getStudentLesson: lesson,
  answerCheck: check,
  setLessonProgress: lesson,
  getLesson: lesson,
  listAssignments: direct,
  getAssignment: assignment,
  listSubmissions: assignment,
  submit: assignment,
  getMySubmission: assignment,
};

export async function toolSessionCourse(op: Operation, repo: Repo, input: unknown, session: ToolSession): Promise<Id | null> {
  const resolver = TOOL_SESSION_OPERATIONS[op];
  return resolver ? resolver(repo, (input ?? {}) as Record<string, unknown>, session) : null;
}

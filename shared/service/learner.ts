import type { Course, Lesson } from '../domain';
import type { ServiceContext } from './context';
import { canReachCourse, course, fail, lessonFor, user } from './helpers';
import { requiredTrainingFor } from './training';

/** Learner access is separate from the broader instructor and administrator course access. */
export async function learnerCourse(ctx: ServiceContext, courseId: string): Promise<Course> {
  const person = user(ctx);
  // A launch grants access only to its course; the stored role may be different.
  if (ctx.toolSession) return canReachCourse(ctx, courseId);
  if (person.role === 'student') return canReachCourse(ctx, courseId);
  const c = await course(ctx, courseId);
  if (!(await requiredTrainingFor(ctx, person)).some(row => row.courseId === courseId)) {
    return fail('forbidden', "This course isn't required training for you.");
  }
  return c;
}

export async function learnerLesson(ctx: ServiceContext, lessonId: string): Promise<Lesson> {
  const lesson = await lessonFor(ctx, lessonId);
  if (lesson.status !== 'published') return fail('not-found', 'Lesson not found.');
  await learnerCourse(ctx, lesson.courseId);
  return lesson;
}

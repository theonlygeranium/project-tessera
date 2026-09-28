import type { Outcome } from '../domain';
import type { Service, ServiceContext } from './context';
import { canReachCourse, course, fail, user } from './helpers';

async function staff(ctx: ServiceContext, courseId: string) {
  const c = await course(ctx, courseId);
  const u = user(ctx);
  if (u.role !== 'administrator' && (u.role !== 'instructor' || !c.instructorIds.includes(u.id))) fail('forbidden', 'You cannot edit this course.');
  return c;
}

export async function saveCourseOutcomes(ctx: ServiceContext, courseId: string, input: { id?: string; text: string }[]): Promise<Outcome[]> {
  const c = await staff(ctx, courseId);
  if (input.length > 30) fail('invalid', 'Use at most 30 outcomes.');
  const old = await ctx.repo.listOutcomes(courseId);
  const known = new Set(old.map(o => o.id));
  const ids = input.map(o => o.id).filter((id): id is string => !!id);
  if (new Set(ids).size !== ids.length || ids.some(id => !known.has(id))) fail('invalid', 'Outcome ids must be unique and belong to this course.');
  const outcomes: Outcome[] = input.map((entry, position) => {
    const text = typeof entry.text === 'string' ? entry.text.trim() : '';
    if (!text || text.length > 500) fail('invalid', 'Outcome text must be 1–500 characters.');
    return { id: entry.id ?? ctx.newId('o'), courseId, code: `O${position + 1}`, text, position };
  });
  await ctx.repo.replaceOutcomes(courseId, outcomes);
  c.outcomes = outcomes.map(o => o.text);
  await ctx.repo.putCourse(c);
  return outcomes;
}

export const outcomes: Pick<Service, 'listOutcomes' | 'saveOutcomes' | 'listOutcomeLinks' | 'setOutcomeLinks'> = {
  listOutcomes: async (ctx, { courseId }) => { await canReachCourse(ctx, courseId); return ctx.repo.listOutcomes(courseId); },
  saveOutcomes: async (ctx, { courseId, outcomes }) => saveCourseOutcomes(ctx, courseId, outcomes),
  listOutcomeLinks: async (ctx, { courseId }) => { await staff(ctx, courseId); return ctx.repo.listOutcomeLinks({ courseId }); },
  setOutcomeLinks: async (ctx, { courseId, targetKind, targetId, outcomeIds }) => {
    await staff(ctx, courseId);
    if (new Set(outcomeIds).size !== outcomeIds.length) fail('invalid', 'Outcome ids must be unique.');
    const valid = new Set((await ctx.repo.listOutcomes(courseId)).map(o => o.id));
    if (outcomeIds.some(id => !valid.has(id))) fail('invalid', 'An outcome is outside this course.');
    if (targetKind === 'assignment') {
      const assignment = await ctx.repo.getAssignment(targetId);
      if (!assignment || assignment.courseId !== courseId) fail('invalid', 'Assignment is outside this course.');
    } else if (targetKind === 'block') {
      const block = await ctx.repo.getBlock(targetId);
      const lesson = block ? await ctx.repo.getLesson(block.lessonId) : null;
      if (!block || !lesson || lesson.courseId !== courseId || !['check', 'scenario'].includes(block.type)) fail('invalid', 'Target must be a check or scenario in this course.');
    } else fail('invalid', 'Invalid target kind.');
    await ctx.repo.setOutcomeLinks(targetKind, targetId, outcomeIds);
    return ctx.repo.listOutcomeLinks({ courseId });
  },
};

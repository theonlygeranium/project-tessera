import { ApiError } from '../api';
import type { Block, BlockContent, Course, Lesson, Module, Provenance, User } from '../domain';
import type { ServiceContext } from './context';

export const fail = (code: ConstructorParameters<typeof ApiError>[0], message: string): never => { throw new ApiError(code, message); };
export const required = (value: string, field: string): string => typeof value === 'string' && value.trim() ? value.trim() : fail('invalid', `${field} is required.`);
export const minutes = (value: number): number => Number.isInteger(value) && value >= 1 && value <= 240 ? value : fail('invalid', 'Minutes must be 1–240.');
export const user = (ctx: ServiceContext): User => ctx.user ?? fail('unauthenticated', 'Sign in first.');
export async function course(ctx: ServiceContext, id: string): Promise<Course> { return await ctx.repo.getCourse(id) ?? fail('not-found', 'Course not found.'); }
export async function canReachCourse(ctx: ServiceContext, id: string): Promise<Course> {
  const c = await course(ctx, id); const u = user(ctx);
  if (u.role === 'administrator' || (u.role === 'instructor' && c.instructorIds.includes(u.id))) return c;
  if (u.role === 'student' && c.status === 'active' && (await ctx.repo.listEnrollments({ courseId: id, userId: u.id })).length) return c;
  return fail('forbidden', 'You cannot reach this course.');
}
export async function canTeach(ctx: ServiceContext, id: string): Promise<Course> {
  const c = await course(ctx, id);
  return c.instructorIds.includes(user(ctx).id) ? c : fail('forbidden', 'You do not teach this course.');
}
export async function moduleFor(ctx: ServiceContext, id: string): Promise<Module> { return await ctx.repo.getModule(id) ?? fail('not-found', 'Module not found.'); }
export async function lessonFor(ctx: ServiceContext, id: string): Promise<Lesson> { return await ctx.repo.getLesson(id) ?? fail('not-found', 'Lesson not found.'); }
export async function teachLesson(ctx: ServiceContext, id: string): Promise<Lesson> { const l = await lessonFor(ctx, id); await canTeach(ctx, l.courseId); return l; }
export async function studentLesson(ctx: ServiceContext, id: string): Promise<Lesson> {
  const l = await lessonFor(ctx, id);
  if (l.status !== 'published') return fail('not-found', 'Lesson not found.');
  await canReachCourse(ctx, l.courseId); return l;
}
export const content = (b: Block): BlockContent => {
  switch (b.type) {
    case 'heading': return { type: 'heading', level: b.level, text: b.text };
    case 'text': return { type: 'text', text: b.text };
    case 'callout': return { type: 'callout', tone: b.tone, title: b.title, text: b.text };
    case 'image': return { type: 'image', src: b.src, alt: b.alt, decorative: b.decorative, caption: b.caption };
    case 'check': return { type: 'check', question: b.question, options: b.options, correctOptionId: b.correctOptionId, feedbackCorrect: b.feedbackCorrect, feedbackIncorrect: b.feedbackIncorrect };
  }
};
export const provenance = (ctx: ServiceContext, model: string, task: Provenance['task'], summary: string, sources: Provenance['sources'] = []): Provenance =>
  ({ model, task, generatedAt: ctx.now(), sources, summary });
export async function aiEnabled(ctx: ServiceContext) { if (!(await ctx.repo.getInstitution()).policy.aiAuthoring) fail('ai-disabled', 'AI authoring is disabled.'); }
export const aiFailed = (): never => fail('ai-failed', 'AI returned unusable content.');
export async function renumberModules(ctx: ServiceContext, courseId: string, ids: string[]) {
  for (const [position, id] of ids.entries()) { const m = await moduleFor(ctx, id); if (m.courseId === courseId) await ctx.repo.putModule({ ...m, position }); }
}
export async function renumberLessons(ctx: ServiceContext, moduleId: string, ids: string[]) {
  for (const [position, id] of ids.entries()) { const l = await lessonFor(ctx, id); if (l.moduleId === moduleId) await ctx.repo.putLesson({ ...l, position }); }
}
export const move = (ids: string[], id: string, requested: number) => {
  const rest = ids.filter(x => x !== id); const pos = Number.isFinite(requested) ? Math.max(0, Math.min(rest.length, Math.trunc(requested))) : 0;
  rest.splice(pos, 0, id); return rest;
};

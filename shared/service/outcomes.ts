import type { Outcome } from '../domain';
import type { Service, ServiceContext } from './context';
import { agentProvenance, canReachCourse, course, fail, provenance, user } from './helpers';

async function staff(ctx: ServiceContext, courseId: string) {
  const c = await course(ctx, courseId);
  const u = user(ctx);
  if (u.role !== 'administrator' && (u.role !== 'instructor' || !c.instructorIds.includes(u.id))) fail('forbidden', 'You cannot edit this course.');
  return c;
}

export async function saveCourseOutcomes(ctx: ServiceContext, courseId: string, input: { id?: string; text: string }[]): Promise<Outcome[]> {
  await staff(ctx, courseId);
  const old = await ctx.repo.listOutcomes(courseId);
  const outcomes = prepareCourseOutcomes(ctx, courseId, input, old);
  if (!await ctx.repo.replaceOutcomesIfUnchanged(courseId, old, outcomes)) fail('conflict', 'Outcomes changed while you were editing. Reload and try again.');
  return outcomes;
}

export function prepareCourseOutcomes(ctx: ServiceContext, courseId: string, input: { id?: string; text: string }[], old: Outcome[]): Outcome[] {
  if (input.length > 30) fail('invalid', 'Use at most 30 outcomes.');
  const known = new Set(old.map(o => o.id));
  const ids = input.map(o => o.id).filter((id): id is string => !!id);
  if (new Set(ids).size !== ids.length || ids.some(id => !known.has(id))) fail('invalid', 'Outcome ids must be unique and belong to this course.');
  const assistant = !!(ctx.token || ctx.agent);
  const proposals = assistant ? input.flatMap(entry => {
    const prior = old.find(item => item.id === entry.id);
    return prior?.aiState !== 'draft' && prior && prior.text !== (typeof entry.text === 'string' ? entry.text.trim() : '') ? [{ text: entry.text }] : prior?.aiState !== 'draft' && prior ? [] : [entry];
  }) : input;
  const kept = assistant ? old.filter(item => item.aiState !== 'draft') : [];
  const entries = assistant ? [...kept.map(({ id, text }) => ({ id, text })), ...proposals] : proposals;
  if (entries.length > 30) fail('invalid', 'Use at most 30 outcomes.');
  const draftStart = kept.length ? Math.max(...kept.map(item => item.position)) + 1 : 0;
  const outcomes: Outcome[] = entries.map((entry, index) => {
    const text = typeof entry.text === 'string' ? entry.text.trim() : '';
    if (!text || text.length > 500) fail('invalid', 'Outcome text must be 1–500 characters.');
    if (assistant && index < kept.length) return kept[index];
    const position = assistant ? draftStart + index - kept.length : index;
    const prior = old.find(item => item.id === entry.id);
    const changed = prior?.text !== text;
    const draft = assistant && (prior?.aiState === 'draft' || !entry.id);
    const source = assistant && changed ? ctx.agent ? agentProvenance(ctx, 'Outcome written by an assistant') : provenance(ctx, `Assistant via API token (${ctx.token?.name ?? ctx.token?.id})`, 'agent', 'Outcome written through an API token') : prior?.provenance;
    return { id: entry.id ?? ctx.newId('o'), courseId, code: `O${position + 1}`, text, position, ...(draft || !changed && prior?.aiState === 'draft' ? { aiState: 'draft' as const } : {}), ...(source && (assistant || !changed) ? { provenance: source } : {}) };
  });
  return outcomes;
}

export const outcomes: Pick<Service, 'listOutcomes' | 'saveOutcomes' | 'keepDesignOutcome' | 'keepOutcome' | 'listOutcomeLinks' | 'setOutcomeLinks'> = {
  listOutcomes: async (ctx, { courseId }) => { await canReachCourse(ctx, courseId); const rows = await ctx.repo.listOutcomes(courseId); return user(ctx).role === 'student' ? rows.filter(row => row.aiState !== 'draft').map(({ provenance: _provenance, ...row }) => row) : rows; },
  saveOutcomes: async (ctx, { courseId, outcomes }) => saveCourseOutcomes(ctx, courseId, outcomes),
  keepDesignOutcome: async (ctx, { sessionId, outcomeId, expectedText }) => {
    if (ctx.token || ctx.agent) fail('forbidden', 'A person must keep this draft in the app.');
    const session = await ctx.repo.getDesignSession(sessionId) ?? fail('not-found', 'Design session not found.');
    await staff(ctx, session.courseId);
    if (!await ctx.repo.keepDesignOutcome(sessionId, outcomeId, expectedText, user(ctx).name, ctx.now())) fail('conflict', 'This draft changed since you opened it. Review the new wording, then keep it.');
    return (await ctx.repo.listOutcomes(session.courseId)).find(item => item.id === outcomeId)!;
  },
  keepOutcome: async (ctx, { courseId, outcomeId, expectedText }) => {
    if (ctx.token || ctx.agent) fail('forbidden', 'A person must keep this draft in the app.');
    await staff(ctx, courseId);
    if (!(await ctx.repo.listOutcomes(courseId)).some(item => item.id === outcomeId)) fail('not-found', 'Outcome not found in this course.');
    if (!await ctx.repo.keepOutcome(courseId, outcomeId, expectedText, user(ctx).name, ctx.now())) fail('conflict', 'This draft changed since you opened it. Review the new wording, then keep it.');
    return (await ctx.repo.listOutcomes(courseId)).find(item => item.id === outcomeId)!;
  },
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

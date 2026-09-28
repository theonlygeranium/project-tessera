import { logError } from './log';
import { ApiError } from '../api';
import type { Block, BlockContent, BuilderSession, CourseBrief, OutlineDraft } from '../domain';
import type { Service, ServiceContext } from './context';
import { aiEnabled, aiFailed, canTeach, fail, provenance, required } from './helpers';
import { validateBlockContent, validateCourseBrief, validateOutlineDraft } from './validate';

async function sessionFor(ctx: ServiceContext, id: string): Promise<BuilderSession> {
  const session = await ctx.repo.getBuilderSession(id) ?? fail('not-found', 'Builder session not found.');
  await canTeach(ctx, session.courseId); return session;
}
export const builder: Pick<Service, 'listBuilderSessions' | 'createBuilderSession' | 'getBuilderSession' | 'updateBuilderSession' | 'generateOutline' | 'generateDrafts'> = {
  listBuilderSessions: async (ctx, { courseId }) => { await canTeach(ctx, courseId); return ctx.repo.listBuilderSessions(courseId); },
  createBuilderSession: async (ctx, { courseId, prompt, sources }) => {
    const c = await canTeach(ctx, courseId); await aiEnabled(ctx); const clean = required(prompt, 'prompt');
    if (!Array.isArray(sources) || sources.length > 5) fail('invalid', 'Use at most five sources.');
    const docs = sources.map(x => ({ id: ctx.newId('src'), name: required(x.name, 'source name'), text: required(x.text, 'source text').slice(0,20000) }));
    let result;
    try { result = await ctx.ai.run('brief', { courseTitle: c.title, prompt: clean, sources: docs }); } catch (error) { logError('AI task failed:', error instanceof Error ? error.message : error, (error as { details?: unknown })?.details ?? ''); return aiFailed(); }
    let brief: CourseBrief;
    try { brief = validateCourseBrief(result.output); } catch (error) { logError('AI task failed:', error instanceof Error ? error.message : error, (error as { details?: unknown })?.details ?? ''); return aiFailed(); }
    const session: BuilderSession = { id: ctx.newId('bs'), courseId, prompt: clean, sources: docs, stage: 'brief', brief, outline: null, lessonIds: [], provenance: provenance(ctx, result.model, 'brief', clean.slice(0,120), docs.map(x => ({ id: x.id, name: x.name }))), createdAt: ctx.now() };
    await ctx.repo.putBuilderSession(session); return session;
  },
  getBuilderSession: async (ctx, { sessionId }) => sessionFor(ctx, sessionId),
  updateBuilderSession: async (ctx, input) => {
    const session = await sessionFor(ctx, input.sessionId);
    if (input.brief !== undefined) session.brief = validateCourseBrief(input.brief);
    if (input.outline !== undefined) { session.outline = validateOutlineDraft(input.outline); session.stage = 'outline'; }
    await ctx.repo.putBuilderSession(session); return session;
  },
  generateOutline: async (ctx, { sessionId }) => {
    const session = await sessionFor(ctx, sessionId); await aiEnabled(ctx);
    if (!session.brief) throw new ApiError('invalid', 'A brief is required.');
    const brief = session.brief;
    const c = await canTeach(ctx, session.courseId);
    let result;
    try { result = await ctx.ai.run('outline', { courseTitle: c.title, brief, sources: session.sources }); } catch (error) { logError('AI task failed:', error instanceof Error ? error.message : error, (error as { details?: unknown })?.details ?? ''); return aiFailed(); }
    let outline: OutlineDraft;
    try { outline = validateOutlineDraft(result.output); } catch (error) { logError('AI task failed:', error instanceof Error ? error.message : error, (error as { details?: unknown })?.details ?? ''); return aiFailed(); }
    session.outline = outline; session.stage = 'outline'; await ctx.repo.putBuilderSession(session); return session;
  },
  generateDrafts: async (ctx, { sessionId }) => {
    const session = await sessionFor(ctx, sessionId); await aiEnabled(ctx);
    if (!session.outline || !session.brief) throw new ApiError('invalid', 'An outline and brief are required.');
    const outline = session.outline, brief = session.brief;
    const c = await canTeach(ctx, session.courseId);
    // Validate all AI outputs before mutating storage, so a failed generation leaves no partial lessons.
    // Draft lessons four at a time (each model call takes ~15 s), and validate every
    // output before touching storage, so a failed generation leaves no partial lessons.
    type Spec = OutlineDraft['modules'][number]['lessons'][number];
    const jobs = outline.modules.flatMap((module, m) => module.lessons.map((spec, l) => ({ m, l, module, spec })));
    const drafted: { blocks: BlockContent[]; model: string }[] = new Array(jobs.length);
    let next = 0;
    const draftOne = async (module: OutlineDraft['modules'][number], spec: Spec) => {
      let result;
      try { result = await ctx.ai.run('lesson-draft', { courseTitle: c.title, brief, moduleTitle: module.title, lesson: spec, sources: session.sources }); } catch (error) { logError('AI task failed:', error instanceof Error ? error.message : error, (error as { details?: unknown })?.details ?? ''); return aiFailed(); }
      const blocks = Array.isArray(result.output?.blocks) ? result.output.blocks.flatMap(raw => { try { return [validateBlockContent(raw)]; } catch { return []; } }) : [];
      if (!blocks.length) { logError('AI lesson draft had no valid blocks:', JSON.stringify(result.output).slice(0, 500)); aiFailed(); }
      return { blocks, model: result.model };
    };
    await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
      while (next < jobs.length) { const i = next++; drafted[i] = await draftOne(jobs[i].module, jobs[i].spec); }
    }));
    const prepared = outline.modules.map((module, m) => ({
      module,
      lessons: jobs.map((job, i) => ({ job, i })).filter(({ job }) => job.m === m).map(({ job, i }) => ({ spec: job.spec, ...drafted[i] })),
    }));
    const lessonIds: string[] = [];
    let modulePosition = (await ctx.repo.listModules(c.id)).length;
    for (const item of prepared) {
      const moduleId = ctx.newId('m');
      await ctx.repo.putModule({ id: moduleId, courseId: c.id, title: item.module.title, position: modulePosition++ });
      for (const [position, itemLesson] of item.lessons.entries()) {
        const lessonId = ctx.newId('l'); lessonIds.push(lessonId);
        await ctx.repo.putLesson({ id: lessonId, moduleId, courseId: c.id, title: itemLesson.spec.title, objective: itemLesson.spec.objective, minutes: itemLesson.spec.minutes, position, status: 'draft', publishedAt: null });
        const sourceRefs = session.sources.map(x => ({ id: x.id, name: x.name }));
        const summary = `Drafted from the course brief and ${sourceRefs.length} sources`;
        const blocks: Block[] = itemLesson.blocks.map((value, blockPosition) => ({ ...value, id: ctx.newId('b'), lessonId, position: blockPosition, origin: 'ai', aiState: 'draft', previous: null, provenance: provenance(ctx, itemLesson.model, 'lesson-draft', summary, sourceRefs), updatedAt: ctx.now() } as Block));
        await ctx.repo.replaceBlocks(lessonId, blocks);
      }
    }
    session.lessonIds = lessonIds; session.stage = 'review'; await ctx.repo.putBuilderSession(session); return session;
  },
};

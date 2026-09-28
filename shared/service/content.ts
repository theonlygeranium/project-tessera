import { logError } from './log';
import { ApiError } from '../api';
import type { Block, BlockContent, LessonDetail } from '../domain';
import { lessonReadiness } from '../policy';
import { lessonAccessReport } from '../access/blocks';
import { policyBlocks } from '../access/score';
import type { Service, ServiceContext } from './context';
import { agentProvenance, aiEnabled, aiFailed, canReachCourse, content, fail, lessonFor, moduleFor, provenance, teachLesson, user } from './helpers';
import { validateBlockContent } from './validate';
import { effectiveTemplate } from './templates';
import { readiness } from './readiness';

async function detail(ctx: ServiceContext, lessonId: string): Promise<LessonDetail> {
  const lesson = await lessonFor(ctx, lessonId), module = await moduleFor(ctx, lesson.moduleId), course = await canReachCourse(ctx, lesson.courseId);
  const blocks = await ctx.repo.listBlocks(lessonId);
  return { lesson, moduleTitle: module.title, courseTitle: course.title, blocks, readiness: lessonReadiness(blocks) };
}
function metadata(b: Block) {
  return { id: b.id, lessonId: b.lessonId, position: b.position, origin: b.origin, aiState: b.aiState, provenance: b.provenance, previous: b.previous, updatedAt: b.updatedAt, source: b.source, templateKey: b.templateKey };
}
async function blockForTeaching(ctx: ServiceContext, blockId: string): Promise<Block> {
  const b = await ctx.repo.getBlock(blockId) ?? fail('not-found', 'Block not found.');
  await teachLesson(ctx, b.lessonId); return b;
}
export const contentHandlers: Pick<Service, 'getLesson' | 'saveBlocks' | 'keepBlock' | 'revertBlock' | 'regenerateBlock' | 'publishLesson' | 'unpublishLesson'> = {
  getLesson: async (ctx, { lessonId }) => {
    const l = await lessonFor(ctx, lessonId); await canReachCourse(ctx, l.courseId);
    if (user(ctx).role === 'student') fail('forbidden', 'Staff only.');
    return detail(ctx, lessonId);
  },
  saveBlocks: async (ctx, { lessonId, blocks }) => {
    await teachLesson(ctx, lessonId);
    const old = await ctx.repo.listBlocks(lessonId), known = new Map(old.map(b => [b.id, b]));
    const seen = new Set<string>();
    const next: Block[] = blocks.map((raw, position) => {
      const value = validateBlockContent(raw);
      if (raw.id !== undefined) {
        if (typeof raw.id !== 'string' || !raw.id) fail('invalid', 'Block id is invalid.');
        const prior = known.get(raw.id);
        if (!prior || seen.has(raw.id)) throw new ApiError('invalid', 'Block id is not in this lesson or is duplicated.');
        seen.add(raw.id);
        const contentChanged = JSON.stringify(content(prior)) !== JSON.stringify(value);
        // An assistant's edit (MCP) turns the block into an AI draft a person reviews (D-003).
        if (ctx.agent && contentChanged) return { ...metadata(prior), ...value, position, origin: 'ai', aiState: 'draft', provenance: agentProvenance(ctx, 'Edited by an assistant through the MCP server'), previous: content(prior), updatedAt: ctx.now() } as Block;
        return { ...metadata(prior), ...value, position, previous: contentChanged && prior.origin === 'ai' ? content(prior) : prior.previous, updatedAt: contentChanged || prior.position !== position ? ctx.now() : prior.updatedAt } as Block;
      }
      if (ctx.agent) return { ...value, id: ctx.newId('b'), lessonId, position, origin: 'ai', aiState: 'draft', provenance: agentProvenance(ctx, 'Written by an assistant through the MCP server'), previous: null, updatedAt: ctx.now() } as Block;
      return { ...value, id: ctx.newId('b'), lessonId, position, origin: 'human', aiState: null, provenance: null, previous: null, updatedAt: ctx.now() } as Block;
    });
    await ctx.repo.replaceBlocks(lessonId, next); return detail(ctx, lessonId);
  },
  keepBlock: async (ctx, { blockId }) => {
    const b = await blockForTeaching(ctx, blockId);
    if (b.origin !== 'ai' || b.aiState !== 'draft') fail('invalid', 'Only an AI draft can be kept.');
    b.aiState = 'kept'; b.previous = null; b.updatedAt = ctx.now(); await ctx.repo.putBlock(b); return detail(ctx, b.lessonId);
  },
  revertBlock: async (ctx, { blockId }) => {
    const b = await blockForTeaching(ctx, blockId);
    if (b.origin !== 'ai') fail('invalid', 'Only an AI block can be reverted.');
    if (!b.previous) await ctx.repo.deleteBlock(blockId);
    else {
      const previous = b.previous;
      await ctx.repo.putBlock({ ...metadata(b), ...previous, previous: null, aiState: 'draft', updatedAt: ctx.now() } as Block);
    }
    return detail(ctx, b.lessonId);
  },
  regenerateBlock: async (ctx, { blockId, instruction }) => {
    const b = await blockForTeaching(ctx, blockId); await aiEnabled(ctx);
    const l = await lessonFor(ctx, b.lessonId), c = await canReachCourse(ctx, l.courseId), prompt = instruction?.trim() ?? '';
    let result;
    try { result = await ctx.ai.run('block-regenerate', { courseTitle: c.title, lessonTitle: l.title, block: content(b), instruction: prompt, sources: [] }); }
    catch (error) { logError('AI task failed:', error instanceof Error ? error.message : error, (error as { details?: unknown })?.details ?? ''); return aiFailed(); }
    let generated: BlockContent;
    try { generated = validateBlockContent(result.output.block); } catch (error) { logError('AI task failed:', error instanceof Error ? error.message : error, (error as { details?: unknown })?.details ?? ''); return aiFailed(); }
    if (generated.type !== b.type) aiFailed();
    await ctx.repo.putBlock({ ...metadata(b), ...generated, origin: 'ai', aiState: 'draft', previous: content(b), provenance: provenance(ctx, result.model, 'block-regenerate', prompt || 'Regenerated this block'), updatedAt: ctx.now() } as Block);
    return detail(ctx, b.lessonId);
  },
  publishLesson: async (ctx, { lessonId }) => {
    const l = await teachLesson(ctx, lessonId), blocks = await ctx.repo.listBlocks(lessonId), report = lessonReadiness(blocks);
    // The institution's accessibility policy (D-022) is checked alongside readiness.
    const access = lessonAccessReport(lessonId, blocks, ctx.now());
    const institution = await ctx.repo.getInstitution();
    const template = await effectiveTemplate(ctx, await canReachCourse(ctx, l.courseId));
    const floor = template?.accessFloor ?? 0;
    const reasons = policyBlocks(access, access.issues, { ...institution.accessPolicy, minimumScore: Math.max(institution.accessPolicy.minimumScore, floor) });
    if (floor > institution.accessPolicy.minimumScore && access.score < floor) {
      const scoreReason = `The accessibility score is ${access.score}; your institution requires at least ${floor}.`;
      const index = reasons.indexOf(scoreReason);
      if (index >= 0) reasons[index] = `The accessibility score is ${access.score}; your course template requires at least ${floor}.`;
    }
    // The readiness policy's minimum (D-029): advisory unless a minimum is set.
    const policy = institution.readinessPolicy;
    const rubricResult = !policy || policy.minimumPercent === null ? null : await readiness.getCourseReadiness(ctx, { courseId: l.courseId });
    const rubric = rubricResult?.blocksPublishing ? { rubricName: rubricResult.rubricName, percent: rubricResult.percent, minimum: policy!.minimumPercent! } : undefined;
    if (!report.ready || reasons.length || rubric) {
      const rubricReason = rubric ? [`The course meets ${rubric.percent}% of the ${rubric.rubricName}; publishing needs ${rubric.minimum}%.`] : [];
      throw new ApiError('not-ready', ["This lesson isn't ready to publish.", ...reasons, ...rubricReason].join(' '), { ...report, ready: false, ...(reasons.length ? { accessPolicy: { score: access.score, reasons } } : {}), ...(rubric ? { rubric } : {}) });
    }
    l.status = 'published'; l.publishedAt = ctx.now(); await ctx.repo.putLesson(l); return l;
  },
  unpublishLesson: async (ctx, { lessonId }) => {
    const l = await teachLesson(ctx, lessonId); l.status = 'draft'; l.publishedAt = null; await ctx.repo.putLesson(l); return l;
  },
};

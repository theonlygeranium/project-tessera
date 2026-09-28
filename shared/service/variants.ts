import { ApiError } from '../api';
import type { Block, BlockContent, Lesson, LessonDetail, LessonVariant, VariantAudience, VariantDiffRow } from '../domain';
import { stableHash } from '../hash';
import { lessonReadiness } from '../policy';
import type { Service, ServiceContext } from './context';
import { aiEnabled, aiFailed, canReachCourse, canTeach, fail, lessonFor, moduleFor, provenance } from './helpers';
import { validateBlockContent } from './validate';

/** Hash only the declared BlockContent fields, never lineage or other block metadata. */
export function masterHash(block: Block): string { return stableHash(blockContent(block)); }

const rewriteable = (block: Block) => ['heading', 'text', 'callout', 'check'].includes(block.type);
const blockContent = (block: Block): BlockContent => {
  const { id: _id, lessonId: _l, position: _p, origin: _o, aiState: _a, provenance: _pr, previous: _pv, updatedAt: _u, source: _s, templateKey: _t, ...value } = block;
  return value as BlockContent;
};

async function detail(ctx: ServiceContext, lesson: Lesson): Promise<LessonDetail> {
  const [module, course, blocks] = await Promise.all([moduleFor(ctx, lesson.moduleId), canReachCourse(ctx, lesson.courseId), ctx.repo.listBlocks(lesson.id)]);
  return { lesson, moduleTitle: module.title, courseTitle: course.title, blocks, readiness: lessonReadiness(blocks) };
}
async function variantAndMaster(ctx: ServiceContext, variantId: string, write = false) {
  const variant = await lessonFor(ctx, variantId);
  const lineage = variant.variantOf ?? fail('invalid', 'This lesson is not a variant.');
  if (write) await canTeach(ctx, variant.courseId); else await canReachCourse(ctx, variant.courseId);
  const master = await lessonFor(ctx, lineage.lessonId);
  if (master.courseId !== variant.courseId || master.variantOf) fail('not-found', 'Master lesson not found.');
  return { variant, master };
}
function status(variant: Lesson, masters: Block[], blocks: Block[]): LessonVariant {
  const lineage = variant.variantOf!;
  const byId = new Map(masters.map(b => [b.id, b]));
  const covered = new Set(blocks.map(b => b.source?.blockId).filter((id): id is string => !!id));
  return {
    lessonId: variant.id, masterLessonId: lineage.lessonId, audience: lineage.audience,
    title: variant.title, minutes: variant.minutes, status: variant.status, syncedAt: lineage.syncedAt,
    divergedBlocks: blocks.filter(b => b.source && byId.has(b.source.blockId) && masterHash(byId.get(b.source.blockId)!) !== b.source.hash).length,
    uncoveredBlocks: masters.filter(b => !covered.has(b.id) && b.updatedAt > lineage.syncedAt).length,
  };
}
function rows(variant: Lesson, masters: Block[], blocks: Block[]): VariantDiffRow[] {
  const byId = new Map(masters.map(b => [b.id, b]));
  const covered = new Set(blocks.map(b => b.source?.blockId).filter((id): id is string => !!id));
  const result: VariantDiffRow[] = blocks.map(b => {
    if (!b.source) return { state: 'variant-only', master: null, variant: b };
    const master = byId.get(b.source.blockId) ?? null;
    return { state: master ? masterHash(master) === b.source.hash ? 'in-sync' : 'diverged' : 'master-removed', master, variant: b };
  });
  for (const master of masters.filter(b => !covered.has(b.id) && b.updatedAt > variant.variantOf!.syncedAt)) {
    const following = result.findIndex(row => row.master && row.master.position > master.position);
    result.splice(following < 0 ? result.length : following, 0, { state: 'new-in-master', master, variant: null });
  }
  return result;
}
function aiBlock(ctx: ServiceContext, lessonId: string, content: BlockContent, model: string, summary: string, source: Block | null, previous: BlockContent | null = null, id?: string): Block {
  return { ...content, id: id ?? ctx.newId('b'), lessonId, position: 0, origin: 'ai', aiState: 'draft', provenance: provenance(ctx, model, 'variant', summary), previous, updatedAt: ctx.now(), ...(source ? { source: { blockId: source.id, hash: masterHash(source) } } : {}) } as Block;
}
function humanCopy(ctx: ServiceContext, lessonId: string, master: Block): Block {
  return { ...blockContent(master), id: ctx.newId('b'), lessonId, position: 0, origin: master.origin, aiState: master.aiState, provenance: master.provenance, previous: null, updatedAt: ctx.now(), source: { blockId: master.id, hash: masterHash(master) } } as Block;
}
function validateResult(output: unknown, sent: Block[], audience: VariantAudience, requireAll: boolean) {
  if (!output || typeof output !== 'object') aiFailed();
  const raw = output as { title?: unknown; minutes?: unknown; blocks?: unknown };
  if (typeof raw.title !== 'string' || !raw.title.trim() || typeof raw.minutes !== 'number' || !Number.isInteger(raw.minutes) || raw.minutes < 1 || raw.minutes > 240 || !Array.isArray(raw.blocks)) aiFailed();
  const title = raw.title as string, minutes = raw.minutes as number, outputBlocks = raw.blocks as unknown[];
  const byId = new Map(sent.map(b => [b.id, b]));
  const seen = new Set<string>();
  const blocks = outputBlocks.map((item: unknown) => {
    if (!item || typeof item !== 'object') aiFailed();
    const b = item as { sourceBlockId?: unknown; content?: unknown };
    if (b.sourceBlockId !== null && (typeof b.sourceBlockId !== 'string' || !byId.has(b.sourceBlockId) || seen.has(b.sourceBlockId))) aiFailed();
    if (typeof b.sourceBlockId === 'string') seen.add(b.sourceBlockId);
    let content: BlockContent;
    try { content = validateBlockContent(b.content); } catch { return aiFailed(); }
    return { source: typeof b.sourceBlockId === 'string' ? byId.get(b.sourceBlockId)! : null, content };
  });
  if (!blocks.length || requireAll && seen.size !== sent.length) aiFailed();
  return { title: title.trim(), minutes: audience === 'micro' ? Math.min(15, minutes) : minutes, blocks };
}
async function runVariant(ctx: ServiceContext, courseTitle: string, lessonTitle: string, audience: VariantAudience, minutes: number, blocks: Block[], requireAll: boolean) {
  let result;
  try {
    result = await ctx.ai.run('variant', { courseTitle, lessonTitle, audience, targetMinutes: audience === 'micro' ? Math.min(15, minutes) : minutes, blocks: blocks.map(b => ({ id: b.id, content: blockContent(b) })) });
    return { model: result.model, ...validateResult(result.output, blocks, audience, requireAll) };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'ai-failed') throw error;
    return aiFailed();
  }
}

export const variants: Pick<Service, 'listVariants' | 'createVariant' | 'getVariantDiff' | 'resyncVariant' | 'keepVariant'> = {
  listVariants: async (ctx, { lessonId }) => {
    const master = await lessonFor(ctx, lessonId); await canReachCourse(ctx, master.courseId);
    if (master.variantOf) fail('invalid', 'Select a master lesson.');
    const masters = await ctx.repo.listBlocks(lessonId);
    const lessons = await ctx.repo.listVariantLessons(lessonId);
    return Promise.all(lessons.map(async variant => status(variant, masters, await ctx.repo.listBlocks(variant.id))));
  },
  createVariant: async (ctx, { lessonId, audience }) => {
    const master = await lessonFor(ctx, lessonId); const course = await canTeach(ctx, master.courseId); await aiEnabled(ctx);
    if (master.variantOf) fail('invalid', 'A variant cannot have its own variant.');
    const masters = await ctx.repo.listBlocks(lessonId);
    if (!masters.length) fail('invalid', 'Add a block to the master lesson first.');
    if ((await ctx.repo.listVariantLessons(lessonId)).some(v => v.variantOf?.audience === audience)) fail('conflict', 'A variant for this audience already exists.');
    const sent = masters.filter(rewriteable);
    if (!sent.length) fail('invalid', 'The master needs a heading, text, callout, or check block.');
    const ai = await runVariant(ctx, course.title, master.title, audience, master.minutes, sent, audience === 'plain');
    const variant: Lesson = { id: ctx.newId('l'), moduleId: master.moduleId, courseId: master.courseId, position: master.position, title: ai.title, minutes: ai.minutes, status: 'draft', publishedAt: null, variantOf: { lessonId, audience, syncedAt: ctx.now() } };
    const summary = `${audience === 'plain' ? 'Plain-language' : '15-minute'} version of ${master.title}`;
    const generated = ai.blocks.map(b => aiBlock(ctx, variant.id, b.content, ai.model, summary, b.source));
    let blocks: Block[];
    if (audience === 'plain') {
      const mapped = new Map(generated.filter(b => b.source).map(b => [b.source!.blockId, b]));
      blocks = [...generated.filter(b => !b.source), ...masters.map(masterBlock => mapped.get(masterBlock.id) ?? humanCopy(ctx, variant.id, masterBlock))];
    } else blocks = generated;
    blocks.forEach((b, i) => { b.position = i; });
    await ctx.repo.putLesson(variant); await ctx.repo.replaceBlocks(variant.id, blocks);
    return detail(ctx, variant);
  },
  getVariantDiff: async (ctx, { variantId }) => {
    const { variant, master } = await variantAndMaster(ctx, variantId);
    const [masters, blocks] = await Promise.all([ctx.repo.listBlocks(master.id), ctx.repo.listBlocks(variant.id)]);
    return { variant: status(variant, masters, blocks), rows: rows(variant, masters, blocks) };
  },
  resyncVariant: async (ctx, { variantId, blockIds }) => {
    const { variant, master } = await variantAndMaster(ctx, variantId, true); await aiEnabled(ctx);
    const [course, masters, blocks] = await Promise.all([canReachCourse(ctx, master.courseId), ctx.repo.listBlocks(master.id), ctx.repo.listBlocks(variant.id)]);
    const diff = rows(variant, masters, blocks);
    const diverged = diff.filter(row => row.state === 'diverged');
    const selected = blockIds === undefined ? diverged : diverged.filter(row => blockIds.includes(row.variant!.id));
    if (blockIds && (new Set(blockIds).size !== blockIds.length || selected.length !== blockIds.length)) fail('invalid', 'Select diverged variant blocks.');
    const uncovered = blockIds === undefined ? diff.filter(row => row.state === 'new-in-master') : [];
    const targets = [...selected, ...uncovered].map(row => row.master!).filter(rewriteable);
    if (!selected.length && !uncovered.length) return detail(ctx, variant);
    const ai = targets.length ? await runVariant(ctx, course.title, master.title, variant.variantOf!.audience, master.minutes, targets, true) : null;
    const bySource = new Map(ai?.blocks.filter(b => b.source).map(b => [b.source!.id, b]) ?? []);
    const summary = `${variant.variantOf!.audience === 'plain' ? 'Plain-language' : '15-minute'} resync of ${master.title}`;
    const replacements = new Map(selected.map(row => {
      const previous = row.variant!, masterBlock = row.master!;
      const next = rewriteable(masterBlock)
        ? aiBlock(ctx, variant.id, bySource.get(masterBlock.id)!.content, ai!.model, summary, masterBlock, blockContent(previous), previous.id)
        : { ...humanCopy(ctx, variant.id, masterBlock), id: previous.id, position: previous.position };
      return [previous.id, next] as const;
    }));
    let next = blocks.map(b => replacements.get(b.id) ? { ...replacements.get(b.id)!, position: b.position } : b);
    for (const row of uncovered) {
      if (variant.variantOf!.audience === 'micro' && !rewriteable(row.master!)) continue;
      const added = rewriteable(row.master!) ? aiBlock(ctx, variant.id, bySource.get(row.master!.id)!.content, ai!.model, summary, row.master) : humanCopy(ctx, variant.id, row.master!);
      if (variant.variantOf!.audience === 'plain') {
        const after = next.findIndex(b => b.source && masters.find(m => m.id === b.source!.blockId)?.position! > row.master!.position);
        next.splice(after < 0 ? next.length : after, 0, added);
      } else next.push(added);
    }
    next.forEach((b, i) => { b.position = i; });
    if (blockIds === undefined || (status(variant, masters, next).divergedBlocks === 0 && status(variant, masters, next).uncoveredBlocks === 0)) variant.variantOf!.syncedAt = ctx.now();
    await ctx.repo.replaceBlocks(variant.id, next); await ctx.repo.putLesson(variant);
    return detail(ctx, variant);
  },
  keepVariant: async (ctx, { variantId, blockIds }) => {
    const { variant, master } = await variantAndMaster(ctx, variantId, true);
    const [masters, blocks] = await Promise.all([ctx.repo.listBlocks(master.id), ctx.repo.listBlocks(variant.id)]);
    const diff = rows(variant, masters, blocks);
    const selected = diff.filter(row => row.state === 'diverged' && blockIds.includes(row.variant!.id));
    if (!blockIds.length || new Set(blockIds).size !== blockIds.length || selected.length !== blockIds.length) fail('invalid', 'Select diverged variant blocks.');
    const hashes = new Map(selected.map(row => [row.variant!.id, masterHash(row.master!)]));
    const next = blocks.map(b => hashes.has(b.id) ? { ...b, source: { blockId: b.source!.blockId, hash: hashes.get(b.id)! } } : b);
    if (status(variant, masters, next).divergedBlocks === 0 && status(variant, masters, next).uncoveredBlocks === 0) variant.variantOf!.syncedAt = ctx.now();
    await ctx.repo.replaceBlocks(variant.id, next); await ctx.repo.putLesson(variant);
    return detail(ctx, variant);
  },
};

import type { Block, BlockContent, BlockType, LessonDetail } from '../domain';
import { lessonReadiness } from '../policy';
import type { GenerationItem, GenerationJob } from '../repo';
import type { Service, ServiceContext } from './context';
import { aiEnabled, canReachCourse, canTeach, content, fail, lessonFor, minutes, provenance, required, user } from './helpers';
import { validateBlockContent } from './validate';
import { courses } from './courses';

const GENERATABLE: readonly BlockType[] = ['text', 'callout', 'check', 'document', 'table', 'scenario'];
const labels: Record<string, string> = { text: 'Text', callout: 'Callout', check: 'Check', document: 'Document', table: 'Table', scenario: 'Scenario' };
/** Checks the stricter shape promised by the element task after general block validation. */
export function validateGeneratedElement(value: unknown, type: BlockType): BlockContent {
  const block = validateBlockContent(value);
  if (block.type !== type) fail('invalid', 'AI returned the wrong element type.');
  switch (block.type) {
    case 'text': if (!block.text) fail('invalid', 'Text is empty.'); break;
    case 'callout': if (!block.title || !block.text) fail('invalid', 'Callout is incomplete.'); break;
    case 'check':
      if (block.options.length < 3 || block.options.length > 4 || !block.options.some(option => option.id === block.correctOptionId) || !block.question || !block.feedbackCorrect || !block.feedbackIncorrect) fail('invalid', 'Check is incomplete.');
      break;
    case 'document': if (block.sections.length < 3 || block.sections.length > 8) fail('invalid', 'Document needs 3–8 sections.'); break;
    case 'table': if (!block.headerRow || block.rows.length < 3 || block.rows.length > 8 || block.rows[0].length < 2 || block.rows[0].length > 5) fail('invalid', 'Table needs a header and 3–8 rows of 2–5 cells.'); break;
    case 'scenario':
      if (block.nodes.length < 4 || block.nodes.length > 8 || block.nodes.filter(node => node.choices.length === 0 && node.outcome).length < 2 || block.nodes.some(node => node.choices.length ? node.choices.length < 2 || node.choices.length > 3 : !node.outcome)) fail('invalid', 'Scenario needs valid decisions and two endings.');
      break;
  }
  return block;
}
function typeFor(value: unknown): BlockType {
  return typeof value === 'string' && GENERATABLE.includes(value as BlockType) ? value as BlockType : fail('invalid', `Cannot generate ${String(value)}.`);
}
async function detail(ctx: ServiceContext, lessonId: string): Promise<LessonDetail> {
  const lesson = await lessonFor(ctx, lessonId);
  const module = await ctx.repo.getModule(lesson.moduleId) ?? fail('not-found', 'Module not found.');
  const course = await canReachCourse(ctx, lesson.courseId);
  const blocks = await ctx.repo.listBlocks(lessonId);
  return { lesson, moduleTitle: module.title, courseTitle: course.title, blocks, readiness: lessonReadiness(blocks) };
}
async function draft(ctx: ServiceContext, item: GenerationItem, instruction: string): Promise<{ block: BlockContent; model: string; lessonTitle: string }> {
  const lesson = await lessonFor(ctx, item.lessonId);
  const module = await ctx.repo.getModule(lesson.moduleId) ?? fail('not-found', 'Module not found.');
  const course = await ctx.repo.getCourse(lesson.courseId) ?? fail('not-found', 'Course not found.');
  const blocks = await ctx.repo.listBlocks(lesson.id);
  const lessonText = blocks.flatMap(block => {
    const value = content(block);
    switch (value.type) {
      case 'heading': case 'text': return [value.text];
      case 'callout': return [value.title, value.text];
      case 'document': return [value.title, ...value.sections.flatMap(section => [section.heading, section.text])];
      default: return [];
    }
  }).join('\n\n').slice(0, 6000);
  const result = await ctx.ai.run('element', { courseTitle: course.title, moduleTitle: module.title, lessonTitle: lesson.title, lessonText, type: item.type, instruction });
  const block = validateGeneratedElement(result.output.block, item.type);
  return { block, model: result.model, lessonTitle: lesson.title };
}
async function insert(ctx: ServiceContext, item: GenerationItem, generated: Awaited<ReturnType<typeof draft>>, position?: number, blockId?: string) {
  const old = await ctx.repo.listBlocks(item.lessonId);
  if (position !== undefined && (!Number.isInteger(position) || position < 0 || position > old.length)) fail('invalid', `Position must be 0–${old.length}.`);
  const at = position ?? old.length;
  const block: Block = { ...generated.block, id: blockId ?? ctx.newId('b'), lessonId: item.lessonId, position: at,
    origin: 'ai', aiState: 'draft', previous: null,
    provenance: provenance(ctx, generated.model, 'element', `${labels[item.type]} drafted for ${generated.lessonTitle}`, []), updatedAt: ctx.now() } as Block;
  if (at === old.length) await ctx.repo.putBlock(block);
  else await ctx.repo.replaceBlocks(item.lessonId, [...old.slice(0, at), block, ...old.slice(at)].map((value, index) => ({ ...value, position: index })));
}
function publicJob(job: GenerationJob) {
  return { jobId: job.id, state: job.state, done: job.done, total: job.total, lessonIds: job.lessonIds, error: job.error, failures: job.failures };
}
export const generation: Pick<Service, 'generateAtScope' | 'getGenerationJob' | 'generateElement' | 'importCourse'> = {
  generateAtScope: async (ctx, { courseId, scope, instruction }) => {
    await canTeach(ctx, courseId); await aiEnabled(ctx);
    if (!scope || typeof scope !== 'object' || (scope.moduleIds !== undefined && !Array.isArray(scope.moduleIds)) || (scope.lessonIds !== undefined && !Array.isArray(scope.lessonIds)) || (scope.elementTypes !== undefined && !Array.isArray(scope.elementTypes))) fail('invalid', 'Choose a valid scope.');
    const types = scope.elementTypes === undefined ? ['text', 'check'] as BlockType[] : scope.elementTypes.map(typeFor);
    if (!types.length) fail('invalid', 'Choose at least one element type.');
    const uniqueTypes = [...new Set(types)];
    const modules = await ctx.repo.listModules(courseId);
    const moduleIds = new Set(modules.map(module => module.id));
    if (scope.moduleIds?.some(id => !moduleIds.has(id))) fail('invalid', 'A selected module is outside this course.');
    const lessons = await ctx.repo.listLessons({ courseId });
    const lessonIds = new Set(lessons.map(lesson => lesson.id));
    if (scope.lessonIds?.some(id => !lessonIds.has(id))) fail('invalid', 'A selected lesson is outside this course.');
    const selectedModules = new Set(scope.moduleIds ?? []), selectedLessons = new Set(scope.lessonIds ?? []);
    const chosen = lessons.filter(lesson => scope.wholeCourse === true || selectedModules.has(lesson.moduleId) || selectedLessons.has(lesson.id));
    if (!chosen.length) fail('invalid', 'Choose at least one lesson.');
    const work = chosen.flatMap(lesson => uniqueTypes.map(type => ({ lessonId: lesson.id, type })));
    if (work.length > 60) fail('invalid', `${work.length} elements exceed the limit of 60.`);
    const now = ctx.now();
    const job: GenerationJob = { id: ctx.newId('gj'), courseId, requestedBy: user(ctx).id, state: 'running', done: 0, total: work.length,
      lessonIds: [], error: null, work, instruction: instruction?.trim() ?? '', failures: [], createdAt: now, updatedAt: now };
    await ctx.repo.putGenerationJob(job);
    return { jobId: job.id };
  },
  getGenerationJob: async (ctx, { jobId }) => {
    const job = await ctx.repo.getGenerationJob(jobId) ?? fail('not-found', 'Generation job not found.');
    await canTeach(ctx, job.courseId);
    if (job.state !== 'running') return publicJob(job);
    await aiEnabled(ctx);
    const batch = job.work.slice(0, 2);
    const results = await Promise.allSettled(batch.map(item => draft(ctx, item, job.instruction)));
    for (const [index, result] of results.entries()) {
      const item = batch[index];
      if (result.status === 'fulfilled') {
        try {
          await insert(ctx, item, result.value, undefined, `b-${job.id}-${job.done}`);
          if (!job.lessonIds.includes(item.lessonId)) job.lessonIds.push(item.lessonId);
        } catch (error) { job.failures.push({ ...item, message: error instanceof Error ? error.message : 'Could not save the draft.' }); }
      } else job.failures.push({ ...item, message: result.reason instanceof Error ? result.reason.message : 'Could not create the draft.' });
      job.done++;
    }
    job.work = job.work.slice(batch.length);
    if (!job.work.length) job.state = job.failures.length === job.total ? 'failed' : 'done';
    if (job.failures.length) job.error = `${job.failures.length} of ${job.total} elements couldn't be generated.`;
    job.updatedAt = ctx.now();
    await ctx.repo.putGenerationJob(job);
    return publicJob(job);
  },
  generateElement: async (ctx, { lessonId, type, instruction, position }) => {
    const lesson = await lessonFor(ctx, lessonId); await canTeach(ctx, lesson.courseId); await aiEnabled(ctx);
    const item = { lessonId, type: typeFor(type) };
    const old = await ctx.repo.listBlocks(lessonId);
    if (position !== undefined && (!Number.isInteger(position) || position < 0 || position > old.length)) fail('invalid', `Position must be 0–${old.length}.`);
    await insert(ctx, item, await draft(ctx, item, instruction?.trim() ?? ''), position);
    return detail(ctx, lessonId);
  },
  importCourse: async (ctx, input) => {
    if (user(ctx).role !== 'administrator' || ctx.token && !ctx.token.scopes.includes('courses:write')) fail('forbidden', 'Administrator course write access is required.');
    if (!input || !input.course || !Array.isArray(input.modules)) fail('invalid', 'A course and modules are required.');
    const courseInput = input.course;
    const clean = { code: required(courseInput.code, 'code'), title: required(courseInput.title, 'title'), term: required(courseInput.term, 'term'),
      description: courseInput.description?.trim() ?? '', welcome: courseInput.welcome?.trim() ?? '', outcomes: (courseInput.outcomes ?? []).map(value => required(value, 'outcome')) };
    const prepared = input.modules.map(module => ({ title: required(module.title, 'module title'), lessons: (Array.isArray(module.lessons) ? module.lessons : fail('invalid', 'Lessons must be an array.')).map(lesson => ({
      title: required(lesson.title, 'lesson title'), minutes: minutes(lesson.minutes ?? 15),
      blocks: (Array.isArray(lesson.blocks) ? lesson.blocks : fail('invalid', 'Blocks must be an array.')).map(validateBlockContent),
    })) }));
    const courseId = ctx.newId('c');
    await ctx.repo.putCourse({ id: courseId, ...clean, instructorIds: [], status: 'active' });
    for (const [modulePosition, module] of prepared.entries()) {
      const moduleId = ctx.newId('m'); await ctx.repo.putModule({ id: moduleId, courseId, title: module.title, position: modulePosition });
      for (const [position, lesson] of module.lessons.entries()) {
        const lessonId = ctx.newId('l');
        await ctx.repo.putLesson({ id: lessonId, moduleId, courseId, title: lesson.title, minutes: lesson.minutes, position, status: 'draft', publishedAt: null });
        await ctx.repo.replaceBlocks(lessonId, lesson.blocks.map((block, blockPosition) => ({ ...block, id: ctx.newId('b'), lessonId, position: blockPosition, origin: 'human', aiState: null, provenance: null, previous: null, updatedAt: ctx.now() } as Block)));
      }
    }
    return courses.getCourseOutline(ctx, { courseId });
  },
};

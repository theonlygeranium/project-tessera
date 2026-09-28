import type { Assignment, Block, BlockContent, DesignSession, Lesson, Module, ProvisionPlan, RubricCriterion, SourceSpan } from '../domain';
import type { GenerationJob } from '../repo';
import type { Service, ServiceContext } from './context';
import { previewProvisionPlan as buildPlan } from '../design/plan';
import { courseSnapshot } from './readiness';
import { aiEnabled, canTeach, fail, provenance, user } from './helpers';
import { saveCourseOutcomes } from './outcomes';
import { validateBlockContent } from './validate';
import { validateNoLearningStyles } from './validate-design';
import { validateGeneratedElement } from './generation';
import { fixtureAi } from '../ai';
import { DEFAULT_AI_DISCLOSURE, lessonReadiness } from '../policy';

const STALE = 'The course or template changed since the preview. Review the changes again.';
async function sessionFor(ctx: ServiceContext, id: string): Promise<DesignSession> {
  const session = await ctx.repo.getDesignSession(id) ?? fail('not-found', 'Design session not found.');
  await canTeach(ctx, session.courseId);
  return session;
}
const planAssignments = (module: ProvisionPlan['modules'][number]) => module.assignments?.length ? module.assignments : module.assignment ? [module.assignment] : [];
function sourceForLesson(session: DesignSession, module: ProvisionPlan['modules'][number], lesson: ProvisionPlan['modules'][number]['lessons'][number]): SourceSpan[] {
  const schedule = session.extraction?.schedule ?? [];
  const spans = schedule.filter(row => row.span && row.week === lesson.week).map(row => row.span!);
  return [...spans, ...(lesson.skeleton === 'start-here' ? session.extraction!.profile.instructor.spans : []), ...session.extraction!.outcomes.filter(o => o.span && module.outcomeCodes.some(code => session.plan!.outcomes.find(p => p.code === code)?.text === o.text)).map(o => o.span!)].filter((span, i, all) => all.findIndex(s => s.page === span.page && s.text === span.text) === i);
}
export function scaffoldBlocks(raw: unknown, objective: string, source: DesignSession['source'], spans: SourceSpan[] = [], skeleton: ProvisionPlan['modules'][number]['lessons'][number]['skeleton'] = 'gagne'): BlockContent[] {
  const response = raw as { blocks?: unknown[] };
  if (!Array.isArray(response?.blocks) || response.blocks.length < 3 || response.blocks.length > 6) fail('invalid', 'A lesson scaffold needs 3–6 blocks.');
  const text = source.sections.map(section => section.text).join('\n');
  const blocks = (response.blocks as unknown[]).map(value => {
    if (value && typeof value === 'object' && 'type' in value && value.type === 'link') {
      const href = 'href' in value ? value.href : null;
      if (typeof href !== 'string' || !/^https?:\/\//.test(href) || !text.includes(href) || !spans.some(span => span.text.includes(href))) return { type: 'callout', tone: 'info', title: 'Reading', text: '[Reading to select]' } as BlockContent;
    }
    const block = validateBlockContent(value);
    if (!['heading', 'callout', 'text', 'check', 'scenario', 'link'].includes(block.type)) fail('invalid', 'The scaffold contains an unsupported element.');
    if (block.type === 'scenario' && skeleton !== 'case') fail('invalid', 'Only a case scaffold can contain a scenario.');
    if (block.type === 'text' && !/\[Your\s+[^\]]+\]/.test(block.text)) return { ...block, text: `${block.text}\n\n[Your example from class]` };
    if (block.type === 'check') {
      const targetWords = new Set((objective.toLowerCase().match(/[\p{L}]{5,}/gu) ?? []));
      const correct = block.options.find(option => option.id === block.correctOptionId);
      const matches = correct && [...targetWords].some(word => correct.text.toLowerCase().includes(word));
      return validateGeneratedElement({ ...block, question: block.question.includes(objective) ? block.question : `${block.question} (${objective})`, options: matches ? block.options : block.options.map(option => option.id === block.correctOptionId ? { ...option, text: objective } : option) }, 'check');
    }
    if (block.type === 'callout' || block.type === 'scenario' || block.type === 'text') return validateGeneratedElement(block, block.type);
    if (block.type === 'link' && /^(here|link|click here|read more|url|https?:\/\/\S+)$/i.test(block.text.trim())) return { ...block, text: `Reading for ${objective}` };
    return block;
  });
  if (!blocks.some(b => b.type === 'check')) fail('invalid', 'The scaffold needs an objective check.');
  validateNoLearningStyles(blocks);
  return blocks;
}
const block = (ctx: ServiceContext, lessonId: string, id: string, position: number, value: BlockContent, model: string, sources: SourceSpan[], sourceName: string, week: number | null): Block => ({ ...value, id, lessonId, position, origin: 'ai', aiState: 'draft', previous: null, updatedAt: ctx.now(), provenance: provenance(ctx, model, 'module-scaffold', `Drafted from your syllabus (${sources[0]?.page ? `p. ${sources[0].page}` : sources[0]?.section ? `§ ${sources[0].section}` : 'source'}${week ? `, Week ${week}` : ''}) and your answers`, sources.map((span, i) => ({ id: `${lessonId}-source-${i + 1}`, name: `${sourceName}${span.page ? ` p. ${span.page}` : span.section ? ` § ${span.section}` : ''}`, span }))) } as Block);
function rubricFor(id: string, objective: string, outcomes: string[], points: number): RubricCriterion[] {
  const descriptions = [objective, outcomes.join('; ') || objective, `Explain how the submitted work demonstrates ${objective.toLowerCase()}`];
  return ['Objective', 'Outcome evidence', 'Explanation'].map((title, i) => ({ id: `${id}-criterion-${i + 1}`, title, description: descriptions[i], levels: [{ id: 'met', title: 'Meets criterion', points: Math.round(points / 3 * 100) / 100, description: descriptions[i] }, { id: 'developing', title: 'Developing', points: Math.round(points / 6 * 100) / 100, description: `Partly demonstrates: ${descriptions[i]}` }, { id: 'not-yet', title: 'Not yet', points: 0, description: `Does not yet demonstrate: ${descriptions[i]}` }] }));
}
const tiltTexts = (objective: string, title: string) => [`Purpose\n${objective}`, `Task\nCreate a draft response to ${title}. [Your course-specific directions]`, `Criteria\nShow evidence for ${objective}. Use the rubric below.`];
async function alternatives(ctx: ServiceContext, session: DesignSession, lessonId: string) {
  const lesson = await ctx.repo.getLesson(lessonId) ?? fail('not-found', 'Lesson not found.');
  if (!session.created.lessonIds.includes(lessonId)) fail('invalid', 'Choose a lesson created by this plan.');
  const old = await ctx.repo.listBlocks(lessonId);
  if (old.some(b => b.type === 'document' && b.title === 'Alternative opening A') && old.some(b => b.type === 'document' && b.title === 'Alternative opening B')) return;
  const plannedModule = session.plan?.modules.find(module => session.created.moduleIds[session.plan!.modules.indexOf(module)] === lesson.moduleId);
  const plannedLesson = plannedModule?.lessons[lesson.position];
  const spans = plannedModule && plannedLesson ? sourceForLesson(session, plannedModule, plannedLesson) : [];
  const drafted: Block[] = [];
  for (const letter of ['A', 'B']) {
    const id = ctx.newId('b');
    const value: BlockContent = { type: 'document', title: `Alternative opening ${letter}`, sections: [{ heading: 'An optional way in', text: letter === 'A' ? `Ask learners what evidence would help them ${lesson.objective?.toLowerCase() ?? 'begin'}. [Your example from class]` : `Invite learners to compare two approaches to ${lesson.objective?.toLowerCase() ?? 'the topic'}. [Your contrasting example]` }] };
    drafted.push(block(ctx, lessonId, id, old.length + drafted.length, value, 'fixture', spans, session.source.name, plannedLesson?.week ?? null));
    session.created.blockIds.push(id);
  }
  await ctx.repo.replaceBlocks(lessonId, [...old, ...drafted]);
  await ctx.repo.putDesignSession(session);
}

/** One lesson per durable step. Validate every block before replaceBlocks writes any of them. */
export async function advanceScaffoldJob(ctx: ServiceContext, job: GenerationJob): Promise<GenerationJob> {
  if (job.kind !== 'scaffold' || job.state !== 'running' || !job.sessionId) return job;
  const item = job.work[0];
  if (!item) return job;
  const session = await ctx.repo.getDesignSession(job.sessionId);
  if (!session || session.stage !== 'provisioning' || session.provisioning?.jobId !== job.id || !session.plan) return job;
  const lesson = await ctx.repo.getLesson(item.lessonId);
  const module = lesson ? await ctx.repo.getModule(lesson.moduleId) : null;
  const planModule = session.plan.modules.find(m => m.position === module?.position);
  const planLesson = planModule?.lessons.find(l => l.title === lesson?.title);
  if (!lesson || !planModule || !planLesson) return job;
  const spans = sourceForLesson(session, planModule, planLesson);
  let drafted: BlockContent[] = [];
  let model = 'fixture';
  let error: string | null = null;
  try {
    if (planLesson.skeleton === 'start-here') {
      const profile = session.extraction?.profile.instructor.value;
      const contact = profile?.email || profile?.officeHours || 'Contact your instructor through the course message tool.';
      const baseline = (await fixtureAi.run('module-scaffold', { courseTitle: '', module: planModule, lesson: planLesson, skeleton: 'start-here', outcomes: session.plan.outcomes, spans, teachingNote: session.teachingNote, instructorProfile: null, priorLessonTitles: [] })).output.blocks.find(b => b.type === 'check')!;
      drafted = [
        { type: 'heading', level: 2, text: 'Start here' },
        { type: 'text', text: `Open the course outline to find each module and lesson. Work through the lessons in order, then review the draft assignments. Your instructor can be reached at ${contact}.\n\n[Your welcome and course navigation example]` },
        { type: 'text', text: `Course outcomes:\n${session.plan.outcomes.map(o => `${o.code}: ${o.text}`).join('\n')}\n\n${(await ctx.repo.getInstructorProfile(session.createdBy))?.disclosureText ?? DEFAULT_AI_DISCLOSURE}\n\n[Your AI-use guidance]` },
        ...Array.from({ length: 5 }, (_, i) => ({ ...baseline, question: `Baseline ${i + 1}: ${baseline.type === 'check' ? baseline.question : planLesson.objective}` } as BlockContent)),
      ];
    } else {
      const input = { courseTitle: (await ctx.repo.getCourse(session.courseId))?.title ?? '', module: planModule, lesson: planLesson, skeleton: planLesson.skeleton, outcomes: session.plan.outcomes.filter(o => planModule.outcomeCodes.includes(o.code)), spans, teachingNote: session.teachingNote, instructorProfile: await ctx.repo.getInstructorProfile(session.createdBy), priorLessonTitles: planModule.lessons.filter(l => l.key !== planLesson.key).map(l => l.title) };
      const readingSpans = session.plan.readings.filter(reading => reading.moduleKey === planModule.key && session.extraction?.schedule.some(row => row.week === planLesson.week && row.span?.text === reading.span.text)).map(reading => reading.span);
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await ctx.ai.run('module-scaffold', input);
        try { drafted = scaffoldBlocks(result.output, planLesson.objective, session.source, readingSpans, planLesson.skeleton); model = result.model; break; }
        catch (cause) { if (attempt === 1) throw cause; }
      }
      const reading = session.plan.readings.find(r => r.moduleKey === planModule.key && session.extraction?.schedule.some(row => row.week === planLesson.week && row.span?.text === r.span.text));
      const callout = drafted.find(b => b.type === 'callout');
      if (callout?.type === 'callout') callout.text += `\n${reading ? `Reading from your syllabus: ${reading.title}` : '[Reading to select]'}`;
      if (callout?.type === 'callout' && planLesson.patternNote) callout.text += `\n${planLesson.patternNote}`;
      const slots: BlockContent[] = [
        ...(planLesson.announcementSlot ? [{ type: 'callout' as const, tone: 'info' as const, title: 'Weekly announcement draft slot', text: '[Your update for this week]' }] : []),
        ...(planLesson.alternativeFormatSlot ? [{ type: 'callout' as const, tone: 'info' as const, title: 'Alternative format slot', text: '[Your alternative format choice]' }] : []),
      ];
      for (const slot of slots) {
        if (drafted.length < 6) drafted.splice(Math.max(1, drafted.length - 1), 0, slot);
        else if (callout?.type === 'callout' && slot.type === 'callout') callout.text += `\n${slot.title}: ${slot.text}`;
      }
    }
    drafted.forEach(validateBlockContent);
  } catch (cause) { error = cause instanceof Error ? cause.message : 'Scaffold validation failed.'; }
  const current = await ctx.repo.getGenerationJob(job.id);
  const latest = await ctx.repo.getDesignSession(job.sessionId);
  if (!current || current.done !== job.done || current.state !== 'running' || current.runner !== job.runner || latest?.stage !== 'provisioning' || latest.provisioning?.jobId !== job.id) return current ?? job;
  if (!error) {
    let writtenIds: string[] = [];
    try {
      const existing = await ctx.repo.listBlocks(lesson.id);
      if (existing.length) throw Error('Lesson was edited while its scaffold was being drafted.');
      const blocks = drafted.map((value, i) => ({ ...block(ctx, lesson.id, `b-${job.id}-${job.done}-${i}`, i, value, model, spans, session.source.name, planLesson.week), templateKey: value.type === 'check' && planLesson.resurface ? 'spaced-review' : value.type === 'callout' && value.title === 'Weekly announcement draft slot' ? 'weekly-announcement' : value.type === 'callout' && value.title === 'Alternative format slot' ? 'alternative-format' : null } as Block));
      await ctx.repo.replaceBlocks(lesson.id, blocks);
      writtenIds = blocks.map(b => b.id);
      latest.created.blockIds.push(...blocks.map(b => b.id));
      for (const b of blocks.filter(b => b.type === 'check' || b.type === 'scenario')) {
        const ids = (await ctx.repo.listOutcomes(session.courseId)).filter(o => planModule.outcomeCodes.includes(o.code)).map(o => o.id);
        await ctx.repo.setOutcomeLinks('block', b.id, ids);
        latest.created.linkKeys.push(...ids.map(id => `block:${b.id}:${id}`));
      }
      current.lessonIds.push(lesson.id);
    } catch (cause) {
      if (writtenIds.length) {
        for (const id of writtenIds) await ctx.repo.setOutcomeLinks('block', id, []);
        await ctx.repo.replaceBlocks(lesson.id, []);
        latest.created.blockIds = latest.created.blockIds.filter(id => !writtenIds.includes(id));
        latest.created.linkKeys = latest.created.linkKeys.filter(key => !writtenIds.some(id => key.startsWith(`block:${id}:`)));
      }
      error = cause instanceof Error ? cause.message : 'Could not save scaffold.';
    }
  }
  if (error) current.failures.push({ ...item, message: error });
  current.done++; current.work.shift(); current.updatedAt = ctx.now();
  if (!current.work.length) current.state = current.failures.length === current.total ? 'failed' : 'done';
  current.error = current.failures.length ? (await Promise.all(current.failures.map(async failure => `${(await ctx.repo.getLesson(failure.lessonId))?.title ?? failure.lessonId}: ${failure.message}`))).join('\n') : null;
  let before = 0;
  latest.provisioning = { jobId: current.id, done: current.done, total: current.total, error: current.error, modules: session.plan.modules.map(module => { const total = module.lessons.length; const done = Math.max(0, Math.min(total, current.done - before)); before += total; return { key: module.key, done, total }; }) };
  if (!current.work.length) {
    latest.stage = 'review';
    const key = current.instruction;
    const unsure = session.plan.modules.find(m => m.key === key);
    const moduleIndex = unsure ? session.plan.modules.indexOf(unsure) : -1;
    const moduleId = moduleIndex >= 0 ? latest.created.moduleIds[moduleIndex] : undefined;
    const firstId = moduleId ? (await ctx.repo.listLessons({ moduleId }))[0]?.id : undefined;
    if (firstId) await alternatives(ctx, latest, firstId);
  }
  latest.updatedAt = ctx.now();
  await ctx.repo.putDesignSession(latest);
  await ctx.repo.putGenerationJob(current);
  return current;
}

export const designPlan: Pick<Service, 'previewProvisionPlan' | 'applyProvisionPlan' | 'undoProvisionPlan' | 'flagLessonAlternatives'> = {
  previewProvisionPlan: async (ctx, { sessionId }) => {
    const session = await sessionFor(ctx, sessionId);
    if (session.stage !== 'preview') fail('invalid', 'Choose an approach first.');
    const plan = buildPlan(session, await courseSnapshot(ctx, session.courseId), await ctx.repo.getInstructorProfile(session.createdBy));
    session.plan = plan; session.record.plan = plan; session.updatedAt = ctx.now();
    await ctx.repo.putDesignSession(session);
    return plan;
  },
  applyProvisionPlan: async (ctx, { sessionId, hash, leastSureModuleKey }) => {
    const session = await sessionFor(ctx, sessionId);
    if ((session.stage === 'provisioning' || session.stage === 'review') && session.plan?.hash === hash) return session;
    if (session.stage !== 'preview') fail('conflict', STALE);
    await aiEnabled(ctx);
    const plan = buildPlan(session, await courseSnapshot(ctx, session.courseId), await ctx.repo.getInstructorProfile(session.createdBy));
    if (plan.hash !== hash || session.plan?.hash !== hash || plan.courseId !== session.courseId) {
      const latest = await sessionFor(ctx, sessionId);
      if ((latest.stage === 'provisioning' || latest.stage === 'review') && latest.plan?.hash === hash) return latest;
      fail('conflict', STALE);
    }
    if (leastSureModuleKey && !plan.modules.some(m => m.key === leastSureModuleKey)) fail('invalid', 'Choose a module in this plan.');
    const oldOutcomes = await ctx.repo.listOutcomes(session.courseId);
    if (oldOutcomes.length + plan.outcomes.length > 30) fail('invalid', 'The course would exceed 30 outcomes.');
    const jobId = ctx.newId('gj');
    const claimed: DesignSession = { ...session, plan, stage: 'provisioning', provisioning: { jobId, done: 0, total: plan.counts.lessons, error: null, modules: plan.modules.map(module => ({ key: module.key, done: 0, total: module.lessons.length })) }, record: { ...session.record, plan }, updatedAt: ctx.now() };
    if (!await ctx.repo.claimDesignApply(claimed)) return sessionFor(ctx, sessionId);
    const created = claimed.created;
    try {
      const saved = await saveCourseOutcomes(ctx, session.courseId, [...oldOutcomes.map(o => ({ id: o.id, text: o.text })), ...plan.outcomes.map(o => ({ text: o.text }))]);
      const added = saved.slice(oldOutcomes.length);
      created.outcomeIds.push(...added.map(o => o.id));
      const outcomeIds = new Map(added.map((o, i) => [plan.outcomes[i].code, o.id]));
      const lessonMap = new Map<string, string>();
      for (const planned of plan.modules) {
        const id = ctx.newId('m');
        const module: Module = { id, courseId: session.courseId, title: planned.title, objective: planned.objective, templateKey: planned.templateKey, position: planned.position };
        await ctx.repo.putModule(module); created.moduleIds.push(id);
        for (const [position, item] of planned.lessons.entries()) {
          const lid = ctx.newId('l'); lessonMap.set(item.key, lid);
          const lesson: Lesson = { id: lid, courseId: session.courseId, moduleId: id, title: item.title, objective: item.objective, minutes: item.minutes, position, status: 'draft', publishedAt: null, templateKey: item.skeleton === 'start-here' ? 'start-here' : null };
          await ctx.repo.putLesson(lesson); created.lessonIds.push(lid);
        }
        for (const [position, item] of planAssignments(planned).entries()) {
          const aid = ctx.newId('asg');
          const texts = tiltTexts(planned.objective, item.title);
          const instructions = texts.map((text, i) => block(ctx, aid, ctx.newId('b'), i, { type: 'text', text }, 'fixture', [], session.source.name, null));
          created.blockIds.push(...instructions.map(b => b.id));
          const assignment: Assignment = { id: aid, courseId: session.courseId, moduleId: id, title: item.title, position, status: 'draft', publishedAt: null, dueAt: item.dueAt, points: item.points, submissionType: 'text', instructions, rubric: rubricFor(aid, planned.objective, plan.outcomes.filter(o => item.outcomeCodes.includes(o.code)).map(o => o.text), item.points) };
          await ctx.repo.putAssignment(assignment); created.assignmentIds.push(aid);
          const ids = item.outcomeCodes.map(code => outcomeIds.get(code)).filter((v): v is string => !!v);
          await ctx.repo.setOutcomeLinks('assignment', aid, ids);
          created.linkKeys.push(...ids.map(oid => `assignment:${aid}:${oid}`));
        }
      }
      const work = plan.modules.flatMap(m => m.lessons.map(l => ({ lessonId: lessonMap.get(l.key)!, type: 'text' as const })));
      const job: GenerationJob = { id: jobId, courseId: session.courseId, requestedBy: user(ctx).id, kind: 'scaffold', sessionId, state: 'running', done: 0, total: work.length, lessonIds: [], error: null, work, instruction: leastSureModuleKey ?? '', failures: [], createdAt: ctx.now(), updatedAt: ctx.now() };
      claimed.record.appliedAt = ctx.now();
      await ctx.repo.putDesignSession(claimed);
      await ctx.repo.putGenerationJob(job);
      if (ctx.background) {
        try { job.runner = 'workflow'; await ctx.repo.putGenerationJob(job); await ctx.background.startGeneration(job.id); }
        catch { job.runner = 'poll'; await ctx.repo.putGenerationJob(job); }
      }
      return claimed;
    } catch (cause) {
      claimed.provisioning!.error = cause instanceof Error ? cause.message : 'Could not provision the course.';
      await ctx.repo.putDesignSession(claimed);
      throw cause;
    }
  },
  undoProvisionPlan: async (ctx, { sessionId }) => {
    const session = await sessionFor(ctx, sessionId);
    if (session.stage === 'preview') { session.stage = 'approaches'; session.selection = null; session.plan = null; await ctx.repo.putDesignSession(session); return { session, kept: [] }; }
    if (session.stage !== 'provisioning' && session.stage !== 'review') fail('invalid', 'There is no applied plan to undo.');
    const job = session.provisioning?.jobId ? await ctx.repo.getGenerationJob(session.provisioning.jobId) : null;
    if (job?.state === 'running') { job.state = 'failed'; job.error = 'Provisioning was undone.'; await ctx.repo.putGenerationJob(job); }
    session.stage = 'approaches';
    await ctx.repo.putDesignSession(session); // Stops an in-flight scaffold before it writes.
    const kept: Awaited<ReturnType<Service['undoProvisionPlan']>>['kept'] = [];
    const planned = session.plan;
    for (const id of session.created.blockIds) {
      const b = await ctx.repo.getBlock(id);
      if (!b) continue;
      if (b.aiState === 'draft' && b.previous === null) { await ctx.repo.setOutcomeLinks('block', id, []); await ctx.repo.deleteBlock(id); }
      else kept.push({ kind: 'block', id, title: b.type === 'document' ? b.title : b.type });
    }
    const plannedAssignments = planned?.modules.flatMap(m => planAssignments(m).map(a => ({ assignment: a, module: m }))) ?? [];
    for (const [index, id] of session.created.assignmentIds.entries()) {
      const a = await ctx.repo.getAssignment(id);
      if (!a) continue;
      const entry = plannedAssignments[index];
      const original = entry?.assignment;
      const expectedModuleId = entry ? session.created.moduleIds[planned!.modules.indexOf(entry.module)] : null;
      const expectedRubric = entry ? rubricFor(id, entry.module.objective, planned!.outcomes.filter(o => original!.outcomeCodes.includes(o.code)).map(o => o.text), original!.points) : [];
      const expectedTexts = entry ? tiltTexts(entry.module.objective, original!.title) : [];
      if (a.status === 'draft' && original && a.moduleId === expectedModuleId && a.title === original.title && a.position === plannedAssignments.slice(0, index).filter(row => row.module === entry.module).length && a.points === original.points && a.dueAt === original.dueAt && a.submissionType === 'text' && JSON.stringify(a.rubric) === JSON.stringify(expectedRubric) && a.instructions.length === 3 && a.instructions.every((b, i) => b.type === 'text' && b.text === expectedTexts[i] && b.aiState === 'draft' && b.previous === null)) { await ctx.repo.setOutcomeLinks('assignment', id, []); await ctx.repo.deleteAssignment(id); }
      else kept.push({ kind: 'assignment', id, title: a.title });
    }
    const plannedLessons = planned?.modules.flatMap(m => m.lessons.map((l, position) => ({ lesson: l, module: m, position }))) ?? [];
    for (const [index, id] of session.created.lessonIds.entries()) {
      const l = await ctx.repo.getLesson(id);
      if (!l) continue;
      const entry = plannedLessons[index];
      const original = entry?.lesson;
      const expectedModuleId = entry ? session.created.moduleIds[planned!.modules.indexOf(entry.module)] : null;
      if (l.status === 'draft' && original && l.moduleId === expectedModuleId && l.title === original.title && l.objective === original.objective && l.minutes === original.minutes && l.position === entry.position && !(await ctx.repo.listBlocks(id)).length) await ctx.repo.deleteLesson(id);
      else kept.push({ kind: 'lesson', id, title: l.title });
    }
    for (const [index, id] of session.created.moduleIds.entries()) {
      const m = await ctx.repo.getModule(id);
      if (!m) continue;
      const original = planned?.modules[index];
      if (original && m.title === original.title && m.position === original.position && m.objective === original.objective && (m.templateKey ?? null) === original.templateKey && !(await ctx.repo.listLessons({ moduleId: id })).length && !(await ctx.repo.listAssignments({ moduleId: id })).length) await ctx.repo.deleteModule(id);
      else kept.push({ kind: 'module', id, title: m.title });
    }
    const outcomes = await ctx.repo.listOutcomes(session.courseId);
    const links = await ctx.repo.listOutcomeLinks({ courseId: session.courseId });
    const remove = new Set(session.created.outcomeIds.filter((id, index) => !links.some(link => link.outcomeId === id) && outcomes.find(o => o.id === id)?.text === planned?.outcomes[index]?.text));
    for (const outcome of outcomes.filter(o => session.created.outcomeIds.includes(o.id) && !remove.has(o.id))) kept.push({ kind: 'outcome', id: outcome.id, title: outcome.text });
    if (remove.size) await saveCourseOutcomes(ctx, session.courseId, outcomes.filter(o => !remove.has(o.id)).map(o => ({ id: o.id, text: o.text })));
    session.record.undoneAt = ctx.now(); session.record.decisions.push({ at: ctx.now(), who: user(ctx).id, what: `Undid the provision plan; kept ${kept.length} edited or kept items.` });
    session.selection = null; session.plan = null; session.provisioning = null; session.created = { outcomeIds: [], moduleIds: [], lessonIds: [], blockIds: [], assignmentIds: [], linkKeys: [] }; session.updatedAt = ctx.now();
    await ctx.repo.putDesignSession(session);
    return { session, kept };
  },
  flagLessonAlternatives: async (ctx, { sessionId, lessonId }) => {
    const session = await sessionFor(ctx, sessionId); await aiEnabled(ctx);
    if (session.stage !== 'review') fail('invalid', 'Wait for the course draft.');
    await alternatives(ctx, session, lessonId);
    const lesson = await ctx.repo.getLesson(lessonId) ?? fail('not-found', 'Lesson not found.');
    const module = await ctx.repo.getModule(lesson.moduleId) ?? fail('not-found', 'Module not found.');
    const course = await ctx.repo.getCourse(session.courseId) ?? fail('not-found', 'Course not found.');
    const blocks = await ctx.repo.listBlocks(lessonId);
    return { lesson, moduleTitle: module.title, courseTitle: course.title, blocks, readiness: lessonReadiness(blocks) };
  },
};

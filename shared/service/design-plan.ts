import type { Assignment, Block, BlockContent, DesignSession, Lesson, Module, ProvisionPlan, RubricCriterion, SourceSpan } from '../domain';
import type { GenerationJob } from '../repo';
import type { Service, ServiceContext } from './context';
import { coveredWeeks, explicitAssessmentPoints, previewProvisionPlan as buildPlan } from '../design/plan';
import { courseSnapshot } from './readiness';
import { aiEnabled, canTeach, fail, provenance, user } from './helpers';
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
async function interruptedApply(ctx: ServiceContext, id: string): Promise<DesignSession> {
  const latest = await sessionFor(ctx, id);
  if (latest.stage === 'provisioning') fail('conflict', 'A course item changed while this plan was being applied. Undo this apply and review the plan again.');
  return latest;
}
const planAssignments = (module: ProvisionPlan['modules'][number]) => module.assignments?.length ? module.assignments : module.assignment ? [module.assignment] : [];
const plannedLinks = (session: DesignSession, kind: 'block' | 'assignment', id: string) => session.created.linkKeys.filter(key => key.startsWith(`${kind}:${id}:`)).map(key => key.slice(`${kind}:${id}:`.length));
function sourceForLesson(session: DesignSession, module: ProvisionPlan['modules'][number], lesson: ProvisionPlan['modules'][number]['lessons'][number]): SourceSpan[] {
  const schedule = session.extraction?.schedule ?? [];
  const spans = schedule.filter(row => row.span && lesson.week !== null && coveredWeeks(row).includes(lesson.week)).map(row => row.span!);
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
  const check = blocks.find(b => b.type === 'check') ?? fail('invalid', 'The scaffold needs an objective check.');
  const heading = blocks.find(b => b.type === 'heading') ?? { type: 'heading', level: 2, text: objective } as BlockContent;
  const activation = blocks.find(b => b.type === 'callout' && b.title !== 'Reading') ?? { type: 'callout', tone: 'info', title: 'Before you begin', text: `What would you need to know to ${objective.charAt(0).toLowerCase()}${objective.slice(1)}?` } as BlockContent;
  const body = blocks.find(b => b.type === 'text') ?? { type: 'text', text: `${objective}\n\n[Your example from class]` } as BlockContent;
  const extras = blocks.filter(b => b !== heading && b !== activation && b !== body && b !== check && b.type !== 'check' && b.type !== 'heading' && b.type !== 'text').slice(0, 2);
  const complete = [heading, activation, body, ...extras, check];
  validateNoLearningStyles(complete);
  return complete;
}
const block = (ctx: ServiceContext, lessonId: string, id: string, position: number, value: BlockContent, model: string, sources: SourceSpan[], sourceName: string, week: number | null): Block => ({ ...value, id, lessonId, position, origin: 'ai', aiState: 'draft', previous: null, updatedAt: ctx.now(), provenance: provenance(ctx, model, 'module-scaffold', `${model === 'rule-based starter' ? 'Rule-based starter because the AI draft did not validate. ' : ''}Drafted from your syllabus (${sources[0]?.page ? `p. ${sources[0].page}` : sources[0]?.section ? `§ ${sources[0].section}` : 'source'}${week ? `, Week ${week}` : ''}) and your answers`, sources.map((span, i) => ({ id: `${lessonId}-source-${i + 1}`, name: `${sourceName}${span.page ? ` p. ${span.page}` : span.section ? ` § ${span.section}` : ''}`, span }))) } as Block);
function rubricFor(id: string, objective: string, outcomes: string[], points: number): RubricCriterion[] {
  const descriptions = [objective, outcomes.join('; ') || objective, `Explain how the submitted work demonstrates ${objective.toLowerCase()}`];
  return ['Objective', 'Outcome evidence', 'Explanation'].map((title, i) => ({ id: `${id}-criterion-${i + 1}`, title, description: descriptions[i], levels: [{ id: 'met', title: 'Meets criterion', points: Math.round(points / 3 * 100) / 100, description: descriptions[i] }, { id: 'developing', title: 'Developing', points: Math.round(points / 6 * 100) / 100, description: `Partly demonstrates: ${descriptions[i]}` }, { id: 'not-yet', title: 'Not yet', points: 0, description: `Does not yet demonstrate: ${descriptions[i]}` }] }));
}
const tiltTexts = (objective: string, title: string) => [`Purpose\n${objective}`, `Task\nCreate a draft response to ${title}. [Your course-specific directions]`, `Criteria\nShow evidence for ${objective}. Use the rubric below.`];
async function alternatives(ctx: ServiceContext, session: DesignSession, lessonId: string) {
  const lesson = await ctx.repo.getLesson(lessonId) ?? fail('not-found', 'Lesson not found.');
  if (!session.created.lessonIds.includes(lessonId)) fail('invalid', 'Choose a lesson created by this plan.');
  const plannedModule = session.plan?.modules.find(module => session.planIds?.modules[module.key] === lesson.moduleId);
  const plannedLesson = plannedModule?.lessons.find(item => session.planIds?.lessons[item.key] === lessonId);
  const spans = plannedModule && plannedLesson ? sourceForLesson(session, plannedModule, plannedLesson) : [];
  const drafted: Block[] = [];
  for (const letter of ['A', 'B']) {
    const id = ctx.newId('b');
    const value: BlockContent = { type: 'document', title: `Alternative opening ${letter}`, sections: [{ heading: 'An optional way in', text: letter === 'A' ? `Ask learners what evidence would help them ${lesson.objective?.toLowerCase() ?? 'begin'}. [Your example from class]` : `Invite learners to compare two approaches to ${lesson.objective?.toLowerCase() ?? 'the topic'}. [Your contrasting example]` }] };
    drafted.push(block(ctx, lessonId, id, drafted.length, value, 'fixture', spans, session.source.name, plannedLesson?.week ?? null));
  }
  await ctx.repo.appendDesignAlternatives(session.id, session.applyRevision!, lessonId, drafted);
}

/** One lesson per durable step. Validate before the conditional scaffold commit. */
export async function advanceScaffoldJob(ctx: ServiceContext, job: GenerationJob): Promise<GenerationJob> {
  if (job.kind !== 'scaffold' || job.state !== 'running' || !job.sessionId) return job;
  const item = job.work[0];
  if (!item) return job;
  const session = await ctx.repo.getDesignSession(job.sessionId);
  if (!session || session.stage !== 'provisioning' || session.provisioning?.jobId !== job.id || !session.plan) return job;
  const lesson = await ctx.repo.getLesson(item.lessonId);
  const module = lesson ? await ctx.repo.getModule(lesson.moduleId) : null;
  const planModule = session.plan.modules.find(m => session.planIds?.modules[m.key] === module?.id);
  const planLesson = planModule?.lessons.find(l => session.planIds?.lessons[l.key] === item.lessonId);
  const spans = planModule && planLesson ? sourceForLesson(session, planModule, planLesson) : [];
  const unchanged = !!lesson && !!planLesson && !!module && module.title === planModule!.title && module.objective === planModule!.objective && module.position === planModule!.position && lesson.moduleId === session.planIds?.modules[planModule!.key] && lesson.title === planLesson.title && lesson.objective === planLesson.objective && lesson.minutes === planLesson.minutes && lesson.status === 'draft' && lesson.publishedAt === null && lesson.position === planModule!.lessons.indexOf(planLesson);
  let drafted: BlockContent[] = [];
  let model = 'fixture';
  let fallbackNote: string | null = null;
  let error: string | null = unchanged ? null : 'Lesson was edited, moved, or deleted before scaffolding.';
  if (unchanged && planModule && planLesson) try {
    if (planLesson.skeleton === 'start-here') {
      const profile = session.extraction?.profile.instructor.value;
      const contact = profile?.email || profile?.officeHours || 'Contact your instructor through the course message tool.';
      const baseline = (await fixtureAi.run('module-scaffold', { courseTitle: '', module: planModule, lesson: planLesson, skeleton: 'start-here', outcomes: session.plan.outcomes, spans, teachingNote: session.teachingNote, instructorProfile: null, priorLessonTitles: [] })).output.blocks.find(b => b.type === 'check')!;
      drafted = [
        { type: 'heading', level: 2, text: 'Start here' },
        { type: 'callout', tone: 'info', title: 'Before you begin', text: 'Find the course outline and note how to contact your instructor.' },
        { type: 'text', text: `Open the course outline to find each module and lesson. Work through the lessons in order, then review the draft assignments. Your instructor can be reached at ${contact}.\n\n[Your welcome and course navigation example]` },
        { type: 'text', text: `Course outcomes:\n${session.plan.outcomes.map(o => `${o.code}: ${o.text}`).join('\n')}\n\n${(await ctx.repo.getInstructorProfile(session.createdBy))?.disclosureText ?? DEFAULT_AI_DISCLOSURE}\n\n[Your AI-use guidance]` },
        ...Array.from({ length: 5 }, (_, i) => ({ ...baseline, question: `Baseline ${i + 1}: ${baseline.type === 'check' ? baseline.question : planLesson.objective}` } as BlockContent)),
      ];
    } else {
      const input = { courseTitle: (await ctx.repo.getCourse(session.courseId))?.title ?? '', module: planModule, lesson: planLesson, skeleton: planLesson.skeleton, outcomes: session.plan.outcomes.filter(o => planModule.outcomeCodes.includes(o.code)), spans, teachingNote: session.teachingNote, instructorProfile: await ctx.repo.getInstructorProfile(session.createdBy), priorLessonTitles: planModule.lessons.filter(l => l.key !== planLesson.key).map(l => l.title) };
      const readingSpans = session.plan.readings.filter(reading => reading.moduleKey === planModule.key && reading.week === planLesson.week).map(reading => reading.span);
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await ctx.ai.run('module-scaffold', input);
        try { drafted = scaffoldBlocks(result.output, planLesson.objective, session.source, readingSpans, planLesson.skeleton); model = result.model; break; }
        catch (cause) { if (attempt === 1) {
          const starter = await fixtureAi.run('module-scaffold', input);
          drafted = scaffoldBlocks(starter.output, planLesson.objective, session.source, readingSpans, planLesson.skeleton);
          model = 'rule-based starter';
          fallbackNote = 'The AI draft did not validate after two attempts; a rule-based starter was used.';
        } }
      }
      const reading = session.plan.readings.find(r => r.moduleKey === planModule.key && r.week === planLesson.week);
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
  if (!current || current.done !== job.done || current.state !== 'running' || (current.runner ?? 'poll') !== (job.runner ?? 'poll') || latest?.stage !== 'provisioning' || latest.applyRevision !== session.applyRevision) return current ?? job;
  const next: GenerationJob = { ...current, work: current.work.slice(1), done: current.done + 1, lessonIds: [...current.lessonIds], failures: [...current.failures], ...(fallbackNote ? { notes: [...(current.notes ?? []), { lessonId: item.lessonId, message: fallbackNote }] } : {}), updatedAt: ctx.now() };
  let blocks: Block[] = [];
  if (!error && lesson && planLesson && planModule) {
    blocks = drafted.map((value, i) => ({ ...block(ctx, lesson.id, `b-${job.id}-${job.done}-${i}`, i, value, model, spans, session.source.name, planLesson.week), templateKey: value.type === 'check' && planLesson.resurface ? 'spaced-review' : value.type === 'callout' && value.title === 'Weekly announcement draft slot' ? 'weekly-announcement' : value.type === 'callout' && value.title === 'Alternative format slot' ? 'alternative-format' : null } as Block));
    next.lessonIds.push(lesson.id);
  } else next.failures.push({ ...item, message: error ?? 'Scaffold validation failed.' });
  next.state = !next.work.length ? (next.failures.length === next.total ? 'failed' : 'done') : 'running';
  next.error = next.failures.length ? next.failures.map(f => `${f.lessonId}: ${f.message}`).join('\n') : null;
  let before = 0;
  const nextSession: DesignSession = { ...latest, createdBlocks: { ...latest.createdBlocks, ...Object.fromEntries(blocks.map(b => [b.id, b])) }, created: { ...latest.created, blockIds: [...latest.created.blockIds, ...blocks.map(b => b.id)], linkKeys: [...latest.created.linkKeys] }, provisioning: { jobId: next.id, done: next.done, total: next.total, error: next.error, modules: session.plan.modules.map(m => { const total = m.lessons.length; const done = Math.max(0, Math.min(total, next.done - before)); before += total; return { key: m.key, done, total }; }) }, stage: next.work.length ? 'provisioning' : 'review', updatedAt: ctx.now() };
  const ids = planModule ? session.plan.outcomes.filter(o => planModule.outcomeCodes.includes(o.code)).map(o => session.planIds?.outcomes[o.code]).filter((id): id is string => !!id) : [];
  nextSession.created.linkKeys.push(...blocks.flatMap(b => b.type === 'check' || b.type === 'scenario' ? ids.map(oid => `block:${b.id}:${oid}`) : []));
  let committed = false, writeError: string | null = null;
  try { committed = await ctx.repo.commitDesignScaffold(session.id, session.applyRevision!, current, next, blocks.length ? lesson : null, blocks, ids, nextSession); }
  catch (cause) { writeError = cause instanceof Error ? cause.message : 'Could not save scaffold.'; }
  if (!committed && blocks.length) {
    // A human edit won the race. Consume this item without touching the lesson.
    next.lessonIds = current.lessonIds;
    next.failures.push({ ...item, message: writeError ?? 'Lesson was edited while its scaffold was being drafted.' });
    next.error = next.failures.map(f => `${f.lessonId}: ${f.message}`).join('\n');
    next.state = !next.work.length && next.failures.length === next.total ? 'failed' : next.state;
    nextSession.created = latest.created;
    nextSession.provisioning!.error = next.error;
    if (!await ctx.repo.commitDesignScaffold(session.id, session.applyRevision!, current, next, null, [], [], nextSession)) return await ctx.repo.getGenerationJob(job.id) ?? job;
  } else if (!committed) return await ctx.repo.getGenerationJob(job.id) ?? job;
  if (!next.work.length && next.state === 'done') {
    const fresh = await ctx.repo.getDesignSession(session.id);
    const moduleId = fresh?.planIds?.modules[current.instruction];
    const planned = fresh?.plan?.modules.find(m => m.key === current.instruction);
    const firstId = planned?.lessons[0] && fresh?.planIds?.lessons[planned.lessons[0].key];
    if (fresh && moduleId && firstId) await alternatives(ctx, fresh, firstId);
  }
  return next;
}

export const designPlan: Pick<Service, 'previewProvisionPlan' | 'confirmDesignPoints' | 'applyProvisionPlan' | 'undoProvisionPlan' | 'flagLessonAlternatives'> = {
  confirmDesignPoints: async (ctx, { sessionId, points }) => {
    const session = await sessionFor(ctx, sessionId);
    if (session.stage !== 'preview' || !session.extraction) fail('conflict', STALE);
    const missing = session.extraction!.assessments.filter(a => a.weightPercent === null && explicitAssessmentPoints(a.span, a.title) === null);
    const ids = new Set(missing.map(a => a.id));
    if (Object.keys(points).some(id => !ids.has(id)) || missing.some(a => !Number.isFinite(points[a.id]) || points[a.id] <= 0)) fail('invalid', 'Confirm a positive points value for every unresolved assessment.');
    if (!await ctx.repo.saveDesignPoints(sessionId, points)) fail('conflict', STALE);
    return sessionFor(ctx, sessionId);
  },
  previewProvisionPlan: async (ctx, { sessionId }) => {
    const session = await sessionFor(ctx, sessionId);
    if (session.stage !== 'preview') fail('invalid', 'Choose an approach first.');
    const plan = buildPlan(session, await courseSnapshot(ctx, session.courseId), await ctx.repo.getInstructorProfile(session.createdBy));
    if (!await ctx.repo.saveDesignPreview(session.id, session.confirmedPoints ?? {}, plan, ctx.now())) fail('conflict', STALE);
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
    const jobId = ctx.newId('gj'), revision = ctx.newId('rev');
    const claimed: DesignSession = { ...session, applyRevision: revision, legacyApply: false, outcomeCodeMap: {}, planIds: { modules: {}, lessons: {}, assignments: {}, outcomes: {} }, createdBlocks: {}, undoKept: [],
      created: { outcomeIds: [], moduleIds: [], lessonIds: [], blockIds: [], assignmentIds: [], linkKeys: [] }, plan, stage: 'provisioning',
      provisioning: { jobId, done: 0, total: plan.counts.lessons, error: null, modules: plan.modules.map(module => ({ key: module.key, done: 0, total: module.lessons.length })) },
      record: { ...session.record, plan, appliedAt: ctx.now() }, updatedAt: ctx.now() };
    if (!await ctx.repo.claimDesignApply(claimed)) {
      const latest = await sessionFor(ctx, sessionId);
      if ((latest.stage === 'provisioning' || latest.stage === 'review') && latest.plan?.hash === hash) return latest;
      fail('conflict', STALE);
    }
    const outcomeIds = new Map<string, string>();
    try {
      for (const [index, item] of plan.outcomes.entries()) {
        const id = ctx.newId('o');
        outcomeIds.set(item.code, id);
      }
      const allocated = await ctx.repo.appendDesignOutcomes(session.id, revision, plan.outcomes.map((item, index) => ({ id: outcomeIds.get(item.code)!, courseId: session.courseId, code: item.code, text: item.text, position: oldOutcomes.length + index })));
      if (!allocated) {
        const message = `This plan needs ${plan.outcomes.length} outcome slots, but the course no longer has room for all of them. Review the plan again.`;
        if (await ctx.repo.resetDesignCapacityFailure(session.id, revision, message)) fail('conflict', message);
        return await interruptedApply(ctx, sessionId);
      }
      const codeMap = Object.fromEntries(plan.outcomes.map((item, index) => [item.code, allocated[index].code]));
      const outcomeIdsByCode = Object.fromEntries(allocated.map(item => [item.code, item.id]));
      const appliedPlan: ProvisionPlan = { ...plan, outcomes: plan.outcomes.map(o => ({ ...o, code: codeMap[o.code] })), modules: plan.modules.map(m => ({ ...m, outcomeCodes: m.outcomeCodes.map(c => codeMap[c] ?? c), assignments: m.assignments?.map(a => ({ ...a, outcomeCodes: a.outcomeCodes.map(c => codeMap[c] ?? c) })) ?? [], assignment: m.assignment ? { ...m.assignment, outcomeCodes: m.assignment.outcomeCodes.map(c => codeMap[c] ?? c) } : null })) };
      if (!await ctx.repo.saveDesignAppliedPlan(session.id, revision, appliedPlan, codeMap, outcomeIdsByCode)) return await interruptedApply(ctx, sessionId);
      const lessonMap = new Map<string, string>();
      for (const planned of appliedPlan.modules) {
        const id = ctx.newId('m');
        const module: Module = { id, courseId: session.courseId, title: planned.title, objective: planned.objective, templateKey: planned.templateKey, position: planned.position };
        if (!await ctx.repo.putDesignModule(session.id, revision, planned.key, module)) return await interruptedApply(ctx, sessionId);
        planned.position = (await ctx.repo.getModule(id))!.position;
        for (const [position, item] of planned.lessons.entries()) {
          const lid = ctx.newId('l'); lessonMap.set(item.key, lid);
          const lesson: Lesson = { id: lid, courseId: session.courseId, moduleId: id, title: item.title, objective: item.objective, minutes: item.minutes, position, status: 'draft', publishedAt: null, templateKey: item.skeleton === 'start-here' ? 'start-here' : null };
          if (!await ctx.repo.putDesignLesson(session.id, revision, item.key, lesson)) return await interruptedApply(ctx, sessionId);
        }
        for (const [position, item] of planAssignments(planned).entries()) {
          const aid = ctx.newId('asg');
          const instructions = tiltTexts(planned.objective, item.title).map((text, i) => block(ctx, aid, ctx.newId('b'), i, { type: 'text', text }, 'fixture', [], session.source.name, null));
          const assignment: Assignment = { id: aid, courseId: session.courseId, moduleId: id, title: item.title, position, status: 'draft', publishedAt: null, dueAt: item.dueAt, points: item.points, submissionType: 'text', instructions, rubric: rubricFor(aid, planned.objective, appliedPlan.outcomes.filter(o => item.outcomeCodes.includes(o.code)).map(o => o.text), item.points) };
          const ids = item.outcomeCodes.map(code => outcomeIds.get(Object.keys(codeMap).find(old => codeMap[old] === code) ?? code)).filter((v): v is string => !!v);
          if (!await ctx.repo.putDesignAssignment(session.id, revision, item.key, assignment, ids)) return await interruptedApply(ctx, sessionId);
        }
      }
      if (!await ctx.repo.saveDesignAppliedPlan(session.id, revision, appliedPlan, codeMap, outcomeIdsByCode)) return await interruptedApply(ctx, sessionId);
      const work = appliedPlan.modules.flatMap(m => m.lessons.map(l => ({ lessonId: lessonMap.get(l.key)!, type: 'text' as const })));
      const job: GenerationJob = { id: jobId, courseId: session.courseId, requestedBy: user(ctx).id, kind: 'scaffold', sessionId, state: 'running', done: 0, total: work.length, lessonIds: [], error: null, work, instruction: leastSureModuleKey ?? '', failures: [], createdAt: ctx.now(), updatedAt: ctx.now() };
      if (!await ctx.repo.startDesignJob(session.id, revision, job)) return await interruptedApply(ctx, sessionId);
      if (ctx.background && await ctx.repo.setDesignRunner(session.id, revision, job.id, 'workflow')) {
        try { await ctx.background.startGeneration(job.id); }
        catch { await ctx.repo.setDesignRunner(session.id, revision, job.id, 'poll'); }
      }
      return sessionFor(ctx, sessionId);
    } catch (cause) {
      await ctx.repo.setDesignApplyError(session.id, revision, cause instanceof Error ? cause.message : 'Could not provision the course.');
      throw cause;
    }
  },
  undoProvisionPlan: async (ctx, { sessionId }) => {
    let session = await sessionFor(ctx, sessionId);
    if (session.stage === 'preview') { if (!await ctx.repo.revertDesignPreview(session.id)) fail('conflict', 'The plan changed while returning to approaches.'); return { session: await sessionFor(ctx, sessionId), kept: [] }; }
    if (session.stage !== 'provisioning' && session.stage !== 'review' && session.stage !== 'undoing') fail('invalid', 'There is no applied plan to undo.');
    let undoRevision = session.applyRevision!;
    if (session.stage !== 'undoing') {
      undoRevision = ctx.newId('rev');
      if (!session.applyRevision || !await ctx.repo.cancelDesignApply(session.id, session.applyRevision, undoRevision)) fail('conflict', 'The plan changed while undo was starting.');
      session = await sessionFor(ctx, sessionId);
    }
    const kept: Awaited<ReturnType<Service['undoProvisionPlan']>>['kept'] = [];
    const planned = session.plan;
    for (const id of session.created.blockIds) {
      const b = await ctx.repo.getBlock(id);
      if (!b) continue;
      const expected = session.createdBlocks?.[id];
      if (!expected || !await ctx.repo.deleteDesignBlockIfDraft(session.id, undoRevision, expected, plannedLinks(session, 'block', id))) kept.push({ kind: 'block', id, title: b.type === 'document' ? b.title : b.type });
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
      if (!session.legacyApply && a.status === 'draft' && original && a.moduleId === expectedModuleId && a.title === original.title && a.position === plannedAssignments.slice(0, index).filter(row => row.module === entry.module).length && a.points === original.points && a.dueAt === original.dueAt && a.submissionType === 'text' && JSON.stringify(a.rubric) === JSON.stringify(expectedRubric) && a.instructions.length === 3 && a.instructions.every((b, i) => b.type === 'text' && b.text === expectedTexts[i] && b.aiState === 'draft' && b.previous === null)) { if (!await ctx.repo.deleteDesignAssignmentIfUnchanged(session.id, undoRevision, a, plannedLinks(session, 'assignment', id))) kept.push({ kind: 'assignment', id, title: a.title }); }
      else kept.push({ kind: 'assignment', id, title: a.title });
    }
    const plannedLessons = planned?.modules.flatMap(m => m.lessons.map((l, position) => ({ lesson: l, module: m, position }))) ?? [];
    for (const [index, id] of session.created.lessonIds.entries()) {
      const l = await ctx.repo.getLesson(id);
      if (!l) continue;
      const entry = plannedLessons[index];
      const original = entry?.lesson;
      const expectedModuleId = entry ? session.created.moduleIds[planned!.modules.indexOf(entry.module)] : null;
      if (l.status === 'draft' && original && l.moduleId === expectedModuleId && l.title === original.title && l.objective === original.objective && l.minutes === original.minutes && l.position === entry.position && !(await ctx.repo.listBlocks(id)).length && await ctx.repo.deleteDesignLessonIfUnchanged(session.id, undoRevision, l)) { /* removed */ }
      else kept.push({ kind: 'lesson', id, title: l.title });
    }
    for (const [index, id] of session.created.moduleIds.entries()) {
      const m = await ctx.repo.getModule(id);
      if (!m) continue;
      const original = planned?.modules[index];
      if (original && m.title === original.title && m.position === original.position && m.objective === original.objective && (m.templateKey ?? null) === original.templateKey && !(await ctx.repo.listLessons({ moduleId: id })).length && !(await ctx.repo.listAssignments({ moduleId: id })).length && await ctx.repo.deleteDesignModuleIfUnchanged(session.id, undoRevision, m)) { /* removed */ }
      else kept.push({ kind: 'module', id, title: m.title });
    }
    for (const [index, id] of session.created.outcomeIds.entries()) {
      const outcome = await ctx.repo.listOutcomes(session.courseId).then(rows => rows.find(row => row.id === id));
      if (outcome && (session.legacyApply || !await ctx.repo.deleteDesignOutcomeIfUnused(session.id, undoRevision, id, planned?.outcomes[index]?.text ?? ''))) kept.push({ kind: 'outcome', id, title: outcome.text });
    }
    session.record.undoneAt = ctx.now(); session.record.decisions.push({ at: ctx.now(), who: user(ctx).id, what: `Undid the provision plan; kept ${kept.length} edited or kept items.` });
    session.undoKept = kept; session.selection = null; session.plan = null; session.provisioning = null; session.planIds = { modules: {}, lessons: {}, assignments: {}, outcomes: {} }; session.createdBlocks = {}; session.created = { outcomeIds: [], moduleIds: [], lessonIds: [], blockIds: [], assignmentIds: [], linkKeys: [] }; session.stage = 'approaches'; session.legacyApply = false; session.updatedAt = ctx.now();
    if (!await ctx.repo.finishDesignUndo(session.id, undoRevision, session)) fail('conflict', 'The plan changed while undo was finishing.');
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

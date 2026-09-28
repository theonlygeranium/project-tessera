import type { Rubric, RubricItem } from '../domain';
import type { RubricInput } from '../api';
import { ApiError } from '../api';
import { AUTOMATIC_CHECKS, BUILT_IN_RUBRICS, DEFAULT_READINESS_POLICY, blockText, builtInRubric, canAttest, evaluateReadiness, type CourseSnapshot } from '../quality';
import { effectiveTemplateId } from '../templates/model';
import type { StoredReadinessItem } from '../repo';
import type { Service, ServiceContext } from './context';
import { aiEnabled, course, fail, provenance, user } from './helpers';

async function staff(ctx: ServiceContext, courseId: string) {
  const c = await course(ctx, courseId); const u = user(ctx);
  if (u.role !== 'administrator' && (u.role !== 'instructor' || !c.instructorIds.includes(u.id))) fail('forbidden', 'You cannot review this course.');
  return c;
}
async function admin(ctx: ServiceContext) { if (user(ctx).role !== 'administrator') fail('forbidden', 'Administrator access is required.'); }
async function rubricFor(ctx: ServiceContext, id: string): Promise<Rubric> { return builtInRubric(id) ?? await ctx.repo.getRubric(id) ?? fail('not-found', 'Rubric not found.'); }
async function selected(ctx: ServiceContext, rubricId?: string) { return rubricFor(ctx, rubricId ?? (await ctx.repo.getInstitution()).readinessPolicy?.rubricId ?? DEFAULT_READINESS_POLICY.rubricId); }
function itemFor(rubric: Rubric, itemId: string): RubricItem { return rubric.standards.flatMap(s => s.items).find(i => i.id === itemId) ?? fail('not-found', 'Rubric item not found.'); }
async function stored(ctx: ServiceContext, courseId: string, rubricId: string, itemId: string): Promise<StoredReadinessItem> {
  return (await ctx.repo.listReadinessItems(courseId, rubricId)).find(i => i.itemId === itemId) ?? { courseId, rubricId, itemId, finding: null, attestation: null, updatedAt: ctx.now() };
}

export async function courseSnapshot(ctx: ServiceContext, courseId: string): Promise<CourseSnapshot> {
  const c = await staff(ctx, courseId);
  const [institution, modules, lessons, assignments, outcomes, outcomeLinks, scans] = await Promise.all([
    ctx.repo.getInstitution(), ctx.repo.listModules(courseId), ctx.repo.listLessons({ courseId }), ctx.repo.listAssignments({ courseId }),
    ctx.repo.listOutcomes(courseId), ctx.repo.listOutcomeLinks({ courseId }), ctx.repo.listScans({ courseId }),
  ]);
  const blocks = Object.fromEntries(await Promise.all(lessons.map(async lesson => [lesson.id, await ctx.repo.listBlocks(lesson.id)] as const)));
  const program = c.programId ? await ctx.repo.getProgram(c.programId) : null;
  const templateId = effectiveTemplateId(c, program, institution);
  const template = templateId ? await ctx.repo.getTemplate(templateId) : null;
  const instructors = (await Promise.all(c.instructorIds.map(id => ctx.repo.getUser(id)))).filter((u): u is NonNullable<typeof u> => !!u).map(({ id, name, email }) => ({ id, name, email }));
  const latest = new Map<string, number>();
  for (const scan of scans) { const key = scan.target.kind === 'lesson' ? `lesson:${scan.target.lessonId}` : `file:${scan.target.fileId}`; if (!latest.has(key)) latest.set(key, scan.score); }
  const scores = [...latest.values()];
  return { course: c, modules, lessons, blocks, assignments, outcomes, outcomeLinks,
    access: { score: scores.length ? Math.round(scores.reduce((n, score) => n + score, 0) / scores.length) : null,
      minimum: Math.max(institution.accessPolicy.minimumScore, template?.accessFloor ?? 0) }, template, instructors };
}

function customRubric(ctx: ServiceContext, id: string, input: RubricInput, previous?: Rubric): Rubric {
  if (!input.name.trim()) fail('invalid', 'Rubric name is required.');
  const standards = input.standards.map((s, si) => {
    const standardNumber = s.number.trim();
    if (!standardNumber || !s.title.trim()) fail('invalid', 'Every standard needs a number and title.');
    const standardId = previous?.standards.find(x => x.number === standardNumber)?.id ?? `${id}-s${standardNumber}`;
    return { id: standardId, number: standardNumber, title: s.title.trim(), description: s.description?.trim() ?? '', items: s.items.map((item, ii) => {
      const number = item.number.trim();
      if (!number || !item.text.trim()) fail('invalid', 'Every rubric item needs a number and text.');
      if (item.kind === 'automatic' && (!item.check || !(item.check in AUTOMATIC_CHECKS))) fail('invalid', 'Automatic items need a valid check.');
      if (item.kind !== 'automatic' && item.check) fail('invalid', 'Only automatic items may have a check.');
      return { id: previous?.standards.find(x => x.number === standardNumber)?.items.find(x => x.number === number)?.id ?? `${id}-i${number}`, number, text: item.text.trim(), kind: item.kind, check: item.kind === 'automatic' ? item.check! : null, criteria: item.criteria?.trim() ?? '' };
    }) };
  });
  const ids = standards.flatMap(s => [s.id, ...s.items.map(i => i.id)]);
  if (new Set(ids).size !== ids.length) fail('invalid', 'Rubric numbers must be unique.');
  return { id, name: input.name.trim(), source: 'custom', version: input.version?.trim() || '1.0', attribution: input.attribution?.trim() || null, builtIn: false, standards, updatedAt: ctx.now() };
}

function digest(s: CourseSnapshot) {
  const parts = [{ label: 'Course welcome', text: s.course.welcome }, { label: 'Course description', text: s.course.description },
    { label: 'Outcomes', text: s.outcomes.map(o => `${o.code}: ${o.text}`).join('\n') },
    ...s.modules.map(m => ({ label: `Module: ${m.title} objective`, text: m.objective ?? '' })),
    ...s.lessons.map(l => ({ label: `Lesson: ${l.title}`, text: (s.blocks[l.id] ?? []).map(blockText).join('\n\n') })),
    ...s.assignments.map(a => ({ label: `Assignment: ${a.title}`, text: a.instructions.map(blockText).join('\n\n') }))];
  const size = () => parts.reduce((n, p) => n + p.label.length + p.text.length, 0);
  while (size() > 12000) {
    const lessons = parts.filter(p => p.label.startsWith('Lesson: ') && p.text.length);
    const longest = lessons.sort((a, b) => b.text.length - a.text.length)[0];
    if (!longest) break;
    longest.text = longest.text.slice(0, Math.max(0, longest.text.length - (size() - 12000)));
  }
  while (size() > 12000) {
    const longest = [...parts].sort((a, b) => b.text.length - a.text.length)[0];
    if (!longest?.text.length) break;
    longest.text = longest.text.slice(0, Math.max(0, longest.text.length - (size() - 12000)));
  }
  return parts.filter(p => p.text.trim()).map(p => ({ label: p.label, text: p.text }));
}

export const readiness: Pick<Service, 'listRubrics' | 'getRubric' | 'createRubric' | 'updateRubric' | 'deleteRubric' | 'updateReadinessPolicy' | 'getCourseReadiness' | 'runReadinessAi' | 'reviewFinding' | 'attestItem' | 'clearAttestation'> = {
  listRubrics: async ctx => { if (user(ctx).role === 'student') fail('forbidden', 'Staff only.'); return [...BUILT_IN_RUBRICS, ...await ctx.repo.listRubrics()]; },
  getRubric: async (ctx, { rubricId }) => { if (user(ctx).role === 'student') fail('forbidden', 'Staff only.'); return rubricFor(ctx, rubricId); },
  createRubric: async (ctx, input) => { await admin(ctx); const rubric = customRubric(ctx, ctx.newId('rubric'), input); await ctx.repo.putRubric(rubric); return rubric; },
  updateRubric: async (ctx, input) => { await admin(ctx); const old = await rubricFor(ctx, input.rubricId); if (old.builtIn) fail('forbidden', "Built-in rubrics can't be edited."); const rubric = customRubric(ctx, old.id, { name: input.name ?? old.name, version: input.version ?? old.version, attribution: input.attribution ?? old.attribution, standards: input.standards ?? old.standards }, old); await ctx.repo.putRubric(rubric); return rubric; },
  deleteRubric: async (ctx, { rubricId }) => { await admin(ctx); const rubric = await rubricFor(ctx, rubricId); if (rubric.builtIn) fail('forbidden', "Built-in rubrics can't be edited."); if (((await ctx.repo.getInstitution()).readinessPolicy ?? DEFAULT_READINESS_POLICY).rubricId === rubricId) fail('conflict', 'The readiness policy uses this rubric.'); await ctx.repo.deleteRubric(rubricId); return { ok: true }; },
  updateReadinessPolicy: async (ctx, policy) => { await admin(ctx); await rubricFor(ctx, policy.rubricId); if (policy.minimumPercent !== null && (!Number.isInteger(policy.minimumPercent) || policy.minimumPercent < 0 || policy.minimumPercent > 100)) fail('invalid', 'Minimum must be 0–100 or advisory.'); const institution = await ctx.repo.getInstitution(); institution.readinessPolicy = policy; await ctx.repo.putInstitution(institution); return institution; },
  getCourseReadiness: async (ctx, { courseId, rubricId }) => { await staff(ctx, courseId); const rubric = await selected(ctx, rubricId); const institution = await ctx.repo.getInstitution(); return evaluateReadiness(rubric, await courseSnapshot(ctx, courseId), await ctx.repo.listReadinessItems(courseId, rubric.id), institution.readinessPolicy ?? DEFAULT_READINESS_POLICY, ctx.now()); },
  runReadinessAi: async (ctx, { courseId, rubricId, itemIds }) => {
    await staff(ctx, courseId); await aiEnabled(ctx); const rubric = await selected(ctx, rubricId);
    const items = rubric.standards.flatMap(s => s.items);
    if (itemIds?.some(id => !items.some(i => i.id === id && i.kind === 'ai'))) fail('invalid', 'Choose only AI-assisted items in this rubric.');
    const chosen = itemIds ? items.filter(i => itemIds.includes(i.id)) : items.filter(i => i.kind === 'ai');
    const snapshot = await courseSnapshot(ctx, courseId), content = digest(snapshot);
    let succeeded = 0;
    const failures: { itemId: string; message: string }[] = [];
    for (const item of chosen) {
      try {
        const result = await ctx.ai.run('readiness-item', { courseTitle: snapshot.course.title, item: { number: item.number, text: item.text, criteria: item.criteria }, content });
        if (!['likely-met', 'likely-not-met', 'unclear'].includes(result.output.verdict)) throw Error('Invalid AI verdict.');
        const row = await stored(ctx, courseId, rubric.id, item.id);
        row.finding = { ...result.output, provenance: provenance(ctx, result.model, 'readiness-item', `Judged item ${item.number} against the course`), state: 'draft', reviewedBy: null, reviewedAt: null };
        row.updatedAt = ctx.now(); await ctx.repo.putReadinessItem(row); succeeded++;
      } catch (error) { failures.push({ itemId: item.id, message: error instanceof Error ? error.message : 'AI check failed.' }); }
    }
    if (chosen.length && !succeeded) throw new ApiError('ai-failed', `AI checks failed for all ${chosen.length} items.`, { failures });
    return readiness.getCourseReadiness(ctx, { courseId, rubricId: rubric.id });
  },
  reviewFinding: async (ctx, { courseId, itemId, rubricId, decision }) => { await staff(ctx, courseId); const rubric = await selected(ctx, rubricId); const item = itemFor(rubric, itemId); if (item.kind !== 'ai') fail('invalid', 'This item has no AI finding.'); const row = await stored(ctx, courseId, rubric.id, itemId); const finding = row.finding ?? fail('not-found', 'Finding not found.'); row.finding = { ...finding, state: decision === 'accept' ? 'accepted' : 'dismissed', reviewedBy: user(ctx).id, reviewedAt: ctx.now() }; row.updatedAt = ctx.now(); await ctx.repo.putReadinessItem(row); return readiness.getCourseReadiness(ctx, { courseId, rubricId: rubric.id }); },
  attestItem: async (ctx, { courseId, itemId, rubricId, status, note }) => { await staff(ctx, courseId); const rubric = await selected(ctx, rubricId), item = itemFor(rubric, itemId); if (!canAttest(item, status) || note.length > 2000 || (status === 'not-applicable' && !note.trim())) fail('invalid', 'This attestation is not valid.'); const row = await stored(ctx, courseId, rubric.id, itemId), reviewer = user(ctx); row.attestation = { status, by: reviewer.id, byName: reviewer.name, note: note.trim(), at: ctx.now() }; row.updatedAt = ctx.now(); await ctx.repo.putReadinessItem(row); return readiness.getCourseReadiness(ctx, { courseId, rubricId: rubric.id }); },
  clearAttestation: async (ctx, { courseId, itemId, rubricId }) => { await staff(ctx, courseId); const rubric = await selected(ctx, rubricId); itemFor(rubric, itemId); const row = await stored(ctx, courseId, rubric.id, itemId); row.attestation = null; row.updatedAt = ctx.now(); await ctx.repo.putReadinessItem(row); return readiness.getCourseReadiness(ctx, { courseId, rubricId: rubric.id }); },
};

import { describe, expect, it } from 'vitest';
import { fixtureAi } from '../ai';
import { automaticCheck } from '../quality/evaluate';
import { seedData } from '../seed';
import sampleSyllabus from '../seed-syllabus.json';
import type { ServiceContext } from './context';
import { courseSnapshot } from './readiness';
import { MemoryRepo, service } from './index';
import { advanceScaffoldJob, scaffoldBlocks } from './design-plan';
import { explicitAssessmentPoints, titleOverlap } from '../design/plan';

async function setup(empty = false): Promise<{ ctx: ServiceContext; sessionId: string }> {
  const repo = new MemoryRepo(seedData()); let n = 0;
  if (empty) {
    const base = (await repo.getCourse('c-stat110'))!;
    await repo.putCourse({ ...base, id: 'c-plan-empty', outcomes: [] });
  }
  const ctx: ServiceContext = { repo, ai: fixtureAi, user: await repo.getUser('u-okafor'), now: () => '2026-09-28T12:00:00.000Z', newId: prefix => `${prefix}-plan-${++n}` };
  const started = await service.createDesignSession(ctx, { courseId: empty ? 'c-plan-empty' : 'c-stat110', sourceKind: 'syllabus', sample: true, consent: { syllabusOnly: true, rememberProfile: false } });
  await service.advanceDesignSession(ctx, { sessionId: started.id });
  const read = await service.advanceDesignSession(ctx, { sessionId: started.id });
  await service.confirmOutcomes(ctx, { sessionId: started.id, outcomes: read.extraction!.outcomes.map((item, i) => ({ code: `O${i + 1}`, text: item.text, originalText: item.text })) });
  const options = await service.advanceDesignSession(ctx, { sessionId: started.id });
  await service.selectApproach(ctx, { sessionId: started.id, optionIds: [options.options![0].id], overlays: ['bookends', 'spaced-review'], rationale: 'Repeated practice fits this group.' });
  return { ctx, sessionId: started.id };
}
async function finish(ctx: ServiceContext, sessionId: string) {
  let state = await service.advanceDesignSession(ctx, { sessionId });
  for (let i = 0; i < 40 && state.stage === 'provisioning'; i++) state = await service.advanceDesignSession(ctx, { sessionId });
  expect(state.stage).toBe('review');
  return state;
}

describe('syllabus provision plan', () => {
  it('places STAT 110 occurrences by schedule week and preserves their shares', async () => {
    const { ctx, sessionId } = await setup();
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    const again = await service.previewProvisionPlan(ctx, { sessionId });
    expect(again.hash).toBe(plan.hash);
    const entries = plan.modules.flatMap(module => (module.assignments ?? []).map(assignment => ({ module, assignment })));
    for (const [component, title, weeks, total] of [
      ['Weekly quizzes', 'Quiz', [3, 5, 7, 10, 12], 15],
      ['Homework sets', 'HW', [2, 4, 6, 9, 11, 13], 20],
    ] as const) {
      const items = entries.filter(entry => entry.assignment.replaces === component);
      expect(items.map(entry => entry.assignment.title)).toEqual(weeks.map((_, i) => `${title} ${i + 1}`));
      expect(items.map(entry => entry.module.lessons[0].week)).toEqual(weeks);
      expect(items.reduce((sum, entry) => sum + entry.assignment.points, 0)).toBeCloseTo(total, 8);
    }
    const midterm = entries.find(entry => entry.assignment.replaces === 'Midterm exam')!;
    expect(midterm.module.lessons[0].week).toBe(7);
    expect(midterm.assignment.placement).toContain('nearest content module, Week 7');
    const project = entries.find(entry => entry.assignment.replaces === 'Course project')!;
    expect(project.module.lessons[0].week).toBe(14);
    expect(project.assignment.dueAt).toBe('2026-12-04');
    expect(entries.find(entry => entry.assignment.replaces === 'Participation')?.module.key).toBe('start-here');
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    await finish(ctx, sessionId);
    const undone = await service.undoProvisionPlan(ctx, { sessionId });
    expect(undone.session.created.assignmentIds).toEqual([]);
    expect((await ctx.repo.listAssignments({ courseId: 'c-stat110' })).some(item => item.title === 'Quiz 3')).toBe(false);
  });
  it('places numbered labs and discussions, a stated brief week, and final exam', async () => {
    const { ctx, sessionId } = await setup();
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    const row = session.extraction!.schedule[0];
    session.extraction!.schedule = Array.from({ length: 16 }, (_, index) => ({ ...row, week: index + 1, topic: `Topic ${index + 1}`, due: [index < 10 ? `Lab ${index + 1}` : '', index < 10 ? `Discussion ${index + 1}` : ''].filter(Boolean).join(', '), empty: false }));
    session.extraction!.schedule[11] = { ...session.extraction!.schedule[11], topic: 'Fall break', due: '' };
    const template = session.options![0].modules[0];
    session.options![0].modules = session.extraction!.schedule.map(row => ({ ...template, title: row.topic, weeks: [row.week] }));
    session.extraction!.assessments = [
      { id: 'labs', title: 'Analysis labs (10)', weightPercent: 20, dueAt: null, format: 'lab', span: null },
      { id: 'discussions', title: 'Studio discussions (10)', weightPercent: 15, dueAt: null, format: 'discussion', span: null },
      { id: 'checkpoints', title: 'Weekly adaptive checkpoints', weightPercent: 15, dueAt: null, format: 'checkpoint', span: null },
      { id: 'brief', title: 'Applied brief #1 (Week 7)', weightPercent: 20, dueAt: null, format: 'brief', span: null },
      { id: 'final', title: 'Final exam', weightPercent: 30, dueAt: null, format: 'exam', span: null },
    ];
    await ctx.repo.putDesignSession(session);
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    const entries = plan.modules.flatMap(module => (module.assignments ?? []).map(assignment => ({ module, assignment })));
    for (const name of ['Analysis labs (10)', 'Studio discussions (10)']) {
      const items = entries.filter(entry => entry.assignment.replaces === name);
      expect(items).toHaveLength(10);
      expect(items.map(entry => entry.module.lessons[0].week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(items.reduce((sum, entry) => sum + entry.assignment.points, 0)).toBeCloseTo(name.startsWith('Analysis') ? 20 : 15, 8);
    }
    expect(entries.filter(entry => entry.assignment.replaces === 'Weekly adaptive checkpoints')).toHaveLength(15);
    expect(entries.some(entry => entry.module.lessons[0].week === 12 && entry.assignment.replaces === 'Weekly adaptive checkpoints')).toBe(false);
    expect(entries.find(entry => entry.assignment.replaces === 'Applied brief #1 (Week 7)')?.module.lessons[0].week).toBe(7);
    expect(entries.find(entry => entry.assignment.replaces === 'Final exam')?.module.lessons[0].week).toBe(16);
    expect(entries.filter(entry => entry.module.lessons[0].week === 16).reduce((sum, entry) => sum + entry.assignment.points, 0)).toBeLessThan(50);
  });
  it('exports formula-leading plan text as inert CSV cells', async () => {
    const { ctx, sessionId } = await setup();
    await service.previewProvisionPlan(ctx, { sessionId });
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    const module = session.record.plan!.modules[0];
    module.title = '=1+1'; module.objective = ' +1+1'; module.lessons[0].title = '\t-1+1'; module.outcomeCodes = ['@SUM(1,1)'];
    await ctx.repo.putDesignSession(session);
    const csv = (await service.exportDesignRecord(ctx, { sessionId, format: 'csv' })).content;
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"\' +1+1"');
    expect(csv).toContain('"\'\t-1+1"');
    expect(csv).toContain('"\'@SUM(1,1)"');
  });
  it('blocks apply when design partner is disabled after preview', async () => {
    const { ctx, sessionId } = await setup();
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    const admin = { ...ctx, user: await ctx.repo.getUser('u-admin') };
    const institution = await ctx.repo.getInstitution();
    await service.updatePolicy(admin, { ...institution.policy, designPartner: { enabled: false, allowedArchitectures: null } });
    await expect(service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash })).rejects.toMatchObject({ code: 'ai-disabled' });
    expect(await ctx.repo.listLessons({ courseId: 'c-stat110' })).toHaveLength(3);
    expect((await service.exportDesignRecord(ctx, { sessionId, format: 'json' })).content).toContain(sessionId);
  });
  it('stops an active scaffold job with a session message when policy turns off', async () => {
    const { ctx, sessionId } = await setup();
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const before = (await ctx.repo.getDesignSession(sessionId))!;
    const job = (await ctx.repo.getGenerationJob(before.provisioning!.jobId!))!;
    const admin = { ...ctx, user: await ctx.repo.getUser('u-admin') };
    const institution = await ctx.repo.getInstitution();
    await service.updatePolicy(admin, { ...institution.policy, designPartner: { enabled: false, allowedArchitectures: null } });
    expect((await ctx.repo.getGenerationJob(job.id))?.state).toBe('failed');
    expect((await service.advanceDesignSession(ctx, { sessionId })).provisioning?.error).toContain('disabled');
    await advanceScaffoldJob(ctx, job);
    expect((await ctx.repo.getDesignSession(sessionId))?.created.blockIds).toEqual(before.created.blockIds);
    await expect(service.flagLessonAlternatives(ctx, { sessionId, lessonId: before.created.lessonIds[0] })).rejects.toMatchObject({ code: 'ai-disabled' });
    await service.undoProvisionPlan(ctx, { sessionId });
  });
  it('records quick drafts and Move it in without making them plan-owned for undo', async () => {
    const { ctx, sessionId } = await setup();
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const done = await finish(ctx, sessionId);
    const lessonId = done.created.lessonIds[0];
    const { jobId } = await service.generateAtScope(ctx, { courseId: 'c-stat110', scope: { lessonIds: [lessonId], elementTypes: ['document'] }, instruction: 'Draft a worked example.' });
    await service.getGenerationJob(ctx, { jobId });
    const drafted = (await ctx.repo.listBlocks(lessonId)).find(block => !done.created.blockIds.includes(block.id))!;
    await service.keepBlock(ctx, { blockId: drafted.id });
    await service.updateLesson(ctx, { lessonId: 'l-stat-1', moduleId: done.created.moduleIds[0] });
    const record = JSON.parse((await service.exportDesignRecord(ctx, { sessionId, format: 'json' })).content);
    expect(record.decisions.map((entry: { what: string }) => entry.what)).toEqual(expect.arrayContaining([expect.stringContaining(`Drafted document block for lesson ${lessonId}`), expect.stringContaining(`Kept block ${drafted.id}`), expect.stringContaining('Moved existing lesson l-stat-1')]));
    expect((await ctx.repo.getDesignSession(sessionId))?.created.blockIds).not.toContain(drafted.id);
    await service.undoProvisionPlan(ctx, { sessionId });
    expect(await ctx.repo.getBlock(drafted.id)).not.toBeNull();
    expect((await ctx.repo.getLesson('l-stat-1'))?.moduleId).toBe(done.created.moduleIds[0]);
  });
  it('keeps both simultaneous review decisions in the design record', async () => {
    const { ctx, sessionId } = await setup();
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const done = await finish(ctx, sessionId);
    const ids = (await ctx.repo.listBlocks(done.created.lessonIds[0])).filter(block => block.aiState === 'draft').slice(0, 2).map(block => block.id);
    await Promise.all(ids.map(blockId => service.keepBlock(ctx, { blockId })));
    const decisions = JSON.parse((await service.exportDesignRecord(ctx, { sessionId, format: 'json' })).content).decisions as { what: string }[];
    for (const id of ids) expect(decisions.some(entry => entry.what.includes(`Kept block ${id}`))).toBe(true);
  });
  it('builds the seven-module B and C plan from the pasted demo syllabus', async () => {
    const repo = new MemoryRepo(seedData()); let n = 0;
    const ctx: ServiceContext = { repo, ai: fixtureAi, user: await repo.getUser('u-okafor'), now: () => '2026-09-28T12:00:00.000Z', newId: prefix => `${prefix}-paste-${++n}` };
    const started = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text: sampleSyllabus.sections.map(section => section.text).join('\n\n'), consent: { syllabusOnly: true, rememberProfile: false } });
    await service.advanceDesignSession(ctx, { sessionId: started.id });
    const read = await service.advanceDesignSession(ctx, { sessionId: started.id });
    await service.confirmOutcomes(ctx, { sessionId: started.id, outcomes: read.extraction!.outcomes.map((item, index) => ({ code: `O${index + 1}`, text: item.text, originalText: item.text })) });
    const options = await service.advanceDesignSession(ctx, { sessionId: started.id });
    await service.selectApproach(ctx, { sessionId: started.id, optionIds: [options.options![1].id, options.options![2].id], overlays: ['bookends'], rationale: 'Apply each idea to a case, then reflect.' });
    const plan = await service.previewProvisionPlan(ctx, { sessionId: started.id });
    expect(plan.modules).toHaveLength(7);
  });
  it('builds seven draft modules from sample approaches B and C with bookends', async () => {
    const { ctx, sessionId } = await setup();
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    session.selection = { optionIds: [session.options![1].id, session.options![2].id], overlays: ['bookends'], rationale: 'Case practice and a project fit these students.', combinationNote: null };
    await ctx.repo.putDesignSession(session);
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    expect(plan.modules).toHaveLength(7);
  });
  it('exposes cited review guidance and exports the applied design record to the instructor', async () => {
    const { ctx, sessionId } = await setup();
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash, leastSureModuleKey: plan.modules.find(module => module.leastSure)?.key });
    const done = await finish(ctx, sessionId);
    const outline = await service.getCourseOutline(ctx, { courseId: 'c-stat110' });
    expect(outline.designSession).toEqual({ id: sessionId, stage: 'review' });
    const student = { ...ctx, user: await ctx.repo.getUser('u-priya') };
    expect((await service.getCourseOutline(student, { courseId: 'c-stat110', asLearner: true })).designSession).toBeUndefined();
    const lessonId = done.planIds!.lessons[plan.modules.find(module => module.leastSure)!.lessons[0].key];
    const detail = await service.getLesson(ctx, { lessonId });
    expect(detail.design?.moduleWhy.text).toContain('Repeated practice fits this group.');
    expect(detail.design?.nextSteps.some(step => step.action === 'add-example')).toBe(true);
    expect(detail.blocks.filter(block => block.type === 'document' && /^Alternative opening [AB]$/.test(block.title))).toHaveLength(2);
    const json = await service.exportDesignRecord(ctx, { sessionId, format: 'json' });
    expect(JSON.parse(json.content).plan.hash).toBe(plan.hash);
    const csv = await service.exportDesignRecord(ctx, { sessionId, format: 'csv' });
    expect(csv.content.split('\r\n')[0]).toContain('source page or section');
    expect(csv.content.split('\r\n')).toHaveLength(plan.modules.length + 2);
    const blockId = detail.blocks.find(block => block.origin === 'ai' && block.aiState === 'draft')!.id;
    await service.keepBlock(ctx, { blockId });
    const keptRecord = await service.exportDesignRecord(ctx, { sessionId, format: 'json' });
    expect(JSON.parse(keptRecord.content).decisions.some((decision: { what: string }) => decision.what.includes(`Kept block ${blockId}`))).toBe(true);
    const undo = await service.undoProvisionPlan(ctx, { sessionId });
    expect(undo.kept).toContainEqual(expect.objectContaining({ kind: 'block', id: blockId }));
    expect(await ctx.repo.getBlock(blockId)).not.toBeNull();
    await expect(service.exportDesignRecord(student, { sessionId, format: 'json' })).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('previews deterministically, covers every graded component, and refuses a stale hash', async () => {
    const { ctx, sessionId } = await setup();
    const a = await service.previewProvisionPlan(ctx, { sessionId });
    const b = await service.previewProvisionPlan(ctx, { sessionId });
    expect(b).toEqual(a);
    expect([...new Set(a.modules.flatMap(m => m.assignments ?? []).filter(x => x.replaces).map(x => x.replaces))].sort()).toEqual((await ctx.repo.getDesignSession(sessionId))!.extraction!.assessments.map(x => x.title).sort());
    expect(a.modules.filter(m => m.key.startsWith('module-')).every(m => (m.assignments?.length ?? 0) >= 1)).toBe(true);
    expect(a.readings.every(r => r.span.text)).toBe(true);
    expect(a.summary).toContain('Renames nothing. Removes nothing.');
    await expect(service.applyProvisionPlan(ctx, { sessionId, hash: 'stale' })).rejects.toMatchObject({ code: 'conflict', message: 'The course or template changed since the preview. Review the changes again.' });
    const existing = (await ctx.repo.listModules('c-stat110'))[0];
    await ctx.repo.putModule({ ...existing, title: `${existing.title} updated` });
    await expect(service.applyProvisionPlan(ctx, { sessionId, hash: a.hash })).rejects.toMatchObject({ code: 'conflict' });
    expect((await ctx.repo.getDesignSession(sessionId))?.created.moduleIds).toEqual([]);
  });
  it('flags overlapping module titles at a stemmed Jaccard threshold', () => {
    expect(titleOverlap('Describing distributions', 'Describe distribution')).toBe(true);
    expect(titleOverlap('Sampling and study design', 'Course communication')).toBe(false);
  });
  it('claims a concurrent apply once, drafts lessons, and matches automatic forecast', async () => {
    const { ctx, sessionId } = await setup();
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    const [a, b] = await Promise.all([service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash }), service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash })]);
    expect(a.id).toBe(b.id);
    const progress = await service.advanceDesignSession(ctx, { sessionId });
    expect(progress.provisioning?.modules?.[0]).toMatchObject({ done: 1, total: 1 });
    const done = await finish(ctx, sessionId);
    expect(done.created.moduleIds).toHaveLength(plan.counts.modules);
    expect(done.created.lessonIds).toHaveLength(plan.counts.lessons);
    expect(done.created.assignmentIds).toHaveLength(plan.counts.assignments);
    expect(done.created.linkKeys).toHaveLength(plan.counts.links);
    const snapshot = await courseSnapshot(ctx, 'c-stat110');
    expect(snapshot.lessons.filter(l => done.created.lessonIds.includes(l.id)).every(l => l.status === 'draft')).toBe(true);
    expect(snapshot.assignments.filter(a => done.created.assignmentIds.includes(a.id)).every(a => a.status === 'draft')).toBe(true);
    expect(snapshot.assignments.filter(a => done.created.assignmentIds.includes(a.id)).map(a => a.points).sort((x, y) => x - y)).toEqual(plan.modules.flatMap(m => m.assignments ?? []).map(a => a.points).sort((x, y) => x - y));
    for (const id of done.created.lessonIds) {
      const blocks = await ctx.repo.listBlocks(id);
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.filter(b => b.type === 'text').every(b => b.type === 'text' && /\[Your\s+/.test(b.text))).toBe(true);
      expect(blocks.every(b => b.aiState === 'draft')).toBe(true);
    }
    expect(plan.readinessForecast).toEqual(plan.readinessForecast.map(f => ({ ...f, expected: automaticCheck(snapshot, f.check).status === 'met' ? 'met' : 'not-met' })));
    const again = await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    expect(again.created.moduleIds).toEqual(done.created.moduleIds);
  });
  it('forecasts the automatic checks for a course with no existing structure', async () => {
    const { ctx, sessionId } = await setup(true);
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    await finish(ctx, sessionId);
    const snapshot = await courseSnapshot(ctx, 'c-plan-empty');
    expect(plan.readinessForecast).toEqual(plan.readinessForecast.map(f => ({ ...f, expected: automaticCheck(snapshot, f.check).status === 'met' ? 'met' : 'not-met' })));
  });
  it('keeps the forecast in sync with teaching-presence and choice slots', async () => {
    const { ctx, sessionId } = await setup(true);
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    session.selection!.overlays.push('teaching-presence', 'udl-choice');
    await ctx.repo.putDesignSession(session);
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    await finish(ctx, sessionId);
    const snapshot = await courseSnapshot(ctx, 'c-plan-empty');
    expect(plan.readinessForecast).toEqual(plan.readinessForecast.map(f => ({ ...f, expected: automaticCheck(snapshot, f.check).status === 'met' ? 'met' : 'not-met' })));
  });
  it('matches the real readiness service for draft-only navigation before and after scaffolding', async () => {
    const { ctx, sessionId } = await setup(true);
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    for (const stage of ['applied', 'scaffolded']) {
      if (stage === 'scaffolded') await finish(ctx, sessionId);
      const report = await service.getCourseReadiness(ctx, { courseId: 'c-plan-empty' });
      const rubric = await service.getRubric(ctx, { rubricId: report.rubricId });
      for (const check of ['navigation-instructions', 'instructor-contact'] as const) {
        const itemId = rubric.standards.flatMap(s => s.items).find(i => i.check === check)!.id;
        expect(plan.readinessForecast.find(f => f.check === check)?.expected).toBe(report.standards.flatMap(s => s.items).find(i => i.itemId === itemId)?.status);
      }
    }
  });
  it('repairs a model response to the promised single check and complete scaffold', async () => {
    const { ctx, sessionId } = await setup();
    const source = (await ctx.repo.getDesignSession(sessionId))!.source;
    const check = { type: 'check' as const, question: 'What fits?', options: [{ id: 'a', text: 'Explain the topic.' }, { id: 'b', text: 'Skip it.' }, { id: 'c', text: 'Guess.' }], correctOptionId: 'a', feedbackCorrect: 'Yes.', feedbackIncorrect: 'Retry.' };
    const result = scaffoldBlocks({ blocks: [{ type: 'heading', level: 2, text: 'Lesson' }, check, check] }, 'Explain the topic.', source);
    expect(result.map(b => b.type)).toEqual(['heading', 'callout', 'text', 'check']);
    expect(result.filter(b => b.type === 'check')).toHaveLength(1);
    expect(result.find(b => b.type === 'text')).toMatchObject({ text: expect.stringContaining('[Your ') });
  });
  it('preserves explicit assessment points and computes the stated-total weight', async () => {
    const { ctx, sessionId } = await setup();
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    session.extraction!.assessments = [{ id: 'project', title: 'Final project', weightPercent: null, dueAt: null, format: 'project', span: { page: 3, text: 'Final project: 200 points. Course total: 1000 points.' } }];
    await ctx.repo.putDesignSession(session);
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    const assignment = plan.modules.flatMap(m => m.assignments ?? []).find(a => a.replaces === 'Final project')!;
    expect(assignment.points).toBe(200);
    expect(assignment.weightPercent).toBe(20);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const saved = (await ctx.repo.listAssignments({ courseId: 'c-stat110' })).find(a => a.title === 'Final project')!;
    expect(saved.points).toBe(200);
    expect(saved.rubric[0].levels[0].points).toBeGreaterThan(0);
  });
  it('undoes unedited drafts but preserves an edited block, lesson and module', async () => {
    const { ctx, sessionId } = await setup();
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const done = await finish(ctx, sessionId);
    const chosen = done.created.blockIds.map(id => ctx.repo.getBlock(id));
    const edited = (await Promise.all(chosen)).find(b => b?.type === 'text')!;
    await ctx.repo.putBlock({ ...edited, aiState: 'kept', previous: { type: 'text', text: 'Before editing' }, text: edited.type === 'text' ? `${edited.text} Edited.` : '' } as typeof edited);
    const result = await service.undoProvisionPlan(ctx, { sessionId });
    expect(result.session.stage).toBe('approaches');
    expect(result.kept.some(item => item.id === edited.id)).toBe(true);
    expect(await ctx.repo.getBlock(edited.id)).not.toBeNull();
    expect(await ctx.repo.getLesson(edited.lessonId)).not.toBeNull();
    expect(await ctx.repo.getModule((await ctx.repo.getLesson(edited.lessonId))!.moduleId)).not.toBeNull();
    expect((await ctx.repo.listModules('c-stat110')).length).toBeLessThan(done.created.moduleIds.length + 2);
  });
  it('repairs instructor slots and replaces uncited links, then rejects an incomplete check', async () => {
    const { ctx, sessionId } = await setup();
    const source = (await ctx.repo.getDesignSession(sessionId))!.source;
    const check = { type: 'check' as const, question: 'What should you do?', options: [{ id: 'a', text: 'Explain the topic.' }, { id: 'b', text: 'Guess.' }, { id: 'c', text: 'Skip it.' }], correctOptionId: 'a', feedbackCorrect: 'Yes.', feedbackIncorrect: 'Try again.' };
    const value = { blocks: [{ type: 'heading', level: 2, text: 'Opening' }, { type: 'text', text: 'A short starter.' }, { type: 'link', href: 'https://example.org/invented', text: 'Reading', description: '' }, check] };
    const repaired = scaffoldBlocks(value, 'Explain the topic.', source);
    expect(repaired[2]).toMatchObject({ type: 'text', text: expect.stringContaining('[Your example from class]') });
    expect(repaired[3]).toMatchObject({ type: 'callout', text: '[Reading to select]' });
    expect(repaired[4]).toMatchObject({ type: 'check', question: expect.stringContaining('Explain the topic.') });
    expect(() => scaffoldBlocks({ blocks: value.blocks.map(x => x === check ? { ...check, options: [] } : x) }, 'Explain the topic.', source)).toThrow();
  });
  it('uses a cited rule-based starter when both AI scaffold drafts fail validation', async () => {
    const { ctx, sessionId } = await setup();
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    const broken = { ...ctx, ai: { run: async (task: never, input: never) => task === 'module-scaffold' ? { model: 'broken', output: { blocks: [{ type: 'text', text: 'too few' }] } } : fixtureAi.run(task, input) } as ServiceContext['ai'] };
    await service.applyProvisionPlan(broken, { sessionId, hash: plan.hash });
    const done = await finish(broken, sessionId);
    expect(done.provisioning?.error).toBeNull();
    const job = (await ctx.repo.getGenerationJob(done.provisioning!.jobId!))!;
    expect(job.failures).toEqual([]);
    expect(job.notes?.length).toBeGreaterThan(0);
    for (const note of job.notes ?? []) {
      const blocks = await ctx.repo.listBlocks(note.lessonId);
      expect(blocks.some(block => block.type === 'check')).toBe(true);
      expect(blocks.every(block => block.aiState === 'draft' && block.provenance?.summary.includes('Rule-based starter'))).toBe(true);
    }
  });
  it('retries an invalid scaffold once before writing the lesson', async () => {
    const { ctx, sessionId } = await setup();
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    let calls = 0;
    const retrying = { ...ctx, ai: { run: async (task: never, input: never) => task === 'module-scaffold' && ++calls === 1 ? { model: 'broken', output: { blocks: [{ type: 'text', text: 'too few' }] } } : fixtureAi.run(task, input) } as ServiceContext['ai'] };
    await service.applyProvisionPlan(retrying, { sessionId, hash: plan.hash });
    const done = await finish(retrying, sessionId);
    expect(calls).toBeGreaterThan(1);
    expect(done.provisioning?.error).toBeNull();
  });
  it('uses the answered week count when the syllabus has no schedule', async () => {
    const repo = new MemoryRepo(seedData()); let n = 0;
    const ctx: ServiceContext = { repo, ai: fixtureAi, user: await repo.getUser('u-okafor'), now: () => '2026-09-28T12:00:00.000Z', newId: prefix => `${prefix}-no-schedule-${++n}` };
    const text = 'ABC 101 · Applied Inquiry\nInstructor: Dr. Rivera · rivera@example.edu\nLearning outcomes\n1. Explain an inquiry question using a course example.\nGrading\nProject 100%';
    const started = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text, consent: { syllabusOnly: true, rememberProfile: false } });
    await service.advanceDesignSession(ctx, { sessionId: started.id });
    const read = await service.advanceDesignSession(ctx, { sessionId: started.id });
    const term = read.questions.find(q => /term length/i.test(q.text))!;
    await service.answerDesignQuestions(ctx, { sessionId: started.id, answers: [{ questionId: term.id, value: '4', skipped: false }], teachingNote: '' });
    await service.confirmOutcomes(ctx, { sessionId: started.id, outcomes: read.extraction!.outcomes.map((o, i) => ({ code: `O${i + 1}`, text: o.text, originalText: o.text })) });
    const options = await service.advanceDesignSession(ctx, { sessionId: started.id });
    expect(options.options?.find(o => o.id === 'weekly')?.modules).toHaveLength(4);
    await service.selectApproach(ctx, { sessionId: started.id, optionIds: ['weekly'], overlays: [], rationale: 'Four weekly steps fit this group.' });
    const plan = await service.previewProvisionPlan(ctx, { sessionId: started.id });
    expect(plan.modules).toHaveLength(4);
    expect(plan.readings).toEqual([]);
    expect(plan.placeholders).toBe(plan.counts.lessons);
  });
  it('expands a module spanning several weeks into lessons with those weeks', async () => {
    const { ctx, sessionId } = await setup();
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    session.options![0].modules = [{ ...session.options![0].modules[0], weeks: [1, 2, 3], lessons: 3 }];
    session.extraction!.schedule = [{ week: 1, dates: 'Weeks 1–3', topic: 'Inquiry cycle', reading: 'Chapter 1', due: '', span: { page: 4, text: 'Weeks 1–3 Inquiry cycle Chapter 1' }, empty: false }];
    await ctx.repo.putDesignSession(session);
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    expect(plan.modules.find(m => m.key === 'module-1')?.lessons.map(l => l.week)).toEqual([1, 2, 3]);
    expect(plan.readings.filter(r => r.moduleKey === 'module-1').map(r => r.week)).toEqual([1, 2, 3]);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const done = await finish(ctx, sessionId);
    for (const item of plan.modules.find(m => m.key === 'module-1')!.lessons) {
      const id = done.planIds!.lessons[item.key];
      const blocks = await ctx.repo.listBlocks(id);
      expect(blocks.some(b => b.type === 'callout' && b.text.includes('Chapter 1'))).toBe(true);
      expect(blocks.some(b => b.provenance?.sources.some(source => source.span?.page === 4))).toBe(true);
    }
  });
  it('adds two draft alternative openings for the selected least-sure module', async () => {
    const { ctx, sessionId } = await setup();
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    const key = plan.modules.find(m => m.leastSure)!.key;
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash, leastSureModuleKey: key });
    const done = await finish(ctx, sessionId);
    const index = plan.modules.findIndex(m => m.key === key);
    const lessons = await ctx.repo.listLessons({ moduleId: done.created.moduleIds[index] });
    const alternatives = (await ctx.repo.listBlocks(lessons[0].id)).filter(b => b.type === 'document' && /^Alternative opening [AB]$/.test(b.title));
    expect(alternatives).toHaveLength(2);
    expect(alternatives.every(b => b.aiState === 'draft' && done.created.blockIds.includes(b.id))).toBe(true);
    const snapshot = await courseSnapshot(ctx, 'c-stat110');
    expect(plan.readinessForecast).toEqual(plan.readinessForecast.map(f => ({ ...f, expected: automaticCheck(snapshot, f.check).status === 'met' ? 'met' : 'not-met' })));
  });
  it('keeps a draft assignment when the instructor edits only its rubric', async () => {
    const { ctx, sessionId } = await setup();
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const done = await finish(ctx, sessionId);
    const id = done.created.assignmentIds[0];
    const assignment = (await ctx.repo.getAssignment(id))!;
    assignment.rubric[0].description = 'Instructor revised criterion';
    await ctx.repo.putAssignment(assignment);
    const undone = await service.undoProvisionPlan(ctx, { sessionId });
    expect(undone.kept).toContainEqual({ kind: 'assignment', id, title: assignment.title });
    expect(await ctx.repo.getAssignment(id)).not.toBeNull();
  });
  it("doesn't take another assessment's points when its title contains this one", () => {
    const span = (text: string) => ({ page: 1, text });
    expect(explicitAssessmentPoints(span('Mini-project: 20 points. Project: points to be confirmed.'), 'Project')).toBeNull();
    expect(explicitAssessmentPoints(span('Quiz – 10 points. Project – 40 points.'), 'Project')).toBe(40);
  });
  it('never reports an item that no longer exists as kept', async () => {
    const { ctx, sessionId } = await setup();
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    await finish(ctx, sessionId);
    const session = await ctx.repo.getDesignSession(sessionId);
    // A concurrent undo retry already removed this block.
    await ctx.repo.deleteBlock(session!.created.blockIds[0]);
    const result = await service.undoProvisionPlan(ctx, { sessionId });
    expect(result.kept.some(item => item.id === session!.created.blockIds[0])).toBe(false);
  });
  it('undoes an untouched plan without changing existing course records', async () => {
    const { ctx, sessionId } = await setup();
    const before = await courseSnapshot(ctx, 'c-stat110');
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    await finish(ctx, sessionId);
    const result = await service.undoProvisionPlan(ctx, { sessionId });
    expect(result.kept).toEqual([]);
    const after = await courseSnapshot(ctx, 'c-stat110');
    expect(after.modules).toEqual(before.modules);
    expect(after.lessons).toEqual(before.lessons);
    expect(after.assignments).toEqual(before.assignments);
    expect(after.outcomes).toEqual(before.outcomes);
    expect(result.session.record.undoneAt).toBeTruthy();
  });
});

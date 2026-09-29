import { describe, expect, it } from 'vitest';
import { fixtureAi } from '../shared/ai';
import { seedData } from '../shared/seed';
import type { Repo } from '../shared/repo';
import type { ServiceContext } from '../shared/service/context';
import { MemoryRepo, service } from '../shared/service';
import { advanceScaffoldJob } from '../shared/service/design-plan';
import { explicitAssessmentPoints } from '../shared/design/plan';
import { D1Repo } from './d1-repo';
import { createTestDb } from './test/d1-shim';

async function setup(kind: 'memory' | 'd1') {
  const repo: Repo = kind === 'memory' ? new MemoryRepo(seedData()) : new D1Repo(createTestDb() as never);
  if (kind === 'd1') await (repo as D1Repo).reset(seedData());
  let n = 0;
  const ctx: ServiceContext = { repo, ai: fixtureAi, user: await repo.getUser('u-okafor'), now: () => '2026-09-28T12:00:00.000Z', newId: prefix => `${prefix}-${kind}-${++n}` };
  const { sessionId, plan } = await prepare(ctx);
  return { ctx, sessionId, plan };
}
async function prepare(ctx: ServiceContext) {
  const started = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', sample: true, consent: { syllabusOnly: true, rememberProfile: false } });
  await service.getDesignSession(ctx, { sessionId: started.id });
  const read = await service.getDesignSession(ctx, { sessionId: started.id });
  await service.confirmOutcomes(ctx, { sessionId: started.id, outcomes: read.extraction!.outcomes.map((item, i) => ({ code: `O${i + 1}`, text: item.text, originalText: item.text })) });
  const options = await service.getDesignSession(ctx, { sessionId: started.id });
  await service.selectApproach(ctx, { sessionId: started.id, optionIds: [options.options![0].id], overlays: ['bookends'], rationale: 'Repeated practice fits this group.' });
  const plan = await service.previewProvisionPlan(ctx, { sessionId: started.id });
  return { sessionId: started.id, plan };
}
async function finish(ctx: ServiceContext, sessionId: string) {
  let session = await ctx.repo.getDesignSession(sessionId);
  for (let i = 0; i < 50 && session?.stage === 'provisioning'; i++) {
    const job = await ctx.repo.getGenerationJob(session.provisioning!.jobId!);
    if (job?.state === 'running') await advanceScaffoldJob(ctx, job);
    session = await ctx.repo.getDesignSession(sessionId);
  }
  expect(session?.stage).toBe('review');
  return session!;
}
function pauseOnce(repo: Repo, name: keyof Repo) {
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const reached = new Promise<void>(resolve => { entered = resolve; });
  let used = false;
  const wrapped = new Proxy(repo, { get(target, key) {
    const original = Reflect.get(target, key);
    if (key !== name || typeof original !== 'function') return typeof original === 'function' ? original.bind(target) : original;
    return async (...args: unknown[]) => { if (!used) { used = true; entered(); await gate; } return original.apply(target, args); };
  } }) as Repo;
  return { wrapped, reached, release };
}
for (const kind of ['memory', 'd1'] as const) describe(`${kind} design safety races`, () => {
  it('preserves the winning scaffold ledger when a stale runner commits later', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    const job = (await ctx.repo.getGenerationJob(session.provisioning!.jobId!))!;
    const pause = pauseOnce(ctx.repo, 'commitDesignScaffold');
    const losing = advanceScaffoldJob({ ...ctx, repo: pause.wrapped }, job);
    await pause.reached;
    await advanceScaffoldJob(ctx, job);
    const winnerBlocks = await ctx.repo.listBlocks(job.work[0].lessonId);
    pause.release(); await losing;
    expect((await ctx.repo.getDesignSession(sessionId))!.created.blockIds).toEqual(expect.arrayContaining(winnerBlocks.map(b => b.id)));
    await service.undoProvisionPlan(ctx, { sessionId });
    expect(await ctx.repo.listBlocks(job.work[0].lessonId)).toEqual([]);
  });
  it('writes a rule-based starter and a job note after two invalid AI drafts', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    const broken = { ...ctx, ai: { run: async (task: never, input: never) => task === 'module-scaffold' ? { model: 'broken', output: { blocks: [{ type: 'text', text: 'No check' }] } } : fixtureAi.run(task, input) } as ServiceContext['ai'] };
    await service.applyProvisionPlan(broken, { sessionId, hash: plan.hash });
    const done = await finish(broken, sessionId);
    const job = (await ctx.repo.getGenerationJob(done.provisioning!.jobId!))!;
    expect(job.failures).toEqual([]);
    expect(job.notes?.length).toBeGreaterThan(0);
    const blocks = await ctx.repo.listBlocks(job.notes![0].lessonId);
    expect(blocks.some(b => b.type === 'check')).toBe(true);
    expect(blocks.every(b => b.aiState === 'draft' && b.provenance?.summary.includes('Rule-based starter because the AI draft did not validate'))).toBe(true);
    expect(blocks.some(b => b.type === 'text' && b.text.includes('[Your '))).toBe(true);
  });
  it('holds the exclusive undo state until the revision-checked final write', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const pause = pauseOnce(ctx.repo, 'finishDesignUndo');
    const undo = service.undoProvisionPlan({ ...ctx, repo: pause.wrapped }, { sessionId });
    await pause.reached;
    expect((await ctx.repo.getDesignSession(sessionId))?.stage).toBe('undoing');
    await expect(service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash })).rejects.toMatchObject({ code: 'conflict' });
    await expect(service.selectApproach(ctx, { sessionId, optionIds: ['weekly'], overlays: [], rationale: 'Try this again later.' })).rejects.toMatchObject({ code: 'invalid' });
    pause.release(); await undo;
    expect((await ctx.repo.getDesignSession(sessionId))?.stage).toBe('approaches');
  });
  it('does not let a stale undo finalization overwrite a newer revision', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const pause = pauseOnce(ctx.repo, 'finishDesignUndo');
    const pending = service.undoProvisionPlan({ ...ctx, repo: pause.wrapped }, { sessionId });
    await pause.reached;
    const newer = (await ctx.repo.getDesignSession(sessionId))!;
    await ctx.repo.putDesignSession({ ...newer, applyRevision: 'newer-revision' });
    pause.release();
    await expect(pending).rejects.toMatchObject({ code: 'conflict' });
    expect((await ctx.repo.getDesignSession(sessionId))?.applyRevision).toBe('newer-revision');
  });
  it('does not delete a draft after undo loses its revision', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const done = await finish(ctx, sessionId);
    const firstBlock = done.createdBlocks![Object.keys(done.createdBlocks!)[0]];
    const pause = pauseOnce(ctx.repo, 'deleteDesignBlockIfDraft');
    const pending = service.undoProvisionPlan({ ...ctx, repo: pause.wrapped }, { sessionId });
    await pause.reached;
    const undoing = (await ctx.repo.getDesignSession(sessionId))!;
    await ctx.repo.putDesignSession({ ...undoing, applyRevision: 'newer-revision' });
    pause.release();
    await expect(pending).rejects.toMatchObject({ code: 'conflict' });
    expect(await ctx.repo.getBlock(firstBlock.id)).not.toBeNull();
    expect(await ctx.repo.getModule(done.created.moduleIds[0])).not.toBeNull();
  });
  it('preserves every legacy block after an instructor insertion and reports what it kept', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const done = await finish(ctx, sessionId);
    const old = { ...done } as Record<string, unknown>;
    for (const key of ['applyRevision', 'planIds', 'createdBlocks', 'undoKept']) delete old[key];
    await ctx.repo.putDesignSession(old as never);
    const read = (await ctx.repo.getDesignSession(sessionId))!;
    expect(read.planIds?.modules[plan.modules[0].key]).toBe(done.created.moduleIds[0]);
    expect(read.createdBlocks).toEqual({});
    const lessonId = done.created.lessonIds[0];
    await service.generateElement(ctx, { lessonId, type: 'text', position: 0 });
    const result = await service.undoProvisionPlan(ctx, { sessionId });
    expect((await ctx.repo.getDesignSession(sessionId))?.stage).toBe('approaches');
    expect(result.kept.filter(item => item.kind === 'block').map(item => item.id).sort()).toEqual(Object.keys(done.createdBlocks ?? {}).sort());
    expect((await ctx.repo.listBlocks(lessonId)).map(item => item.id)).toEqual(expect.arrayContaining(done.created.blockIds.filter(id => done.createdBlocks?.[id]?.lessonId === lessonId)));
    expect(await ctx.repo.getModule(done.created.moduleIds[0])).not.toBeNull();
  });
  it('stops an old-shape provisioning job with recovery guidance', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const current = (await ctx.repo.getDesignSession(sessionId))!;
    const old = { ...current } as Record<string, unknown>;
    for (const key of ['applyRevision', 'planIds', 'createdBlocks', 'undoKept']) delete old[key];
    await ctx.repo.putDesignSession(old as never);
    for (let i = 0; i < 3; i++) await service.getDesignSession(ctx, { sessionId });
    const after = (await ctx.repo.getDesignSession(sessionId))!;
    const message = 'This draft was created by an earlier version. Undo it and apply again.';
    expect(after.stage).toBe('provisioning');
    expect(after.provisioning?.error).toBe(message);
    expect((await ctx.repo.getGenerationJob(current.provisioning!.jobId!))?.state).toBe('failed');
    await service.undoProvisionPlan(ctx, { sessionId });
    expect((await ctx.repo.getDesignSession(sessionId))?.stage).toBe('approaches');
  });
  it('removes a ledger-listed empty module during conservative legacy undo', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    const blocked = new Proxy(ctx.repo, { get(target, key) {
      if (key === 'putDesignLesson') return async () => false;
      const method = Reflect.get(target, key);
      return typeof method === 'function' ? method.bind(target) : method;
    } }) as Repo;
    await expect(service.applyProvisionPlan({ ...ctx, repo: blocked }, { sessionId, hash: plan.hash })).rejects.toMatchObject({ code: 'conflict' });
    const current = (await ctx.repo.getDesignSession(sessionId))!;
    const moduleId = current.created.moduleIds[0];
    const old = { ...current } as Record<string, unknown>;
    for (const key of ['applyRevision', 'planIds', 'createdBlocks', 'undoKept']) delete old[key];
    await ctx.repo.putDesignSession(old as never);
    await service.undoProvisionPlan(ctx, { sessionId });
    expect(await ctx.repo.getModule(moduleId)).toBeNull();
  });
  it('rejects a missing outcome reference before an assignment write', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    const pause = pauseOnce(ctx.repo, 'putDesignAssignment');
    const pending = service.applyProvisionPlan({ ...ctx, repo: pause.wrapped }, { sessionId, hash: plan.hash });
    await pause.reached;
    const created = (await ctx.repo.getDesignSession(sessionId))!.created.outcomeIds;
    const rows = await ctx.repo.listOutcomes('c-stat110');
    await service.saveOutcomes(ctx, { courseId: 'c-stat110', outcomes: rows.filter(row => !created.includes(row.id)).map(row => ({ id: row.id, text: row.text })) });
    pause.release();
    await expect(pending).rejects.toMatchObject({ code: 'conflict' });
    expect((await ctx.repo.listOutcomeLinks({ targetKind: 'assignment' })).filter(link => created.includes(link.outcomeId))).toEqual([]);
  });
  it('rejects a missing scaffold outcome reference without blocks or ledger entries', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    const job = (await ctx.repo.getGenerationJob(session.provisioning!.jobId!))!;
    let first = true;
    const wrapped = new Proxy(ctx.repo, { get(target, key) {
      const method = Reflect.get(target, key);
      if (key === 'commitDesignScaffold') return async (...args: unknown[]) => { if (first) { first = false; args[6] = ['missing-outcome']; } return method.apply(target, args); };
      return typeof method === 'function' ? method.bind(target) : method;
    } }) as Repo;
    await advanceScaffoldJob({ ...ctx, repo: wrapped }, job);
    expect(await ctx.repo.listBlocks(job.work[0].lessonId)).toEqual([]);
    expect((await ctx.repo.getDesignSession(sessionId))!.created.blockIds.some(id => id.startsWith(`b-${job.id}-0-`))).toBe(false);
    expect((await ctx.repo.getGenerationJob(job.id))!.failures[0].lessonId).toBe(job.work[0].lessonId);
  });
  it('rejects a whole outcome append when a concurrent addition fills the cap', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    const current = await ctx.repo.listOutcomes('c-stat110');
    const target = 30 - plan.outcomes.length;
    await service.saveOutcomes(ctx, { courseId: 'c-stat110', outcomes: [...current.map(row => ({ id: row.id, text: row.text })), ...Array.from({ length: target - current.length }, (_, i) => ({ text: `Instructor outcome ${i + 1}` }))] });
    const refreshed = await service.previewProvisionPlan(ctx, { sessionId });
    const pause = pauseOnce(ctx.repo, 'appendDesignOutcomes');
    const pending = service.applyProvisionPlan({ ...ctx, repo: pause.wrapped }, { sessionId, hash: refreshed.hash });
    await pause.reached;
    const rows = await ctx.repo.listOutcomes('c-stat110');
    await service.saveOutcomes(ctx, { courseId: 'c-stat110', outcomes: [...rows.map(row => ({ id: row.id, text: row.text })), { text: 'Last instructor slot' }] });
    pause.release();
    await expect(pending).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('outcome slots') });
    const after = (await ctx.repo.getDesignSession(sessionId))!;
    expect(after.stage).toBe('preview');
    expect(after.provisioning?.error).toContain('outcome slots');
    expect(after.created.outcomeIds).toEqual([]);
    expect(await ctx.repo.getGenerationJob(after.provisioning!.jobId!)).toBeNull();
  });
  it('stores actual outcome codes in the plan and Start-here draft', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    const pause = pauseOnce(ctx.repo, 'appendDesignOutcomes');
    const pending = service.applyProvisionPlan({ ...ctx, repo: pause.wrapped }, { sessionId, hash: plan.hash });
    await pause.reached;
    const current = await ctx.repo.listOutcomes('c-stat110');
    await service.saveOutcomes(ctx, { courseId: 'c-stat110', outcomes: [...current.map(row => ({ id: row.id, text: row.text })), { text: 'Instructor addition' }] });
    pause.release(); await pending;
    const done = await finish(ctx, sessionId);
    const actual = (await ctx.repo.listOutcomes('c-stat110')).filter(row => done.created.outcomeIds.includes(row.id));
    expect(done.plan?.outcomes.map(row => row.code)).toEqual(actual.map(row => row.code));
    expect(done.outcomeCodeMap?.[plan.outcomes[0].code]).toBe(actual[0].code);
    expect(done.planIds?.outcomes).toEqual(Object.fromEntries(actual.map(row => [row.code, row.id])));
    for (const module of done.plan!.modules) {
      const expected = module.outcomeCodes.map(code => done.planIds!.outcomes[code]).sort();
      for (const lesson of module.lessons) {
        const blocks = await ctx.repo.listBlocks(done.planIds!.lessons[lesson.key]);
        for (const block of blocks.filter(row => row.type === 'check' || row.type === 'scenario')) {
          expect((await ctx.repo.listOutcomeLinks({ targetKind: 'block', targetId: block.id })).map(link => link.outcomeId).sort()).toEqual(expected);
        }
      }
    }
    const startId = done.planIds!.lessons['start-here/lesson-1'];
    const startText = (await ctx.repo.listBlocks(startId)).filter(b => b.type === 'text').map(b => b.text).join('\n');
    expect(startText).toContain(`${actual[0].code}: ${actual[0].text}`);
    const check = (await ctx.repo.listBlocks(startId)).find(b => b.type === 'check')!;
    expect(await ctx.repo.listOutcomeLinks({ targetKind: 'block', targetId: check.id })).toContainEqual({ targetKind: 'block', targetId: check.id, outcomeId: actual[0].id });
  });
  it('rejects an apply whose points were reconfirmed during the claim', async () => {
    const { ctx, sessionId } = await setup(kind);
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    session.extraction!.assessments = [{ id: 'project', title: 'Project', weightPercent: null, dueAt: null, format: 'project', span: { page: 2, text: 'Project: points to be confirmed.' } }];
    await ctx.repo.putDesignSession(session);
    await service.confirmDesignPoints(ctx, { sessionId, points: { project: 10 } });
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    const pause = pauseOnce(ctx.repo, 'claimDesignApply');
    const pending = service.applyProvisionPlan({ ...ctx, repo: pause.wrapped }, { sessionId, hash: plan.hash });
    await pause.reached;
    await service.confirmDesignPoints(ctx, { sessionId, points: { project: 20 } });
    pause.release();
    await expect(pending).rejects.toMatchObject({ code: 'conflict' });
    const after = (await ctx.repo.getDesignSession(sessionId))!;
    expect(after.confirmedPoints).toEqual({ project: 20 });
    expect(after.plan).toBeNull();
    expect(after.created.moduleIds).toEqual([]);
  });
  it('resumes a failed undo by retry and by polling, including finalization', async () => {
    for (const recovery of ['retry', 'poll'] as const) {
      const { ctx, sessionId, plan } = await setup(kind);
      await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
      await finish(ctx, sessionId);
      let deletions = 0;
      const broken = new Proxy(ctx.repo, { get(target, key) {
        const method = Reflect.get(target, key);
        if (key === 'deleteDesignBlockIfDraft') return async (...args: unknown[]) => { if (++deletions === 2) throw Error('Interrupted cleanup'); return method.apply(target, args); };
        return typeof method === 'function' ? method.bind(target) : method;
      } }) as Repo;
      await expect(service.undoProvisionPlan({ ...ctx, repo: broken }, { sessionId })).rejects.toThrow('Interrupted cleanup');
      expect((await ctx.repo.getDesignSession(sessionId))?.stage).toBe('undoing');
      if (recovery === 'retry') await service.undoProvisionPlan(ctx, { sessionId });
      else await service.getDesignSession(ctx, { sessionId });
      expect((await ctx.repo.getDesignSession(sessionId))?.stage).toBe('approaches');
      expect((await ctx.repo.listModules('c-stat110')).filter(m => m.id.includes(kind))).toEqual([]);
    }
  });
  it('retries undo finalization after cleanup has completed', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    await finish(ctx, sessionId);
    const broken = new Proxy(ctx.repo, { get(target, key) {
      if (key === 'finishDesignUndo') return async () => false;
      const method = Reflect.get(target, key);
      return typeof method === 'function' ? method.bind(target) : method;
    } }) as Repo;
    await expect(service.undoProvisionPlan({ ...ctx, repo: broken }, { sessionId })).rejects.toMatchObject({ code: 'conflict' });
    expect((await ctx.repo.getDesignSession(sessionId))?.stage).toBe('undoing');
    await service.getDesignSession(ctx, { sessionId });
    expect((await ctx.repo.getDesignSession(sessionId))?.stage).toBe('approaches');
  });
  it('uses only a full assessment title immediately before its points', async () => {
    const { ctx, sessionId } = await setup(kind);
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    session.extraction!.assessments = [{ id: 'project', title: 'Project', weightPercent: null, dueAt: null, format: 'project', span: { page: 2, text: 'Project proposal: 20 points. Project: points to be confirmed.' } }];
    await ctx.repo.putDesignSession(session);
    expect(explicitAssessmentPoints(session.extraction!.assessments[0].span, 'Project')).toBeNull();
    expect(explicitAssessmentPoints({ page: 2, text: 'Final Project: 20 points.' }, 'Project')).toBeNull();
    await expect(service.previewProvisionPlan(ctx, { sessionId })).rejects.toThrow('Confirm the points');
    await service.confirmDesignPoints(ctx, { sessionId, points: { project: 25 } });
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    expect(plan.modules.flatMap(m => m.assignments ?? []).filter(a => a.replaces === 'Project').reduce((sum, a) => sum + a.points, 0)).toBe(25);
  });
  it('records a concurrent module position before a failed lesson insert so undo removes it', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    const pause = pauseOnce(ctx.repo, 'putDesignModule');
    const blocked = new Proxy(pause.wrapped, { get(target, key) {
      if (key === 'putDesignLesson') return async () => false;
      return Reflect.get(target, key);
    } }) as Repo;
    const pending = service.applyProvisionPlan({ ...ctx, repo: blocked }, { sessionId, hash: plan.hash });
    await pause.reached;
    const current = await ctx.repo.listModules('c-stat110');
    await ctx.repo.putModule({ id: `instructor-${kind}`, courseId: 'c-stat110', title: 'Instructor addition', position: Math.max(...current.map(m => m.position)) + 1 });
    pause.release();
    await expect(pending).rejects.toMatchObject({ code: 'conflict' });
    const before = (await ctx.repo.getDesignSession(sessionId))!;
    const added = (await ctx.repo.getModule(before.created.moduleIds[0]))!;
    expect(before.plan!.modules[0].position).toBe(added.position);
    await service.undoProvisionPlan(ctx, { sessionId });
    expect(await ctx.repo.getModule(added.id)).toBeNull();
    expect(await ctx.repo.getModule(`instructor-${kind}`)).not.toBeNull();
  });
  it('parses grouped points and never assigns a course total to the assessment', async () => {
    const { ctx, sessionId } = await setup(kind);
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    session.extraction!.assessments = [
      { id: 'project', title: 'Project', weightPercent: null, dueAt: null, format: 'project', span: { page: 2, text: 'Project: 1,000 points.' } },
      { id: 'final', title: 'Final project', weightPercent: null, dueAt: null, format: 'project', span: { page: 3, text: 'Course total: 1000 points. Final project: 200 points.' } },
    ];
    await ctx.repo.putDesignSession(session);
    expect(explicitAssessmentPoints(session.extraction!.assessments[0].span, 'Project')).toBe(1000);
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    const items = plan.modules.flatMap(m => m.assignments ?? []);
    expect(items.filter(a => a.replaces === 'Project').reduce((sum, a) => sum + a.points, 0)).toBe(1000);
    expect(items.filter(a => a.replaces === 'Final project').reduce((sum, a) => sum + a.points, 0)).toBe(200);
    expect(items.filter(a => a.replaces === 'Final project').reduce((sum, a) => sum + (a.weightPercent ?? 0), 0)).toBe(20);
  });
  it('confirms every unresolved assessment on preview and hashes the values', async () => {
    const { ctx, sessionId } = await setup(kind);
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    session.extraction!.assessments = Array.from({ length: 6 }, (_, i) => ({ id: `task-${i}`, title: `Task ${i}`, weightPercent: null, dueAt: null, format: 'project', span: { page: i + 1, text: `Task ${i}: points to be decided.` } }));
    await ctx.repo.putDesignSession(session);
    await expect(service.previewProvisionPlan(ctx, { sessionId })).rejects.toThrow('Confirm the points');
    await expect(service.confirmDesignPoints(ctx, { sessionId, points: Object.fromEntries(session.extraction!.assessments.slice(0, 5).map(a => [a.id, 10])) })).rejects.toMatchObject({ code: 'invalid' });
    await service.confirmDesignPoints(ctx, { sessionId, points: Object.fromEntries(session.extraction!.assessments.map(a => [a.id, 10])) });
    const first = await service.previewProvisionPlan(ctx, { sessionId });
    await service.confirmDesignPoints(ctx, { sessionId, points: Object.fromEntries(session.extraction!.assessments.map((a, i) => [a.id, i === 5 ? 20 : 10])) });
    const second = await service.previewProvisionPlan(ctx, { sessionId });
    expect(second.hash).not.toBe(first.hash);
    await expect(service.applyProvisionPlan(ctx, { sessionId, hash: first.hash })).rejects.toMatchObject({ code: 'conflict' });
    await service.applyProvisionPlan(ctx, { sessionId, hash: second.hash });
  });
  it('allocates different module positions for two concurrent sessions', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    const second = await prepare(ctx);
    const a = pauseOnce(ctx.repo, 'claimDesignApply'), b = pauseOnce(ctx.repo, 'claimDesignApply');
    const firstPending = service.applyProvisionPlan({ ...ctx, repo: a.wrapped }, { sessionId, hash: plan.hash });
    const secondPending = service.applyProvisionPlan({ ...ctx, repo: b.wrapped }, { sessionId: second.sessionId, hash: second.plan.hash });
    await Promise.all([a.reached, b.reached]); a.release(); b.release();
    await Promise.all([firstPending, secondPending]);
    const modules = (await ctx.repo.listModules('c-stat110')).filter(m => m.id.includes(kind));
    expect(new Set(modules.map(m => m.position)).size).toBe(modules.length);
  });
  it('matches actual readiness for draft-only content after apply and scaffolding', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    for (const stage of ['applied', 'scaffolded']) {
      if (stage === 'scaffolded') await finish(ctx, sessionId);
      const report = await service.getCourseReadiness(ctx, { courseId: 'c-stat110' });
      const rubric = await service.getRubric(ctx, { rubricId: report.rubricId });
      for (const check of ['navigation-instructions', 'instructor-contact'] as const) {
        const itemId = rubric.standards.flatMap(row => row.items).find(item => item.check === check)!.id;
        expect(plan.readinessForecast.find(row => row.check === check)?.expected).toBe(report.standards.flatMap(row => row.items).find(item => item.itemId === itemId)?.status);
      }
    }
  });
  it('repairs incomplete model scaffolds and never exceeds the preview check count', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    const check = { type: 'check' as const, question: 'Which choice fits?', options: [{ id: 'a', text: 'Explain the topic.' }, { id: 'b', text: 'Skip evidence.' }, { id: 'c', text: 'Guess.' }], correctOptionId: 'a', feedbackCorrect: 'Yes.', feedbackIncorrect: 'Try again.' };
    const malformed = { ...ctx, ai: { run: async (task: never, input: never) => task === 'module-scaffold' ? { model: 'malformed', output: { blocks: [{ type: 'heading', level: 2, text: 'Opening' }, check, check] } } : fixtureAi.run(task, input) } as ServiceContext['ai'] };
    await service.applyProvisionPlan(malformed, { sessionId, hash: plan.hash });
    const done = await finish(malformed, sessionId);
    const groups = await Promise.all(done.created.lessonIds.map(id => ctx.repo.listBlocks(id)));
    expect(groups.flat().filter(b => b.type === 'check')).toHaveLength(plan.counts.checks);
    for (const group of groups) {
      expect(group.some(b => b.type === 'heading')).toBe(true);
      expect(group.some(b => b.type === 'callout')).toBe(true);
      expect(group.some(b => b.type === 'text' && b.text.includes('[Your '))).toBe(true);
    }
  });
  it('stores explicit points and their normalized stated-total weight', async () => {
    const { ctx, sessionId } = await setup(kind);
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    session.extraction!.assessments = [{ id: 'points', title: 'Final project', weightPercent: null, dueAt: null, format: 'project', span: { page: 2, text: 'Final project: 200 points. Course total: 1000 points.' } }];
    await ctx.repo.putDesignSession(session);
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    const planned = plan.modules.flatMap(m => m.assignments ?? []).find(a => a.replaces === 'Final project')!;
    expect([planned.points, planned.weightPercent]).toEqual([200, 20]);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const saved = (await ctx.repo.listAssignments({ courseId: 'c-stat110' })).find(a => a.title === 'Final project')!;
    expect(saved.points).toBe(200);
    expect(saved.rubric[0].levels[0].points).toBeGreaterThan(0);
  });
  it('carries a cited multiweek reading into every covered lesson', async () => {
    const { ctx, sessionId } = await setup(kind);
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    session.options![0].modules = [{ ...session.options![0].modules[0], weeks: [1, 2, 3], lessons: 3 }];
    session.extraction!.schedule = [{ week: 1, dates: 'Weeks 1–3', topic: 'Inquiry cycle', reading: 'Chapter 1', due: '', span: { page: 4, text: 'Weeks 1–3 Inquiry cycle Chapter 1' }, empty: false }];
    await ctx.repo.putDesignSession(session);
    const plan = await service.previewProvisionPlan(ctx, { sessionId });
    expect(plan.readings.filter(row => row.moduleKey === 'module-1').map(row => row.week)).toEqual([1, 2, 3]);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const done = await finish(ctx, sessionId);
    for (const planned of plan.modules.find(m => m.key === 'module-1')!.lessons) {
      const blocks = await ctx.repo.listBlocks(done.planIds!.lessons[planned.key]);
      expect(blocks.some(b => b.type === 'callout' && b.text.includes('Chapter 1'))).toBe(true);
      expect(blocks.some(b => b.provenance?.sources.some(source => source.span?.page === 4))).toBe(true);
    }
  });
  it('appends outcomes after an instructor edits and links one during apply', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    const pause = pauseOnce(ctx.repo, 'appendDesignOutcomes');
    const pending = service.applyProvisionPlan({ ...ctx, repo: pause.wrapped }, { sessionId, hash: plan.hash });
    await pause.reached;
    const prior = await ctx.repo.listOutcomes('c-stat110');
    const saved = await service.saveOutcomes(ctx, { courseId: 'c-stat110', outcomes: [...prior.map(o => ({ id: o.id, text: o.id === prior[0].id ? 'Instructor edit' : o.text })), { text: 'Instructor addition' }] });
    await ctx.repo.setOutcomeLinks('block', 'b-s1-1', [saved.at(-1)!.id]);
    pause.release(); await pending;
    expect((await ctx.repo.listOutcomes('c-stat110')).map(o => o.text)).toContain('Instructor edit');
    expect((await ctx.repo.listOutcomes('c-stat110')).map(o => o.text)).toContain('Instructor addition');
    expect(await ctx.repo.listOutcomeLinks({ targetKind: 'block', targetId: 'b-s1-1' })).toContainEqual({ outcomeId: saved.at(-1)!.id, targetKind: 'block', targetId: 'b-s1-1' });
  });
  it('cannot resume apply after undo changes its revision', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    const pause = pauseOnce(ctx.repo, 'putDesignModule');
    const pending = service.applyProvisionPlan({ ...ctx, repo: pause.wrapped }, { sessionId, hash: plan.hash });
    await pause.reached;
    await service.undoProvisionPlan(ctx, { sessionId });
    pause.release(); await pending;
    expect((await ctx.repo.getDesignSession(sessionId))?.stage).toBe('approaches');
    expect((await ctx.repo.listModules('c-stat110')).filter(m => m.id.includes(kind))).toEqual([]);
  });
  it('does not delete a block kept at the delete boundary', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const done = await finish(ctx, sessionId);
    const id = done.created.blockIds.find(asyncId => asyncId.startsWith(`b-${done.provisioning!.jobId}`))!;
    const pause = pauseOnce(ctx.repo, 'deleteDesignBlockIfDraft');
    const pending = service.undoProvisionPlan({ ...ctx, repo: pause.wrapped }, { sessionId });
    await pause.reached;
    await service.keepBlock(ctx, { blockId: id });
    pause.release(); const result = await pending;
    expect(result.kept.some(item => item.id === id)).toBe(true);
    expect((await ctx.repo.getDesignSession(sessionId))?.undoKept).toEqual(result.kept);
    expect((await ctx.repo.getBlock(id))?.aiState).toBe('kept');
  });
  it('does not overwrite a kept scaffold when another runner wins the commit', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const job = (await ctx.repo.getGenerationJob((await ctx.repo.getDesignSession(sessionId))!.provisioning!.jobId!))!;
    const pause = pauseOnce(ctx.repo, 'commitDesignScaffold');
    const pending = advanceScaffoldJob({ ...ctx, repo: pause.wrapped }, job);
    await pause.reached;
    await ctx.repo.setDesignRunner(sessionId, (await ctx.repo.getDesignSession(sessionId))!.applyRevision!, job.id, 'poll');
    const winner = (await ctx.repo.getGenerationJob(job.id))!;
    await advanceScaffoldJob(ctx, winner);
    const blocks = await ctx.repo.listBlocks(job.work[0].lessonId);
    await service.keepBlock(ctx, { blockId: blocks[0].id });
    pause.release(); await pending;
    expect((await ctx.repo.getBlock(blocks[0].id))?.aiState).toBe('kept');
    expect((await ctx.repo.getGenerationJob(job.id))?.done).toBe(1);
    expect((await ctx.repo.getGenerationJob(job.id))?.runner ?? 'poll').toBe('poll');
  });
  it('leaves a lesson empty and advances after a scaffold transaction fails', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const job = (await ctx.repo.getGenerationJob((await ctx.repo.getDesignSession(sessionId))!.provisioning!.jobId!))!;
    let once = true;
    const wrapped = new Proxy(ctx.repo, { get(target, key) {
      const value = Reflect.get(target, key);
      if (key === 'commitDesignScaffold') return async (...args: unknown[]) => { if (once) { once = false; throw Error('Injected link transaction failure'); } return (value as (...args: unknown[]) => unknown).apply(target, args); };
      return typeof value === 'function' ? value.bind(target) : value;
    } }) as Repo;
    await advanceScaffoldJob({ ...ctx, repo: wrapped }, job);
    expect(await ctx.repo.listBlocks(job.work[0].lessonId)).toEqual([]);
    expect((await ctx.repo.getGenerationJob(job.id))?.done).toBe(1);
    expect((await ctx.repo.getGenerationJob(job.id))?.failures[0].message).toContain('Injected');
  });
  it('skips a renamed pending lesson and advances the queue', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    const job = (await ctx.repo.getGenerationJob(session.provisioning!.jobId!))!;
    const lesson = (await ctx.repo.getLesson(job.work[0].lessonId))!;
    await ctx.repo.putLesson({ ...lesson, title: 'Instructor renamed this lesson' });
    await advanceScaffoldJob(ctx, job);
    const next = (await ctx.repo.getGenerationJob(job.id))!;
    expect(next.done).toBe(1);
    expect(next.failures[0].lessonId).toBe(lesson.id);
    expect(await ctx.repo.listBlocks(lesson.id)).toEqual([]);
  });
  it('cannot revive a cancelled job during workflow-to-poll takeover', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const session = (await ctx.repo.getDesignSession(sessionId))!;
    await ctx.repo.setDesignRunner(sessionId, session.applyRevision!, session.provisioning!.jobId!, 'workflow');
    const pause = pauseOnce(ctx.repo, 'setDesignRunner');
    const stalled = { ...ctx, repo: pause.wrapped, now: () => '2026-09-28T13:00:00.000Z' };
    const pending = service.getDesignSession(stalled, { sessionId });
    await pause.reached;
    await service.undoProvisionPlan(ctx, { sessionId });
    pause.release(); await pending;
    expect((await ctx.repo.getDesignSession(sessionId))?.stage).toBe('approaches');
    expect((await ctx.repo.getGenerationJob(session.provisioning!.jobId!))?.state).toBe('failed');
  });
  it('cannot write a paused scaffold after undo', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const job = (await ctx.repo.getGenerationJob((await ctx.repo.getDesignSession(sessionId))!.provisioning!.jobId!))!;
    const pause = pauseOnce(ctx.repo, 'commitDesignScaffold');
    const pending = advanceScaffoldJob({ ...ctx, repo: pause.wrapped }, job);
    await pause.reached;
    await service.undoProvisionPlan(ctx, { sessionId });
    pause.release(); await pending;
    expect((await ctx.repo.getDesignSession(sessionId))?.stage).toBe('approaches');
    expect(await ctx.repo.getLesson(job.work[0].lessonId)).toBeNull();
    expect((await ctx.repo.getGenerationJob(job.id))?.state).toBe('failed');
  });
  it('appends alternatives without reverting a block kept at its commit boundary', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const done = await finish(ctx, sessionId);
    const lessonId = done.created.lessonIds[0];
    const first = (await ctx.repo.listBlocks(lessonId))[0];
    const pause = pauseOnce(ctx.repo, 'appendDesignAlternatives');
    const pending = service.flagLessonAlternatives({ ...ctx, repo: pause.wrapped }, { sessionId, lessonId });
    await pause.reached;
    await service.keepBlock(ctx, { blockId: first.id });
    pause.release(); await pending;
    expect((await ctx.repo.getBlock(first.id))?.aiState).toBe('kept');
  });
  it('removes untouched alternative openings on undo', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    const key = plan.modules.find(m => m.leastSure)!.key;
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash, leastSureModuleKey: key });
    const done = await finish(ctx, sessionId);
    const firstId = done.planIds!.lessons[plan.modules.find(m => m.key === key)!.lessons[0].key];
    expect((await ctx.repo.listBlocks(firstId)).filter(b => b.type === 'document')).toHaveLength(2);
    const undone = await service.undoProvisionPlan(ctx, { sessionId });
    expect(undone.kept).toEqual([]);
    expect(await ctx.repo.getLesson(firstId)).toBeNull();
  });
  it('preserves an edited draft block even while its state is still draft', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const done = await finish(ctx, sessionId);
    const id = done.created.blockIds.find(asyncId => asyncId.startsWith(`b-${done.provisioning!.jobId}`))!;
    const block = (await ctx.repo.getBlock(id))!;
    if (block.type !== 'heading') throw Error('Expected heading');
    await ctx.repo.putBlock({ ...block, text: 'Instructor edited this draft' });
    const undone = await service.undoProvisionPlan(ctx, { sessionId });
    expect(undone.kept.some(item => item.id === id)).toBe(true);
    expect((await ctx.repo.getBlock(id))?.type).toBe('heading');
  });
  it('preserves an assignment edited at its delete boundary', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const done = await finish(ctx, sessionId);
    const id = done.created.assignmentIds[0];
    const pause = pauseOnce(ctx.repo, 'deleteDesignAssignmentIfUnchanged');
    const pending = service.undoProvisionPlan({ ...ctx, repo: pause.wrapped }, { sessionId });
    await pause.reached;
    const assignment = (await ctx.repo.getAssignment(id))!;
    await ctx.repo.putAssignment({ ...assignment, title: 'Instructor changed this assignment' });
    pause.release(); const undone = await pending;
    expect(undone.kept.some(item => item.id === id)).toBe(true);
    expect((await ctx.repo.getAssignment(id))?.title).toBe('Instructor changed this assignment');
  });
  it('preserves a lesson changed at its delete boundary', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const done = await finish(ctx, sessionId);
    const id = done.created.lessonIds[0];
    const pause = pauseOnce(ctx.repo, 'deleteDesignLessonIfUnchanged');
    const pending = service.undoProvisionPlan({ ...ctx, repo: pause.wrapped }, { sessionId });
    await pause.reached;
    const lesson = (await ctx.repo.getLesson(id))!;
    await ctx.repo.putLesson({ ...lesson, title: 'Instructor changed this lesson' });
    pause.release(); const undone = await pending;
    expect(undone.kept.some(item => item.id === id)).toBe(true);
    expect((await ctx.repo.getLesson(id))?.title).toBe('Instructor changed this lesson');
  });
  it('preserves instructor alignment changes on generated blocks and assignments', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const done = await finish(ctx, sessionId);
    const blockId = done.created.blockIds.find(asyncId => asyncId.startsWith(`b-${done.provisioning!.jobId}`) && asyncId.endsWith('-3'))!;
    const assignmentId = done.created.assignmentIds[0];
    const outside = (await ctx.repo.listOutcomes('c-stat110'))[0].id;
    await ctx.repo.setOutcomeLinks('block', blockId, [outside]);
    await ctx.repo.setOutcomeLinks('assignment', assignmentId, [outside]);
    const undone = await service.undoProvisionPlan(ctx, { sessionId });
    expect(undone.kept.some(item => item.id === blockId)).toBe(true);
    expect(undone.kept.some(item => item.id === assignmentId)).toBe(true);
    expect(await ctx.repo.listOutcomeLinks({ targetKind: 'block', targetId: blockId })).toContainEqual({ outcomeId: outside, targetKind: 'block', targetId: blockId });
    expect(await ctx.repo.listOutcomeLinks({ targetKind: 'assignment', targetId: assignmentId })).toContainEqual({ outcomeId: outside, targetKind: 'assignment', targetId: assignmentId });
  });
  it('preserves a kept descendant variant during undo', async () => {
    const { ctx, sessionId, plan } = await setup(kind);
    await service.applyProvisionPlan(ctx, { sessionId, hash: plan.hash });
    const done = await finish(ctx, sessionId);
    const master = done.created.lessonIds[0];
    const variant = await service.createVariant(ctx, { lessonId: master, audience: 'plain' });
    const first = (await ctx.repo.listBlocks(variant.lesson.id))[0];
    if (first) await service.keepBlock(ctx, { blockId: first.id });
    const result = await service.undoProvisionPlan(ctx, { sessionId });
    expect(result.kept.some(item => item.id === master)).toBe(true);
    expect(await ctx.repo.getLesson(variant.lesson.id)).not.toBeNull();
    if (first) expect((await ctx.repo.getBlock(first.id))?.aiState).toBe('kept');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fixtureAi } from '../shared/ai';
import { ROUTES } from '../shared/api';
import type { DesignSession } from '../shared/domain';
import type { Repo } from '../shared/repo';
import { seedData } from '../shared/seed';
import { MemoryRepo, service } from '../shared/service';
import type { ServiceContext } from '../shared/service/context';
import { advanceExtractJob } from '../shared/service/design-partner';
import { coveredWeeks } from '../shared/design/plan';
import { D1Repo } from './d1-repo';
import { createTestDb } from './test/d1-shim';
import { findFileRoute } from './api/files';
import { palmyraClient } from './ai/palmyra';

const at = '2026-09-28T12:00:00.000Z';
async function setup(kind: 'memory' | 'd1') {
  const repo: Repo = kind === 'memory' ? new MemoryRepo(seedData()) : new D1Repo(createTestDb() as never);
  if (kind === 'd1') await (repo as D1Repo).reset(seedData());
  let next = 0;
  const ctx: ServiceContext = { repo, ai: fixtureAi, user: await repo.getUser('u-okafor'), now: () => at, newId: prefix => `${prefix}-${kind}-${++next}` };
  return ctx;
}
async function read(ctx: ServiceContext) {
  const started = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', sample: true, consent: { syllabusOnly: true, rememberProfile: false } });
  await service.advanceDesignSession(ctx, { sessionId: started.id });
  return service.advanceDesignSession(ctx, { sessionId: started.id });
}
async function options(ctx: ServiceContext, session: DesignSession) {
  await service.confirmOutcomes(ctx, { sessionId: session.id, outcomes: session.extraction!.outcomes.map((item, i) => ({ code: `O${i + 1}`, text: item.text, originalText: item.text })) });
  return service.advanceDesignSession(ctx, { sessionId: session.id });
}

for (const kind of ['memory', 'd1'] as const) describe(`${kind} Night 4 integration`, () => {
  it('hides staff-only source bytes, metadata, and derived formats until explicit sharing', async () => {
    const ctx = await setup(kind);
    const objects = new Map<string, Uint8Array>();
    const bucket = { put: async (key: string, body: ReadableStream) => { objects.set(key, new Uint8Array(await new Response(body).arrayBuffer())); }, get: async (key: string) => { const bytes = objects.get(key); return bytes ? { body: bytes, size: bytes.length } : null; } };
    const upload = findFileRoute('POST', '/courses/c-stat110/files/upload')!.handle;
    const form = new FormData(); form.set('file', new File(['PRIVATE-SYLLABUS-CONTENT-PROBE'], 'Draft syllabus.pdf', { type: 'application/pdf' }));
    const response = await upload(new Request('https://example.test/api/v1/courses/c-stat110/files/upload?visibility=staff', { method: 'POST', body: form }), ctx, bucket as never, { courseId: 'c-stat110' });
    expect(response.status).toBe(201);
    const file = await response.json() as { id: string; visibility: string; version: number; key: string };
    expect(file.visibility).toBe('staff');
    objects.set('format-key', new TextEncoder().encode('DERIVED-PRIVATE-PROBE'));
    await ctx.repo.putFormat({ fileId: file.id, version: file.version, format: 'reading', state: 'ready', outputKey: 'format-key', generatedAt: at, error: null });
    const student = { ...ctx, user: await ctx.repo.getUser('u-priya') };
    expect((await service.listFiles(student, { courseId: 'c-stat110', limit: 200 })).items.some(item => item.id === file.id)).toBe(false);
    await expect(service.getFile(student, { fileId: file.id })).rejects.toMatchObject({ code: 'not-found' });
    await expect(service.getFormats(student, { fileId: file.id })).rejects.toMatchObject({ code: 'not-found' });
    await expect(service.requestFormat(student, { fileId: file.id, format: 'reading' })).rejects.toMatchObject({ code: 'not-found' });
    const content = findFileRoute('GET', `/files/${file.id}/content`)!.handle;
    await expect(content(new Request(`https://example.test/api/v1/files/${file.id}/content`), student, bucket as never, { fileId: file.id })).rejects.toMatchObject({ code: 'not-found' });
    await expect(content(new Request(`https://example.test/api/v1/files/${file.id}/content?format=reading`), student, bucket as never, { fileId: file.id })).rejects.toMatchObject({ code: 'not-found' });
    await expect(service.setFileVisibility({ ...ctx, token: { id: 'token-probe' } as ServiceContext['token'] }, { fileId: file.id, visibility: 'course' })).rejects.toMatchObject({ code: 'forbidden' });
    await service.setFileVisibility(ctx, { fileId: file.id, visibility: 'course' });
    expect((await service.listFiles(student, { courseId: 'c-stat110', limit: 200 })).items.some(item => item.id === file.id)).toBe(true);
    expect(await (await content(new Request(`https://example.test/api/v1/files/${file.id}/content`), student, bucket as never, { fileId: file.id })).text()).toContain('PRIVATE-SYLLABUS-CONTENT-PROBE');
  });

  it('keeps applied outcomes hidden from learners until a person keeps each draft', async () => {
    const ctx = await setup(kind);
    const readSession = await read(ctx);
    const token = { ...ctx, token: { id: 'token-probe', name: 'Fictional assistant' } as ServiceContext['token'], agent: { name: 'Fictional assistant' } };
    const confirmed = await service.confirmOutcomes(token, { sessionId: readSession.id, outcomes: [{ code: 'O1', text: 'Compare fictional survey methods in a new way.', originalText: '', source: 'instructor' }] });
    expect(confirmed.confirmedOutcomes?.[0].submittedBy).toEqual({ kind: 'agent', name: 'Fictional assistant' });
    await service.advanceDesignSession(ctx, { sessionId: readSession.id });
    const selected = (await ctx.repo.getDesignSession(readSession.id))!;
    await service.selectApproach(ctx, { sessionId: selected.id, optionIds: [selected.options![0].id], overlays: ['bookends'], rationale: 'Repeated practice fits these learners.' });
    const plan = await service.previewProvisionPlan(ctx, { sessionId: selected.id });
    await service.applyProvisionPlan(token, { sessionId: selected.id, hash: plan.hash });
    const applied = (await ctx.repo.getDesignSession(selected.id))!;
    const draft = (await ctx.repo.listOutcomes(selected.courseId)).find(item => applied.created.outcomeIds.includes(item.id))!;
    expect(draft.aiState).toBe('draft');
    const student = { ...ctx, user: await ctx.repo.getUser('u-priya') };
    expect((await service.getCourseOutline(student, { courseId: selected.courseId })).course.outcomes).not.toContain(draft.text);
    expect((await service.listOutcomes(student, { courseId: selected.courseId })).some(item => item.id === draft.id)).toBe(false);
    await expect(service.keepDesignOutcome(token, { sessionId: selected.id, outcomeId: draft.id })).rejects.toMatchObject({ code: 'forbidden' });
    const kept = await service.keepDesignOutcome(ctx, { sessionId: selected.id, outcomeId: draft.id });
    expect(kept.aiState).toBeUndefined();
    expect((await service.getCourseOutline(student, { courseId: selected.courseId })).course.outcomes).toContain(draft.text);
    const undone = await service.undoProvisionPlan(ctx, { sessionId: selected.id });
    expect(undone.kept).toContainEqual({ kind: 'outcome', id: draft.id, title: draft.text });
    expect((await service.getCourseOutline(student, { courseId: selected.courseId })).course.outcomes).toContain(draft.text);
  });

  it('claims one options job under concurrent confirmations and fails superseded work before AI', async () => {
    const ctx = await setup(kind);
    const session = await read(ctx);
    const confirmed = session.extraction!.outcomes.map((item, i) => ({ code: `O${i + 1}`, text: item.text, originalText: item.text }));
    const results = await Promise.allSettled([service.confirmOutcomes(ctx, { sessionId: session.id, outcomes: confirmed }), service.confirmOutcomes(ctx, { sessionId: session.id, outcomes: confirmed })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const active = (await ctx.repo.getDesignSession(session.id))!.provisioning!.jobId!;
    const stale = { ...(await ctx.repo.getGenerationJob(active))!, id: `gj-stale-${kind}` };
    await ctx.repo.putGenerationJob(stale);
    const ai = vi.fn(fixtureAi.run);
    const result = await advanceExtractJob({ ...ctx, ai: { run: ai } as ServiceContext['ai'] }, stale);
    expect(result).toMatchObject({ state: 'failed', error: expect.stringContaining('superseded') });
    expect(ai).not.toHaveBeenCalled();
    expect((await service.advanceDesignSession(ctx, { sessionId: session.id })).options).not.toBeNull();
  });

  it('makes session reads inert and requires the AI operation to advance a job', async () => {
    const ctx = await setup(kind);
    const calls = vi.fn(fixtureAi.run);
    const runCtx = { ...ctx, ai: { run: calls } as ServiceContext['ai'] };
    const started = await service.createDesignSession(runCtx, { courseId: 'c-stat110', sourceKind: 'syllabus', sample: true, consent: { syllabusOnly: true, rememberProfile: false } });
    const before = await ctx.repo.getDesignSession(started.id);
    const readCtx = { ...runCtx, token: { id: 'read-only' } as ServiceContext['token'] };
    expect((await service.getDesignSession(readCtx, { sessionId: started.id })).provisioning?.done).toBe(0);
    expect(await ctx.repo.getDesignSession(started.id)).toEqual(before);
    expect(calls).not.toHaveBeenCalled();
    expect(ROUTES.getDesignSession.scope).toBe('content:read');
    expect(ROUTES.advanceDesignSession.scope).toBe('ai:run');
    expect((await service.advanceDesignSession(runCtx, { sessionId: started.id })).provisioning?.done).toBe(1);
  });

  it('removes two-row rosters and standalone name/ID lines before any model input', async () => {
    const ctx = await setup(kind);
    const text = ['Week 1 | Evidence and claims', 'Student Name | Student ID', 'Ada Lovelace | 1234567', 'Grace Hopper | 2345678', 'Week 2 | Compare sources', 'Katherine Johnson | kj@student.example.edu'].join('\n');
    const source = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text, consent: { syllabusOnly: true, rememberProfile: false } });
    const cleaned = source.source.sections.map(section => section.text).join('\n');
    expect(cleaned).toContain('Week 1 | Evidence');
    for (const name of ['Ada Lovelace', 'Grace Hopper', 'Katherine Johnson']) expect(cleaned).not.toContain(name);
    let prompt = '';
    const ai = { run: async (task: never, input: never) => { if (task === 'syllabus-extract') prompt = JSON.stringify(input); return fixtureAi.run(task, input); } } as ServiceContext['ai'];
    await service.advanceDesignSession({ ...ctx, ai }, { sessionId: source.id });
    expect(prompt).not.toContain('Ada Lovelace');
    expect(prompt).not.toContain('Katherine Johnson');
    expect((await ctx.repo.getDesignSession(source.id))!.extraction!.problems.some(problem => problem.message.includes('removed a table'))).toBe(true);
    const oneRow = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text: 'Student Name | Student ID\nFictional Student | 3456789\nWeek 1 | Evidence', consent: { syllabusOnly: true, rememberProfile: false } });
    expect(oneRow.source.sections.map(section => section.text).join('\n')).not.toContain('Fictional Student');
  });

  it('logs only allowlisted fields for an upstream HTTP error containing syllabus text', async () => {
    const ctx = await setup(kind);
    const session = await read(ctx);
    await service.confirmOutcomes(ctx, { sessionId: session.id, outcomes: session.extraction!.outcomes.map((item, i) => ({ code: `O${i + 1}`, text: item.text, originalText: item.text })) });
    const marker = 'PRIVATE-SYLLABUS-CONTENT-PROBE Dr. Fictional';
    const ai = palmyraClient({ apiKey: 'local', url: 'https://example.test', fetchImpl: async () => new Response(marker, { status: 400 }) });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await service.advanceDesignSession({ ...ctx, ai }, { sessionId: session.id });
      expect(JSON.stringify(log.mock.calls)).not.toContain(marker);
      expect(log).toHaveBeenCalledWith('design AI failed', { task: 'structure-options', status: 400, category: 'ai-failed', sessionId: session.id, jobId: expect.any(String) });
    } finally { log.mockRestore(); }
  });

  it('uses accepted typed corrections for budget, options, and plan while preserving extraction', async () => {
    const ctx = await setup(kind);
    const session = await read(ctx);
    await service.contestDesignField(ctx, { sessionId: session.id, field: 'credits', correction: '6' });
    await service.contestDesignField(ctx, { sessionId: session.id, field: 'termWeeks', correction: '16' });
    await service.contestDesignField(ctx, { sessionId: session.id, field: 'meeting', correction: 'Monday Wednesday 75 minutes' });
    const changed = await service.contestDesignField(ctx, { sessionId: session.id, field: 'modality', correction: 'hybrid' });
    expect(changed.extraction!.profile.credits.value).toBe(3);
    expect(changed.effectiveProfile).toMatchObject({ credits: { value: 6 }, termWeeks: { value: 16 }, meeting: { value: { days: ['Monday', 'Wednesday'], minutes: 75 } }, modality: { value: 'hybrid' }, weeklyHoursBudget: 18 });
    expect(changed.read!.workload.weeklyBudgetHours).toBe(18);
    let input: unknown;
    const ai = { run: async (task: never, value: never) => { if (task === 'structure-options') input = value; return fixtureAi.run(task, value); } } as ServiceContext['ai'];
    await options({ ...ctx, ai }, changed);
    expect(input).toMatchObject({ profile: { credits: { value: 6 }, termWeeks: { value: 16 }, modality: { value: 'hybrid' } }, weeks: 16 });
  });

  it('preserves every project week and reading and avoids a break-week deadline', async () => {
    const ctx = await setup(kind);
    const session = await read(ctx);
    const weekQuestion = session.questions.find(item => item.weekIds?.includes(8))!;
    expect(weekQuestion).toBeDefined();
    await service.answerDesignQuestions(ctx, { sessionId: session.id, answers: [{ questionId: weekQuestion.id, optionId: 'break', skipped: false }], teachingNote: '' });
    const shown = await options(ctx, (await ctx.repo.getDesignSession(session.id))!);
    const project = shown.options!.find(option => option.id === 'project')!;
    expect(project).toBeDefined();
    await service.selectApproach(ctx, { sessionId: session.id, optionIds: ['project'], overlays: ['bookends'], rationale: 'Projects fit this syllabus and its milestones.' });
    const plan = await service.previewProvisionPlan(ctx, { sessionId: session.id });
    const projectWeeks = new Set(project.modules.flatMap(module => module.weeks));
    const covered = new Set(plan.modules.flatMap(module => module.lessons.flatMap(lesson => lesson.weeks ?? (lesson.week === null ? [] : [lesson.week]))));
    expect([...projectWeeks].filter(week => !covered.has(week))).toEqual([]);
    for (const row of shown.extraction!.schedule.filter(row => row.reading && projectWeeks.has(row.week))) {
      expect(plan.readings.some(reading => reading.week === row.week && reading.title === row.reading)).toBe(true);
    }
    for (const row of shown.extraction!.schedule.filter(row => row.topic && projectWeeks.has(row.week) && !row.empty)) {
      expect(plan.modules.some(module => module.lessons.some(lesson => (lesson.weeks ?? []).some(week => coveredWeeks(row).includes(week)) && lesson.title.includes(row.topic.trim())))).toBe(true);
    }
    const start = Date.parse(shown.effectiveProfile?.termStart.value ?? shown.extraction!.profile.termStart.value!);
    for (const due of plan.modules.flatMap(module => module.assignments ?? []).flatMap(item => item.dueAt ? [item.dueAt] : [])) {
      expect(Math.floor((Date.parse(due) - start) / 604800000) + 1).not.toBe(8);
    }
  });
});

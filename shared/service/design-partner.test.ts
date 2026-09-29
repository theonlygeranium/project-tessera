import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { fixtureAi } from '../ai';
import type { FileRecord } from '../domain';
import { seedData } from '../seed';
import type { ServiceContext } from './context';
import { advanceGenerationJob, WORKFLOW_STALL_MS } from './generation';
import { MemoryRepo, service } from './index';
import { csvCell, joinSmallCaps } from './design-partner';
import { AiPolicySchema, WorkloadRatesSchema } from '../schema/domain';
import { RICE_DEFAULTS, validWorkloadRates } from '../policy';
import { effectiveProfile } from '../design/effective-profile';

const at = '2026-09-28T12:00:00.000Z';
let clock = Date.parse(at);
async function context(): Promise<ServiceContext> {
  const repo = new MemoryRepo(seedData()); let n = 0;
  clock = Date.parse(at);
  return { repo, ai: fixtureAi, user: await repo.getUser('u-okafor'), now: () => new Date(clock).toISOString(), newId: prefix => `${prefix}-${++n}` };
}
const sample = { courseId: 'c-stat110', sourceKind: 'syllabus' as const, sample: true as const, consent: { syllabusOnly: true as const, rememberProfile: false } };
const file: FileRecord = { id: 'f-test', courseId: 'c-stat110', name: 'Syllabus.pdf', kind: 'pdf', mime: 'application/pdf', size: 100, key: 'files/test', version: 1, uploadedBy: 'u-okafor', uploadedAt: at, scan: null };

describe('design partner service', () => {
  it('applies days-only meeting and common modality corrections without losing extracted minutes', async () => {
    const ctx = await context();
    const session = await service.createDesignSession(ctx, sample);
    await service.advanceDesignSession(ctx, { sessionId: session.id });
    const read = await service.advanceDesignSession(ctx, { sessionId: session.id });
    const extracted = read.extraction!.profile;
    const profile = effectiveProfile(extracted, [], { meeting: 'Tuesday Thursday', modality: 'Hybrid' });
    expect(profile.meeting.value).toEqual({ days: ['Tuesday', 'Thursday'], minutes: extracted.meeting.value!.minutes });
    expect(profile.modality.value).toBe('hybrid');
    for (const [text, expected] of [['online', 'online-async'], ['fully online', 'online-async'], ['asynchronous online', 'online-async'], ['synchronous online', 'online-sync'], ['live online', 'online-sync'], ['in person', 'in-person'], ['face-to-face', 'in-person'], ['HyFlex', 'hyflex']]) {
      expect(effectiveProfile(extracted, [], { modality: text }).modality.value).toBe(expected);
    }
  });
  it('neutralizes spreadsheet formulas after whitespace and control characters before CSV quoting', () => {
    for (const prefix of ['=', '+', '-', '@']) for (const lead of ['', '  ', '\t', '\r\n', '\u0000']) {
      expect(csvCell(`${lead}${prefix}SUM(1,1)`)).toBe(`"'${lead}${prefix}SUM(1,1)"`);
    }
    expect(csvCell('Ordinary "quoted" cell')).toBe('"Ordinary ""quoted"" cell"');
  });
  it('uses the same finite, positive, at-most-1000 rate constraint in policy and service', async () => {
    const ctx = await context();
    const institution = await ctx.repo.getInstitution();
    for (const invalid of [0, -1, 1001, Infinity, NaN]) {
      const rates = { ...RICE_DEFAULTS, readingPagesPerHour: invalid };
      expect(validWorkloadRates(rates)).toBe(false);
      expect(WorkloadRatesSchema.safeParse(rates).success).toBe(false);
      expect(AiPolicySchema.safeParse({ ...institution.policy, workloadRates: rates }).success).toBe(false);
      await expect(service.updatePolicy({ ...ctx, user: await ctx.repo.getUser('u-admin') }, { ...institution.policy, workloadRates: rates })).rejects.toMatchObject({ code: 'invalid' });
    }
    expect(WorkloadRatesSchema.safeParse({ ...RICE_DEFAULTS, readingPagesPerHour: 0.0001 }).success).toBe(true);
    expect(WorkloadRatesSchema.safeParse({ ...RICE_DEFAULTS, readingPagesPerHour: 1000 }).success).toBe(true);
  });
  it('persists institution design controls and applies them to new sessions', async () => {
    const ctx = await context();
    const institution = await ctx.repo.getInstitution();
    const policy = { ...institution.policy, designPartner: { enabled: false, allowedArchitectures: ['project' as const] }, workloadRates: { readingPagesPerHour: 25, problemSetHours: 3, writingHoursPerPage: 2, projectHours: 35, quizMinutes: 15, discussionMinutes: 30 }, defaultAiDisclosure: 'Our instructor reviews each draft before learners see it.' };
    await service.updatePolicy({ ...ctx, user: await ctx.repo.getUser('u-admin') }, policy);
    await expect(service.createDesignSession(ctx, sample)).rejects.toMatchObject({ code: 'ai-disabled' });
    await service.updatePolicy({ ...ctx, user: await ctx.repo.getUser('u-admin') }, { ...policy, designPartner: { ...policy.designPartner, enabled: true } });
    const started = await service.createDesignSession(ctx, sample);
    await service.advanceDesignSession(ctx, { sessionId: started.id });
    const read = await service.advanceDesignSession(ctx, { sessionId: started.id });
    expect(read.read?.workload.rates).toEqual(policy.workloadRates);
    await service.confirmOutcomes(ctx, { sessionId: started.id, outcomes: read.extraction!.outcomes.map((outcome, index) => ({ code: `O${index + 1}`, text: outcome.text, originalText: outcome.text })) });
    const options = await service.advanceDesignSession(ctx, { sessionId: started.id });
    expect(options.options?.map(option => option.id)).toEqual(['project']);
    expect((await ctx.repo.getInstitution()).policy.defaultAiDisclosure).toBe(policy.defaultAiDisclosure);
  });
  it('requires the instructor, consent, and enabled policy', async () => {
    const ctx = await context();
    await expect(service.createDesignSession({ ...ctx, user: await ctx.repo.getUser('u-priya') }, sample)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(service.createDesignSession(ctx, { ...sample, consent: { syllabusOnly: false as never, rememberProfile: false } })).rejects.toMatchObject({ code: 'invalid' });
    const institution = await ctx.repo.getInstitution(); institution.policy.designPartner = { enabled: false, allowedArchitectures: null }; await ctx.repo.putInstitution(institution);
    await expect(service.createDesignSession(ctx, sample)).rejects.toMatchObject({ code: 'ai-disabled' });
    institution.policy.designPartner.enabled = true; institution.policy.aiAuthoring = false; await ctx.repo.putInstitution(institution);
    await expect(service.createDesignSession(ctx, sample)).rejects.toMatchObject({ code: 'ai-disabled' });
  });
  it('denies new suggestions and approach generation in an existing session after policy is disabled', async () => {
    const ctx = await context();
    const started = await service.createDesignSession(ctx, sample);
    await service.advanceDesignSession(ctx, { sessionId: started.id });
    const read = await service.advanceDesignSession(ctx, { sessionId: started.id });
    const admin = { ...ctx, user: await ctx.repo.getUser('u-admin') };
    const institution = await ctx.repo.getInstitution();
    await service.updatePolicy(admin, { ...institution.policy, designPartner: { enabled: false, allowedArchitectures: null } });
    await expect(service.suggestDesignOutcomes(ctx, { sessionId: started.id })).rejects.toMatchObject({ code: 'ai-disabled' });
    await expect(service.confirmOutcomes(ctx, { sessionId: started.id, outcomes: read.extraction!.outcomes.map((item, index) => ({ code: `O${index + 1}`, text: item.text, originalText: item.text })) })).rejects.toMatchObject({ code: 'ai-disabled' });
    expect((await service.advanceDesignSession(ctx, { sessionId: started.id })).read).not.toBeNull();
  });
  it('stores a sample source and advances extraction and questions on two polls', async () => {
    const ctx = await context();
    const started = await service.createDesignSession(ctx, sample);
    expect(started).toMatchObject({ stage: 'start', source: { name: 'STAT110_Syllabus_Fall2026.pdf', fileId: null, ocr: false }, consent: { syllabusOnly: true, at } });
    expect(await service.listDesignSessions(ctx, { courseId: sample.courseId })).toHaveLength(1);
    const first = await service.advanceDesignSession(ctx, { sessionId: started.id });
    expect(first).toMatchObject({ stage: 'start', provisioning: { done: 1, total: 2 } });
    expect(first.extraction?.outcomes).toHaveLength(6);
    expect(first.questions).toHaveLength(0);
    const done = await service.advanceDesignSession(ctx, { sessionId: started.id });
    expect(done).toMatchObject({ stage: 'read', read: { provenance: { task: 'syllabus-analyze' } }, provisioning: { done: 2, total: 2 } });
    expect(done.questions.some(question => question.fromProblem === 'empty-week' && question.text.includes('week 8'))).toBe(true);
    expect(done.questions.at(-1)?.id).toBe('question-teaching-approach');
    expect(done.questions.some(question => question.id.startsWith('question-unassessed-'))).toBe(true);
    expect(done.questions.some(question => question.id.startsWith('question-milestones-'))).toBe(true);
    expect(done.questions.length).toBeLessThanOrEqual(6);
    expect(done.read?.outcomeAudits.find(audit => audit.outcomeId === 'outcome-2')?.suggestion?.text).toContain('Explain variability');
    expect(done.read?.workload.weeks.find(week => week.week === 11)?.overBudget).toBe(true);
    expect((await ctx.repo.getGenerationJob(done.provisioning!.jobId!))?.state).toBe('done');
  });
  it('filters QM refs unless the readiness rubric is a matching custom rubric', async () => {
    const ctx = await context();
    const ai = { run: async (task: never, input: never) => {
      const result = await fixtureAi.run(task, input);
      if (task === 'syllabus-analyze') return { ...result, output: { ...(result.output as object), deficiencies: [{ code: 'qm-test', message: 'Possible gap', spans: [], rubricRefs: [{ rubric: 'qm', item: '2.1' }] }] } };
      return result;
    } } as ServiceContext['ai'];
    const started = await service.createDesignSession({ ...ctx, ai }, sample);
    await service.advanceDesignSession({ ...ctx, ai }, { sessionId: started.id });
    const read = await service.advanceDesignSession({ ...ctx, ai }, { sessionId: started.id });
    expect(read.read?.deficiencies[0].rubricRefs).toEqual([]);
    const rubric = (await ctx.repo.getRubric('rubric-tessera'))!;
    await ctx.repo.putRubric({ ...rubric, id: 'rubric-qm-test', name: 'Quality Matters local copy', source: 'custom', builtIn: false });
    const institution = await ctx.repo.getInstitution(); institution.readinessPolicy = { rubricId: 'rubric-qm-test', minimumPercent: null }; await ctx.repo.putInstitution(institution);
    const second = await service.createDesignSession({ ...ctx, ai }, sample);
    await service.advanceDesignSession({ ...ctx, ai }, { sessionId: second.id });
    const allowed = await service.advanceDesignSession({ ...ctx, ai }, { sessionId: second.id });
    expect(allowed.read?.deficiencies[0].rubricRefs).toEqual([{ rubric: 'qm', item: '2.1' }]);
  });
  it('rejects malformed analysis without writing a read', async () => {
    const ctx = await context();
    const ai = { run: async (task: never, input: never) => task === 'syllabus-analyze' ? { output: { summary: 'bad' }, model: 'broken' } : fixtureAi.run(task, input) } as ServiceContext['ai'];
    const started = await service.createDesignSession({ ...ctx, ai }, sample);
    await service.advanceDesignSession({ ...ctx, ai }, { sessionId: started.id });
    const failed = await service.advanceDesignSession({ ...ctx, ai }, { sessionId: started.id });
    expect(failed.read).toBeNull();
    expect(failed.provisioning?.error).toMatch(/expected shape/);
  });
  it('rejects malformed suggested rewrites without writing a read', async () => {
    const ctx = await context();
    const ai = { run: async (task: never, input: never) => task === 'objective-rewrite' ? { output: { text: 'Explain it.' }, model: 'broken' } : fixtureAi.run(task, input) } as ServiceContext['ai'];
    const started = await service.createDesignSession({ ...ctx, ai }, sample);
    await service.advanceDesignSession({ ...ctx, ai }, { sessionId: started.id });
    const failed = await service.advanceDesignSession({ ...ctx, ai }, { sessionId: started.id });
    expect(failed.read).toBeNull();
    expect(failed.provisioning?.error).toMatch(/expected shape/);
  });
  it('confirms edited, reordered outcomes only after the read, records a contest, and recomputes rates', async () => {
    const ctx = await context();
    const started = await service.createDesignSession(ctx, sample);
    await expect(service.confirmOutcomes(ctx, { sessionId: started.id, outcomes: [] })).rejects.toMatchObject({ code: 'invalid' });
    await service.advanceDesignSession(ctx, { sessionId: started.id });
    const ready = await service.advanceDesignSession(ctx, { sessionId: started.id });
    await expect(service.confirmOutcomes(ctx, { sessionId: ready.id, outcomes: [] })).rejects.toMatchObject({ code: 'invalid' });
    const contested = await service.contestDesignField(ctx, { sessionId: ready.id, field: 'meeting', correction: 'Wednesday only' });
    expect(contested.questions.find(question => question.id === 'question-contest-meeting')?.answer?.value).toBe('Wednesday only');
    const rates = { ...ready.read!.workload.rates, problemSetHours: 4 };
    const updated = await service.updateDesignRates(ctx, { sessionId: ready.id, rates });
    expect(updated.read!.workload.weeks.find(week => week.week === 2)!.hours).toBeGreaterThan(ready.read!.workload.weeks.find(week => week.week === 2)!.hours);
    const original = ready.extraction!.outcomes;
    const confirmed = await service.confirmOutcomes(ctx, { sessionId: ready.id, outcomes: [{ code: 'O6', text: original[5].text, originalText: original[5].text }, { code: 'O2', text: 'Explain variability with an example.', originalText: original[1].text }] });
    expect(confirmed).toMatchObject({ stage: 'approaches', options: null, confirmedOutcomes: [{ code: 'O6' }, { code: 'O2' }] });
    expect(confirmed.record.confirmedOutcomes).toEqual(confirmed.confirmedOutcomes);
    expect(confirmed.record.decisions.some(item => item.what.includes('Contested profile meeting'))).toBe(true);
    await expect(service.confirmOutcomes(ctx, { sessionId: ready.id, outcomes: [{ code: 'O1', text: original[0].text, originalText: original[0].text }] })).rejects.toMatchObject({ code: 'invalid' });
  });
  it('advances options on a poll, validates selection, and records the choice', async () => {
    const ctx = await context();
    const started = await service.createDesignSession(ctx, sample);
    await service.advanceDesignSession(ctx, { sessionId: started.id });
    const read = await service.advanceDesignSession(ctx, { sessionId: started.id });
    const outcome = read.extraction!.outcomes[0];
    const confirmed = await service.confirmOutcomes(ctx, { sessionId: read.id, outcomes: [{ code: 'O1', text: outcome.text, originalText: outcome.text }] });
    expect(confirmed).toMatchObject({ stage: 'approaches', options: null, provisioning: { done: 0, total: 1 } });
    const options = await service.advanceDesignSession(ctx, { sessionId: read.id });
    expect(options.options).toHaveLength(3);
    expect(options.record.optionsShown).toEqual(options.options);
    await expect(service.selectApproach(ctx, { sessionId: read.id, optionIds: ['micro'], overlays: [], rationale: 'These students need repeated practice.' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(service.selectApproach(ctx, { sessionId: read.id, optionIds: [options.options![0].id], overlays: [], rationale: 'Too short' })).rejects.toMatchObject({ code: 'invalid' });
    const selection = await service.selectApproach(ctx, { sessionId: read.id, optionIds: options.options!.slice(0, 2).map(item => item.id), overlays: ['bookends'], rationale: 'These students need repeated practice.' });
    expect(selection).toMatchObject({ stage: 'preview', selection: { overlays: ['bookends'], rationale: 'These students need repeated practice.' } });
    expect(selection.selection?.combinationNote).toContain(' with ');
    expect(selection.record.selection).toEqual(selection.selection);
  });
  it('keeps confirmed outcomes when options fail and retries only options', async () => {
    const ctx = await context();
    const started = await service.createDesignSession(ctx, sample);
    await service.advanceDesignSession(ctx, { sessionId: started.id });
    const read = await service.advanceDesignSession(ctx, { sessionId: started.id });
    const outcome = read.extraction!.outcomes[0];
    await service.confirmOutcomes(ctx, { sessionId: read.id, outcomes: [{ code: 'O1', text: outcome.text, originalText: outcome.text }] });
    const broken = { ...ctx, ai: { run: async (task: never, input: never) => task === 'structure-options' ? { output: [], model: 'broken' } : fixtureAi.run(task, input) } as ServiceContext['ai'] };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = await service.advanceDesignSession(broken, { sessionId: read.id });
    spy.mockRestore();
    expect(failed.options).toBeNull();
    expect(failed.confirmedOutcomes).toHaveLength(1);
    expect(failed.provisioning?.error).toContain('Try again');
    expect((await ctx.repo.getGenerationJob(failed.provisioning!.jobId!))?.state).toBe('failed');
    const retried = await service.retryDesignOptions(ctx, { sessionId: read.id });
    expect(retried.provisioning?.jobId).not.toBe(failed.provisioning?.jobId);
    const done = await service.advanceDesignSession(ctx, { sessionId: read.id });
    expect(done.options).toHaveLength(3);
  });
  it('accepts instructor-written outcomes and requires a click for suggested ones', async () => {
    const ctx = await context();
    const started = await service.createDesignSession(ctx, sample);
    await service.advanceDesignSession(ctx, { sessionId: started.id });
    const read = await service.advanceDesignSession(ctx, { sessionId: started.id });
    const suggestions = await service.suggestDesignOutcomes(ctx, { sessionId: read.id });
    expect(suggestions.suggestions).toHaveLength(3);
    await expect(service.confirmOutcomes(ctx, { sessionId: read.id, outcomes: [{ code: 'O1', text: 'Explain the topic.', originalText: '', source: 'suggested' }] })).rejects.toMatchObject({ code: 'invalid' });
    const confirmed = await service.confirmOutcomes(ctx, { sessionId: read.id, outcomes: [{ code: 'O1', text: 'Explain the topic.', originalText: '', source: 'instructor' }, { code: 'O2', text: suggestions.suggestions[0].text, originalText: '', source: 'suggested' }] });
    expect(confirmed.confirmedOutcomes?.map(item => item.source)).toEqual(['instructor', 'suggested']);
    expect(confirmed.record.confirmedOutcomes).toEqual(confirmed.confirmedOutcomes);
  });
  it('asks before suggesting when a syllabus lists no outcomes', async () => {
    const ctx = await context();
    const started = await service.createDesignSession(ctx, { ...sample, sample: undefined, text: 'Course title: Community inquiry\n3 credits, 10 weeks\nCourse schedule\n1 Sep 1–5 Question design Ch. 1 Quiz 1' });
    await service.advanceDesignSession(ctx, { sessionId: started.id });
    const read = await service.advanceDesignSession(ctx, { sessionId: started.id });
    expect(read.extraction?.outcomes).toHaveLength(0);
    expect(read.questions.some(question => question.text.includes("doesn't list course outcomes"))).toBe(true);
    expect(read.confirmedOutcomes).toBeNull();
    const suggested = await service.suggestDesignOutcomes(ctx, { sessionId: read.id });
    expect(suggested.suggestions).toHaveLength(3);
    expect((await service.advanceDesignSession(ctx, { sessionId: read.id })).confirmedOutcomes).toBeNull();
  });
  it('accepts pasted text and refuses fileId without a document engine', async () => {
    const ctx = await context();
    const pasted = await service.createDesignSession(ctx, { ...sample, sample: undefined, text: 'A brief\nSecond line', sourceKind: 'brief' });
    expect(pasted.source).toMatchObject({ kind: 'brief', fileId: null, sections: [{ page: null, lines: ['A brief', 'Second line'] }] });
    await ctx.repo.putFile(file);
    await expect(service.createDesignSession(ctx, { ...sample, sample: undefined, fileId: file.id })).rejects.toMatchObject({ code: 'unsupported', message: "Uploads aren't available in demo mode. Use the sample syllabus or paste the text." });
  });
  it('limits long pasted sources and records a problem after extraction', async () => {
    const ctx = await context();
    const started = await service.createDesignSession(ctx, { ...sample, sample: undefined, text: `Course notes\n${'A'.repeat(61_000)}` });
    expect(started.source.chars).toBeLessThanOrEqual(60_000);
    await service.advanceDesignSession(ctx, { sessionId: started.id });
    const ready = await service.advanceDesignSession(ctx, { sessionId: started.id });
    expect(ready.extraction?.problems.some(problem => problem.code === 'missing-field' && problem.message.includes('60,000'))).toBe(true);
  });
  it('removes roster-like table rows before they reach the AI', async () => {
    const ctx = await context();
    const text = 'Course notes\nStudent | ID\nAvery Smith | 1001\nBlair Jones | 1002\nCasey Brown | 1003\nPolicies\nAttendance required.';
    const started = await service.createDesignSession(ctx, { ...sample, sample: undefined, text });
    expect(started.source.sections[0].text).not.toContain('Avery Smith');
    await service.advanceDesignSession(ctx, { sessionId: started.id });
    const ready = await service.advanceDesignSession(ctx, { sessionId: started.id });
    expect(ready.extraction?.problems.some(problem => problem.message.includes('student names'))).toBe(true);
  });
  it('uses the document engine and records OCR when textless files are read', async () => {
    const ctx = await context(); await ctx.repo.putFile(file);
    const documents = { extract: vi.fn(async () => ({ sections: [{ page: 1, heading: '', level: 0, text: 'A syllabus', lines: ['A syllabus'] }], ocr: true })) } as unknown as ServiceContext['documents'];
    const started = await service.createDesignSession({ ...ctx, documents }, { ...sample, sample: undefined, fileId: file.id });
    expect(documents!.extract).toHaveBeenCalledWith({ ...file, visibility: 'course' });
    expect(started.source).toMatchObject({ fileId: file.id, version: 1, ocr: true });
  });
  it('removes page furniture repeated on at least half of three PDF pages', async () => {
    const ctx = await context(); await ctx.repo.putFile(file);
    const distinct = ['alpha', 'beta', 'gamma'];
    const documents = { extract: async () => ({ sections: [1, 2, 3].map(page => ({ page, heading: '', level: 0, text: '', lines: [`${page} | P a g e`, `Unique ${distinct[page - 1]} content`] })), ocr: false }) } as unknown as ServiceContext['documents'];
    const started = await service.createDesignSession({ ...ctx, documents }, { ...sample, sample: undefined, fileId: file.id });
    expect(started.source.sections.flatMap(section => section.lines)).toEqual(['Unique alpha content', 'Unique beta content', 'Unique gamma content']);
  });
  it('logs only safe metadata and stores a short reason for extract and read failures', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const ctx = await context();
      const broken = { run: async () => { throw new ApiError('ai-failed', 'The AI draft could not be created. Try again.', { cause: 'Error: cut off at length limit' }); } } as ServiceContext['ai'];
      const first = await service.createDesignSession({ ...ctx, ai: broken }, sample);
      const failed = await service.advanceDesignSession({ ...ctx, ai: broken }, { sessionId: first.id });
      expect(failed.provisioning?.error).toContain('(cut off at the length limit)');
      expect(log).toHaveBeenCalledWith('AI task failed', { task: 'syllabus-extract', status: null, category: 'ai-failed', sessionId: first.id, jobId: first.provisioning!.jobId });
      const next = await service.createDesignSession(ctx, sample);
      await service.advanceDesignSession(ctx, { sessionId: next.id });
      const readAi = { run: async (task: never, input: never) => task === 'syllabus-analyze' ? Promise.reject(new Error('request timed out')) : fixtureAi.run(task, input) } as ServiceContext['ai'];
      const readFailed = await service.advanceDesignSession({ ...ctx, ai: readAi }, { sessionId: next.id });
      expect(readFailed.provisioning?.error).toContain('(timed out)');
      expect(log).toHaveBeenCalledWith('AI task failed', { task: 'syllabus-analyze', status: null, category: 'unexpected', sessionId: next.id, jobId: next.provisioning!.jobId });
    } finally { log.mockRestore(); }
  });
  it('rejects another course file and session access', async () => {
    const ctx = await context(); await ctx.repo.putFile({ ...file, courseId: 'c-comm120' });
    await expect(service.createDesignSession(ctx, { ...sample, sample: undefined, fileId: file.id })).rejects.toMatchObject({ code: 'forbidden' });
    const started = await service.createDesignSession(ctx, sample);
    await expect(service.advanceDesignSession({ ...ctx, user: await ctx.repo.getUser('u-priya') }, { sessionId: started.id })).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('records invalid model output as a job error without writing extraction', async () => {
    const ctx = await context();
    const started = await service.createDesignSession({ ...ctx, ai: { run: async () => ({ output: { profile: null }, model: 'broken' }) } as ServiceContext['ai'] }, sample);
    const after = await service.advanceDesignSession({ ...ctx, ai: { run: async () => ({ output: { profile: null }, model: 'broken' }) } as ServiceContext['ai'] }, { sessionId: started.id });
    expect(after.extraction).toBeNull();
    expect(after.provisioning?.error).toMatch(/expected shape/);
    expect((await ctx.repo.getGenerationJob(started.provisioning!.jobId!))?.state).toBe('failed');
  });
  it('validates answers and saves an opted-in teaching note to a default profile', async () => {
    const ctx = await context();
    const started = await service.createDesignSession(ctx, { ...sample, consent: { syllabusOnly: true, rememberProfile: true } });
    await service.advanceDesignSession(ctx, { sessionId: started.id });
    const ready = await service.advanceDesignSession(ctx, { sessionId: started.id });
    await expect(service.answerDesignQuestions(ctx, { sessionId: started.id, answers: [{ questionId: 'unknown', skipped: true }], teachingNote: '' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(service.answerDesignQuestions(ctx, { sessionId: started.id, answers: [], teachingNote: 'x'.repeat(2001) })).rejects.toMatchObject({ code: 'invalid' });
    const answered = await service.answerDesignQuestions(ctx, { sessionId: started.id, answers: [{ questionId: ready.questions[0].id, optionId: ready.questions[0].options[0].id, skipped: false }], teachingNote: 'I use practice and cases.' });
    expect(answered.questions[0].answer?.optionId).toBe(ready.questions[0].options[0].id);
    expect((await ctx.repo.getInstructorProfile('u-okafor'))?.teachingApproach).toBe('I use practice and cases.');
  });
  it('keeps workflow ownership until stalled, then polling takes over', async () => {
    const ctx = await context(); const background = { startGeneration: vi.fn(async () => {}) };
    const started = await service.createDesignSession({ ...ctx, background }, sample);
    expect(background.startGeneration).toHaveBeenCalledWith(started.provisioning!.jobId);
    expect((await service.advanceDesignSession(ctx, { sessionId: started.id })).provisioning?.done).toBe(0);
    clock += WORKFLOW_STALL_MS + 1000;
    const polled = await service.advanceDesignSession(ctx, { sessionId: started.id });
    expect(polled.provisioning?.done).toBe(1);
    expect((await ctx.repo.getGenerationJob(started.provisioning!.jobId!))?.runner).toBe('poll');
    const stale = await ctx.repo.getGenerationJob(started.provisioning!.jobId!);
    await advanceGenerationJob(ctx, stale!);
    expect((await ctx.repo.getGenerationJob(stale!.id))?.state).toBe('done');
  });
  it('does not overwrite a newer extraction after a delayed runner finishes', async () => {
    const ctx = await context();
    const started = await service.createDesignSession(ctx, sample);
    const initial = (await ctx.repo.getGenerationJob(started.provisioning!.jobId!))!;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const slow = { ...ctx, ai: { run: async (task: never, input: never) => { await held; return fixtureAi.run(task, input); } } as ServiceContext['ai'] };
    const delayed = advanceGenerationJob(slow, initial);
    const first = await advanceGenerationJob(ctx, initial);
    const before = await ctx.repo.getDesignSession(started.id);
    release(); await delayed;
    expect(first.done).toBe(1);
    expect(await ctx.repo.getDesignSession(started.id)).toEqual(before);
    expect((await ctx.repo.getGenerationJob(initial.id))?.done).toBe(1);
  });
  it('joins small-caps splits in headings only', () => {
    expect(joinSmallCaps('C ATALOG D ESCRIPTION')).toBe('CATALOG DESCRIPTION');
    expect(joinSmallCaps('F ALL 2014')).toBe('FALL 2014');
    expect(joinSmallCaps('A SSESSMENT OF F INAL G RADE')).toBe('ASSESSMENT OF FINAL GRADE');
    expect(joinSmallCaps('B LACKBOARD, E MAIL, & T ECHNICAL S UPPORT')).toBe('BLACKBOARD, EMAIL, & TECHNICAL SUPPORT');
    expect(joinSmallCaps('I AM A STUDENT')).toBe('I AM A STUDENT');
    expect(joinSmallCaps('Week 1 A new start')).toBe('Week 1 A new start');
  });
  it('keeps ordinary tables that mention students and strips a real roster', async () => {
    const ctx = await context();
    const rows = ['9 | Oct 18–24 | Justice and the political. | Checkpoint 8', '10 | Oct 25–31 | Applied ethics case (student choice from a set). Essay due. | Essay', '11 | Nov 1–7 | Meaning and absurdity. | Checkpoint 9', '12 | Nov 8–12 | Synthesis and final. | Final exam', 'Student name | Student ID | Email', 'Rivera, Ana | 1234567 | ana@example.edu', 'Chen, Li | 2345678 | li@example.edu', 'Okoro, Sam | 3456789 | sam@example.edu'];
    const session = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text: rows.join('\n'), consent: { syllabusOnly: true, rememberProfile: false } });
    const text = session.source.sections.map(section => section.lines.join('\n')).join('\n');
    expect(text).toContain('10 | Oct 25–31');
    expect(text).toContain('12 | Nov 8–12');
    expect(text).not.toContain('Rivera');
  });
});

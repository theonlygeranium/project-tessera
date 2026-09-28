import seed from '../seed-syllabus.json';
import { ApiError, type Input } from '../api';
import type { DesignSession, DesignSource, DesignQuestion, SyllabusExtraction } from '../domain';
import type { GenerationJob } from '../repo';
import type { Service, ServiceContext } from './context';
import { DEFAULT_AI_DISCLOSURE, designPartnerPolicy } from '../policy';
import { aiEnabled, canTeach, fail, provenance, required, user } from './helpers';
import { validateExtraction } from './validate-design';
import { problemsFrom, questionsFrom } from './design-rules';
import { WORKFLOW_STALL_MS } from './generation';

type Problem = SyllabusExtraction['problems'][number];
const MAX_CHARS = 60_000;
const SAMPLE = seed as DesignSource;

function cleanSource(source: DesignSource): { source: DesignSource; problems: Problem[] } {
  const problems: Problem[] = [];
  let stripped = 0;
  let remaining = MAX_CHARS;
  let clipped = false;
  let clippedAt: number | null = null;
  const flattened = source.sections.flatMap((section, sectionIndex) => (section.lines ?? section.text.split('\n')).map(line => ({ line, sectionIndex })));
  const rosterRow = (line: string) => /(?:\||\t|\s{2,})/.test(line) && /[A-Za-z]{2,}/.test(line)
    || /^(?:\d{3,}\s+)?[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+\d{3,})?$/.test(line.trim());
  const kept = source.sections.map(() => [] as string[]);
  let roster = false;
  for (let index = 0; index < flattened.length; index++) {
    const { line, sectionIndex } = flattened[index];
    const candidates = flattened.slice(index + 1, index + 5).map(entry => entry.line);
    if (/\b(?:student|student\s*id|id\s*number)\b/i.test(line) && candidates.filter(rosterRow).length >= 3) { roster = true; stripped++; continue; }
    if (roster && rosterRow(line)) { stripped++; continue; }
    roster = false;
    if (remaining <= 0) { clipped = true; clippedAt ??= source.sections[sectionIndex].page; continue; }
    const part = line.slice(0, remaining);
    kept[sectionIndex].push(part);
    remaining -= part.length + 1;
    if (part.length < line.length) { clipped = true; clippedAt ??= source.sections[sectionIndex].page; }
  }
  const sections = source.sections.map((section, index) => ({ ...section, lines: kept[index], text: kept[index].join('\n') })).filter(section => section.lines.length);
  if (stripped) problems.push({ code: 'missing-field', message: 'I removed a table that appears to contain student names or IDs before reading this source.', spans: [] });
  if (clipped) problems.push({ code: 'missing-field', message: clippedAt === null ? 'The document is longer than I can read in one pass; I read the first 60,000 characters.' : `The document is longer than I can read in one pass; I read pages 1–${clippedAt}.`, spans: [] });
  const chars = sections.reduce((sum, section) => sum + section.text.length, 0);
  return { source: { ...source, sections, chars }, problems };
}

async function sourceFor(ctx: ServiceContext, input: Input<'createDesignSession'>): Promise<{ source: DesignSource; problems: Problem[] }> {
  const count = Number(Boolean(input.fileId)) + Number(Boolean(input.text?.trim())) + Number(input.sample === true);
  if (count !== 1) fail('invalid', 'Provide exactly one of fileId, text, or sample.');
  if (input.sample && input.sourceKind !== 'syllabus') fail('invalid', 'The sample source is a syllabus.');
  let source: DesignSource;
  if (input.sample) source = { ...SAMPLE, kind: input.sourceKind };
  else if (input.text !== undefined) {
    const text = required(input.text, 'source text');
    source = { kind: input.sourceKind, fileId: null, version: null, name: input.name?.trim() || (input.sourceKind === 'brief' ? 'Pasted training brief' : 'Pasted syllabus'), sections: [{ page: null, heading: '', level: 0, text, lines: text.split(/\r?\n/) }], chars: text.length, ocr: false };
  } else {
    const file = await ctx.repo.getFile(input.fileId!) ?? fail('not-found', 'File not found.');
    if (file.courseId !== input.courseId) fail('forbidden', 'That file belongs to another course.');
    if (file.kind !== 'pdf' && file.kind !== 'docx') fail('invalid', 'Use a PDF or DOCX syllabus.');
    const uploader = await ctx.repo.getUser(file.uploadedBy);
    if (!uploader || uploader.role === 'student') fail('invalid', 'Student uploads cannot be used as a syllabus source.');
    const engine = ctx.documents;
    if (!engine) throw new ApiError('unsupported', "Uploads aren't available in demo mode. Use the sample syllabus or paste the text.");
    const extracted = await engine.extract(file);
    source = { kind: input.sourceKind, fileId: file.id, version: file.version, name: file.name, sections: extracted.sections.map(section => ({ page: section.page ?? null, heading: section.heading, level: section.level, text: section.text, lines: section.lines ?? section.text.split('\n') })), chars: 0, ocr: extracted.ocr };
  }
  return cleanSource(source);
}

async function sessionFor(ctx: ServiceContext, id: string): Promise<DesignSession> {
  const session = await ctx.repo.getDesignSession(id) ?? fail('not-found', 'Design session not found.');
  await canTeach(ctx, session.courseId);
  return session;
}

export async function advanceExtractJob(ctx: ServiceContext, job: GenerationJob): Promise<GenerationJob> {
  if (job.state !== 'running' || job.kind !== 'extract' || !job.sessionId) return job;
  const session = await ctx.repo.getDesignSession(job.sessionId);
  if (!session) return job;
  const { done, state, runner } = job;
  try {
    let result: Awaited<ReturnType<ServiceContext['ai']['run']>> | undefined;
    if (done === 0) result = await ctx.ai.run('syllabus-extract', { sourceKind: session.source.kind, name: session.source.name, sections: session.source.sections });
    const current = await ctx.repo.getGenerationJob(job.id);
    if (!current || current.done !== done || current.state !== state || current.runner !== runner) return current ?? job;
    const latest = await ctx.repo.getDesignSession(job.sessionId);
    if (!latest) return current;
    if (done === 0) {
      const valid = validateExtraction(result!.output, latest.source);
      const notes = JSON.parse(current.instruction || '[]') as Problem[];
      const extraction: SyllabusExtraction = { ...valid, problems: notes, provenance: provenance(ctx, result!.model, 'syllabus-extract', `Read ${latest.source.name}`, latest.source.sections.map(section => ({ id: latest.source.fileId ?? latest.id, name: `${latest.source.name}${section.page ? ` p. ${section.page}` : ''}` }))) };
      latest.extraction = extraction;
      latest.record.extraction = extraction;
    } else {
      const prior = latest.extraction;
      if (!prior) throw new ApiError('invalid', 'The extraction is missing.');
      const problems = [...prior.problems, ...problemsFrom(prior)];
      const extraction: SyllabusExtraction = { ...prior, problems };
      latest.extraction = extraction;
      latest.record.extraction = extraction;
      latest.questions = questionsFrom(problems, extraction, await ctx.repo.getInstructorProfile(latest.createdBy));
      latest.record.questions = latest.questions;
      latest.stage = 'read';
    }
    latest.updatedAt = ctx.now();
    current.done++;
    current.state = current.done >= current.total ? 'done' : 'running';
    current.updatedAt = ctx.now();
    latest.provisioning = { jobId: current.id, done: current.done, total: current.total, error: null };
    await ctx.repo.putDesignSession(latest);
    await ctx.repo.putGenerationJob(current);
    return current;
  } catch (error) {
    const current = await ctx.repo.getGenerationJob(job.id);
    if (!current || current.done !== done || current.state !== state || current.runner !== runner) return current ?? job;
    current.state = 'failed';
    current.error = error instanceof Error ? error.message : 'The syllabus could not be read.';
    current.updatedAt = ctx.now();
    const latest = await ctx.repo.getDesignSession(job.sessionId);
    if (latest) { latest.provisioning = { jobId: current.id, done: current.done, total: current.total, error: current.error }; latest.updatedAt = ctx.now(); await ctx.repo.putDesignSession(latest); }
    await ctx.repo.putGenerationJob(current);
    return current;
  }
}

export const designPartner: Pick<Service, 'createDesignSession' | 'getDesignSession' | 'listDesignSessions' | 'answerDesignQuestions' | 'getInstructorProfile' | 'updateInstructorProfile'> = {
  createDesignSession: async (ctx, input) => {
    await canTeach(ctx, input.courseId);
    await aiEnabled(ctx);
    if (!designPartnerPolicy((await ctx.repo.getInstitution()).policy).enabled) fail('ai-disabled', 'Start from a syllabus is disabled by your administrator.');
    if (input.consent?.syllabusOnly !== true) fail('invalid', 'Consent to read this syllabus is required.');
    const { source, problems } = await sourceFor(ctx, input);
    const now = ctx.now(), id = ctx.newId('ds'), jobId = ctx.newId('gj');
    const record: DesignSession['record'] = { sessionId: id, source: { name: source.name, kind: source.kind, chars: source.chars }, extraction: null, read: null, questions: [], confirmedOutcomes: [], optionsShown: [], selection: null, plan: null, appliedAt: null, undoneAt: null, decisions: [] };
    const session: DesignSession = { id, courseId: input.courseId, mode: 'syllabus', stage: 'start', createdBy: user(ctx).id, createdAt: now, updatedAt: now, source, consent: { syllabusOnly: true, at: now, rememberProfile: input.consent.rememberProfile }, extraction: null, read: null, questions: [], confirmedOutcomes: null, teachingNote: '', options: null, selection: null, plan: null, provisioning: { jobId, done: 0, total: 2, error: null }, created: { outcomeIds: [], moduleIds: [], lessonIds: [], blockIds: [], assignmentIds: [], linkKeys: [] }, record };
    const job: GenerationJob = { id: jobId, courseId: input.courseId, requestedBy: user(ctx).id, kind: 'extract', sessionId: id, state: 'running', done: 0, total: 2, lessonIds: [], error: null, work: [], instruction: JSON.stringify(problems), failures: [], createdAt: now, updatedAt: now };
    await ctx.repo.putDesignSession(session);
    await ctx.repo.putGenerationJob(job);
    if (ctx.background) {
      try { job.runner = 'workflow'; await ctx.repo.putGenerationJob(job); await ctx.background.startGeneration(job.id); }
      catch { job.runner = 'poll'; await ctx.repo.putGenerationJob(job); }
    }
    return session;
  },
  getDesignSession: async (ctx, { sessionId }) => {
    const session = await sessionFor(ctx, sessionId);
    const jobId = session.provisioning?.jobId;
    if (session.stage !== 'start' || !jobId || session.provisioning?.error) return session;
    const job = await ctx.repo.getGenerationJob(jobId);
    if (!job || job.kind !== 'extract' || job.state !== 'running') return session;
    if (job.runner === 'workflow') {
      if (Date.parse(ctx.now()) - Date.parse(job.updatedAt) < WORKFLOW_STALL_MS) return session;
      job.runner = 'poll';
      await ctx.repo.putGenerationJob(job);
    }
    await aiEnabled(ctx);
    await advanceExtractJob(ctx, job);
    return sessionFor(ctx, sessionId);
  },
  listDesignSessions: async (ctx, { courseId }) => { await canTeach(ctx, courseId); return ctx.repo.listDesignSessions(courseId); },
  answerDesignQuestions: async (ctx, { sessionId, answers, teachingNote }) => {
    const session = await sessionFor(ctx, sessionId);
    if (!session.extraction) fail('invalid', 'Wait until the syllabus has been read.');
    if (teachingNote.length > 2_000) fail('invalid', 'Keep the teaching note to 2,000 characters or fewer.');
    const byId = new Map(session.questions.map(question => [question.id, question]));
    if (answers.some(answer => !byId.has(answer.questionId))) fail('invalid', 'One or more question ids are unknown.');
    const updated: DesignQuestion[] = session.questions.map(question => {
      const answer = answers.find(item => item.questionId === question.id);
      if (!answer) return question;
      if (answer.optionId && !question.options.some(option => option.id === answer.optionId)) fail('invalid', 'That answer option is unknown.');
      return { ...question, answer: { optionId: answer.skipped ? null : answer.optionId ?? null, value: answer.skipped ? null : answer.value ?? null, skipped: answer.skipped } };
    });
    session.questions = updated;
    session.record.questions = updated;
    session.teachingNote = teachingNote.trim();
    session.updatedAt = ctx.now();
    if (session.consent.rememberProfile && session.teachingNote) {
      const existing = await ctx.repo.getInstructorProfile(user(ctx).id);
      await ctx.repo.putInstructorProfile({ userId: user(ctx).id, teachingApproach: session.teachingNote, voice: existing?.voice ?? '', assessmentPreferences: existing?.assessmentPreferences ?? { formativeEveryModule: false, prefers: [] }, disclosureText: existing?.disclosureText ?? DEFAULT_AI_DISCLOSURE, updatedAt: ctx.now() });
    }
    await ctx.repo.putDesignSession(session);
    return session;
  },
  getInstructorProfile: async ctx => ctx.repo.getInstructorProfile(user(ctx).id),
  updateInstructorProfile: async (ctx, input) => { const profile = { ...input, userId: user(ctx).id, updatedAt: ctx.now() }; await ctx.repo.putInstructorProfile(profile); return profile; },
};

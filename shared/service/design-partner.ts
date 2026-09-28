import seed from '../seed-syllabus.json';
import { ApiError, type Input } from '../api';
import type { DesignSession, DesignSource, DesignQuestion, SyllabusExtraction, WorkloadRates } from '../domain';
import type { GenerationJob } from '../repo';
import type { Service, ServiceContext } from './context';
import { DEFAULT_AI_DISCLOSURE, designPartnerPolicy, workloadRatesFor } from '../policy';
import { aiEnabled, canTeach, fail, provenance, required, user } from './helpers';
import { validateExtraction, validateRead, validateObjectiveRewrite, repairRead } from './validate-design';
import { analyzeSyllabusFixture } from '../design/read-fixture';
import { estimateWorkload } from '../design/workload';
import { problemsFrom, questionsFrom } from './design-rules';
import { groundSpans } from './ground-spans';
import { normalizeExtraction } from './normalize-extraction';
import { WORKFLOW_STALL_MS } from './generation';
import { selectCandidates } from '../design/candidates';
import { combinationNote, finalizeOptions, validateSuggestions } from '../design/options';
import { advanceScaffoldJob } from './design-plan';

type Problem = SyllabusExtraction['problems'][number];
const MAX_CHARS = 60_000;
const SAMPLE = seed as DesignSource;

/**
 * Headings set in small caps often come out of a PDF as "C ATALOG D ESCRIPTION". In a short
 * all-capitals line, join a lone capital to the capitals after it, unless that would glue the
 * word "A" or "I" to an ordinary word or the line shows no other small-caps split.
 */
const SMALL_WORDS = new Set(['ALL', 'AND', 'ARE', 'AM', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'FOR', 'IF', 'IN', 'IS', 'IT', 'NO', 'NOT', 'OF', 'ON', 'OR', 'SO', 'THE', 'TO', 'WE', 'WILL', 'CAN', 'HAVE', 'NEED', 'MUST', 'MAY', 'WANT']);
export function joinSmallCaps(line: string): string {
  const letters = line.replace(/[^\p{L}]/gu, '');
  if (line.length > 90 || letters.length < 4 || letters !== letters.toLocaleUpperCase()) return line;
  const split = /(^|[\s(–—-])(\p{Lu}) (\p{Lu}{2,})(?=$|[\s,.:;)–—&-])/gu;
  // "A" and "I" are real words; join them only when the line shows other small-caps splits.
  const smallCaps = [...line.matchAll(split)].some(match => match[2] !== 'A' && match[2] !== 'I');
  return line.replace(split, (all, lead: string, first: string, rest: string) => (first === 'A' || first === 'I') && (!smallCaps || SMALL_WORDS.has(rest)) ? all : `${lead}${first}${rest}`);
}

function cleanSource(source: DesignSource): { source: DesignSource; problems: Problem[] } {
  const problems: Problem[] = [];
  let stripped = 0;
  let remaining = MAX_CHARS;
  let clipped = false;
  let clippedAt: number | null = null;
  const pages = new Set(source.sections.map(section => section.page).filter((page): page is number => page !== null));
  const repeated = new Map<string, Set<number>>();
  if (pages.size >= 3) source.sections.forEach(section => {
    if (section.page === null) return;
    for (const line of section.lines ?? section.text.split('\n')) {
      const key = line.trim().toLocaleLowerCase().replace(/\d/g, '#').replace(/\s+/g, ' ');
      if (key) repeated.set(key, (repeated.get(key) ?? new Set()).add(section.page));
    }
  });
  const running = new Set([...repeated].filter(([, seen]) => seen.size >= Math.ceil(pages.size / 2)).map(([key]) => key));
  const flattened = source.sections.flatMap((section, sectionIndex) => (section.lines ?? section.text.split('\n')).map(joinSmallCaps)
    .filter(line => !running.has(line.trim().toLocaleLowerCase().replace(/\d/g, '#').replace(/\s+/g, ' ')))
    .map(line => ({ line, sectionIndex })));
  // A roster is a table headed by student names or IDs whose rows hold a name and an ID or
  // email. Ordinary tables mention students too ("student choice from a set"), so both are required.
  const rosterHeader = (line: string) => /\bstudent\b[\s|]{0,4}(?:name|id|number|e-?mail)\b|\bname\b[^|]{0,20}\|\s*(?:student\s*)?id\b/i.test(line);
  const rosterRow = (line: string) => /^(?:\d{3,}\s*\|?\s*)?[A-Z][a-z]+,?\s+[A-Z][a-z]+/.test(line.trim()) && (/\b\d{3,}\b/.test(line) || /@/.test(line))
    || /^(?:\d{3,}\s+)?[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+\d{3,})?$/.test(line.trim());
  const kept = source.sections.map(() => [] as string[]);
  let roster = false;
  for (let index = 0; index < flattened.length; index++) {
    const { line, sectionIndex } = flattened[index];
    const candidates = flattened.slice(index + 1, index + 5).map(entry => entry.line);
    if (rosterHeader(line) && candidates.filter(rosterRow).length >= 3) { roster = true; stripped++; continue; }
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
  if (job.instruction === 'options') return advanceOptionsJob(ctx, job);
  const session = await ctx.repo.getDesignSession(job.sessionId);
  if (!session) return job;
  const { done, state, runner } = job;
  try {
    let result: Awaited<ReturnType<ServiceContext['ai']['run']>> | undefined;
    let readRepairs: string[] = [];
    if (done === 0) result = await ctx.ai.run('syllabus-extract', { sourceKind: session.source.kind, name: session.source.name, sections: session.source.sections });
    if (done === 1 && session.extraction) {
      const institution = await ctx.repo.getInstitution();
      const policyRubric = institution.readinessPolicy?.rubricId ? await ctx.repo.getRubric(institution.readinessPolicy.rubricId) : null;
      const allowQm = policyRubric?.source === 'custom' && /quality matters|QM/i.test(policyRubric.name);
      const rates = session.workloadRates ?? workloadRatesFor(institution.policy);
      const extraction = { ...session.extraction, problems: [...session.extraction.problems, ...problemsFrom(session.extraction)] };
      const allowed: ('tessera' | 'oscqr' | 'qm')[] = allowQm ? ['tessera', 'oscqr', 'qm'] : ['tessera', 'oscqr'];
      const analyzeInput = { extraction, profileAnswers: {}, rates, rubricRefsAllowed: allowed, sourceKind: session.source.kind, sections: session.source.sections };
      // Tessera's rule-based read fills any outcome the model didn't audit.
      const fallback = analyzeSyllabusFixture(analyzeInput);
      let analyzed!: Awaited<ReturnType<ServiceContext['ai']['run']>>;
      let validated!: ReturnType<typeof validateRead>;
      for (let attempt = 0; ; attempt++) {
        analyzed = await ctx.ai.run('syllabus-analyze', analyzeInput);
        try {
          const repaired = repairRead(groundSpans(analyzed.output, session.source).value, extraction, fallback);
          validated = validateRead(repaired.value, extraction, session.source);
          readRepairs = repaired.repairs;
          break;
        } catch (error) {
          if (attempt >= 1) throw error; // one more read when the shape is wrong
        }
      }
      if (session.source.kind === 'brief' && validated.outcomeAudits.some(audit => audit.mager === null)) fail('invalid', 'The training brief read needs a Mager objective audit.');
      const audits = await Promise.all(validated.outcomeAudits.map(async audit => {
        if (audit.measurable) return audit;
        const outcome = extraction.outcomes.find(item => item.id === audit.outcomeId)!;
        const rewritten = await ctx.ai.run('objective-rewrite', { outcome, nearbyTopics: extraction.schedule.filter(row => !row.empty).map(row => row.topic).slice(0, 5), industry: session.source.kind === 'brief' });
        return { ...audit, suggestion: validateObjectiveRewrite(rewritten.output) };
      }));
      result = { model: analyzed.model, output: { ...validated, outcomeAudits: audits, deficiencies: validated.deficiencies.map(item => ({ ...item, rubricRefs: item.rubricRefs.filter(ref => allowed.includes(ref.rubric)) })), learnerCenteredness: session.source.kind === 'brief' ? null : validated.learnerCenteredness } } as typeof result;
    }
    const current = await ctx.repo.getGenerationJob(job.id);
    if (!current || current.done !== done || current.state !== state || current.runner !== runner) return current ?? job;
    const latest = await ctx.repo.getDesignSession(job.sessionId);
    if (!latest) return current;
    if (done === 0) {
      const grounded = groundSpans(normalizeExtraction(result!.output), latest.source);
      const valid = validateExtraction(grounded.value, latest.source);
      const notes = JSON.parse(current.instruction || '[]') as Problem[];
      const extraction: SyllabusExtraction = { ...valid, problems: notes, provenance: provenance(ctx, result!.model, 'syllabus-extract', `Read ${latest.source.name}.${grounded.unmatched ? ` ${grounded.unmatched} quote${grounded.unmatched === 1 ? '' : 's'} could not be matched to the syllabus.` : ''}`, latest.source.sections.map(section => ({ id: latest.source.fileId ?? latest.id, name: `${latest.source.name}${section.page ? ` p. ${section.page}` : section.heading ? ` § ${section.heading}` : ''}` }))) };
      latest.extraction = extraction;
      latest.record.extraction = extraction;
    } else {
      const prior = latest.extraction;
      if (!prior) throw new ApiError('invalid', 'The extraction is missing.');
      const problems = [...prior.problems, ...problemsFrom(prior)];
      const extraction: SyllabusExtraction = { ...prior, problems };
      latest.extraction = extraction;
      latest.record.extraction = extraction;
      const readOutput = result!.output as ReturnType<typeof validateRead>;
      const institution = await ctx.repo.getInstitution();
      const rates = latest.workloadRates ?? workloadRatesFor(institution.policy);
      const citations = readOutput.cites;
      const read = { ...readOutput, workload: estimateWorkload(extraction.profile, extraction.schedule, extraction.assessments, rates), provenance: provenance(ctx, result!.model, 'syllabus-analyze', `Instructional read of ${latest.source.name}${readRepairs.length ? ` (repaired: ${readRepairs.join('; ')})` : ''}`, citations.map((span, index) => ({ id: `${latest.id}-cite-${index + 1}`, name: `${latest.source.name}${span.page ? ` p. ${span.page}` : ''}`, span }))) };
      latest.read = read;
      latest.record.read = read;
      latest.questions = questionsFrom(problems, extraction, await ctx.repo.getInstructorProfile(latest.createdBy), read);
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
    const cause = error instanceof ApiError && error.details && typeof error.details === 'object' && 'cause' in error.details ? String(error.details.cause) : error instanceof ApiError && error.code === 'invalid' ? `invalid shape: ${error.message}` : error instanceof Error ? error.message : String(error);
    console.error(`syllabus-${done === 0 ? 'extract' : 'analyze'} failed:`, cause);
    const reason = /cut off|length limit|truncat/i.test(cause) ? 'cut off at the length limit' : /timed? out|timeout|abort/i.test(cause) ? 'timed out' : /shape|schema|malformed|invalid json|unexpected token/i.test(cause) ? "response didn't match the expected shape" : 'AI service returned an error';
    current.state = 'failed';
    current.error = `The AI draft could not be created. Try again. (${reason})`;
    current.updatedAt = ctx.now();
    const latest = await ctx.repo.getDesignSession(job.sessionId);
    if (latest) { latest.provisioning = { jobId: current.id, done: current.done, total: current.total, error: current.error }; latest.updatedAt = ctx.now(); await ctx.repo.putDesignSession(latest); }
    await ctx.repo.putGenerationJob(current);
    return current;
  }
}

async function startOptionsJob(ctx: ServiceContext, session: DesignSession): Promise<void> {
  const now = ctx.now(), jobId = ctx.newId('gj');
  const job: GenerationJob = { id: jobId, courseId: session.courseId, requestedBy: user(ctx).id, kind: 'extract', sessionId: session.id, state: 'running', done: 0, total: 1, lessonIds: [], error: null, work: [], instruction: 'options', failures: [], createdAt: now, updatedAt: now };
  session.options = null;
  session.provisioning = { jobId, done: 0, total: 1, error: null };
  session.updatedAt = now;
  await ctx.repo.putDesignSession(session);
  await ctx.repo.putGenerationJob(job);
  if (ctx.background) {
    try { job.runner = 'workflow'; await ctx.repo.putGenerationJob(job); await ctx.background.startGeneration(job.id); }
    catch { job.runner = 'poll'; await ctx.repo.putGenerationJob(job); }
  }
}

async function advanceOptionsJob(ctx: ServiceContext, job: GenerationJob): Promise<GenerationJob> {
  const session = await ctx.repo.getDesignSession(job.sessionId!);
  if (!session?.extraction || !session.confirmedOutcomes?.length) return job;
  const { done, state, runner } = job;
  try {
    const institution = await ctx.repo.getInstitution();
    const choice = selectCandidates(session.extraction, session.questions, session.teachingNote, designPartnerPolicy(institution.policy).allowedArchitectures, session.source.kind);
    const input = { profile: session.extraction.profile, schedule: session.extraction.schedule, assessments: session.extraction.assessments, source: session.source, confirmedOutcomes: session.confirmedOutcomes, answers: session.questions, teachingNote: session.teachingNote, instructorProfile: await ctx.repo.getInstructorProfile(session.createdBy), candidates: choice.ids, closest: choice.closest, overlaysDefault: choice.overlaysDefault, rates: session.workloadRates ?? workloadRatesFor(institution.policy), weeks: choice.weeks };
    let options!: ReturnType<typeof finalizeOptions>;
    for (let attempt = 0; ; attempt++) {
      const result = await ctx.ai.run('structure-options', input);
      try { options = finalizeOptions(result.output, input); break; }
      catch (error) { if (attempt >= 1) throw error; }
    }
    const current = await ctx.repo.getGenerationJob(job.id);
    if (!current || current.done !== done || current.state !== state || current.runner !== runner) return current ?? job;
    const latest = await ctx.repo.getDesignSession(job.sessionId!);
    if (!latest || latest.stage !== 'approaches' || latest.options) return current;
    latest.options = options;
    latest.record.optionsShown = options;
    latest.provisioning = { jobId: current.id, done: 1, total: 1, error: null };
    latest.updatedAt = ctx.now();
    current.done = 1; current.state = 'done'; current.updatedAt = ctx.now();
    await ctx.repo.putDesignSession(latest);
    await ctx.repo.putGenerationJob(current);
    return current;
  } catch (error) {
    const current = await ctx.repo.getGenerationJob(job.id);
    if (!current || current.done !== done || current.state !== state || current.runner !== runner) return current ?? job;
    console.error('structure-options failed:', error);
    current.state = 'failed'; current.error = 'The approaches could not be drafted. Try again.'; current.updatedAt = ctx.now();
    const latest = await ctx.repo.getDesignSession(job.sessionId!);
    if (latest) { latest.provisioning = { jobId: current.id, done: 0, total: 1, error: current.error }; latest.updatedAt = ctx.now(); await ctx.repo.putDesignSession(latest); }
    await ctx.repo.putGenerationJob(current);
    return current;
  }
}

export const designPartner: Pick<Service, 'createDesignSession' | 'getDesignSession' | 'listDesignSessions' | 'answerDesignQuestions' | 'contestDesignField' | 'updateDesignRates' | 'confirmOutcomes' | 'suggestDesignOutcomes' | 'retryDesignOptions' | 'selectApproach' | 'getInstructorProfile' | 'updateInstructorProfile'> = {
  createDesignSession: async (ctx, input) => {
    await canTeach(ctx, input.courseId);
    await aiEnabled(ctx);
    if (!designPartnerPolicy((await ctx.repo.getInstitution()).policy).enabled) fail('ai-disabled', 'Start from a syllabus is disabled by your administrator.');
    if (input.consent?.syllabusOnly !== true) fail('invalid', 'Consent to read this syllabus is required.');
    const { source, problems } = await sourceFor(ctx, input);
    const now = ctx.now(), id = ctx.newId('ds'), jobId = ctx.newId('gj');
    const record: DesignSession['record'] = { sessionId: id, source: { name: source.name, kind: source.kind, chars: source.chars }, extraction: null, read: null, questions: [], confirmedOutcomes: [], optionsShown: [], selection: null, plan: null, appliedAt: null, undoneAt: null, decisions: [] };
    const session: DesignSession = { id, courseId: input.courseId, mode: 'syllabus', stage: 'start', createdBy: user(ctx).id, createdAt: now, updatedAt: now, source, consent: { syllabusOnly: true, at: now, rememberProfile: input.consent.rememberProfile }, extraction: null, read: null, questions: [], confirmedOutcomes: null, teachingNote: '', workloadRates: null, options: null, selection: null, plan: null, provisioning: { jobId, done: 0, total: 2, error: null }, created: { outcomeIds: [], moduleIds: [], lessonIds: [], blockIds: [], assignmentIds: [], linkKeys: [] }, record };
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
    if ((session.stage !== 'start' && !(session.stage === 'approaches' && !session.options) && session.stage !== 'provisioning') || !jobId || (session.stage !== 'provisioning' && session.provisioning?.error)) return session;
    const job = await ctx.repo.getGenerationJob(jobId);
    if (!job || job.state !== 'running' || (job.kind !== 'extract' && job.kind !== 'scaffold')) return session;
    if (job.runner === 'workflow') {
      if (Date.parse(ctx.now()) - Date.parse(job.updatedAt) < WORKFLOW_STALL_MS) return session;
      if (job.kind === 'scaffold') {
        if (!session.applyRevision || !await ctx.repo.setDesignRunner(session.id, session.applyRevision, job.id, 'poll')) return sessionFor(ctx, sessionId);
      } else await ctx.repo.putGenerationJob({ ...job, runner: 'poll' });
      job.runner = 'poll';
    }
    await aiEnabled(ctx);
    if (job.kind === 'scaffold') await advanceScaffoldJob(ctx, job);
    else await advanceExtractJob(ctx, job);
    return sessionFor(ctx, sessionId);
  },
  listDesignSessions: async (ctx, { courseId }) => { await canTeach(ctx, courseId); return ctx.repo.listDesignSessions(courseId); },
  answerDesignQuestions: async (ctx, { sessionId, answers, teachingNote }) => {
    const session = await sessionFor(ctx, sessionId);
    if (!session.read || session.stage !== 'read') fail('invalid', 'Wait until the syllabus has been read.');
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
    const openAnswer = updated.find(question => question.id === 'question-teaching-approach')?.answer;
    session.teachingNote = openAnswer?.skipped ? '' : (openAnswer?.value ?? teachingNote).trim();
    session.updatedAt = ctx.now();
    if (session.consent.rememberProfile && session.teachingNote) {
      const existing = await ctx.repo.getInstructorProfile(user(ctx).id);
      await ctx.repo.putInstructorProfile({ userId: user(ctx).id, teachingApproach: session.teachingNote, voice: existing?.voice ?? '', assessmentPreferences: existing?.assessmentPreferences ?? { formativeEveryModule: false, prefers: [] }, disclosureText: existing?.disclosureText ?? DEFAULT_AI_DISCLOSURE, updatedAt: ctx.now() });
    }
    await ctx.repo.putDesignSession(session);
    return session;
  },
  contestDesignField: async (ctx, { sessionId, field, correction }) => {
    const session = await sessionFor(ctx, sessionId);
    if (!session.read || session.stage !== 'read') fail('invalid', 'Wait until the syllabus has been read.');
    const profile = session.extraction!.profile;
    if (!Object.prototype.hasOwnProperty.call(profile, field) || field === 'weeklyHoursBudget' || !correction.trim() || correction.length > 1000) fail('invalid', 'Provide a profile field and a correction.');
    const item = profile[field as keyof Omit<typeof profile, 'weeklyHoursBudget'>];
    const id = `question-contest-${field}`;
    const question: DesignQuestion = { id, text: `You marked ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} as needing a change. What should I use?`, spans: item.spans, kind: 'text', options: [], required: false, answer: { optionId: null, value: correction.trim(), skipped: false }, fromProblem: 'missing-field' };
    session.questions = [...session.questions.filter(q => q.id !== id && q.id !== 'question-teaching-approach').slice(0, 4), question, ...session.questions.filter(q => q.id === 'question-teaching-approach')];
    session.record.questions = session.questions;
    session.record.decisions.push({ at: ctx.now(), who: user(ctx).id, what: `Contested profile ${field}: ${correction.trim()}` });
    session.updatedAt = ctx.now();
    await ctx.repo.putDesignSession(session);
    return session;
  },
  updateDesignRates: async (ctx, { sessionId, rates }) => {
    const session = await sessionFor(ctx, sessionId);
    if (!session.read || !session.extraction || session.stage !== 'read') fail('invalid', 'Wait until the syllabus has been read.');
    const names: (keyof WorkloadRates)[] = ['readingPagesPerHour', 'problemSetHours', 'writingHoursPerPage', 'projectHours', 'quizMinutes', 'discussionMinutes'];
    if (names.some(name => !Number.isFinite(rates[name]) || rates[name] <= 0 || rates[name] > 1000)) fail('invalid', 'Workload rates must be positive numbers.');
    session.workloadRates = { ...rates };
    session.read!.workload = estimateWorkload(session.extraction!.profile, session.extraction!.schedule, session.extraction!.assessments, rates);
    session.record.read = session.read;
    session.record.decisions.push({ at: ctx.now(), who: user(ctx).id, what: 'Edited workload assumptions for this session.' });
    session.updatedAt = ctx.now();
    await ctx.repo.putDesignSession(session);
    return session;
  },
  confirmOutcomes: async (ctx, { sessionId, outcomes }) => {
    const session = await sessionFor(ctx, sessionId);
    if (session.stage !== 'read' || !session.read || !session.extraction) fail('invalid', 'Read and confirm the syllabus before approaches.');
    if (!outcomes.length) fail('invalid', 'Confirm at least one outcome.');
    const originals = new Map(session.extraction!.outcomes.map(item => [item.text, item]));
    const codes = new Set<string>();
    const sourceTexts = new Set<string>();
    const texts = new Set<string>();
    for (const outcome of outcomes) {
      if (!outcome.code.trim() || !outcome.text.trim() || codes.has(outcome.code) || texts.has(outcome.text.trim()) || (outcome.originalText && sourceTexts.has(outcome.originalText))) fail('invalid', 'Outcomes must have unique codes and text.');
      if (outcome.source === 'suggested' && !session.suggestedOutcomes?.some(item => item.text === (outcome.suggestedText ?? outcome.text))) fail('invalid', 'Use a suggestion shown in this session.');
      if ((outcome.source === 'instructor' || outcome.source === 'suggested') ? outcome.originalText !== '' : !originals.has(outcome.originalText)) fail('invalid', 'The outcome source is invalid.');
      codes.add(outcome.code);
      texts.add(outcome.text.trim());
      if (outcome.originalText) sourceTexts.add(outcome.originalText);
    }
    session.confirmedOutcomes = outcomes.map(item => ({ code: item.code.trim(), text: item.text.trim(), originalText: item.originalText, source: item.source ?? 'syllabus', ...(item.suggestedText ? { suggestedText: item.suggestedText } : {}) }));
    session.record.confirmedOutcomes = session.confirmedOutcomes;
    session.record.decisions.push({ at: ctx.now(), who: user(ctx).id, what: `Confirmed ${outcomes.length} outcomes before approaches.` });
    session.stage = 'approaches';
    await startOptionsJob(ctx, session);
    return session;
  },
  suggestDesignOutcomes: async (ctx, { sessionId }) => {
    const session = await sessionFor(ctx, sessionId);
    if (session.stage !== 'read' || !session.extraction) fail('invalid', 'Read the syllabus first.');
    await aiEnabled(ctx);
    const extraction = session.extraction!;
    const profile = extraction.profile;
    const input = { title: profile.title.value ?? '', description: profile.description.value ?? '', scheduleTopics: extraction.schedule.map(row => row.topic), assessments: extraction.assessments.map(item => ({ title: item.title, format: item.format })) };
    let output!: ReturnType<typeof validateSuggestions>;
    for (let attempt = 0; ; attempt++) {
      const result = await ctx.ai.run('outcome-suggest', input);
      try { output = validateSuggestions(result.output); break; } catch (error) { if (attempt >= 1) throw error; }
    }
    session.suggestedOutcomes = output.suggestions;
    session.updatedAt = ctx.now();
    await ctx.repo.putDesignSession(session);
    return output;
  },
  retryDesignOptions: async (ctx, { sessionId }) => {
    const session = await sessionFor(ctx, sessionId);
    if (session.stage !== 'approaches' || session.options || !session.provisioning?.error) fail('invalid', 'There is no failed approaches draft to retry.');
    await aiEnabled(ctx);
    await startOptionsJob(ctx, session);
    return session;
  },
  selectApproach: async (ctx, { sessionId, optionIds, overlays, rationale }) => {
    const session = await sessionFor(ctx, sessionId);
    if (session.stage !== 'approaches' || !session.options) fail('invalid', 'Wait for the approaches to be drafted.');
    if (!Array.isArray(optionIds) || !optionIds.length || new Set(optionIds).size !== optionIds.length || optionIds.some(id => !session.options!.some(option => option.id === id))) fail('invalid', 'Choose one or more shown approaches.');
    if (!Array.isArray(overlays) || new Set(overlays).size !== overlays.length || overlays.some(id => !['bookends', 'spaced-review', 'udl-choice', 'teaching-presence'].includes(id))) fail('invalid', 'Choose valid overlays.');
    if (rationale.trim().length < 12) fail('invalid', 'Explain why this fits your students in one sentence.');
    session.selection = { optionIds, overlays, rationale: rationale.trim(), combinationNote: combinationNote(optionIds) };
    session.record.selection = session.selection;
    session.record.decisions.push({ at: ctx.now(), who: user(ctx).id, what: `Selected ${optionIds.join(', ')} with ${overlays.join(', ')}. Why: ${session.selection.rationale}` });
    session.stage = 'preview'; session.updatedAt = ctx.now();
    await ctx.repo.putDesignSession(session);
    return session;
  },
  getInstructorProfile: async ctx => ctx.repo.getInstructorProfile(user(ctx).id),
  updateInstructorProfile: async (ctx, input) => { const profile = { ...input, userId: user(ctx).id, updatedAt: ctx.now() }; await ctx.repo.putInstructorProfile(profile); return profile; },
};

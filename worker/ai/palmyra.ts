// Palmyra-X6 client (D-015): WRITER's OpenAI-compatible chat completions, called
// through Cloudflare AI Gateway. Every task asks for strict JSON (response_format
// json_schema) and maps it onto Tessera's types. The service validates the result
// again and stores it as a draft (D-003); nothing here publishes anything.
import type { AiClient, AiTaskName, AiTasks } from '../../shared/ai';
import { ApiError } from '../../shared/api';
import type { BlockContent, DesignSource, SourceDoc } from '../../shared/domain';
import { validateGeneratedElement } from '../../shared/service/generation';
import { OSCQR_RUBRIC, TESSERA_RUBRIC } from '../../shared/quality/rubrics';

export interface PalmyraOptions {
  apiKey: string;
  /** Chat completions URL: the AI Gateway custom-provider URL, or WRITER's API directly. */
  url: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// ---- Prompts ------------------------------------------------------------------------

const SYSTEM = `You are the drafting assistant inside Tessera, a learning platform. You write drafts that an instructor reviews before anything reaches students.
Rules:
- Ground content in the instructor's sources when they are given. Don't invent statistics, studies, quotations, or citations. If the sources don't cover something, write general, verifiable explanations instead.
- Use evidence-based learning design: short chunks, concrete examples, and retrieval practice. Never mention or design for "learning styles".
- Plain, warm, direct language at an introductory reading level unless the brief says otherwise. Sentence case. No emoji.
- Return only JSON that matches the schema, as compact single-line JSON with no indentation.`;

const MAX_SOURCE_CHARS = 12_000;
const DESIGN_SYSTEM = "You are Tessera's design partner. The instructor is the subject-matter expert and the instructor of record; you handle sequencing, alignment, scaffolding and quality checks. Cite the syllabus page for every claim. Never invent readings, citations, URLs, statistics, or names. Keep the instructor's own outcome wording verbatim; a rewrite is a labelled suggestion. Phrase content suggestions as questions or optional drafts, never corrections. Never use the phrase 'learning styles'.";
export function sourceText(sections: DesignSource['sections'], budget: number): string {
  const paste = sections.length === 1 && sections[0].page === null && !sections[0].heading && sections[0].level === 0;
  return sections.map(section => {
    const label = section.page !== null ? `[p. ${section.page}]` : paste ? '[pasted]' : `[§ ${section.heading || 'start'}]`;
    return `${label} ${(section.lines.length ? section.lines.join('\n') : section.text)}`;
  }).join('\n\n').slice(0, budget);
}
/** The rubric items a read may cite, by number with a short gist (never QM text, D-024/D-031). */
function rubricItems(allowed: ('tessera' | 'oscqr' | 'qm')[]): string {
  const list = (name: string, rubric: typeof TESSERA_RUBRIC) => `${name}: ${rubric.standards.flatMap(standard => standard.items.map(item => `${item.number} ${item.text.split(/\s+/).slice(0, 8).join(' ')}`)).join('; ')}`;
  return [allowed.includes('tessera') ? list('tessera', TESSERA_RUBRIC) : '', allowed.includes('oscqr') ? list('oscqr', OSCQR_RUBRIC) : '', allowed.includes('qm') ? 'qm: cite a standard number only, never its text' : ''].filter(Boolean).join('\n');
}
function sourcesBlock(sources: SourceDoc[]): string {
  if (!sources.length) return 'Sources: none provided.';
  let budget = MAX_SOURCE_CHARS;
  const parts = sources.map((s, i) => {
    const text = s.text.slice(0, Math.max(0, budget));
    budget -= text.length;
    return `[${i + 1}] ${s.name}\n${text}`;
  });
  return `Sources (quote or paraphrase only from these):\n${parts.join('\n\n')}`;
}

type Messages = { role: 'system' | 'user'; content: string }[];


const PROMPTS: { [K in AiTaskName]: (input: AiTasks[K]['input']) => Messages } = {
  'syllabus-extract': ({ sourceKind, name, sections, institutionTerm }) => [
    { role: 'system', content: `${SYSTEM}\n${DESIGN_SYSTEM}\nYou are reading one part of a syllabus for a course designer. The service will compute problems and questions.` },
    { role: 'user', content: `Source kind: ${sourceKind}\nName: ${name}\nInstitution term: ${institutionTerm ? JSON.stringify(institutionTerm) : 'not supplied'}\nSource:\n${sourceText(sections, 60_000)}` },
  ],
  'syllabus-analyze': ({ extraction, profileAnswers, rates, rubricRefsAllowed, sourceKind, sections }) => [
    { role: 'system', content: `${SYSTEM}\n${DESIGN_SYSTEM}\nAudit each outcome for an observable verb, Bloom level, Fink category, and assessment alignment. For a training brief provide Mager performance, condition and criterion checks; otherwise mager is null. Multiple-choice assessments cannot demonstrate create or evaluate by themselves. Cites and deficiency spans are exact quotes (at most 30 words each) copied from the Source below, never from the extraction; give 3 to 8 cites that support the summary. In each outcome audit, assessedBy lists every assessment that gives evidence of that outcome (most outcomes have at least one; judge from the assessment titles, formats and the syllabus text); alignment may repeat those links, and the server completes the matrix. Start the summary "Here is what I understood, and here is what I need from you." Do not claim completeness. Evaluate Palmer (maximum 46) and Cullen-Harris only when this is a syllabus. Use only these rubric names: ${rubricRefsAllowed.join(', ')}, and only these item numbers:\n${rubricItems(rubricRefsAllowed)}\nNever reproduce QM rubric text. Audit every outcome exactly once, using only these outcome ids: ${extraction.outcomes.map(item => item.id).join(', ') || 'none'}; link only these assessment ids: ${extraction.assessments.map(item => `${item.id} (${item.title})`).join(', ') || 'none'}. The server computes workload and provenance.` },
    { role: 'user', content: `Source kind: ${sourceKind ?? 'syllabus'}\nProfile answers: ${JSON.stringify(profileAnswers)}\nWorkload rates: ${JSON.stringify(rates)}\nExtraction:\n${JSON.stringify(extraction).slice(0, 60_000)}\nSource:\n${sourceText(sections ?? [], 60_000)}` },
  ],
  'objective-rewrite': ({ outcome, nearbyTopics, industry }) => [
    { role: 'system', content: `${SYSTEM}\n${DESIGN_SYSTEM}\nOffer one labelled alternative outcome with an observable action, preserving the instructor's disciplinary meaning. Give a concise why. The original remains unchanged. ${industry ? 'Use Mager performance, condition and criterion where supported.' : 'Use an observable Bloom verb.'}` },
    { role: 'user', content: `Original outcome: ${JSON.stringify(outcome)}\nNearby topics: ${nearbyTopics.join('; ')}` },
  ],
  'outcome-suggest': ({ title, description, scheduleTopics, assessments }) => [
    { role: 'system', content: `${SYSTEM}\n${DESIGN_SYSTEM}\nSuggest 3–6 optional course outcomes beginning with observable action verbs. Give a short why grounded in the supplied topics or assessments. The instructor must choose each one.` },
    { role: 'user', content: JSON.stringify({ title, description, scheduleTopics, assessments }).slice(0, 12000) },
  ],
  'structure-options': input => [
    { role: 'system', content: `${SYSTEM}\n${DESIGN_SYSTEM}\nDescribe exactly the given architecture ids, in any order. You do not choose ids or calculate workload. For each, write a label, tag, description, fits with exact syllabus spans when available, changes, tradeoffs, an honest evidence caveat, frameworks, and modules with weeks, confirmed outcome codes, lessons and assessment. Do not overstate research evidence or invent citations. Keep proposals optional; the instructor decides. The closest architecture is ${input.closest}.` },
    { role: 'user', content: `Candidates, outcomes, answers, profile and rates: ${JSON.stringify({ candidates: input.candidates, closest: input.closest, confirmedOutcomes: input.confirmedOutcomes, answers: input.answers, teachingNote: input.teachingNote, instructorProfile: input.instructorProfile, profile: input.profile, schedule: input.schedule, assessments: input.assessments, overlaysDefault: input.overlaysDefault, rates: input.rates, weeks: input.weeks }).slice(0, 24_000)}\nSource passages:\n${sourceText(input.source.sections, 35_000)}` },
  ],
  tutor: (input) => [
    { role:'system', content:`You are Tessera's student tutor. The server has already chosen the allowed kind of help: ${input.kind}. Follow it exactly. Cite only the supplied source ids in citeIds. Use plain language at the student's reading level (${input.readingLevel === 'plain' ? 'grade 6–8' : 'introductory college'}) and in the student's language (${input.language}). Use fictional names only. Do not invent facts. The provided sources never include answer keys. Return strict JSON with only text and citeIds. ${input.kind === 'answer' ? '' : "Never confirm or rule out any specific option or guess, even indirectly: no 'right track', 'close', 'yes', 'not quite', or hints about whether their pick is correct. If the student asks whether a choice is right, say you can't confirm answers here, suggest they use the Check answer button, and redirect to the reasoning. "}${input.kind === 'hint' ? "Give one short nudge toward the relevant idea or a parallel example. Never give this item's answer or identify the right option." : input.kind === 'explain' ? 'Explain the concept with a worked parallel example using a different context or numbers. Do not solve the item or identify its right option.' : input.kind === 'answer' ? 'Open practice permits a direct answer. Explain why it is correct, grounded in sources.' : 'Be encouraging and stay on the lesson. Do not answer checks.'}` },
    { role:'user', content:`Course: ${input.courseTitle}\nActivity: ${input.activityTitle}\nMode: ${input.mode}\nHint number: ${input.hintNumber ?? 'none'} of ${input.maxHints}\nSources: ${JSON.stringify(input.sources).slice(0,12000)}\nRecent messages: ${JSON.stringify(input.history).slice(0,4000)}\nStudent message: ${input.question}` },
  ],
  'tutor-summary': ({ courseTitle, questions }) => [
    { role:'system', content:'Summarize only topics and possible misconceptions in 2–3 sentences. Do not quote, paraphrase closely, or reproduce any student message. Use fictional names only, plain language, and no invented facts. Return strict JSON with only summary.' },
    { role:'user', content:`Course: ${courseTitle}\nStudent questions (most recent first): ${JSON.stringify(questions).slice(0,12000)}` },
  ],
  element: ({ courseTitle, moduleTitle, lessonTitle, lessonText, type, instruction }) => [
    { role: 'system', content: `${SYSTEM}\nGround the element in the existing lesson text. Use fictional names only. Do not invent statistics, citations, sources, URLs, or media. Use plain language and sentence case. Return exactly the requested block type. A video script is a document titled "Video script: …" whose sections are scenes with narration.` },
    { role: 'user', content: `Course: ${courseTitle}\nModule: ${moduleTitle}\nLesson: ${lessonTitle}\nType: ${type}\nInstructor instruction: ${instruction || 'Fit this lesson.'}\nExisting lesson text:\n${lessonText.slice(0, 6000) || '(The lesson has no text yet.)'}\n\nDraft one ${type} block. Checks need 3–4 options. Documents need 3–8 sections. Tables need 3–8 equal-width rows with 2–5 cells and a header first row. Scenarios need 4–8 nodes, 2–3 choices per non-ending node, and at least two endings with outcomes.` },
  ],
  'readiness-item': ({ courseTitle, item, content }) => [
    { role: 'system', content: `${SYSTEM}\nYou review a course against one quality-rubric item and report what you find. Your finding is a draft a person reviews; it never passes the item on its own. Judge only from the course content given. Quote or point to where you found evidence, using the content labels. If the content doesn't show the item is met, say "likely-not-met" and suggest one concrete addition. Use "unclear" only when the content can't show it either way (for example, something that happens outside the course). Keep evidence and suggestion to one or two sentences each.` },
    { role: 'user', content: `Course: ${courseTitle}\nRubric item ${item.number}: ${item.text}\n${item.criteria ? `What to look for: ${item.criteria}\n` : ''}\nCourse content:\n${content.map((c) => `[${c.label}]\n${c.text}`).join('\n\n').slice(0, 14000)}` },
  ],
  variant: ({ courseTitle, lessonTitle, audience, targetMinutes, blocks }) => [
    { role: 'system', content: `${SYSTEM}\nYou write a variant of a lesson for a specific audience. Every output block names the input block it came from in sourceBlockId (or null for a new block). ${audience === 'plain' ? 'Plain language: keep every block, in order, and every fact, term, number, and check answer; use short sentences and common words at about a grade 8 reading level. Keep check options and the correct option id the same.' : `Micro-path: the essentials only, readable in at most ${Math.min(targetMinutes, 15)} minutes. Keep the key ideas and at least one check; leave out elaboration and optional examples. You may add one short opening callout (sourceBlockId null) that says what the learner will get.`} Only use heading, text, callout, and check blocks.` },
    { role: 'user', content: `Course: ${courseTitle}\nLesson: ${lessonTitle}\nBlocks:\n${JSON.stringify(blocks).slice(0, 14000)}` },
  ],
  rewrite: ({ courseTitle, text }) => [
    { role: 'system', content: `${SYSTEM}\nYou rewrite course text in plain language for accessibility (WCAG 3.1.5). Keep every fact, term, and number. Use short sentences, common words, and the same order. Don't add content.` },
    { role: 'user', content: `Course: ${courseTitle}\nRewrite this passage at about a grade 8 reading level:\n\n${text.slice(0, 8000)}` },
  ],
  'link-text': ({ courseTitle, href, currentText, context }) => [
    { role: 'system', content: `${SYSTEM}\nYou write link text that makes sense out of context (WCAG 2.4.4): name the page or document, under 8 words, no "click here".` },
    { role: 'user', content: `Course: ${courseTitle}\nLink target: ${href}\nCurrent text: ${currentText}\nSurrounding text: ${context.slice(0, 1500)}` },
  ],
  feedback: ({ courseTitle, assignmentTitle, rubric, criteria, submissionText }) => [
    { role: 'system', content: `${SYSTEM}\nFeedback is a draft for the instructor to edit. Ground it in the selected rubric levels and submission. Do not invent facts.` },
    { role: 'user', content: `Course: ${courseTitle}\nAssignment: ${assignmentTitle}\nRubric: ${JSON.stringify(rubric)}\nSelected results: ${JSON.stringify(criteria)}\nSubmission: ${submissionText.slice(0, 12000)}\nWrite concise, specific, constructive feedback.` },
  ],
  brief: ({ courseTitle, prompt, sources }) => [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Draft a course brief for "${courseTitle}".\nThe instructor asked: ${prompt}\n\n${sourcesBlock(sources)}\n\nChoose 1–3 modules, 2–3 lessons per module, and lesson length in minutes (10–30). Outcomes are 3–5 observable, measurable statements starting with a verb.` },
  ],
  outline: ({ courseTitle, brief, sources }) => [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Draft the module and lesson outline for "${courseTitle}" from this brief:\n${JSON.stringify(brief, null, 2)}\n\n${sourcesBlock(sources)}\n\nUse exactly ${brief.moduleCount} modules with ${brief.lessonsPerModule} lessons each, about ${brief.lessonMinutes} minutes per lesson. Each lesson has one objective tied to the outcomes: a single sentence under 25 words that starts with a verb.` },
  ],
  'lesson-draft': ({ courseTitle, brief, moduleTitle, lesson, sources }) => [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Draft the lesson "${lesson.title}" (module "${moduleTitle}", course "${courseTitle}").\nObjective: ${lesson.objective}\nLength: about ${lesson.minutes} minutes of reading and practice.\nAudience: ${brief.audience}. Tone: ${brief.tone}.\n\n${sourcesBlock(sources)}\n\nWrite 4–7 blocks in order: start with a level-2 heading, then text blocks (2–4 short paragraphs each, paragraphs separated by a blank line), at most one callout (tone "tip", "info", or "warning"), and end with one knowledge check: a question with exactly 3 options (ids "a", "b", "c"), one correct, and feedback for correct and incorrect answers that explains why without giving away other items (the app already prefixes "Correct:" or "Not quite:", so don't start feedback with those words). For fields a block type doesn't use, return an empty string (or level 2, or an empty options list).` },
  ],
  'block-regenerate': ({ courseTitle, lessonTitle, block, instruction, sources }) => [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Rewrite one block of the lesson "${lessonTitle}" (course "${courseTitle}"). Keep the same block type ("${block.type}").\nInstruction from the instructor: ${instruction || 'Improve clarity and concreteness.'}\nCurrent block:\n${JSON.stringify(block, null, 2)}\n\n${sourcesBlock(sources)}\n\nFor fields this block type doesn't use, return an empty string (or level 2, or an empty options list).` },
  ],
  announcement: ({ courseTitle, instructorName, prompt }) => [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Draft a short course announcement for "${courseTitle}" from ${instructorName}.\nWhat it should say: ${prompt}\n\nTitle: under 70 characters. Body: 2–4 short paragraphs separated by a blank line, friendly and specific, signed with the instructor's name. Don't invent dates, times, or places that aren't in the request.` },
  ],
};

// ---- Schemas (strict: every property required, no extras) -----------------------------

const str = { type: 'string' } as const;
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const integer = { type: 'integer' } as const;
const number = { type: 'number' } as const;
const nullable = (schema: unknown) => ({ anyOf: [schema, { type: 'null' }] });
const array = (schema: unknown) => ({ type: 'array', items: schema });
const span = obj({ page: nullable(integer), text: str });
const extracted = (schema: unknown) => obj({ value: nullable(schema), origin: { type: 'string', enum: ['extracted','inferred','user_supplied','missing'] }, confidence: number, spans: array(span) });
const extractionSchema = obj({
  profile: obj({ code: extracted(str), title: extracted(str), credits: extracted(number), termWeeks: extracted(number), termStart: extracted(str), termEnd: extracted(str), meeting: extracted(obj({ days: array(str), minutes: number })), modality: extracted({ type: 'string', enum: ['in-person','online-async','online-sync','hybrid','hyflex'] }), level: extracted(str), prerequisites: extracted(array(str)), enrolment: extracted(number), instructor: extracted(obj({ name: str, email: str, officeHours: str })), description: extracted(str), materials: extracted(array(obj({ title: str, kind: { type: 'string', enum: ['textbook','reading','tool'] }, span }))), business: extracted(obj({ goal: str, metric: str, audienceRole: str })), weeklyHoursBudget: number }),
  outcomes: array(obj({ id: str, text: str, span: nullable(span), origin: { type: 'string', enum: ['extracted','inferred','user_supplied','missing'] } })),
  assessments: array(obj({ id: str, title: str, weightPercent: nullable(number), dueAt: nullable(str), format: str, span: nullable(span) })),
  schedule: array(obj({ week: integer, dates: str, topic: str, reading: str, due: str, span: nullable(span), empty: { type: 'boolean' } })),
  policies: array(obj({ kind: { type: 'string', enum: ['attendance','late-work','integrity','ai-use','accommodations','other'] }, text: str, span })),
});

/**
 * Syllabus extraction runs as three smaller requests in parallel: one request for everything
 * made a real 9-page syllabus slow (60–200 s) and often ran out of room before its JSON ended.
 * Each part retries on its own; the client merges them into one `syllabus-extract` output.
 */
const materialSchema = obj({ title: str, kind: { type: 'string', enum: ['textbook','reading','tool'] }, span });
const { materials: _materials, ...profileProps } = (extractionSchema.properties.profile as { properties: Record<string, unknown> }).properties;
const EXTRACT_RULES = `Extract only facts present in the source; never invent. Every extracted or inferred field has an origin and verbatim source spans. A span's text is a short exact quote (at most 30 words) and its page is the page label it came from; use null pages for sources without pages. Missing fields have origin missing, value null, confidence 0 and no spans. Dates are ISO YYYY-MM-DD: resolve a month and day with the term's year; if there is no specific date, use null.`;
const EXTRACT_PARTS = {
  course: {
    schema: obj({ profile: obj(profileProps), outcomes: extractionSchema.properties.outcomes, assessments: extractionSchema.properties.assessments }),
    focus: `Return the course profile, the course learning outcomes, and the graded assessments.
- code: the primary course code only, like "EPS 120" (no cross-listed codes, section numbers, or term).
- instructor: the instructor of record, a person (never an AI assistant, tutor, or teaching assistant). Their name, email and office hours are often on separate lines or table rows; use "" for a part the syllabus doesn't give.
- termWeeks: the number of weeks the syllabus states for the term; otherwise infer it from a dated schedule (origin inferred).
- modality: as stated; otherwise infer it (origin inferred) from meeting days, times and rooms (in-person), a learning platform with no meetings (online-async), or both.
- outcomes: only the COURSE learning outcomes or objectives, verbatim and in order, without numbering. Never institutional, program, general-education or standards outcomes, never the catalog or course description, and never a later table that restates or groups them. If the syllabus has no outcomes or objectives, return an empty list. Ids o1, o2, ….
- assessments: each graded component in the grading table with its weight in percent. If the syllabus gives points, convert each component to percent of the sum of the components' points. A component that is described as not graded is not an assessment. dueAt is an ISO date only when one specific date is given; otherwise null. Ids a1, a2, ….
- business is for industry training briefs; for a syllabus it is missing. weeklyHoursBudget is 0 (the service computes it); materials are handled separately.`,
    maxTokens: 16000,
  },
  schedule: {
    schema: obj({ schedule: extractionSchema.properties.schedule }),
    focus: `Return the course schedule: one row per row of the syllabus's week-by-week or dated course calendar, in order.
- If the syllabus has no such calendar, return an empty list. Never build rows from lists of assignment due dates.
- week: the row's week (or module/unit) number; a row covering several weeks uses its first week; an orientation row labelled "0 / 1" is week 1. When rows have dates but no week numbers, the week is counted from the term's first week by date (a row dated three weeks after the start is week 4), not by row order.
- topic: the row's topic text verbatim (not a summary and not the due items). reading and due: that row's readings and due items, "" when none.
- empty is true only when the row has no topic or content at all (dates only, or a break with nothing else).
- A table may reach you flattened, one cell per line: keep each row's number, dates, and title together, and don't shift titles to the next number.`,
    maxTokens: 12000,
  },
  policies: {
    schema: obj({ materials: extracted(array(materialSchema)), policies: extractionSchema.properties.policies }),
    focus: `Return the required materials (textbooks, readings, tools, each with its span) and the course policies: attendance, late work, academic integrity, AI use, accommodations, and other course-specific policies.
- A policy's text is a one- or two-sentence summary in plain words; its span quotes the key sentence.`,
    maxTokens: 12000,
  },
} as const;
type ExtractPart = keyof typeof EXTRACT_PARTS;
const extractMessages = (part: ExtractPart, input: AiTasks['syllabus-extract']['input']): Messages => {
  const [system, user] = PROMPTS['syllabus-extract'](input);
  return [{ role: 'system', content: `${system.content}\n${EXTRACT_RULES}\n${EXTRACT_PARTS[part].focus}` }, user];
};

const auditSchema = obj({ outcomeId: str, measurable: { type: 'boolean' }, verb: nullable(str), bloom: nullable({ type: 'string', enum: ['remember','understand','apply','analyze','evaluate','create'] }), fink: nullable({ type: 'string', enum: ['foundational','application','integration','human','caring','learning-how'] }), mager: nullable(obj({ performance: { type: 'boolean' }, condition: { type: 'boolean' }, criterion: { type: 'boolean' } })), assessedBy: array(obj({ assessmentId: str, fit: { type: 'string', enum: ['assessed','verb-mismatch'] } })), suggestion: nullable(obj({ text: str, why: str })) });
const analysisSchema = obj({ summary: str, cites: array(span), outcomeAudits: array(auditSchema), alignment: array(obj({ outcomeId: str, assessmentId: str, state: { type: 'string', enum: ['assessed','verb-mismatch','none'] } })), learnerCenteredness: nullable(obj({ palmer: obj({ score: number, max: { type: 'integer', enum: [46] }, band: { type: 'string', enum: ['content-focused','transitional','learning-focused'] }, components: array(obj({ name: str, score: number, max: number, evidence: nullable(span) })) }), cullenHarris: obj({ community: number, powerAndControl: number, evaluation: number, evidence: array(obj({ factor: str, quote: span })) }) })), deficiencies: array(obj({ code: str, message: str, rubricRefs: array(obj({ rubric: { type: 'string', enum: ['tessera','oscqr','qm'] }, item: str })), spans: array(span) })) });
/**
 * The read also runs as two parallel parts: in one large request the model skipped the
 * outcome-by-assessment judgment (every pair "none"), so the audit gets a request of its own.
 */
const ANALYZE_PARTS = {
  audit: {
    schema: obj({ outcomeAudits: array(auditSchema) }),
    focus: `Return one audit per outcome, in order. For each outcome: its observable verb (or null), Bloom level, Fink category, whether it is measurable, and assessedBy: every graded assessment that gives evidence of the outcome, judged from the assessment titles and formats and from how the Source describes each assignment, project, exam or discussion. Most outcomes are assessed by at least one assessment; leave assessedBy empty only when nothing in the syllabus could show the outcome. Use fit verb-mismatch when the assessment can't reach the outcome's level (for example multiple choice for create or evaluate). suggestion is null (the service asks for rewrites separately).`,
    maxTokens: 12000,
  },
  review: {
    schema: obj({ summary: str, cites: array(span), learnerCenteredness: (analysisSchema.properties as Record<string, unknown>).learnerCenteredness, deficiencies: (analysisSchema.properties as Record<string, unknown>).deficiencies }),
    focus: `Return the summary, its cites, learner-centeredness, and deficiencies (gaps a reviewer would raise: unclear outcomes, missing policies, workload, alignment, accessibility, feedback). The outcome audits are done separately.`,
    maxTokens: 12000,
  },
} as const;
type AnalyzePart = keyof typeof ANALYZE_PARTS;
const analyzeMessages = (part: AnalyzePart, input: AiTasks['syllabus-analyze']['input']): Messages => {
  const [system, user] = PROMPTS['syllabus-analyze'](input);
  return [{ role: 'system', content: `${system.content}\n${ANALYZE_PARTS[part].focus}` }, user];
};
const BLOCK = obj({
  type: { type: 'string', enum: ['heading', 'text', 'callout', 'check'] },
  level: { type: 'integer', enum: [2, 3] },
  text: str,
  tone: { type: 'string', enum: ['', 'info', 'tip', 'warning'] },
  title: str,
  question: str,
  options: { type: 'array', items: obj({ id: str, text: str }) },
  correctOptionId: str,
  feedbackCorrect: str,
  feedbackIncorrect: str,
});
const elementSchemas = {
  text: obj({ type: { type: 'string', enum: ['text'] }, text: str }),
  callout: obj({ type: { type: 'string', enum: ['callout'] }, tone: { type: 'string', enum: ['info', 'tip', 'warning'] }, title: str, text: str }),
  check: obj({ type: { type: 'string', enum: ['check'] }, question: str, options: { type: 'array', minItems: 3, maxItems: 4, items: obj({ id: str, text: str }) }, correctOptionId: str, feedbackCorrect: str, feedbackIncorrect: str }),
  document: obj({ type: { type: 'string', enum: ['document'] }, title: str, sections: { type: 'array', minItems: 3, maxItems: 8, items: obj({ heading: str, text: str }) } }),
  table: obj({ type: { type: 'string', enum: ['table'] }, caption: str, headerRow: { type: 'boolean', enum: [true] }, rows: { type: 'array', minItems: 3, maxItems: 8, items: { type: 'array', minItems: 2, maxItems: 5, items: str } } }),
  scenario: obj({ type: { type: 'string', enum: ['scenario'] }, title: str, setting: str, startNodeId: str, nodes: { type: 'array', minItems: 4, maxItems: 8, items: obj({ id: str, text: str, outcome: str, choices: { type: 'array', maxItems: 3, items: obj({ id: str, text: str, nextNodeId: str, feedback: str, quality: { type: 'string', enum: ['best', 'okay', 'poor'] } }) } }) } }),
} as const;
export const elementSchema = (type: keyof typeof elementSchemas) => obj({ block: elementSchemas[type] });

const SCHEMAS: Record<AiTaskName, unknown> = {
  'syllabus-extract': extractionSchema,
  'syllabus-analyze': analysisSchema,
  'objective-rewrite': obj({ text: str, why: str }),
  'outcome-suggest': obj({ suggestions: { type: 'array', minItems: 3, maxItems: 6, items: obj({ text: str, why: str }) } }),
  'structure-options': obj({ options: { type: 'array', minItems: 1, maxItems: 3, items: obj({ id: str, label: str, tag: str, description: str, fits: array(obj({ text: str, span: nullable(span) })), changes: str, tradeoffs: str, evidence: str, frameworks: array(str), modules: array(obj({ title: str, objective: str, outcomeIds: array(str), weeks: array(integer), lessons: integer, lessonMinutes: number, assessment: str, hours: number })), workload: obj({ averageHours: number, peakHours: number, peakModule: integer }) }) } }),
  tutor: obj({ text: str, citeIds: { type:'array', items:str } }),
  'tutor-summary': obj({ summary: str }),
  element: elementSchema('text'),
  feedback: obj({ feedback: str }),
  rewrite: obj({ text: str }),
  'readiness-item': obj({ verdict: { type: 'string', enum: ['likely-met', 'likely-not-met', 'unclear'] }, evidence: str, suggestion: str }),
  variant: obj({ title: str, minutes: { type: 'integer' }, blocks: { type: 'array', items: obj({ sourceBlockId: { type: ['string', 'null'] }, block: BLOCK }) } }),
  'link-text': obj({ text: str }),
  brief: obj({
    audience: str,
    outcomes: { type: 'array', items: str },
    moduleCount: { type: 'integer' },
    lessonsPerModule: { type: 'integer' },
    lessonMinutes: { type: 'integer' },
    tone: str,
    notes: str,
  }),
  outline: obj({
    modules: { type: 'array', items: obj({ title: str, lessons: { type: 'array', items: obj({ title: str, minutes: { type: 'integer' }, objective: str }) } }) },
  }),
  'lesson-draft': obj({ blocks: { type: 'array', items: BLOCK } }),
  'block-regenerate': obj({ block: BLOCK }),
  announcement: obj({ title: str, body: str }),
};

// ---- Mapping model output onto Tessera types ---------------------------------------------

type FlatBlock = {
  type: string; level: number; text: string; tone: string; title: string; question: string;
  options: { id: string; text: string }[]; correctOptionId: string; feedbackCorrect: string; feedbackIncorrect: string;
};

/** Turns the flat schema block into a BlockContent. The service validates it afterwards. */
export function toBlock(b: FlatBlock, fallback?: BlockContent): BlockContent {
  switch (b.type) {
    case 'heading': return { type: 'heading', level: b.level === 3 ? 3 : 2, text: b.text };
    case 'callout': return { type: 'callout', tone: (['info', 'tip', 'warning'] as const).find((t) => t === b.tone) ?? 'tip', title: b.title, text: b.text };
    case 'check': return { type: 'check', question: b.question, options: b.options, correctOptionId: b.correctOptionId, feedbackCorrect: b.feedbackCorrect, feedbackIncorrect: b.feedbackIncorrect };
    case 'text': return { type: 'text', text: b.text };
    default:
      // Images can't be generated; keep the original block rather than inventing one.
      if (fallback) return fallback;
      return { type: 'text', text: b.text };
  }
}

const MAP: { [K in AiTaskName]: (raw: any, input: AiTasks[K]['input']) => AiTasks[K]['output'] } = {
  'syllabus-extract': raw => raw,
  'syllabus-analyze': raw => raw,
  'objective-rewrite': raw => raw,
  'outcome-suggest': raw => raw,
  'structure-options': raw => raw.options,
  tutor: raw => ({ text:String(raw.text ?? ''), citeIds:Array.isArray(raw.citeIds) ? raw.citeIds.filter((x:unknown): x is string => typeof x === 'string') : [] }),
  'tutor-summary': raw => ({ summary:String(raw.summary ?? '') }),
  element: (raw, input) => {
    try {
      const block = validateGeneratedElement(raw.block, input.type);
      if (block.type === 'document' && /video script/i.test(input.instruction) && !/^Video script:\s*\S/i.test(block.title)) throw new Error('Video script title is missing.');
      return { block };
    }
    catch (error) { throw new Error(`Invalid element output: ${error instanceof Error ? error.message : String(error)}`); }
  },
  feedback: (raw) => ({ feedback: String(raw.feedback ?? '') }),
  rewrite: (raw) => ({ text: String(raw.text ?? '') }),
  'readiness-item': (raw) => ({
    verdict: (['likely-met', 'likely-not-met', 'unclear'] as const).find((v) => v === raw.verdict) ?? 'unclear',
    evidence: String(raw.evidence ?? '').trim(),
    suggestion: String(raw.suggestion ?? '').trim(),
  }),
  variant: (raw, input) => {
    const ids = new Set(input.blocks.map((b) => b.id));
    const byId = new Map(input.blocks.map((b) => [b.id, b.content]));
    return {
      title: String(raw.title ?? input.lessonTitle).trim() || input.lessonTitle,
      minutes: Math.max(1, Math.min(Number(raw.minutes) || input.targetMinutes, input.targetMinutes)),
      blocks: (raw.blocks as { sourceBlockId: string | null; block: FlatBlock }[]).map((b) => {
        const sourceBlockId = typeof b.sourceBlockId === 'string' && ids.has(b.sourceBlockId) ? b.sourceBlockId : null;
        return { sourceBlockId, content: toBlock(b.block, sourceBlockId ? byId.get(sourceBlockId) : undefined) };
      }),
    };
  },
  'link-text': (raw) => ({ text: String(raw.text ?? '').trim() }),
  brief: (raw) => raw,
  outline: (raw) => raw,
  'lesson-draft': (raw) => ({ blocks: (raw.blocks as FlatBlock[]).map((b) => toBlock(b)) }),
  'block-regenerate': (raw, input) =>
    input.block.type === 'image'
      ? { block: { ...input.block, caption: (raw.block as FlatBlock).text || input.block.caption } }
      : { block: toBlock(raw.block as FlatBlock, input.block) },
  announcement: (raw) => raw,
};

const MAX_TOKENS: Record<AiTaskName, number> = {
  // A real 9-page syllabus needs ~6,000 output tokens plus 4,000–8,000 of reasoning; at 8,000
  // most calls ended before the JSON did (D-032 check, 2026-09-28). The read is the same size.
  'syllabus-extract': 24000, 'syllabus-analyze': 24000, 'objective-rewrite': 6000, 'outcome-suggest': 4000, 'structure-options': 16000,
  tutor: 1800, 'tutor-summary': 1200,
  element: 8000,
  // A good lesson draft uses ~2,000 tokens (about 1,400 of them reasoning). The cap stops the
  // occasional runaway generation within seconds instead of a minute.
  brief: 6000, outline: 8000, 'lesson-draft': 7000, 'block-regenerate': 5000, announcement: 4000, feedback: 2000, rewrite: 4000, 'link-text': 1500,
  'readiness-item': 2500, variant: 9000,
};

/**
 * Per-task request options beyond the defaults. `reasoning_effort: 'low'` isn't in WRITER's
 * published reference but Palmyra-X6 honors it: on the D-032 syllabus it cut reasoning enough
 * that 3/3 extractions finished on the first try, against 0/3 without it.
 */
const TASK_OPTIONS: Partial<Record<AiTaskName, { reasoningEffort?: 'low' | 'medium' | 'high'; timeoutMs?: number }>> = {
  'syllabus-extract': { reasoningEffort: 'low', timeoutMs: 150_000 },
  'syllabus-analyze': { reasoningEffort: 'low', timeoutMs: 150_000 },
  'objective-rewrite': { reasoningEffort: 'low' },
  'outcome-suggest': { reasoningEffort: 'low' },
  'structure-options': { reasoningEffort: 'low', timeoutMs: 150_000 },
};

/**
 * Palmyra sometimes degenerates into blank lines mid-JSON until it hits max_tokens. Compact
 * JSON never contains a raw newline (newlines inside strings are escaped), so three in a row
 * only ever mean a runaway: stop there and retry instead of generating whitespace for minutes.
 */
const RUNAWAY_STOP = ['\n\n\n'];

/** Every attempt of one `run` must finish inside a Workflow step (5 minutes), with margin. */
const RUN_DEADLINE_MS = 270_000;

// ---- Client ---------------------------------------------------------------------------------

export function palmyraClient(options: PalmyraOptions): AiClient {
  const model = options.model ?? 'palmyra-x6';
  const doFetch = options.fetchImpl ?? fetch;

  interface Request { name: string; messages: Messages; schema: unknown; maxTokens: number; reasoningEffort?: 'low' | 'medium' | 'high'; salvage?: (content: string) => unknown }
  async function request(req: Request, timeoutMs: number): Promise<unknown> {
    const res = await doFetch(options.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        // WRITER caches identical requests upstream (AI Gateway's skip-cache header can't reach
        // it), so without a fresh seed a retry, or the person's "Try again", replays the same
        // failed response.
        seed: Math.floor(Math.random() * 2 ** 31),
        // Palmyra-X6 counts reasoning tokens against max_tokens (D-015).
        max_tokens: req.maxTokens,
        ...(req.reasoningEffort ? { reasoning_effort: req.reasoningEffort } : {}),
        stop: RUNAWAY_STOP,
        messages: req.messages,
        response_format: { type: 'json_schema', json_schema: { name: req.name, strict: true, schema: req.schema } },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new ApiError('ai-failed', `The AI service returned ${res.status}.`, { status: res.status, detail });
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    const choice = body.choices?.[0];
    const content = choice?.message?.content;
    if (!content) throw new Error(`The AI service returned an empty response (${req.name}${choice?.finish_reason === 'length' ? ', cut off' : ''}).`);
    try {
      if (choice?.finish_reason === 'length') throw new Error('cut off');
      return JSON.parse(content);
    } catch {
      // Palmyra occasionally runs away mid-JSON; some tasks can keep what came before it.
      const salvaged = req.salvage?.(content);
      if (salvaged) return salvaged;
      throw new Error(`The AI response was cut off or malformed (${req.name}, ${content.length} characters).`);
    }
  }

  /** Up to three attempts for transient failures and malformed or runaway output, while there's time left for a real one. */
  async function withRetries<T>(perAttempt: number, deadline: number, attemptOnce: (timeoutMs: number, attempt: number) => Promise<T>, accept?: (output: T, attempt: number) => boolean): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = deadline - Date.now();
      if (attempt > 0 && remaining < 30_000) break;
      try {
        const output = await attemptOnce(Math.min(perAttempt, remaining), attempt);
        if (accept && !accept(output, attempt)) { last = new Error('the output was not usable'); continue; }
        return output;
      } catch (error) {
        last = error;
        const status = error instanceof ApiError ? (error.details as { status?: number } | undefined)?.status : undefined;
        if (status && status < 500 && status !== 429) break; // a client error won't fix itself
      }
    }
    if (last instanceof ApiError) throw last;
    throw new ApiError('ai-failed', 'The AI draft could not be created. Try again.', { cause: String(last) });
  }

  function once<K extends AiTaskName>(task: K, input: AiTasks[K]['input'], timeoutMs: number): Promise<AiTasks[K]['output']> {
    const extra = TASK_OPTIONS[task];
    const schema = task === 'element' ? elementSchema((input as AiTasks['element']['input']).type as keyof typeof elementSchemas) : SCHEMAS[task];
    // For a lesson, keep the complete blocks before a runaway if there are enough to be a lesson.
    const salvage = task === 'lesson-draft' ? (content: string) => { const blocks = salvageBlocks(content); return blocks.length >= 3 ? { blocks } : null; } : undefined;
    return request({ name: task.replace(/-/g, '_'), messages: PROMPTS[task](input as never), schema, maxTokens: MAX_TOKENS[task], reasoningEffort: extra?.reasoningEffort, salvage }, timeoutMs).then(raw => {
      const mapped = MAP[task](raw, input as never) as AiTasks[K]['output'];
      if (task === 'element' && (mapped as AiTasks['element']['output']).block.type !== (input as AiTasks['element']['input']).type) throw new Error('Wrong element type.');
      return mapped;
    });
  }

  async function extract(input: AiTasks['syllabus-extract']['input'], deadline: number): Promise<AiTasks['syllabus-extract']['output']> {
    // Weights that add up to almost nothing mean the grading table was cut short: try again.
    const plausible = (output: any, attempt: number) => attempt >= 2 || !output?.assessments?.length || (() => { const total = output.assessments.reduce((sum: number, item: { weightPercent: number | null }) => sum + (item.weightPercent ?? 0), 0); return total === 0 || (total >= 50 && total <= 150); })();
    const part = <P extends ExtractPart>(name: P) => withRetries(options.timeoutMs ?? 120_000, deadline, timeoutMs =>
      request({ name: `syllabus_extract_${name}`, messages: extractMessages(name, input), schema: EXTRACT_PARTS[name].schema, maxTokens: EXTRACT_PARTS[name].maxTokens, reasoningEffort: 'low' }, timeoutMs), name === 'course' ? plausible : undefined) as Promise<any>;
    // Policies and materials are the least essential part: if they can't be read, the read goes on without them.
    const missing = { value: null, origin: 'missing', confidence: 0, spans: [] };
    const [course, schedule, policies] = await Promise.all([part('course'), part('schedule'), part('policies').catch(error => { console.warn('syllabus-extract policies part failed:', String(error?.details?.cause ?? error)); return { materials: missing, policies: [] }; })]);
    return MAP['syllabus-extract']({ profile: { ...course.profile, materials: policies.materials }, outcomes: course.outcomes, assessments: course.assessments, schedule: schedule.schedule, policies: policies.policies }, input);
  }

  async function analyze(input: AiTasks['syllabus-analyze']['input'], deadline: number): Promise<AiTasks['syllabus-analyze']['output']> {
    const part = <P extends AnalyzePart>(name: P) => withRetries(options.timeoutMs ?? 120_000, deadline, timeoutMs =>
      request({ name: `syllabus_analyze_${name}`, messages: analyzeMessages(name, input), schema: ANALYZE_PARTS[name].schema, maxTokens: ANALYZE_PARTS[name].maxTokens, reasoningEffort: 'low' }, timeoutMs)) as Promise<any>;
    const [audit, review] = await Promise.all([part('audit'), part('review')]);
    // The service builds the alignment matrix from the audits (repairRead).
    return MAP['syllabus-analyze']({ ...review, outcomeAudits: audit.outcomeAudits, alignment: [] }, input);
  }

  return {
    async run(task, input) {
      const deadline = Date.now() + RUN_DEADLINE_MS;
      if (task === 'syllabus-extract') return { output: await extract(input as AiTasks['syllabus-extract']['input'], deadline) as never, model };
      if (task === 'syllabus-analyze') return { output: await analyze(input as AiTasks['syllabus-analyze']['input'], deadline) as never, model };
      const perAttempt = options.timeoutMs ?? TASK_OPTIONS[task]?.timeoutMs ?? 90_000;
      // Retry a lesson without a usable knowledge check (principle #4), except on the last try.
      const accept = task === 'lesson-draft' ? (output: unknown, attempt: number) => attempt >= 2 || hasUsableCheck(output as AiTasks['lesson-draft']['output']) : undefined;
      const output = await withRetries(perAttempt, deadline, timeoutMs => once(task, input, timeoutMs), accept);
      return { output, model };
    },
  };
}

/**
 * Complete block objects from a truncated `{"blocks":[{…},{…},…` response: scans the
 * array, tracking strings and brace depth, and parses each closed object.
 */
export function salvageBlocks(content: string): FlatBlock[] {
  const start = content.indexOf('[', content.indexOf('"blocks"'));
  if (start < 0) return [];
  const out: FlatBlock[] = [];
  let depth = 0, inString = false, escaped = false, objStart = -1;
  for (let i = start + 1; i < content.length; i++) {
    const ch = content[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try { out.push(JSON.parse(content.slice(objStart, i + 1)) as FlatBlock); } catch { /* skip a malformed block */ }
        objStart = -1;
      }
    } else if (ch === ']' && depth === 0) break;
  }
  return out;
}

/** A lesson draft is only complete with a real retrieval check: 2+ options and a valid correct answer. */
export function hasUsableCheck(draft: { blocks: BlockContent[] }): boolean {
  return draft.blocks.some((b) => b.type === 'check' && b.question.trim() !== '' && b.options.filter((o) => o.text.trim()).length >= 2
    && b.options.some((o) => o.id === b.correctOptionId && o.text.trim() !== ''));
}

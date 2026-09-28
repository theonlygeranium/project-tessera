// Palmyra-X6 client (D-015): WRITER's OpenAI-compatible chat completions, called
// through Cloudflare AI Gateway. Every task asks for strict JSON (response_format
// json_schema) and maps it onto Tessera's types. The service validates the result
// again and stores it as a draft (D-003); nothing here publishes anything.
import type { AiClient, AiTaskName, AiTasks } from '../../shared/ai';
import { ApiError } from '../../shared/api';
import type { BlockContent, SourceDoc } from '../../shared/domain';
import { validateGeneratedElement } from '../../shared/service/generation';

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
  tutor: 1800, 'tutor-summary': 1200,
  element: 8000,
  // A good lesson draft uses ~2,000 tokens (about 1,400 of them reasoning). The cap stops the
  // occasional runaway generation within seconds instead of a minute.
  brief: 6000, outline: 8000, 'lesson-draft': 7000, 'block-regenerate': 5000, announcement: 4000, feedback: 2000, rewrite: 4000, 'link-text': 1500,
  'readiness-item': 2500, variant: 9000,
};

// ---- Client ---------------------------------------------------------------------------------

export function palmyraClient(options: PalmyraOptions): AiClient {
  const model = options.model ?? 'palmyra-x6';
  const doFetch = options.fetchImpl ?? fetch;

  async function once<K extends AiTaskName>(task: K, input: AiTasks[K]['input']) {
    const res = await doFetch(options.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        // Palmyra-X6 counts reasoning tokens against max_tokens (D-015).
        max_tokens: MAX_TOKENS[task],
        messages: PROMPTS[task](input as never),
        response_format: { type: 'json_schema', json_schema: { name: task.replace(/-/g, '_'), strict: true, schema: task === 'element' ? elementSchema((input as AiTasks['element']['input']).type as keyof typeof elementSchemas) : SCHEMAS[task] } },
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new ApiError('ai-failed', `The AI service returned ${res.status}.`, { status: res.status, detail });
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    const choice = body.choices?.[0];
    const content = choice?.message?.content;
    if (!content) throw new ApiError('ai-failed', 'The AI service returned an empty response.');
    let raw: unknown;
    try {
      if (choice?.finish_reason === 'length') throw new Error('cut off');
      raw = JSON.parse(content);
    } catch {
      // Palmyra occasionally runs away mid-JSON. For a lesson, keep the complete blocks
      // that came before the runaway if there are enough of them to be a lesson.
      const blocks = task === 'lesson-draft' ? salvageBlocks(content) : [];
      if (blocks.length >= 3) raw = { blocks };
      else throw new Error(`The AI response was cut off or malformed (${task}, ${content.length} characters).`);
    }
    const mapped = MAP[task](raw, input as never) as AiTasks[K]['output'];
    if (task === 'element' && (mapped as AiTasks['element']['output']).block.type !== (input as AiTasks['element']['input']).type) throw new Error('Wrong element type.');
    return mapped;
  }

  return {
    async run(task, input) {
      let last: unknown;
      // Up to three attempts for transient failures and malformed or runaway output.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const output = await once(task, input);
          // Retry a lesson without a usable knowledge check (principle #4), except on the last try.
          if (attempt < 2 && task === 'lesson-draft' && !hasUsableCheck(output as AiTasks['lesson-draft']['output'])) {
            last = new Error('lesson draft had no usable knowledge check');
            continue;
          }
          return { output, model };
        } catch (error) {
          last = error;
          const status = error instanceof ApiError ? (error.details as { status?: number } | undefined)?.status : undefined;
          if (status && status < 500 && status !== 429) break; // a client error won't fix itself
        }
      }
      if (last instanceof ApiError) throw last;
      throw new ApiError('ai-failed', 'The AI draft could not be created. Try again.', { cause: String(last) });
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

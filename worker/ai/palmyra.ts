// Palmyra-X6 client (D-015): WRITER's OpenAI-compatible chat completions, called
// through Cloudflare AI Gateway. Every task asks for strict JSON (response_format
// json_schema) and maps it onto Tessera's types. The service validates the result
// again and stores it as a draft (D-003); nothing here publishes anything.
import type { AiClient, AiTaskName, AiTasks } from '../../shared/ai';
import { ApiError } from '../../shared/api';
import type { BlockContent, SourceDoc } from '../../shared/domain';

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

const SCHEMAS: Record<AiTaskName, unknown> = {
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
  brief: 6000, outline: 8000, 'lesson-draft': 16000, 'block-regenerate': 6000, announcement: 4000,
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
        response_format: { type: 'json_schema', json_schema: { name: task.replace(/-/g, '_'), strict: true, schema: SCHEMAS[task] } },
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
    // Structured output padded with whitespace can run out of tokens mid-JSON; that's worth one retry.
    if (choice?.finish_reason === 'length') throw new Error(`The AI response was cut off (${task}, ${content.length} characters).`);
    return MAP[task](JSON.parse(content), input as never) as AiTasks[K]['output'];
  }

  return {
    async run(task, input) {
      try {
        return { output: await once(task, input), model };
      } catch (first) {
        if (first instanceof ApiError && (first.details as { status?: number })?.status && (first.details as { status: number }).status < 500) throw first;
        // One retry for transient failures and malformed JSON.
        try {
          return { output: await once(task, input), model };
        } catch (second) {
          if (second instanceof ApiError) throw second;
          throw new ApiError('ai-failed', 'The AI draft could not be created. Try again.', { cause: String(second) });
        }
      }
    },
  };
}

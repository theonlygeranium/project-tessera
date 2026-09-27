// AI tasks (D-003, D-015). The service asks an AiClient for structured output; the
// Worker's real client calls Palmyra-X6 through AI Gateway (worker/ai/, lane F), and
// the fixture client below answers deterministically for tests, the mock adapter,
// the a11y audit, docs screenshots, and local development without a key.
//
// Whatever a client returns is stored as a *draft*; a person keeps it (D-003).
import type { BlockContent, CourseBrief, OutlineDraft, RubricCriterion, SourceDoc } from './domain';

export interface AiTasks {
  brief: {
    input: { courseTitle: string; prompt: string; sources: SourceDoc[] };
    output: CourseBrief;
  };
  outline: {
    input: { courseTitle: string; brief: CourseBrief; sources: SourceDoc[] };
    output: OutlineDraft;
  };
  'lesson-draft': {
    input: {
      courseTitle: string;
      brief: CourseBrief;
      moduleTitle: string;
      lesson: { title: string; minutes: number; objective: string };
      sources: SourceDoc[];
    };
    /** 3–8 blocks. Check blocks need 3 options and a correct option id. */
    output: { blocks: BlockContent[] };
  };
  'block-regenerate': {
    input: { courseTitle: string; lessonTitle: string; block: BlockContent; instruction: string; sources: SourceDoc[] };
    /** Same block type as the input block. */
    output: { block: BlockContent };
  };
  announcement: {
    input: { courseTitle: string; instructorName: string; prompt: string };
    output: { title: string; body: string };
  };
  feedback: {
    input: { courseTitle: string; assignmentTitle: string; rubric: RubricCriterion[]; criteria: { criterionId: string; levelId: string; points: number; comment: string }[]; submissionText: string };
    output: { feedback: string };
  };
}

export type AiTaskName = keyof AiTasks;

export interface AiResult<K extends AiTaskName> {
  output: AiTasks[K]['output'];
  /** The model that produced it, for provenance ("palmyra-x6" or "fixture"). */
  model: string;
}

export interface AiClient {
  run<K extends AiTaskName>(task: K, input: AiTasks[K]['input']): Promise<AiResult<K>>;
}

// ---- Deterministic fixture client -------------------------------------------------------

const firstSentence = (text: string) => (text.split(/(?<=[.!?])\s/)[0] ?? text).trim();
const sourceLine = (sources: SourceDoc[]) =>
  sources.length ? firstSentence(sources[0].text).slice(0, 220) : 'Use examples from your own discipline.';

export const fixtureAi: AiClient = {
  async run(task, input) {
    const out = FIXTURES[task](input as never);
    return { output: out as never, model: 'fixture' };
  },
};

const FIXTURES: { [K in AiTaskName]: (input: AiTasks[K]['input']) => AiTasks[K]['output'] } = {
  feedback: ({ criteria }) => ({ feedback: `You met ${criteria.length} rubric ${criteria.length === 1 ? 'criterion' : 'criteria'}. Review the rubric comments and revise one specific part of your work.` }),
  brief: ({ courseTitle, prompt }) => ({
    audience: /graduate|master/i.test(prompt) ? 'Graduate students new to the topic' : 'First-year undergraduates with no prior background',
    outcomes: [
      `Explain the core ideas of ${courseTitle} in plain language.`,
      'Apply those ideas to a short, realistic example.',
      'Check their own understanding with quick retrieval practice.',
    ],
    moduleCount: 2,
    lessonsPerModule: 2,
    lessonMinutes: 15,
    tone: 'Warm, direct, and concrete',
    notes: prompt.trim().slice(0, 280),
  }),

  outline: ({ brief }) => {
    const n = Math.max(1, Math.min(brief.moduleCount, 6));
    const per = Math.max(1, Math.min(brief.lessonsPerModule, 5));
    const themes = ['Foundations', 'Working with examples', 'Applying the ideas', 'Going further', 'Synthesis', 'Review'];
    return {
      modules: Array.from({ length: n }, (_, m) => ({
        title: `${themes[m]}`,
        lessons: Array.from({ length: per }, (_, l) => ({
          title: `${themes[m]}: part ${l + 1}`,
          minutes: brief.lessonMinutes,
          objective: brief.outcomes[(m * per + l) % brief.outcomes.length] ?? 'Build understanding step by step.',
        })),
      })),
    };
  },

  'lesson-draft': ({ lesson, sources }) => ({
    blocks: [
      { type: 'heading', level: 2, text: lesson.title },
      { type: 'text', text: `${lesson.objective}\n\nFrom your sources: ${sourceLine(sources)}` },
      { type: 'callout', tone: 'tip', title: 'Try it', text: 'Pause and write one sentence in your own words before reading on.' },
      {
        type: 'check',
        question: `Which statement best matches the goal of "${lesson.title}"?`,
        options: [
          { id: 'a', text: lesson.objective },
          { id: 'b', text: 'Memorize the vocabulary list.' },
          { id: 'c', text: 'Skip ahead to the final exam.' },
        ],
        correctOptionId: 'a',
        feedbackCorrect: 'That\'s what this lesson is for.',
        feedbackIncorrect: 'Reread the lesson\'s first paragraph, then try again.',
      },
    ],
  }),

  'block-regenerate': ({ block, instruction }) => {
    const note = instruction.trim() ? ` (${instruction.trim()})` : '';
    switch (block.type) {
      case 'heading': return { block: { ...block, text: `${block.text}, revisited` } };
      case 'text': return { block: { ...block, text: `Put another way${note}: ${block.text}` } };
      case 'callout': return { block: { ...block, text: `${block.text} Take a minute on this before moving on.` } };
      case 'image': return { block: { ...block, caption: block.caption || 'Illustration for this section.' } };
      case 'check': return { block: { ...block, question: `Rephrased${note}: ${block.question}` } };
      case 'document': return { block: { ...block, sections: block.sections.map((s) => ({ ...s, text: `Put another way${note}: ${s.text}` })) } };
      case 'scenario': return { block: { ...block, setting: `${block.setting}${note}` } };
      case 'video': return { block: { ...block, transcript: block.transcript || 'Transcript to be added.' } };
      case 'table': return { block: { ...block, caption: block.caption || 'Data table' } };
      case 'link': return { block: { ...block, text: block.text || block.href } };
      case 'file': return { block: { ...block, description: `${block.description}${note}`.trim() } };
    }
  },

  announcement: ({ courseTitle, prompt }) => ({
    title: `${courseTitle}: ${firstSentence(prompt).replace(/[.!?]$/, '').slice(0, 70) || 'An update'}`,
    body: `Hello everyone,\n\n${prompt.trim()}\n\nReply here or come to office hours with any questions.`,
  }),
};

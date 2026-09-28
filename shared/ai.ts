// AI tasks (D-003, D-015). The service asks an AiClient for structured output; the
// Worker's real client calls Palmyra-X6 through AI Gateway (worker/ai/, lane F), and
// the fixture client below answers deterministically for tests, the mock adapter,
// the a11y audit, docs screenshots, and local development without a key.
//
// Whatever a client returns is stored as a *draft*; a person keeps it (D-003).
import type { BlockContent, BlockType, CourseBrief, OutlineDraft, RubricCriterion, SourceDoc, VariantAudience, DesignSource, DesignSourceKind, SyllabusExtraction, InstructionalRead, WorkloadRates, ExtractedOutcome, ArchitectureId, OverlayId, InstructorProfile, StructureOption, DesignQuestion } from './domain';
import { extractSyllabusFixture } from './syllabus-fixture';
import { analyzeSyllabusFixture, rewriteObjectiveFixture } from './design/read-fixture';
import type { TutorKind } from './tutor/policy';

export interface AiTasks {
  'syllabus-extract': {
    input: { sourceKind: DesignSourceKind; name: string; sections: { page: number | null; heading: string; level: number; text: string; lines: string[] }[]; institutionTerm?: { start: string; end: string; holidays: string[] } };
    output: Omit<SyllabusExtraction, 'problems' | 'provenance'>;
  };
  'syllabus-analyze': {
    input: { extraction: SyllabusExtraction; profileAnswers: Record<string, string>; rates: WorkloadRates; rubricRefsAllowed: ('tessera' | 'oscqr' | 'qm')[]; sourceKind?: DesignSourceKind; sections?: DesignSource['sections'] };
    output: Omit<InstructionalRead, 'workload' | 'provenance'>;
  };
  'objective-rewrite': {
    input: { outcome: ExtractedOutcome; nearbyTopics: string[]; industry: boolean };
    output: { text: string; why: string };
  };
  'outcome-suggest': {
    input: { title: string; description: string; scheduleTopics: string[]; assessments: { title: string; format: string }[] };
    output: { suggestions: { text: string; why: string }[] };
  };
  'structure-options': {
    input: { profile: SyllabusExtraction['profile']; schedule: SyllabusExtraction['schedule']; assessments: SyllabusExtraction['assessments']; source: DesignSource; confirmedOutcomes: { code: string; text: string; originalText: string }[]; answers: DesignQuestion[]; teachingNote: string; instructorProfile: InstructorProfile | null; candidates: ArchitectureId[]; closest: ArchitectureId; overlaysDefault: OverlayId[]; rates: WorkloadRates; weeks: number };
    output: StructureOption[];
  };
  element: {
    input: { courseTitle: string; moduleTitle: string; lessonTitle: string; lessonText: string; type: BlockType; instruction: string };
    output: { block: BlockContent };
  };
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
  /** Tessera Access (D-022): a plain-language rewrite of one passage. */
  rewrite: {
    input: { courseTitle: string; text: string };
    output: { text: string };
  };
  /** Tessera Access: link text that says where a link goes. */
  'link-text': {
    input: { courseTitle: string; href: string; currentText: string; context: string };
    output: { text: string };
  };
  feedback: {
    input: { courseTitle: string; assignmentTitle: string; rubric: RubricCriterion[]; criteria: { criterionId: string; levelId: string; points: number; comment: string }[]; submissionText: string };
    output: { feedback: string };
  };
  tutor: {
    input: { kind: Exclude<TutorKind, 'refusal'>; mode: 'off' | 'hints' | 'explain' | 'open'; courseTitle: string; activityTitle: string;
      sources: { id: string; name: string; text: string }[]; history: { role: 'student' | 'tutor'; text: string }[];
      question: string; hintNumber: number | null; maxHints: number; readingLevel: 'standard' | 'plain'; language: string };
    output: { text: string; citeIds: string[] };
  };
  'tutor-summary': {
    input: { courseTitle: string; questions: string[] };
    output: { summary: string };
  };
  /**
   * Night 3 (D-029): judge one AI-assisted rubric item against the course. The result is
   * a draft finding with evidence; a person accepts or dismisses it. `content` is a digest
   * the service builds (welcome, outcomes, module objectives, lesson text), labeled so the
   * evidence can say where something was found.
   */
  'readiness-item': {
    input: { courseTitle: string; item: { number: string; text: string; criteria: string }; content: { label: string; text: string }[] };
    output: { verdict: 'likely-met' | 'likely-not-met' | 'unclear'; evidence: string; suggestion: string };
  };
  /**
   * Night 3 (D-028): derive a variant of a lesson for an audience, or resync some blocks.
   * Only heading, text, callout, and check blocks are sent; the service copies other
   * blocks (media, files, tables, scenarios) as they are. Each output block names the
   * master block it came from (`sourceBlockId`), or null for a new block (for example a
   * micro-path's one-line summary). A micro-path may leave blocks out; plain language
   * keeps every block and every fact.
   */
  variant: {
    input: { courseTitle: string; lessonTitle: string; audience: VariantAudience; targetMinutes: number; blocks: { id: string; content: BlockContent }[] };
    output: { title: string; minutes: number; blocks: { sourceBlockId: string | null; content: BlockContent }[] };
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
  'syllabus-extract': extractSyllabusFixture,
  'syllabus-analyze': analyzeSyllabusFixture,
  'objective-rewrite': rewriteObjectiveFixture,
  'outcome-suggest': ({ title, scheduleTopics }) => ({ suggestions: Array.from({ length: 3 }, (_, index) => ({ text: `${['Explain', 'Apply', 'Evaluate'][index]} ${scheduleTopics[index] || title} using a course example.`, why: `This draws on ${scheduleTopics[index] ? `the ${scheduleTopics[index]} topic` : 'the course title'}; please check its fit.` })) }),
  'structure-options': input => input.candidates.map(id => {
    const schedule = input.schedule.filter(row => !row.empty);
    const rows = schedule.length ? schedule : Array.from({ length: input.weeks }, (_, index) => ({ week: index + 1, topic: `Session ${index + 1}`, reading: '', due: '', span: null, dates: '', empty: false }));
    const chunk = ['case', 'project', 'thematic', 'performance', 'competency'].includes(id) ? 2 : 1;
    const modules = Array.from({ length: Math.ceil(rows.length / chunk) }, (_, index) => {
      const part = rows.slice(index * chunk, (index + 1) * chunk);
      return { title: `${id[0].toUpperCase()}${id.slice(1)}: ${part[0].topic}`, objective: input.confirmedOutcomes[index % input.confirmedOutcomes.length]?.text ?? 'Explain the topic.', outcomeIds: input.confirmedOutcomes.map(o => o.code), weeks: part.map(row => row.week), lessons: 2, lessonMinutes: 20, assessment: part.map(row => row.due).filter(Boolean).join('; ') || 'Retrieval check', hours: 0 };
    });
    return { id, label: `${id[0].toUpperCase()}${id.slice(1)} approach`, tag: id === input.closest ? 'Closest to your syllabus' : 'Another possible structure', description: `An optional ${id} structure for ${input.profile.title.value ?? 'this course'}, using the stated schedule as a starting point.`, fits: [{ text: schedule.length ? 'Your syllabus lists a sequence of topics.' : input.assessments.length ? `Your source names ${input.assessments[0].title} as an assessment.` : 'Your source describes the course; please supply the missing schedule.', span: schedule[0]?.span ?? input.assessments.find(item => item.span)?.span ?? input.profile.description.spans[0] ?? null }], changes: 'Groups the listed topics into draft modules for your review.', tradeoffs: 'Check the pacing and assessment load before using this structure.', evidence: 'Sequencing can support practice, but this proposal has not been tested with your students.', frameworks: ['backward design', 'Tessera standard 2.2'], modules, workload: { averageHours: 0, peakHours: 0, peakModule: 0 } };
  }),
  element: ({ lessonTitle, type, instruction }) => {
    const topic = lessonTitle.trim() || 'This lesson';
    const note = instruction.trim() ? ` ${firstSentence(instruction.trim())}` : '';
    switch (type) {
      case 'text': return { block: { type, text: `${topic} introduces a useful idea. Read the example, then explain it in your own words.${note}` } };
      case 'callout': return { block: { type, tone: 'tip', title: 'Pause and reflect', text: `How does ${topic.toLowerCase()} connect to an example you know?${note}` } };
      case 'check': return { block: { type, question: `What is a useful first step in ${topic}?`, options: [{ id: 'a', text: 'Identify the question and available evidence.' }, { id: 'b', text: 'Choose an answer before reading.' }, { id: 'c', text: 'Ignore the context.' }], correctOptionId: 'a', feedbackCorrect: 'The question and evidence guide the next step.', feedbackIncorrect: 'Start by identifying the question and evidence.' } };
      case 'document': {
        const script = /video script/i.test(instruction);
        return { block: { type, title: `${script ? 'Video script' : 'Guide'}: ${topic}`, sections: script ? [
          { heading: 'Scene 1: Introduce the question', text: `Narration: ${topic} begins with a clear question.` },
          { heading: 'Scene 2: Work through an example', text: 'Narration: A fictional class compares two possible explanations.' },
          { heading: 'Scene 3: Invite practice', text: 'Narration: Write one question and name the evidence you would need.' },
        ] : [{ heading: 'Overview', text: `${topic} begins with a clear question.` }, { heading: 'Example', text: 'A fictional class compares two possible explanations.' }, { heading: 'Practice', text: 'Write one question and name the evidence you would need.' }] } };
      }
      case 'table': return { block: { type, caption: `Steps in ${topic}`, headerRow: true, rows: [['Step', 'Action'], ['Observe', 'Describe what is known'], ['Compare', 'Look for differences'], ['Reflect', 'Explain the result']] } };
      case 'scenario': return { block: { type, title: `${topic}: a decision`, setting: 'A fictional class is reviewing a short example.', startNodeId: 'start', nodes: [
        { id: 'start', text: 'Which step should the class take first?', outcome: '', choices: [{ id: 'a', text: 'State the question.', nextNodeId: 'good', feedback: 'A clear question helps.', quality: 'best' }, { id: 'b', text: 'Guess the answer.', nextNodeId: 'retry', feedback: 'A guess may miss the evidence.', quality: 'poor' }] },
        { id: 'retry', text: 'The class pauses. What now?', outcome: '', choices: [{ id: 'a', text: 'Gather evidence.', nextNodeId: 'good', feedback: 'Evidence helps.', quality: 'best' }, { id: 'b', text: 'Move on.', nextNodeId: 'limited', feedback: 'The class has not checked its idea.', quality: 'poor' }] },
        { id: 'good', text: 'The class can explain its choice.', choices: [], outcome: 'The class uses evidence to support its conclusion.' },
        { id: 'limited', text: 'The class has an untested answer.', choices: [], outcome: 'The class needs a question and evidence before concluding.' },
      ] } };
      default: throw new Error(`Cannot generate ${type}.`);
    }
  },
  rewrite: ({ text }) => ({
    text: text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean).slice(0, 6).join('\n\n'),
  }),
  'link-text': ({ href, context }) => {
    let host = href;
    try { host = new URL(href).hostname.replace(/^www\./, ''); } catch { /* keep the raw href */ }
    return { text: context.trim() ? `${firstSentence(context).replace(/[.!?]$/, '').slice(0, 60)} (${host})` : `Page on ${host}` };
  },
  feedback: ({ criteria }) => ({ feedback: `You met ${criteria.length} rubric ${criteria.length === 1 ? 'criterion' : 'criteria'}. Review the rubric comments and revise one specific part of your work.` }),
  tutor: ({ kind, hintNumber, maxHints, sources, activityTitle }) => ({
    text: kind === 'hint' ? `Hint ${hintNumber} of ${maxHints}: look for the main idea in the activity, then try one step yourself.`
      : kind === 'explain' ? 'Explanation: in a different example, start with the question, then compare the evidence before deciding.'
      : kind === 'answer' ? activityTitle === 'What makes a question statistical?'
        ? 'Answer: the question about how many hours a week Meridian State students study is statistical because the answers vary across students.'
        : activityTitle === 'Cases and variables'
          ? 'Answer: the students who answered the survey are the cases because each row represents one student.'
          : 'Answer: use the lesson idea to choose the option that fits, and explain why it fits.'
      : 'Let us stay with this activity. What part would you like to explore?',
    citeIds: sources[0] ? [sources[0].id] : [],
  }),
  'tutor-summary': ({ questions }) => ({ summary: questions.length
    ? 'This student asked about course ideas. They may need more practice connecting examples to the main concept.'
    : 'No questions are available to summarize yet. There is not enough information to identify a misconception.' }),
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

  'readiness-item': ({ item, content }) => {
    // Deterministic: looks for the item's longer words in the content.
    const words = new Set(`${item.text} ${item.criteria}`.toLowerCase().match(/[a-z]{6,}/g) ?? []);
    let best: { label: string; text: string; hits: number } | null = null;
    for (const c of content) {
      const hits = [...words].filter((w) => c.text.toLowerCase().includes(w)).length;
      if (!best || hits > best.hits) best = { ...c, hits };
    }
    if (best && best.hits >= 2) {
      return { verdict: 'likely-met', evidence: `${best.label}: "${firstSentence(best.text).slice(0, 160)}"`, suggestion: '' };
    }
    return { verdict: content.length ? 'likely-not-met' : 'unclear', evidence: content.length ? 'The course content doesn\'t mention this yet.' : 'There is no course content to judge yet.', suggestion: `Add a short passage that covers: ${item.text}` };
  },
  variant: ({ lessonTitle, audience, targetMinutes, blocks }) => {
    const plain = (text: string) => text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean).slice(0, 4).join(' ');
    const rewrite = (c: BlockContent): BlockContent => {
      switch (c.type) {
        case 'text': return { ...c, text: plain(c.text) };
        case 'callout': return { ...c, text: plain(c.text) };
        default: return c;
      }
    };
    const kept = audience === 'micro'
      ? blocks.filter((b, i) => b.content.type === 'check' || b.content.type === 'heading' || (b.content.type === 'text' && i === blocks.findIndex((x) => x.content.type === 'text')))
      : blocks;
    const out: { sourceBlockId: string | null; content: BlockContent }[] = kept.map((b) => ({ sourceBlockId: b.id, content: rewrite(b.content) }));
    if (audience === 'micro') out.unshift({ sourceBlockId: null, content: { type: 'callout', tone: 'info', title: 'In 15 minutes', text: `The essentials of ${lessonTitle.toLowerCase()}, then one check.` } });
    return { title: audience === 'micro' ? `${lessonTitle} (15-minute version)` : `${lessonTitle} (plain language)`, minutes: Math.min(targetMinutes, audience === 'micro' ? 15 : targetMinutes), blocks: out };
  },
  announcement: ({ courseTitle, prompt }) => ({
    title: `${courseTitle}: ${firstSentence(prompt).replace(/[.!?]$/, '').slice(0, 70) || 'An update'}`,
    body: `Hello everyone,\n\n${prompt.trim()}\n\nReply here or come to office hours with any questions.`,
  }),
};

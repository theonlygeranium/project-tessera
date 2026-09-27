// The hint-first tutor's rules (D-005, plan §5.4). Pure functions shared by the service,
// the app (to explain what the tutor will do), and tests. The AI never decides what kind
// of help to give: this module does, and the prompt is written for that kind.
//
// - Assignments are graded; lessons (and their knowledge checks) are practice.
// - Open is never allowed on graded work (normalizePolicyModes in shared/policy.ts).
// - Asking for the answer gets a hint unless the activity is practice in Open mode.
// - Hints are counted; when they run out, Explain and Open modes explain instead, and
//   Hints mode says so plainly.
// - The answer key is never a source, and a reply that contains a correct answer on
//   work where answers aren't allowed is replaced before the student sees it.
import type { ActivityKind, AiPolicy, TutorMode, TutorSetting } from '../domain';

export type TutorIntent = 'hint' | 'explain' | 'answer' | 'chat';
export type TutorKind = 'hint' | 'explain' | 'answer' | 'refusal' | 'chat';

export const isGraded = (kind: ActivityKind) => kind === 'assignment';

/** Modes an instructor may pick for this activity, within the administrator's policy. */
export function allowedModes(kind: ActivityKind, policy: AiPolicy): TutorMode[] {
  const list = isGraded(kind) ? policy.tutorModes.graded : policy.tutorModes.practice;
  const ordered: TutorMode[] = ['off', 'hints', 'explain', 'open'];
  return ordered.filter((m) => m === 'off' || (list.includes(m) && !(m === 'open' && isGraded(kind))));
}

/** The setting that applies when the instructor hasn't chosen one: Hints if allowed, else the most limited allowed mode. */
export function defaultMode(kind: ActivityKind, policy: AiPolicy): TutorMode {
  const allowed = allowedModes(kind, policy);
  return allowed.includes('hints') ? 'hints' : allowed.find((m) => m !== 'off') ?? 'off';
}

/**
 * The effective mode: the instructor's choice if the policy still allows it (the
 * administrator may have narrowed it since), otherwise the default.
 */
export function effectiveMode(kind: ActivityKind, policy: AiPolicy, setting: Pick<TutorSetting, 'mode'> | null): TutorMode {
  if (setting && allowedModes(kind, policy).includes(setting.mode)) return setting.mode;
  return defaultMode(kind, policy);
}

export interface TutorDecision {
  kind: TutorKind;
  /** For hints: which hint this is (1-based). */
  hintNumber: number | null;
  /** Shown to the student when the tutor changes or declines the request. */
  note: string | null;
}

export function decide(input: { mode: TutorMode; activityKind: ActivityKind; intent: TutorIntent; hintsUsed: number; maxHints: number }): TutorDecision {
  const { mode, activityKind, intent, hintsUsed, maxHints } = input;
  const graded = isGraded(activityKind);
  const hintsLeft = Math.max(0, maxHints - hintsUsed);
  const hint = (note: string | null = null): TutorDecision => ({ kind: 'hint', hintNumber: hintsUsed + 1, note });
  const noHints = (): TutorDecision => (mode === 'explain' || mode === 'open')
    ? { kind: 'explain', hintNumber: null, note: `You've used all ${maxHints} hints, so here's an explanation of the idea instead.` }
    : { kind: 'refusal', hintNumber: null, note: `You've used all ${maxHints} hints for this activity. Try the next step yourself, or ask your instructor.` };

  if (mode === 'off') return { kind: 'refusal', hintNumber: null, note: 'The tutor is off for this activity.' };

  if (intent === 'answer') {
    if (mode === 'open' && !graded) return { kind: 'answer', hintNumber: null, note: null };
    const why = graded ? 'This is graded work, so the tutor gives hints, not answers.' : 'The tutor gives hints here, not answers.';
    return hintsLeft > 0 ? hint(why) : { ...noHints(), note: `${why} ${noHints().note}` };
  }
  if (intent === 'explain') {
    if (mode === 'explain' || mode === 'open') return { kind: 'explain', hintNumber: null, note: null };
    return hintsLeft > 0 ? hint('The tutor gives hints on this activity, so here is a hint.') : noHints();
  }
  if (intent === 'hint') return hintsLeft > 0 ? hint() : noHints();
  return { kind: 'chat', hintNumber: null, note: null };
}

/** What the student always sees about the tutor (D-005): the mode, who set it, and what the instructor can see. */
export function visibilityText(mode: TutorMode, setByName: string | null, maxHints: number): string {
  const who = setByName ? `${setByName} set the tutor to ${label(mode)}` : `The tutor is set to ${label(mode)} (the course default)`;
  const hints = mode === 'off' ? '' : ` You have ${maxHints} ${maxHints === 1 ? 'hint' : 'hints'} for this activity.`;
  return `${who}.${hints} Your instructor sees a summary of the topics you ask about and how many hints you use, not your messages.`;
}

const label = (mode: TutorMode) => ({ off: 'Off', hints: 'Hints', explain: 'Explain', open: 'Open' })[mode];

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Whether a reply gives away a correct answer: it contains a correct option's text
 * (normalized, at least 4 characters) or names the correct option as the answer.
 * Used only when the decision wasn't `answer`.
 */
export function leaksAnswer(reply: string, answers: { correctText: string; correctLabel?: string }[]): boolean {
  const text = normalize(reply);
  return answers.some(({ correctText, correctLabel }) => {
    const t = normalize(correctText);
    if (t.length >= 4 && text.includes(t)) return true;
    if (!correctLabel) return false;
    // A letter only counts when it's used as an option label, not as a word ("choose a question").
    const raw = reply.toLowerCase(), l = correctLabel.toLowerCase();
    return [
      new RegExp(`\\b(option|choice)\\s+${l}\\b`),
      new RegExp(`\\(${l}\\)`),
      new RegExp(`\\b(answer|correct (one|option|choice))\\s+is\\s+${l}\\s*([.!,;:)]|$)`, 'm'),
      new RegExp(`(^|[\\s("'])${l}\\s+is\\s+(the\\s+)?(correct|right)\\b`, 'm'),
    ].some((re) => re.test(raw));
  });
}

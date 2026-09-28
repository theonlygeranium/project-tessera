import type { DesignQuestion, ExtractionProblemCode, InstructorProfile, SourceSpan, SyllabusExtraction } from '../domain';

type Problem = SyllabusExtraction['problems'][number];
type TermInfo = { start: string; end: string; holidays: string[] } | undefined;
const observableVerbs = new Set('analyze apply assess calculate categorize classify compare compose compute construct contrast critique defend demonstrate describe design develop distinguish draft evaluate explain formulate identify illustrate implement interpret justify list map measure model organize plan predict present rank recommend revise select solve summarize synthesize test trace use write communicate tell'.split(' '));
function needsObservableVerb(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/^(?:students?\s+(?:will|can|should)\s+|be\s+able\s+to\s+)/, '');
  if (/^(understand|know|appreciate|be familiar with|learn about)\b/.test(normalized)) return true;
  const first = normalized.match(/^\p{L}+/u)?.[0];
  return !first || !observableVerbs.has(first);
}

/** Deterministic checks ask before changing any interpretation of the syllabus. */
export function problemsFrom(extraction: SyllabusExtraction, termInfo?: TermInfo): Problem[] {
  const problems: Problem[] = [];
  const add = (code: ExtractionProblemCode, message: string, spans: SourceSpan[] = []) => problems.push({ code, message, spans });
  const weights = extraction.assessments.map(item => item.weightPercent).filter((n): n is number => n !== null);
  if (weights.length) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 100) > 1) add('weights-not-100', `Your grading components add to ${total}%.`, extraction.assessments.flatMap(item => item.span ? [item.span] : []));
  }
  const termWeeks = extraction.profile.termWeeks.value;
  if (termWeeks !== null && extraction.schedule.length !== termWeeks) add('week-count-mismatch', `The schedule has ${extraction.schedule.length} rows for a ${termWeeks}-week term.`, extraction.schedule.flatMap(row => row.span ? [row.span] : []).slice(0, 1));
  for (const row of extraction.schedule.filter(row => row.empty || !row.topic.trim())) add('empty-week', `The schedule has no topic in week ${row.week} of a ${extraction.schedule.length}-week table${termWeeks ? `, in a ${termWeeks}-week term` : ''}.`, row.span ? [row.span] : []);
  const start = termInfo?.start ?? extraction.profile.termStart.value;
  const end = termInfo?.end ?? extraction.profile.termEnd.value;
  if (start && end) for (const item of extraction.assessments) if (item.dueAt && (item.dueAt < start || item.dueAt > end)) add('due-outside-term', `${item.title} is due outside the term.`, item.span ? [item.span] : []);
  for (const outcome of extraction.outcomes) if (needsObservableVerb(outcome.text)) add('objective-no-verb', `Outcome ${outcome.id} may need an observable verb.`, outcome.span ? [outcome.span] : []);
  for (const field of ['credits', 'termWeeks', 'modality', 'enrolment'] as const) if (extraction.profile[field].origin === 'missing') add('missing-field', `${field} is not stated in the source.`);
  return problems;
}

const choice = (id: string, text: string) => ({ id, text });
/** At most five source questions plus the always-present teaching approach question. */
export function questionsFrom(problems: Problem[], extraction: SyllabusExtraction, profile: InstructorProfile | null): DesignQuestion[] {
  const hasEmptyWeek = problems.some(problem => problem.code === 'empty-week');
  const rank: Record<ExtractionProblemCode, number> = { 'week-count-mismatch': 0, 'empty-week': 0, 'weights-not-100': 1, 'due-outside-term': 3, 'missing-field': 4, 'objective-no-verb': 5 };
  const questions: DesignQuestion[] = [];
  for (const [index, problem] of [...problems].sort((a, b) => rank[a.code] - rank[b.code]).entries()) {
    if (questions.length >= 5) break;
    let text = '', kind: DesignQuestion['kind'] = 'choice', options: DesignQuestion['options'] = [];
    switch (problem.code) {
      case 'week-count-mismatch': if (hasEmptyWeek) continue; text = `${problem.message} Is a week missing, or is the term length different?`; options = [choice('missing-week', 'A week is missing'), choice('different-term', 'The term length is different'), choice('other', 'Something else')]; break;
      case 'weights-not-100': {
        const total = extraction.assessments.reduce((sum, assessment) => sum + (assessment.weightPercent ?? 0), 0);
        text = `Your grading components add to ${total}%. Which is right: the weights, or is something missing?`;
        options = [choice('as-written', 'weights as written'), choice('missing-component', 'a component is missing'), choice('other', 'other')]; break;
      }
      case 'empty-week': text = problem.message; options = [choice('exam', 'Midterm exam week'), choice('break', 'Fall break'), choice('other', 'Something else')]; break;
      case 'due-outside-term': text = `${problem.message} Is that date right?`; options = [choice('yes', 'Keep this date'), choice('change', 'Change the date')]; break;
      case 'missing-field': {
        if (!/^(credits|termWeeks|modality|enrolment)\b/.test(problem.message)) continue;
        const field = problem.message.split(' ')[0];
        if (field === 'enrolment') text = "Enrolment isn't stated. Roughly how many students? Case discussion and peer review depend on it.";
        else text = `I couldn't find ${field === 'termWeeks' ? 'the term length' : field} in the source. What should I use?`;
        kind = field === 'modality' ? 'choice' : 'number';
        options = field === 'modality' ? ['in-person','online-async','online-sync','hybrid','hyflex'].map(value => choice(value, value.replace('-', ' '))) : [];
        break;
      }
      case 'objective-no-verb': continue;
    }
    questions.push({ id: `question-${problem.code}-${index}`, text, spans: problem.spans, kind, options, required: false, answer: null, fromProblem: problem.code });
  }
  questions.push({ id: 'question-teaching-approach', text: 'In a sentence or two: how do you like to teach this course, and what do you want from this redesign?', spans: [], kind: 'text', options: [], required: false, answer: profile?.teachingApproach ? { optionId: null, value: profile.teachingApproach, skipped: false } : null, fromProblem: null });
  return questions;
}

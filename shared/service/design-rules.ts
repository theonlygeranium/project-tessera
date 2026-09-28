import type { DesignQuestion, ExtractionProblemCode, InstructorProfile, SourceSpan, SyllabusExtraction, InstructionalRead } from '../domain';
import { explicitAssessmentPoints } from '../design/plan';

type Problem = SyllabusExtraction['problems'][number];
type TermInfo = { start: string; end: string; holidays: string[] } | undefined;
const observableVerbs = new Set('analyze apply assess calculate categorize classify compare compose compute construct contrast critique defend demonstrate describe design develop distinguish draft evaluate explain formulate identify illustrate implement interpret justify list map measure model organize plan predict present rank recommend revise select solve summarize synthesize test trace use write communicate tell'.split(' '));
function needsObservableVerb(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/^(?:students?\s+(?:will|can|should)\s+|be\s+able\s+to\s+)/, '');
  if (/^(understand|know|appreciate|be familiar with|learn about)\b/.test(normalized)) return true;
  const first = normalized.match(/^\p{L}+/u)?.[0];
  return !first || !observableVerbs.has(first);
}
function calendarDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function dueDate(value: string, termStart: number): number | null {
  const iso = calendarDate(value.trim());
  if (iso !== null) return iso;
  const monthName = /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})$/i.exec(value.trim());
  const slash = /^(\d{1,2})\/(\d{1,2})$/.exec(value.trim());
  const month = monthName ? months.findIndex(m => monthName[1].toLowerCase().startsWith(m)) + 1 : slash ? Number(slash[1]) : 0;
  const day = Number(monthName?.[2] ?? slash?.[2]);
  if (!month || month > 12 || !day) return null;
  let year = new Date(termStart).getUTCFullYear();
  let parsed = calendarDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  if (parsed !== null && parsed < termStart - 60 * 86_400_000) parsed = calendarDate(`${++year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  return parsed;
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
  // Rows may group weeks ("Weeks 2–4"). Only a schedule with a row for every week can be missing
  // one; a grouped schedule is only wrong when it runs past the term.
  const lastWeek = Math.max(0, ...extraction.schedule.map(row => row.week));
  const weekly = extraction.schedule.length > 0 && extraction.schedule.length === lastWeek;
  if (termWeeks !== null && extraction.schedule.length && (weekly ? lastWeek !== termWeeks : lastWeek > termWeeks)) add('week-count-mismatch', `The schedule has ${extraction.schedule.length} rows for a ${termWeeks}-week term.`, extraction.schedule.flatMap(row => row.span ? [row.span] : []).slice(0, 1));
  for (const row of extraction.schedule.filter(row => row.empty || !row.topic.trim())) add('empty-week', `The schedule has no topic in week ${row.week} of a ${extraction.schedule.length}-week table${termWeeks ? `, in a ${termWeeks}-week term` : ''}.`, row.span ? [row.span] : []);
  const start = termInfo?.start ?? extraction.profile.termStart.value;
  const end = termInfo?.end ?? extraction.profile.termEnd.value;
  const startDate = start ? calendarDate(start) : null;
  const endDate = end ? calendarDate(end) : null;
  if (startDate !== null && endDate !== null) {
    const outside = extraction.assessments.filter(item => {
      const due = item.dueAt ? dueDate(item.dueAt, startDate) : null;
      return due !== null && (due < startDate - 3 * 86_400_000 || due > endDate + 3 * 86_400_000);
    });
    if (outside.length) add('due-outside-term', `${outside.map(item => item.title).join(', ')} ${outside.length === 1 ? 'is' : 'are'} due outside the term.`, outside.flatMap(item => item.span ? [item.span] : []));
  }
  for (const outcome of extraction.outcomes) if (needsObservableVerb(outcome.text)) add('objective-no-verb', `Outcome ${outcome.id} may need an observable verb.`, outcome.span ? [outcome.span] : []);
  for (const field of ['credits', 'termWeeks', 'modality', 'enrolment'] as const) if (extraction.profile[field].origin === 'missing') add('missing-field', `${field} is not stated in the source.`);
  return problems;
}

const choice = (id: string, text: string) => ({ id, text });
/** At most five source questions plus the always-present teaching approach question. */
export function questionsFrom(problems: Problem[], extraction: SyllabusExtraction, profile: InstructorProfile | null, read?: InstructionalRead): DesignQuestion[] {
  const hasEmptyWeek = problems.some(problem => problem.code === 'empty-week');
  const rank: Record<ExtractionProblemCode, number> = { 'week-count-mismatch': 0, 'empty-week': 0, 'weights-not-100': 1, 'due-outside-term': 3, 'missing-field': 4, 'objective-no-verb': 5 };
  const questions: DesignQuestion[] = [];
  if (!extraction.outcomes.length) questions.push({ id: 'question-missing-outcomes', text: "Your syllabus doesn't list course outcomes. Should I suggest some from your schedule and assignments?", spans: [], kind: 'choice', options: [choice('suggest', 'Suggest outcomes'), choice('write', "I'll write them")], required: false, answer: null, fromProblem: null });
  for (const assessment of extraction.assessments.filter(item => item.weightPercent === null && explicitAssessmentPoints(item.span) === null)) {
    if (questions.length >= 5) break;
    questions.push({ id: `question-assessment-points-${assessment.id}`, text: `How many points is ${assessment.title} worth?`, spans: assessment.span ? [assessment.span] : [], kind: 'number', options: [], required: false, answer: null, fromProblem: null });
  }
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
  if (read) {
    for (const audit of read.outcomeAudits.filter(item => !item.assessedBy.length)) {
      const outcome = extraction.outcomes.find(item => item.id === audit.outcomeId);
      if (!outcome) continue;
      questions.push({ id: `question-unassessed-${audit.outcomeId}`, text: `Outcome ${audit.outcomeId}, “${outcome.text}”, isn't assessed by anything I can find. How should we handle it?`, spans: outcome.span ? [outcome.span] : [], kind: 'choice', options: [choice('assess', 'Assess it (propose how)'), choice('inside', "It's inside an existing assessment"), choice('drop', 'Drop it')], required: false, answer: null, fromProblem: null });
    }
    for (const assessment of extraction.assessments.filter(item => (item.weightPercent ?? 0) >= 30 && item.dueAt)) {
      questions.push({ id: `question-milestones-${assessment.id}`, text: `${assessment.title} is ${assessment.weightPercent}% with one due date. Would milestones with feedback help, or is the single deadline deliberate?`, spans: assessment.span ? [assessment.span] : [], kind: 'choice', options: [choice('milestones', 'Add milestones with feedback'), choice('single', 'Keep one deadline')], required: false, answer: null, fromProblem: null });
    }
  }
  const open: DesignQuestion = { id: 'question-teaching-approach', text: 'In a sentence or two: how do you like to teach this course, and what do you want from this redesign?', spans: [], kind: 'text', options: [], required: false, answer: profile?.teachingApproach ? { optionId: null, value: profile.teachingApproach, skipped: false } : null, fromProblem: null };
  return [...questions.slice(0, 5), open];
}

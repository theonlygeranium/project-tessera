import { ApiError } from '../api';
import type { AiTasks } from '../ai';
import type { ArchitectureId, DesignSource, StructureOption } from '../domain';
import { estimateWorkload } from './workload';
import { validateArchitectureIds, validateNoLearningStyles } from '../service/validate-design';

type Input = AiTasks['structure-options']['input'];
const bad = (message: string): never => { throw new ApiError('invalid', message); };
const validSpan = (span: { page: number | null; text: string }, source: DesignSource) => source.sections.some(section => section.page === span.page && section.text.includes(span.text));

/** Repair safe omissions, then reject ungrounded claims and invalid model structure. */
export function finalizeOptions(raw: unknown, input: Input): StructureOption[] {
  if (!Array.isArray(raw)) bad('Options must be an array.');
  const options = structuredClone(raw) as StructureOption[];
  validateArchitectureIds(options, input.candidates);
  validateNoLearningStyles(options);
  const codes = new Set(input.confirmedOutcomes.map(item => item.code));
  const profile = { ...input.profile, termWeeks: { ...input.profile.termWeeks, value: input.weeks } };
  const workload = estimateWorkload(profile, input.schedule, input.assessments, input.rates);
  const weekHours = new Map(workload.weeks.map(week => [week.week, week.hours]));
  for (const option of options) {
    if (!option || typeof option.label !== 'string' || typeof option.tag !== 'string' || typeof option.description !== 'string' || typeof option.changes !== 'string' || typeof option.tradeoffs !== 'string' || typeof option.evidence !== 'string' || !Array.isArray(option.fits) || !Array.isArray(option.frameworks) || !Array.isArray(option.modules) || !option.modules.length) bad('Option response has an invalid shape.');
    if (option.fits.some(fit => typeof fit.text !== 'string' || (fit.span && !validSpan(fit.span, input.source)))) bad('Option cites a passage outside the source.');
    if ((input.schedule.some(row => row.span) || input.assessments.some(item => item.span) || input.profile.description.spans.length > 0) && !option.fits.some(fit => fit.span)) bad('Each approach needs a syllabus citation.');
    if (!option.evidence.trim()) bad('Each approach needs an evidence caveat.');
    if (!/\b(?:varies|vary|depends|uncertain|limited|mixed|context|not a prediction|may)\b/i.test(option.evidence)) option.evidence += ' Results vary by context; this is not a prediction for your students.';
    option.tag = option.id === input.closest ? 'Closest to your syllabus' : option.tag.replace(/closest to your syllabus/ig, 'Alternative structure');
    if (option.id === 'weekly') {
      const expected = input.schedule.length ? input.schedule.filter(row => !row.empty).map(row => row.week) : Array.from({ length: input.weeks }, (_, index) => index + 1);
      const actual = option.modules.flatMap(module => module.weeks);
      if (option.modules.length !== expected.length || option.modules.some(module => module.weeks.length !== 1) || actual.some(week => !expected.includes(week)) || new Set(actual).size !== expected.length) bad('Weekly architecture needs one module per scheduled week or unit.');
    }
    for (const module of option.modules) {
      if (typeof module.title !== 'string' || typeof module.objective !== 'string' || typeof module.assessment !== 'string' || !Array.isArray(module.outcomeIds) || !Array.isArray(module.weeks) || !module.weeks.length || !Number.isInteger(module.lessons) || !Number.isFinite(module.lessonMinutes)) bad('Module response has an invalid shape.');
      module.outcomeIds = [...new Set(module.outcomeIds.filter(code => codes.has(code)))];
      if (module.weeks.some(week => !Number.isInteger(week) || week < 1 || week > input.weeks)) bad('Module week is outside the term.');
      module.hours = Math.round(module.weeks.reduce((sum, week) => sum + (weekHours.get(week) ?? 0), 0) * 10) / 10;
    }
    for (const outcome of input.confirmedOutcomes) {
      if (option.modules.some(module => module.outcomeIds.includes(outcome.code))) continue;
      const original = input.source.sections.find(section => section.text.includes(outcome.originalText));
      const sourceWeek = input.schedule.find(row => row.span?.page === original?.page)?.week ?? 1;
      const nearest = option.modules.reduce((best, module) => Math.min(...module.weeks.map(week => Math.abs(week - sourceWeek))) < Math.min(...best.weeks.map(week => Math.abs(week - sourceWeek))) ? module : best);
      nearest.outcomeIds.push(outcome.code);
      option.changes += ` Outcome ${outcome.code} was added to the closest module because the draft omitted it.`;
    }
    const peak = Math.max(...option.modules.flatMap(module => module.weeks.map(week => weekHours.get(week) ?? 0)));
    option.workload = { averageHours: workload.averageHours, peakHours: peak, peakModule: option.modules.findIndex(module => module.weeks.some(week => (weekHours.get(week) ?? 0) === peak)) + 1 };
    if (workload.weeklyBudgetHours > 0 && peak > workload.weeklyBudgetHours * 1.1) option.tradeoffs += ` The estimated peak of ${peak} hours exceeds the ${workload.weeklyBudgetHours} hour weekly budget by more than 10%.`;
  }
  return options;
}

export function validateSuggestions(raw: unknown): AiTasks['outcome-suggest']['output'] {
  const output = raw as AiTasks['outcome-suggest']['output'];
  if (!output || !Array.isArray(output.suggestions) || output.suggestions.length < 3 || output.suggestions.length > 6 || output.suggestions.some(item => !item || typeof item.text !== 'string' || typeof item.why !== 'string' || !/^(?:Analyze|Apply|Assess|Calculate|Categorize|Classify|Communicate|Compare|Compose|Compute|Construct|Contrast|Create|Critique|Defend|Demonstrate|Describe|Design|Develop|Distinguish|Draft|Evaluate|Explain|Formulate|Identify|Illustrate|Implement|Interpret|Justify|List|Map|Measure|Model|Organize|Plan|Predict|Present|Rank|Recommend|Revise|Select|Solve|Summarize|Synthesize|Test|Trace|Use|Write)\b/i.test(item.text))) bad('Outcome suggestions need 3–6 observable actions.');
  validateNoLearningStyles(output);
  return output;
}

export function combinationNote(ids: ArchitectureId[]): string | null {
  if (ids.length < 2) return null;
  const names: Record<ArchitectureId, string> = { weekly: 'Weekly rhythm', thematic: 'Thematic units', case: 'Case inquiry', project: 'Project spine', competency: 'Competency progression', flipped: 'Flipped meetings', scaffolded: 'Skill scaffolding', performance: 'Performance practice', micro: 'Short sessions', hyflex: 'Flexible participation' };
  const [spine, ...patterns] = ids;
  return `${names[spine]} with ${patterns.map(id => names[id].toLowerCase()).join(' and ')}`;
}

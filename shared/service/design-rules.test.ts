import { describe, expect, it } from 'vitest';
import seed from '../seed-syllabus.json';
import type { DesignSource, InstructorProfile, SyllabusExtraction } from '../domain';
import { extractSyllabusFixture } from '../syllabus-fixture';
import { problemsFrom, questionsFrom } from './design-rules';

const source = seed as DesignSource;
const extraction = (): SyllabusExtraction => ({ ...extractSyllabusFixture({ sourceKind: 'syllabus', name: source.name, sections: source.sections }), problems: [], provenance: { model: 'fixture', task: 'syllabus-extract', generatedAt: '2026-09-28T00:00:00Z', sources: [], summary: '' } });
const codes = (x: SyllabusExtraction) => problemsFrom(x).map(problem => problem.code);

describe('design questions from deterministic rules', () => {
  it('asks for points when an assessment has neither percent nor cited points', () => {
    const x = extraction();
    x.assessments = [{ id: 'unweighted', title: 'Final project', weightPercent: null, dueAt: null, format: 'project', span: { page: 3, text: 'Final project: grade to be determined.' } }];
    expect(questionsFrom([], x, null).some(q => q.id === 'question-assessment-points-unweighted' && q.kind === 'number')).toBe(true);
  });
  it('finds week count, empty week, unobservable outcome, and missing enrolment in the sample', () => {
    const result = codes(extraction());
    expect(result).toContain('week-count-mismatch');
    expect(result).toContain('empty-week');
    expect(result).toContain('objective-no-verb');
    expect(result).toContain('missing-field');
  });
  it('flags weights outside the 99–101 tolerance', () => { const x = extraction(); x.assessments[0].weightPercent = 10; expect(codes(x)).toContain('weights-not-100'); });
  it('asks about a mismatched week count when no row is empty', () => { const x = extraction(); const row = x.schedule.find(item => item.week === 8)!; row.topic = 'Midterm exam'; row.empty = false; expect(questionsFrom(problemsFrom(x), x, null).some(question => question.fromProblem === 'week-count-mismatch')).toBe(true); });
  it('flags a due date outside the term', () => { const x = extraction(); x.assessments[0].dueAt = '2027-01-01'; expect(codes(x)).toContain('due-outside-term'); });
  it('parses only actual dates, resolves month and slash forms, and groups outside dates', () => {
    const x = extraction();
    const start = x.profile.termStart.value!;
    const end = x.profile.termEnd.value!;
    x.assessments.forEach(item => { item.dueAt = 'Weekly'; });
    x.assessments[0].dueAt = 'Week 7'; x.assessments[1].dueAt = 'TBA';
    expect(problemsFrom(x).filter(problem => problem.code === 'due-outside-term')).toHaveLength(0);
    x.assessments[0].dueAt = 'Oct 15'; x.assessments[1].dueAt = 'October 15'; x.assessments[2].dueAt = '10/15';
    expect(problemsFrom(x).filter(problem => problem.code === 'due-outside-term')).toHaveLength(0);
    x.assessments[0].dueAt = start; x.assessments[1].dueAt = end;
    expect(problemsFrom(x).filter(problem => problem.code === 'due-outside-term')).toHaveLength(0);
    x.assessments[0].dueAt = '2026-12-14'; x.assessments[1].dueAt = '2026-12-15';
    expect(problemsFrom(x).filter(problem => problem.code === 'due-outside-term')).toHaveLength(1);
    x.assessments[2].dueAt = '2027-01-01';
    const problems = problemsFrom(x).filter(problem => problem.code === 'due-outside-term');
    expect(problems).toHaveLength(1);
    expect(questionsFrom(problems, x, null).filter(question => question.fromProblem === 'due-outside-term')).toHaveLength(1);
  });
  it('uses the next year for a month far before a cross-year term start', () => {
    const x = extraction(); x.assessments.forEach(item => { item.dueAt = 'TBA'; });
    x.assessments[0].dueAt = 'Jan 15';
    expect(problemsFrom(x, { start: '2026-12-01', end: '2027-03-31', holidays: [] }).filter(problem => problem.code === 'due-outside-term')).toHaveLength(0);
  });
  it('asks for date confirmation and missing profile fields with the intended controls', () => {
    const x = extraction(); x.assessments[0].dueAt = '2027-01-01';
    const questions = questionsFrom(problemsFrom(x), x, null);
    expect(questions.find(question => question.fromProblem === 'due-outside-term')).toMatchObject({ kind: 'choice', options: [{ text: 'Keep this date' }, { text: 'Change the date' }] });
    expect(questions.find(question => question.text.startsWith("Enrolment isn't stated"))).toMatchObject({ kind: 'number', required: false });
  });
  it('does not ask a question for an unobservable outcome', () => { const x = extraction(); const problems = problemsFrom(x).filter(problem => problem.code === 'objective-no-verb'); expect(questionsFrom(problems, x, null).map(question => question.fromProblem)).toEqual([null]); });
  it('flags a noun phrase with no observable verb', () => { const x = extraction(); x.outcomes[0].text = 'Statistical questions and data'; expect(problemsFrom(x).some(problem => problem.code === 'objective-no-verb' && problem.message.includes(x.outcomes[0].id))).toBe(true); });
  it('orders week count and weights first, caps at six, and appends the teaching prompt with prefill', () => {
    const x = extraction(); x.assessments[0].weightPercent = 10;
    const problems = [...problemsFrom(x), ...Array.from({ length: 9 }, (_, i) => ({ code: 'missing-field' as const, message: `credits ${i} is not stated`, spans: [] }))];
    const profile = { teachingApproach: 'Practice with local cases.' } as InstructorProfile;
    const questions = questionsFrom(problems, x, profile);
    expect(questions).toHaveLength(6);
    expect(questions.slice(0, 2).map(question => question.fromProblem)).toEqual(['empty-week', 'weights-not-100']);
    expect(questions[1].options.map(option => option.text)).toEqual(['weights as written', 'a component is missing', 'other']);
    expect(questions.find(question => question.fromProblem === 'empty-week')?.options.map(option => option.text)).toEqual(['Midterm exam week', 'Fall break', 'Something else']);
    expect(questions.at(-1)?.answer?.value).toBe('Practice with local cases.');
    expect(questions.every(question => question.required === false)).toBe(true);
  });
});

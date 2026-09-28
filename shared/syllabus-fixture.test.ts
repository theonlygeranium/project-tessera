import { describe, expect, it } from 'vitest';
import seed from './seed-syllabus.json';
import { extractSyllabusFixture } from './syllabus-fixture';
import type { DesignSource } from './domain';

const source = seed as DesignSource;
describe('fictional syllabus extraction', () => {
  it('reads profile, outcomes, grading, schedule and policies with page anchors', () => {
    const result = extractSyllabusFixture({ sourceKind: 'syllabus', name: source.name, sections: source.sections });
    expect(result.profile.code).toMatchObject({ value: 'STAT 110', origin: 'extracted' });
    expect(result.profile.credits.value).toBe(3);
    expect(result.profile.termWeeks.value).toBe(15);
    expect(result.profile.instructor.value).toMatchObject({ name: 'Dr. Amara Okafor', email: 'a.okafor@meridianstate.example' });
    expect(result.profile.meeting.value).toMatchObject({ days: ['Tuesday', 'Thursday'], minutes: 75 });
    expect(result.profile.modality).toMatchObject({ value: 'in-person', origin: 'inferred' });
    expect(result.profile.enrolment).toMatchObject({ value: null, origin: 'missing' });
    expect(result.outcomes).toHaveLength(6);
    expect(result.outcomes.every(outcome => outcome.span?.page === 2)).toBe(true);
    expect(result.assessments.map(item => [item.title, item.weightPercent])).toEqual([['Weekly quizzes', 15], ['Homework sets', 20], ['Midterm exam', 20], ['Course project', 40], ['Participation', 5]]);
    expect(result.schedule).toHaveLength(14);
    expect(result.schedule.find(row => row.week === 8)).toMatchObject({ topic: '', empty: true, span: { page: 4 } });
    expect(result.policies.map(item => item.kind)).toEqual(['attendance', 'late-work', 'integrity', 'ai-use', 'accommodations']);
    expect(result.policies.every(item => item.span.page === 5)).toBe(true);
  });
});

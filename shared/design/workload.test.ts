import { describe, expect, it } from 'vitest';
import type { DesignSource } from '../domain';
import seed from '../seed-syllabus.json';
import { extractSyllabusFixture } from '../syllabus-fixture';
import { RICE_DEFAULTS } from '../policy';
import { estimateWorkload } from './workload';

const source = seed as DesignSource;
const extraction = extractSyllabusFixture({ sourceKind: 'syllabus', name: source.name, sections: source.sections });
describe('workload estimate', () => {
  it('uses a nine-hour budget and identifies the sample peak in week 11', () => {
    const result = estimateWorkload(extraction.profile, extraction.schedule, extraction.assessments, RICE_DEFAULTS);
    expect(result.weeklyBudgetHours).toBe(9);
    expect(result.weeks.reduce((peak, week) => week.hours > peak.hours ? week : peak).week).toBe(11);
    expect(result.weeks.find(week => week.week === 11)?.overBudget).toBe(true);
    expect(result.weeks.find(week => week.week === 8)).toMatchObject({ hours: 2.5, overBudget: false });
  });
  it('uses session rates when passed and can leave an empty row at zero', () => {
    const profile = { ...extraction.profile, meeting: { ...extraction.profile.meeting, value: null } };
    const result = estimateWorkload(profile, extraction.schedule, extraction.assessments, { ...RICE_DEFAULTS, problemSetHours: 4 });
    expect(result.weeks.find(week => week.week === 8)?.hours).toBe(0);
    expect(result.weeks.find(week => week.week === 2)?.hours).toBeGreaterThan(4);
  });
  it('uses stated seat time for a training brief and treats rows as sessions', () => {
    const profile = { ...extraction.profile, credits: { ...extraction.profile.credits, value: null }, weeklyHoursBudget: 2, meeting: { ...extraction.profile.meeting, value: null }, termWeeks: { ...extraction.profile.termWeeks, value: 2 } };
    const sessions = [{ ...extraction.schedule[0], week: 1, reading: '', due: '' }, { ...extraction.schedule[1], week: 2, reading: '', due: '' }];
    const result = estimateWorkload(profile, sessions, [], RICE_DEFAULTS);
    expect(result.weeklyBudgetHours).toBe(2);
    expect(result.weeks).toHaveLength(2);
    expect(result.weeks.every(week => week.hours === 0)).toBe(true);
  });
  it('uses chapter page counts in materials and computes the budget from credits', () => {
    const profile = { ...extraction.profile, weeklyHoursBudget: 99, materials: { ...extraction.profile.materials, value: [{ title: 'Ch. 1: 68 pages', kind: 'textbook' as const, span: { page: 1, text: 'Ch. 1: 68 pages' } }] } };
    const result = estimateWorkload(profile, [extraction.schedule[0]], [], RICE_DEFAULTS);
    expect(result.weeklyBudgetHours).toBe(9);
    expect(result.weeks[0].hours).toBe(4.5);
  });
});

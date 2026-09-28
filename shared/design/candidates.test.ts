import { describe, expect, it } from 'vitest';
import seed from '../seed-syllabus.json';
import { extractSyllabusFixture } from '../syllabus-fixture';
import type { SyllabusExtraction } from '../domain';
import { selectCandidates } from './candidates';

const baseline = (): SyllabusExtraction => ({ ...extractSyllabusFixture({ sourceKind: 'syllabus', name: 'sample', sections: seed.sections }), problems: [], provenance: { task: 'syllabus-extract', model: 'fixture', generatedAt: '2026-09-28T12:00:00.000Z', summary: '', sources: [] } });
const row = (week: number, dates = `Week ${week}`, topic = `Topic ${week}`) => ({ week, dates, topic, reading: '', due: '', span: null, empty: false });
describe('candidate rules', () => {
  it.each([
    ['STAT 110 sample', () => baseline(), 'syllabus', ['weekly', 'project', 'flipped']],
    ['16-week online with 30% project', () => { const x = baseline(); x.schedule = Array.from({ length: 16 }, (_, i) => row(i + 1)); x.profile.termWeeks.value = 16; x.profile.modality.value = 'online-async'; x.assessments = [{ id: 'p', title: 'Project', format: 'project', weightPercent: 30, dueAt: null, span: null }]; return x; }, 'syllabus', ['weekly', 'project', 'scaffolded']],
    ['8-module online graduate', () => { const x = baseline(); x.schedule = Array.from({ length: 8 }, (_, i) => row(i + 1, `Module ${i + 1}`)); x.profile.termWeeks.value = 8; x.profile.modality.value = 'online-async'; x.profile.level.value = 'graduate'; x.assessments = []; return x; }, 'syllabus', ['thematic', 'weekly', 'case']],
    ['points graded, no calendar', () => { const x = baseline(); x.schedule = []; x.profile.termWeeks.value = null; x.assessments = x.assessments.map(a => ({ ...a, weightPercent: null })); return x; }, 'syllabus', ['thematic', 'flipped', 'scaffolded']],
    ['15-week face-to-face lab', () => { const x = baseline(); x.schedule = Array.from({ length: 15 }, (_, i) => row(i + 1)); x.profile.modality.value = 'in-person'; x.profile.title.value = 'Introductory biology lab'; x.assessments = []; return x; }, 'syllabus', ['weekly', 'flipped', 'scaffolded']],
  ] as const)('%s', (_name, make, kind, expected) => {
    const actual = selectCandidates(make(), [], '', null, kind);
    expect(actual.ids).toEqual(expected);
    expect(actual.ids).toHaveLength(3);
  });
  it('uses an answered week count without a schedule', () => {
    const x = baseline(); x.schedule = []; x.profile.termWeeks.value = null;
    expect(selectCandidates(x, [{ id: 'weeks', text: 'What is the term length?', kind: 'number', options: [], required: false, spans: [], fromProblem: null, answer: { optionId: null, value: '10', skipped: false } }], '').closest).toBe('weekly');
  });
  it('allows cross-listed and unknown levels to scaffold an introductory skill', () => {
    const x = baseline(); x.profile.level.value = null; x.profile.prerequisites.value = [];
    expect(selectCandidates(x, [], '', ['weekly', 'scaffolded', 'case']).ids).toContain('scaffolded');
    x.profile.level.value = 'cross-listed 100/500';
    expect(selectCandidates(x, [], '', ['weekly', 'scaffolded', 'case']).ids).toContain('scaffolded');
  });
  it('filters allowed ids and keeps weekly away from micro', () => {
    const x = baseline(); x.profile.business.value = { goal: 'Practice', metric: 'Completion', audienceRole: 'staff' }; x.profile.weeklyHoursBudget = 2; x.schedule = []; x.profile.termWeeks.value = null;
    const actual = selectCandidates(x, [], '', ['weekly', 'performance', 'micro', 'project'], 'brief');
    expect(actual.ids).toEqual(['performance', 'project', 'micro']);
    expect(actual.ids).not.toEqual(expect.arrayContaining(['weekly', 'micro']));
  });
  it('only shows hyflex when stated and defaults overlays by modality', () => {
    const x = baseline(); x.profile.modality.value = 'hyflex'; x.assessments = [];
    expect(selectCandidates(x, [], '', ['weekly', 'hyflex', 'scaffolded']).ids).toContain('hyflex');
    expect(selectCandidates(x, [], '').overlaysDefault).toContain('teaching-presence');
    x.profile.modality.value = 'in-person';
    expect(selectCandidates(x, [], '').ids).not.toContain('hyflex');
    expect(selectCandidates(x, [], '').overlaysDefault).toEqual(['bookends', 'spaced-review']);
  });
  it('promotes cases from analytical outcomes in small or asynchronous courses, or an explicit note', () => {
    const x = baseline(); x.assessments = []; x.profile.modality.value = 'online-async'; x.outcomes = [{ id: 'O1', text: 'Evaluate claims using data.', span: null, origin: 'extracted' }];
    expect(selectCandidates(x, [], '').ids[1]).toBe('case');
    x.profile.modality.value = 'in-person'; x.profile.enrolment.value = 120;
    expect(selectCandidates(x, [], 'Use real data and cases').ids[1]).toBe('case');
  });
  it('includes performance and competency for an industry competency brief', () => {
    const x = baseline(); x.schedule = []; x.profile.termWeeks.value = null; x.profile.description.value = 'Competencies for a procedure refresher'; x.profile.weeklyHoursBudget = 2; x.assessments = [];
    expect(selectCandidates(x, [], '', null, 'brief').ids).toEqual(['competency', 'performance', 'micro']);
  });
});

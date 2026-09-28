import { describe, expect, it } from 'vitest';
import seed from '../seed-syllabus.json';
import { fixtureAi } from '../ai';
import { extractSyllabusFixture } from '../syllabus-fixture';
import { RICE_DEFAULTS } from '../policy';
import { finalizeOptions, validateSuggestions, combinationNote } from './options';
import type { AiTasks } from '../ai';

const source = seed as AiTasks['structure-options']['input']['source'];
const extraction = extractSyllabusFixture({ sourceKind: 'syllabus', name: source.name, sections: source.sections });
const input: AiTasks['structure-options']['input'] = { profile: extraction.profile, schedule: extraction.schedule, assessments: extraction.assessments, source, confirmedOutcomes: extraction.outcomes.map((item, index) => ({ code: `O${index + 1}`, text: item.text, originalText: item.text })), answers: [], teachingNote: '', instructorProfile: null, candidates: ['weekly', 'project', 'flipped'], closest: 'weekly', overlaysDefault: ['bookends', 'spaced-review'], rates: RICE_DEFAULTS, weeks: 15 };

describe('structure option validation', () => {
  it('overwrites model hours and repairs a missing outcome', async () => {
    const output = (await fixtureAi.run('structure-options', input)).output;
    output[0].modules[0].hours = 999;
    output[0].workload.peakHours = 999;
    for (const module of output[0].modules) module.outcomeIds = module.outcomeIds.filter(id => id !== 'O6');
    const options = finalizeOptions(output, input);
    expect(options[0].modules[0].hours).not.toBe(999);
    expect(options[0].workload.peakHours).not.toBe(999);
    expect(options[0].modules.some(module => module.outcomeIds.includes('O6'))).toBe(true);
    expect(options[0].changes).toContain('Outcome O6 was added');
    expect(options[0].tradeoffs).toContain('weekly budget');
  });
  it('rejects wrong ids, bad weeks, false spans, and unsupported claims', async () => {
    const raw = (await fixtureAi.run('structure-options', input)).output;
    expect(() => finalizeOptions(raw.map(option => ({ ...option, id: 'case' as const })), input)).toThrow();
    expect(() => finalizeOptions(raw.map((option, index) => index === 0 ? { ...option, modules: [{ ...option.modules[0], weeks: [16] }] } : option), input)).toThrow();
    expect(() => finalizeOptions(raw.map((option, index) => index === 0 ? { ...option, fits: [{ text: 'Cited', span: { page: 9, text: 'invented' } }] } : option), input)).toThrow();
    expect(() => finalizeOptions(raw.map((option, index) => index === 0 ? { ...option, description: 'learning styles' } : option), input)).toThrow();
  });
  it('validates suggestions and makes deterministic combination notes', () => {
    expect(validateSuggestions({ suggestions: ['Explain', 'Apply', 'Evaluate'].map(verb => ({ text: `${verb} the evidence.`, why: 'From the topics.' })) }).suggestions).toHaveLength(3);
    expect(() => validateSuggestions({ suggestions: [{ text: 'Understand data', why: '' }] })).toThrow();
    expect(combinationNote(['weekly', 'project'])).toBe('Weekly rhythm with project spine');
  });
});

import { describe, expect, it } from 'vitest';
import type { DesignSource, StructureOption } from '../domain';
import { validateArchitectureIds, validateExtraction, validateNoLearningStyles, validateSpans } from './validate-design';
import seed from '../seed-syllabus.json';
import { extractSyllabusFixture } from '../syllabus-fixture';

const file: DesignSource = { kind: 'syllabus', fileId: 'f-1', version: 1, name: 'Syllabus', sections: [{ page: 2, heading: '', level: 0, text: '', lines: [] }, { page: 4, heading: '', level: 0, text: '', lines: [] }], chars: 0, ocr: false };
const paste: DesignSource = { ...file, fileId: null, version: null, sections: [{ page: null, heading: '', level: 0, text: '', lines: [] }] };
const option = (id: StructureOption['id']) => ({ id }) as StructureOption;

describe('design output validators', () => {
  it('checks every page against the source pages or null for a paste', () => {
    expect(() => validateSpans([{ page: 2, text: 'one' }, { page: 4, text: 'three' }], file)).not.toThrow();
    expect(() => validateSpans([{ page: 3, text: 'two' }], file)).toThrow();
    expect(() => validateSpans([{ page: null, text: 'paste' }], paste)).not.toThrow();
    expect(() => validateSpans([{ page: 1, text: '' }], file)).toThrow(/spans\[0\]\.page/);
    expect(() => validateSpans([{ page: 5, text: '' }], file)).toThrow(/spans\[0\]\.page/);
    // A quote that couldn't be anchored keeps no page rather than a wrong one.
    expect(() => validateSpans([{ page: null, text: 'unanchored' }], file)).not.toThrow();
    expect(() => validateSpans([{ page: 1, text: '' }], paste)).toThrow(/spans\[0\]\.page/);
  });
  const source = seed as import('../domain').DesignSource;
  const output = () => extractSyllabusFixture({ sourceKind: 'syllabus', name: source.name, sections: source.sections });
  it('accepts a shaped extraction from the seeded source', () => { expect(() => validateExtraction(output(), source)).not.toThrow(); });
  it('rejects a malformed extraction shape', () => { expect(() => validateExtraction({ ...output(), profile: null }, source)).toThrow(/invalid shape/); });
  it('rejects a span outside source pages', () => { const value = output(); value.outcomes[0].span = { page: 99, text: 'x' }; expect(() => validateExtraction(value, source)).toThrow(/outside/); });
  it('rejects duplicate ids', () => { const value = output(); value.outcomes[1].id = value.outcomes[0].id; expect(() => validateExtraction(value, source)).toThrow(/repeats an id/); });
  it('rejects weights outside 0–100', () => { const value = output(); value.assessments[0].weightPercent = 101; expect(() => validateExtraction(value, source)).toThrow(/outside 0–100/); });
  it('rejects learning-style claims in any field', () => { const value = output(); value.policies[0].text = 'learning style'; expect(() => validateExtraction(value, source)).toThrow(/learning style/); });
  it('finds learning styles in nested strings with a field path', () => {
    expect(() => validateNoLearningStyles({ notes: ['Goals and time', { reason: 'LEARNING STYLES preference' }] })).toThrow(/value\.notes\[1\]\.reason/);
    expect(() => validateNoLearningStyles({ 'learning style': 'auditory' })).toThrow(/value\.learning style/);
    expect(() => validateNoLearningStyles({ notes: ['goals', 'access needs'] })).not.toThrow();
  });
  it('accepts candidate ids in any order and rejects missing, repeated, or extra ids', () => {
    expect(() => validateArchitectureIds([option('case'), option('weekly')], ['weekly', 'case'])).not.toThrow();
    expect(() => validateArchitectureIds([option('weekly')], ['weekly', 'case'])).toThrow(/options/);
    expect(() => validateArchitectureIds([option('weekly'), option('weekly')], ['weekly', 'case'])).toThrow(/options/);
    expect(() => validateArchitectureIds([option('weekly'), option('project')], ['weekly', 'case'])).toThrow(/options/);
  });
});

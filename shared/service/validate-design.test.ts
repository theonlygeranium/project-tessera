import { describe, expect, it } from 'vitest';
import type { DesignSource, StructureOption } from '../domain';
import { validateArchitectureIds, validateNoLearningStyles, validateSpans } from './validate-design';

const file: DesignSource = { kind: 'syllabus', fileId: 'f-1', version: 1, name: 'Syllabus', sections: [{ page: 2, heading: '', level: 0, text: '', lines: [] }, { page: 4, heading: '', level: 0, text: '', lines: [] }], chars: 0, ocr: false };
const paste: DesignSource = { ...file, fileId: null, version: null, sections: [{ page: null, heading: '', level: 0, text: '', lines: [] }] };
const option = (id: StructureOption['id']) => ({ id }) as StructureOption;

describe('design output validators', () => {
  it('checks every page against the source range or null for a paste', () => {
    expect(() => validateSpans([{ page: 2, text: 'one' }, { page: 3, text: 'two' }, { page: 4, text: 'three' }], file)).not.toThrow();
    expect(() => validateSpans([{ page: null, text: 'paste' }], paste)).not.toThrow();
    expect(() => validateSpans([{ page: 1, text: '' }], file)).toThrow(/spans\[0\]\.page/);
    expect(() => validateSpans([{ page: 5, text: '' }], file)).toThrow(/spans\[0\]\.page/);
    expect(() => validateSpans([{ page: null, text: '' }], file)).toThrow(/spans\[0\]\.page/);
    expect(() => validateSpans([{ page: 1, text: '' }], paste)).toThrow(/spans\[0\]\.page/);
  });
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

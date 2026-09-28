import { describe, expect, it } from 'vitest';
import { OPERATIONS } from './operations';
import { DesignSourceSchema, SourceSpanSchema } from './domain';

const create = { courseId: 'c-stat110', sourceKind: 'syllabus', text: 'A fictional syllabus', consent: { syllabusOnly: true, rememberProfile: false } };

describe('design operation input contracts', () => {
  it('preserves source passage and line spacing', () => {
    expect(SourceSpanSchema.parse({ page: 1, text: '  Week 1  ' }).text).toBe('  Week 1  ');
    expect(DesignSourceSchema.parse({ kind: 'syllabus', fileId: null, version: null, name: 'Demo', sections: [{ page: null, heading: '', level: 0, text: '  row  ', lines: ['  first | second  '] }], chars: 7, ocr: false }).sections[0].lines[0]).toBe('  first | second  ');
  });
  it('requires true consent and exactly one source', () => {
    const schema = OPERATIONS.createDesignSession.input;
    expect(schema.safeParse(create).success).toBe(true);
    expect(schema.safeParse({ ...create, text: undefined, fileId: 'f-1' }).success).toBe(true);
    expect(schema.safeParse({ ...create, consent: { ...create.consent, syllabusOnly: false } }).success).toBe(false);
    expect(schema.safeParse({ ...create, text: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...create, fileId: 'f-1' }).success).toBe(false);
    expect(schema.safeParse({ ...create, text: '   ' }).success).toBe(false);
  });
  it('checks the rationale after trimming', () => {
    const schema = OPERATIONS.selectApproach.input;
    const input = { sessionId: 'ds-1', optionIds: ['weekly'], overlays: [], rationale: 'For this cohort' };
    expect(schema.safeParse(input).success).toBe(true);
    expect(schema.safeParse({ ...input, rationale: '  short  ' }).success).toBe(false);
    expect(schema.safeParse({ ...input, optionIds: ['weekly', 'weekly'] }).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { defaultGradebookSetup } from './defaults';
import { checkSetup } from './setup-check';
import { draftSetupFromSyllabusAssessments } from './syllabus-prefill';

describe('syllabus setup draft', () => {
  it('keeps stated weights, provenance, and page even when weights do not total 100', () => {
    const draft = draftSetupFromSyllabusAssessments('stat110-04', [
      { name: 'Homework', weightPercent: 15, page: 4 },
      { name: 'Quizzes', weightPercent: 20 },
    ], 'design-1');
    expect(draft.categories.map(c => c.weight)).toEqual([15, 20]);
    expect(draft.source).toEqual({ kind: 'syllabus', designSessionId: 'design-1' });
    expect(draft.pageHint).toBe(4);
    const setup = defaultGradebookSetup('stat110-04', draft);
    expect(checkSetup(setup, [], '2026-02-01T00:00:00.000Z').some(c => c.code === 'weights-not-100' && c.severity === 'fix')).toBe(true);
  });
});

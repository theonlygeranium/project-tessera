import { expect, it } from 'vitest';
import { fixHref } from './fixHref';

it('sends a block fix to its exact lesson editor block', () => {
  expect(fixHref('c-1', { label: 'Fix check', target: { kind: 'block', lessonId: 'l-2', blockId: 'b-3' } })).toBe('/teach/courses/c-1/lessons/l-2#block-b-3');
});
it('sends outcomes and assignment fixes to their editors', () => {
  expect(fixHref('c-1', { label: 'Outcomes', target: { kind: 'course', courseId: 'c-1', field: 'outcomes' } })).toBe('/teach/courses/c-1/outcomes');
  expect(fixHref('c-1', { label: 'Assignment', target: { kind: 'assignment', assignmentId: 'a-2' } })).toBe('/teach/courses/c-1/assignments/a-2');
});

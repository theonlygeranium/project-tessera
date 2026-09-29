import { describe, expect, it } from 'vitest';
import { gradeCellText } from './GradeCell';
describe('grade cell accessible text', () => {
  it('names student, item, score, and state', () => {
    expect(gradeCellText({ student: 'Priya Natarajan', item: 'HW 3', points: 10, display: { state: 'late', adjusted: 6.3, label: 'late 1 day' } })).toBe('Priya Natarajan, HW 3, 6.3 of 10, late 1 day');
    expect(gradeCellText({ student: 'Priya Natarajan', item: 'Quiz 3', points: 20, display: { state: 'excused', adjusted: null, label: 'excused' } })).toBe('Priya Natarajan, Quiz 3, EX, excused');
  });
});

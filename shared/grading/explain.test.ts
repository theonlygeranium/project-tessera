import { describe, expect, it } from 'vitest';
import { calculate } from './engine';
import { arithmeticLine, explain } from './explain';
import { goldenInput } from './golden.fixture';

describe('explanation text', () => {
  it('renders Priya’s arithmetic line and dropped, excused, keep, and empty notes', () => {
    const trace = calculate(goldenInput('u-priya'));
    const staff = explain(trace, 'staff', 'Priya Natarajan').join(' ');
    const student = explain(trace, 'student', 'Priya Natarajan').join(' ');
    expect(arithmeticLine(trace)).toBe('14.50 + 17.00 + 16.20 + 36.00 = 83.70 of 95 · 83.70 ÷ 95 = 88.1% → B+ (87.0 to 89.9)');
    expect(staff).toContain('Lowest score dropped: HW 3, 7 less 10% for 1 day late.');
    expect(staff).toContain('Quiz 3 excused.');
    expect(staff).toContain('No quiz dropped: the rule keeps at least 2 scores.');
    expect(staff).toContain('No items yet, so its 5% is shared across the other categories.');
    expect(student).toContain('Lowest score dropped: HW 3, 7 less 10% for 1 day late.');
    expect(student).not.toContain('D-041');
  });
  it('does not expose a held score in a student trace and distinguishes override audience', () => {
    const input = goldenInput('u-priya');
    const student = calculate(input);
    expect(student.categories.flatMap(c => c.items).find(i => i.assignmentId === 'draft')!.raw).toBeNull();
    expect(explain(student, 'student', 'Priya Natarajan').join(' ')).toContain("Draft is held, so it isn't counted until your instructor releases it.");
    input.finalOverride = { courseId: input.setup.courseId, studentId: input.studentId, percent: 90, letter: null, reason: 'Appeal approved', by: 'u-okafor', at: input.now, version: 1 };
    const overridden = calculate(input);
    expect(explain(calculate({ ...input, view: 'held' }), 'staff', 'Priya Natarajan').join(' ')).toContain('Appeal approved');
    expect(explain(overridden, 'student', 'Priya Natarajan').join(' ')).toContain('set by your instructor');
    expect(explain(overridden, 'student', 'Priya Natarajan').join(' ')).not.toContain('Appeal approved');
  });
});

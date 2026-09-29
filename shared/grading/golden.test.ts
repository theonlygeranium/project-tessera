import { describe, expect, it } from 'vitest';
import { calculate } from './engine';
import { arithmeticLine } from './explain';
import { goldenInput, goldenNames, pendingItem } from './golden.fixture';
import { solveNeeded, whatIf } from './what-if';

const expected: [string, number, string, number, string][] = [
  ['u-aguilar', 85.6, 'B', 84.9, 'B'], ['u-asante', 72.3, 'C-', 71.6, 'C-'], ['u-bello', 98.6, 'A', 97.2, 'A'],
  ['u-brooks', 79.9, 'C+', 79.2, 'C+'], ['u-ellis', 58.5, 'F', 57.1, 'F'], ['u-haddad', 91.7, 'A-', 91, 'A-'],
  ['u-marchetti', 82.9, 'B-', 81.5, 'B-'], ['u-petrova', 94.4, 'A', 93, 'A'], ['u-ramirez', 66.3, 'D', 70.2, 'C-'],
  ['u-priya', 88.1, 'B+', 86.7, 'B'], ['u-whitaker', 73.2, 'C', 71.8, 'C-'], ['u-zhao', 94.2, 'A', 93.5, 'A'],
];
describe('STAT 110 Section 04 golden fixture', () => {
  for (const [id, current, letter, held, heldLetter] of expected) it(`${goldenNames.get(id)} current and held`, () => {
    expect([calculate(goldenInput(id)).totals.rounded, calculate(goldenInput(id)).totals.letter]).toEqual([current, letter]);
    expect([calculate(goldenInput(id, 'held')).totals.rounded, calculate(goldenInput(id, 'held')).totals.letter]).toEqual([held, heldLetter]);
  });
  it('has Priya’s contributions and explanation arithmetic', () => {
    const trace = calculate(goldenInput('u-priya'));
    expect(trace.categories.map(c => c.contribution).filter(x => x !== null)).toEqual([14.5, 17, 16.2, 36]);
    expect(trace.totals.weightedPossible).toBe(95);
    expect(arithmeticLine(trace)).toBe('14.50 + 17.00 + 16.20 + 36.00 = 83.70 of 95 · 83.70 ÷ 95 = 88.1% → B+ (87.0 to 89.9)');
    expect(trace.categories.find(c => c.categoryId === 'hw')!.items.filter(i => i.state === 'dropped').map(i => i.assignmentId)).toEqual(['hw3']);
    expect(trace.categories.find(c => c.categoryId === 'quiz')!.reasons.some(r => r.code === 'drop-limited-by-keep')).toBe(true);
  });
  it('class mean of rounded current grades is 82.1', () => {
    const rounded = expected.map(([id]) => calculate(goldenInput(id)).totals.rounded!);
    expect(Math.round(rounded.reduce((a, b) => a + b, 0) / rounded.length * 10) / 10).toBe(82.1);
  });
  it('what-if and needed score use the same engine', () => {
    const input = goldenInput('u-priya');
    input.items.push(pendingItem('hw5', 'HW 5', 'hw', 10, 12), pendingItem('q4', 'Quiz 4', 'quiz', 20, 13), pendingItem('final', 'Final report', 'project', 40, 14));
    const scores = [{ assignmentId: 'hw5', score: 9 }, { assignmentId: 'q4', score: 17 }, { assignmentId: 'final', score: 36 }];
    const result = whatIf(input, scores).trace;
    expect([result.totals.rounded, result.totals.letter]).toEqual([88.4, 'B+']);
    expect(result.categories.find(c => c.categoryId === 'quiz')!.items.filter(i => i.state === 'dropped').map(i => i.assignmentId)).toEqual(['q1']);
    expect(solveNeeded(input, scores.filter(s => s.assignmentId !== 'final'), 'final', { letter: 'A-' })).toEqual({ score: 38.3, finalOverrideActive: false });
  });
  it('weight change moves every current grade and only Brooks changes letter', () => {
    let letterChanges = 0;
    for (const [id] of expected) {
      const input = goldenInput(id);
      const before = calculate(input).totals;
      input.setup = { ...input.setup, categories: input.setup.categories.map(c => ({ ...c, weight: c.id === 'mid' ? 25 : c.id === 'project' ? 35 : c.weight })) };
      const after = calculate(input).totals;
      expect(after.rounded).not.toBe(before.rounded);
      if (after.letter !== before.letter) { letterChanges++; expect(id).toBe('u-brooks'); expect([after.rounded, after.letter]).toEqual([80, 'B-']); }
    }
    expect(letterChanges).toBe(1);
  });
});

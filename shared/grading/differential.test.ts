import { describe, expect, it } from 'vitest';
import { calculate, calculateExact, calculationPath } from './engine';
import { defaultGradebookSetup } from './defaults';
import { whatIf, solveNeeded } from './what-if';
import { explain } from './explain';
import { cellDisplays, exportRow, toCourseGradeResult } from './views';
import { Rational } from './rational';
import { checkSetup } from './setup-check';
import type { CalcInput, CalcItem, SetupItem } from './types';

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}
function pick(r: () => number, n: number): number { return Math.floor(r() * n); }
function decimal(r: () => number): number { const places = 10 ** pick(r, 5); return pick(r, 250 * places + 1) / places; }
const due = '2026-01-01T00:00:00.000Z';
const late = '2026-01-03T02:30:00.000Z';
const future = '2026-03-01T00:00:00.000Z';
function generated(r: () => number, trial: number): CalcInput {
  const adversarial = trial % 20 === 0;
  const categories = Array.from({ length: 3 }, (_, k) => ({ id: `c${k}`, courseId: 'c', name: `Category ${k}`, position: k,
    weight: adversarial && k === 0 ? 33.333333 : [0, 20, 33.333333, 50, 100][pick(r, 5)],
    drop: { lowest: pick(r, 3), highest: pick(r, 2), keepAtLeast: 1 + pick(r, 2) }, lateApplies: pick(r, 4) !== 0 }));
  const items: CalcItem[] = Array.from({ length: 4 + pick(r, 5) }, (_, i) => {
    const kind = pick(r, 12), points = adversarial && i === 0 ? 1e15 : adversarial && i === 1 ? Number.MAX_SAFE_INTEGER - 2 : 1 + decimal(r);
    const score = adversarial && i === 0 ? 0.123456789 : adversarial && i === 1 ? Number.MAX_SAFE_INTEGER - 4 : decimal(r);
    const submission = kind === 0 || kind === 1 ? null : { state: (kind === 2 ? 'submitted' : kind === 3 ? 'returned' : 'graded') as 'submitted' | 'returned' | 'graded',
      score: kind === 2 ? null : score, submittedAt: kind % 3 === 0 ? late : due, released: kind !== 4 };
    const state = { excused: kind === 5 ? { reason: 'fixture', studentNote: kind % 2 ? 'note' : null, by: 'staff', at: due } : null,
      missing: kind === 6 ? 'force-missing' as const : kind === 7 ? 'force-not-missing' as const : null,
      lateWaived: kind === 8 ? { reason: 'fixture', by: 'staff', at: due } : null,
      override: kind === 9 ? { score, reason: 'fixture', by: 'staff', at: due } : null };
    return { assignmentId: `a${i}`, title: `Item ${i}`, categoryId: pick(r, 8) === 0 ? 'unknown' : pick(r, 8) === 0 ? null : `c${pick(r, 3)}`,
      points, extraCredit: kind === 10 || (kind === 0 && pick(r, 3) === 0), countsTowardGrade: pick(r, 12) !== 0,
      dueAt: kind === 0 ? future : due, extended: kind === 8, position: i, submission,
      itemState: Object.values(state).some(v => v !== null) ? state : null, hypothetical: kind === 11 ? decimal(r) : null };
  });
  const base = defaultGradebookSetup('c');
  const setup = defaultGradebookSetup('c', { categories, mode: pick(r, 2) ? 'weighted' : 'points',
    late: { ...base.late, period: pick(r, 2) ? 'day' : 'hour', basis: pick(r, 2) ? 'score' : 'possible',
      graceMinutes: pick(r, 2) ? 0.5 : 30, percentPerPeriod: decimal(r), maxPeriods: pick(r, 2) ? null : 1 + pick(r, 5),
      afterMax: pick(r, 2) ? 'missing' : 'hold-at-max' },
    missing: { treatAs: pick(r, 2) ? 'zero-after-due' : 'exclude-until-graded', droppable: !!pick(r, 2) },
    extraCredit: { categoryCapPercent: pick(r, 2) ? null : 100, courseCapPoints: pick(r, 2) ? null : 10 } });
  return { setup, studentId: `s${trial}`, items, view: pick(r, 2) ? 'student' : 'held', now: '2026-02-01T00:00:00.000Z',
    finalOverride: trial % 17 === 0 ? { courseId: 'c', studentId: `s${trial}`, letter: trial % 2 ? 'A' : null,
      percent: trial % 2 ? null : 97.25, reason: 'fixture', by: 'staff', at: due, version: 1 } : null };
}
function outcome(input: CalcInput, run: (input: CalcInput) => unknown): unknown {
  try { return { value: run(input) }; }
  catch (error) { return { error: { type: (error as Error).constructor, message: (error as Error).message } }; }
}
function setupItems(input: CalcInput): SetupItem[] {
  return input.items.map(item => ({ assignmentId: item.assignmentId, title: item.title, categoryId: item.categoryId,
    points: item.points, extraCredit: item.extraCredit, countsTowardGrade: item.countsTowardGrade,
    status: 'published', dueAt: item.dueAt, gradedCount: item.submission?.score == null ? 0 : 1 }));
}

describe('fast and exact gradebook differential', () => {
  it('preserves the original BigInt-to-double rounding at safe integer operands', () => {
    const oldConversion = (n: bigint, d: bigint): number => {
      if (n === 0n) return 0;
      const negative = n < 0n, numerator = negative ? -n : n;
      const round = (a: bigint, b: bigint): bigint => {
        const quotient = a / b, remainder = a % b;
        return quotient + (2n * remainder > b || (2n * remainder === b && quotient % 2n === 1n) ? 1n : 0n);
      };
      let exponent = numerator.toString(2).length - d.toString(2).length;
      if (exponent >= 0 ? numerator < d << BigInt(exponent) : numerator << BigInt(-exponent) < d) exponent--;
      const shift = exponent < -1022 ? 1074 : 52 - exponent;
      const significand = shift >= 0 ? round(numerator << BigInt(shift), d) : round(numerator, d << BigInt(-shift));
      const value = exponent < -1022 ? Number(significand) * Number.MIN_VALUE : Number(significand) * 2 ** (exponent - 52);
      return negative ? -value : value;
    };
    const r = random(0x5234abcd);
    for (let i = 0; i < 20000; i++) {
      const numerator = BigInt(Math.floor(r() * Number.MAX_SAFE_INTEGER)) * (i % 2 ? -1n : 1n);
      const denominator = BigInt(1 + Math.floor(r() * Number.MAX_SAFE_INTEGER));
      const value = new Rational(numerator, denominator);
      expect(Object.is(value.toNumber(), oldConversion(value.n, value.d)), `fraction ${i}`).toBe(true);
    }
  });
  it('matches every trace and derived view in 5,000 seeded cases', () => {
    const r = random(0x5eed2026);
    let fast = 0, fallback = 0;
    const derived = { fast: 0, exact: 0 }, whatIfPaths = { fast: 0, exact: 0 }, solvePaths = { fast: 0, exact: 0 };
    for (let trial = 0; trial < 5000; trial++) {
      const input = generated(r, trial);
      const path = calculationPath(input);
      if (path === 'fast') fast++; else fallback++;
      if (trial % 20 === 0) expect(path).toBe('exact');
      const actual = calculate(input), reference = calculateExact(input);
      expect(actual, `trial ${trial}`).toEqual(reference);
      if (trial % 100 === 0 || trial % 100 === 1) {
        derived[path]++;
        expect(explain(actual, 'student', 'Learner')).toEqual(explain(reference, 'student', 'Learner'));
        expect(cellDisplays(actual)).toEqual(cellDisplays(reference));
        expect(exportRow(actual, input.items)).toEqual(exportRow(reference, input.items));
        expect(toCourseGradeResult(actual)).toEqual(toCourseGradeResult(reference));
        const checks = checkSetup(input.setup, setupItems(input), input.now);
        expect(checks).toEqual(checkSetup(input.setup, [...setupItems(input)].reverse(), input.now));
      }
      if (trial < 60) {
        const target: CalcItem = { assignmentId: 'target', title: 'Target', categoryId: 'c0', points: 10, extraCredit: false,
          countsTowardGrade: true, dueAt: future, position: 100, submission: null, itemState: null, hypothetical: null };
        const withTarget = { ...input, items: [...input.items, target] };
        whatIfPaths[calculationPath(withTarget)]++;
        expect(whatIf(withTarget, [{ assignmentId: 'target', score: trial / 10 }])).toEqual(whatIf(withTarget, [{ assignmentId: 'target', score: trial / 10 }], { arithmetic: 'exact' }));
        if (trial < 12 || trial === 20) {
          solvePaths[calculationPath(withTarget)]++;
          expect(solveNeeded(withTarget, [], 'target', { percent: 75 })).toEqual(solveNeeded(withTarget, [], 'target', { percent: 75 }, { arithmetic: 'exact' }));
        }
      }
    }
    expect(fast).toBeGreaterThan(3000);
    expect(fallback).toBeGreaterThan(200);
    for (const counts of [derived, whatIfPaths, solvePaths]) {
      expect(counts.fast).toBeGreaterThan(0);
      expect(counts.exact).toBeGreaterThan(0);
    }
  }, 30000);
  it('preserves committed ordering when dueAt is omitted', () => {
    const input = generated(random(71), 1);
    input.setup.categories = [{ id: 'c0', courseId: 'c', name: 'Category', position: 0, weight: 100,
      drop: { lowest: 0, highest: 0, keepAtLeast: 1 }, lateApplies: true }];
    input.view = 'held'; input.finalOverride = null;
    input.items = ['a', 'b'].map((assignmentId, position) => ({ assignmentId, title: assignmentId, categoryId: 'c0',
      points: 10, extraCredit: false, countsTowardGrade: true, dueAt: due, position,
      submission: { state: 'graded', score: 8, submittedAt: due, released: true }, itemState: null, hypothetical: null }));
    delete (input.items[1] as Partial<CalcItem>).dueAt;
    expect(calculationPath(input)).toBe('exact');
    const trace = calculate(input);
    expect(trace).toEqual(calculateExact(input));
    expect(trace.categories[0].items.map(item => item.assignmentId)).toEqual(['a', 'b']);
    expect(trace.steps.filter(step => step.code === 'base-score').map(step => step.target.assignmentId)).toEqual(['a', 'b']);
    expect(explain(trace, 'student', 'Learner').slice(0, 2)).toEqual(['a: 8 of 10 recorded.', 'b: 8 of 10 recorded.']);
    expect(cellDisplays(trace)).toEqual([
      { assignmentId: 'a', state: 'graded', adjusted: 8, label: '' },
      { assignmentId: 'b', state: 'graded', adjusted: 8, label: '' },
    ]);
    expect(exportRow(trace, input.items)).toEqual([8, 8, 80, 80, 'B-', input.setup.rulesVersion]);
  });
  it('matches exact outcomes for malformed JSON-shaped inputs', () => {
    const base = generated(random(91), 1);
    const cases: [string, (input: CalcInput) => void][] = [
      ['omitted dueAt', input => { delete (input.items[0] as Partial<CalcItem>).dueAt; }],
      ['null dueAt', input => { input.items[0].dueAt = null; }],
      ['undefined dueAt', input => { input.items[0].dueAt = undefined as unknown as string; }],
      ['empty dueAt', input => { input.items[0].dueAt = ''; }],
      ['invalid dueAt', input => { input.items[0].dueAt = '2026-02-30T00:00:00Z'; }],
      ['omitted position', input => { delete (input.items[0] as Partial<CalcItem>).position; }],
      ['null position', input => { input.items[0].position = null as unknown as number; }],
      ['undefined position', input => { input.items[0].position = undefined as unknown as number; }],
      ['omitted categoryId', input => { delete (input.items[0] as Partial<CalcItem>).categoryId; }],
      ['null categoryId', input => { input.items[0].categoryId = null; }],
      ['undefined categoryId', input => { input.items[0].categoryId = undefined as unknown as string; }],
      ['omitted submission', input => { delete (input.items[0] as Partial<CalcItem>).submission; }],
      ['null submission', input => { input.items[0].submission = null; }],
      ['undefined submission', input => { input.items[0].submission = undefined as unknown as null; }],
      ['omitted itemState', input => { delete (input.items[0] as Partial<CalcItem>).itemState; }],
      ['null itemState', input => { input.items[0].itemState = null; }],
      ['undefined itemState', input => { input.items[0].itemState = undefined as unknown as null; }],
      ['missing itemState field', input => { input.items[0].itemState = { missing: null } as CalcItem['itemState']; }],
      ['invalid submittedAt', input => { input.items[0].submission = { state: 'graded', score: 8, submittedAt: 'bad', released: true }; }],
    ];
    for (const [name, change] of cases) {
      const input = structuredClone(base);
      change(input);
      expect(outcome(input, calculate), name).toEqual(outcome(input, calculateExact));
    }
  });
  it('preserves error classes and messages', () => {
    const input = generated(random(91), 1);
    const cases: CalcInput[] = [
      { ...input, now: 'bad-time' },
      { ...input, items: [...input.items, input.items[0]] },
      { ...input, items: input.items.map((item, index) => index ? item : { ...item, points: -1 }) },
    ];
    for (const value of cases) {
      let fastError: unknown, exactError: unknown;
      try { calculate(value); } catch (error) { fastError = error; }
      try { calculate(value, { arithmetic: 'exact' }); } catch (error) { exactError = error; }
      expect(fastError).toBeInstanceOf(Error);
      expect((fastError as Error).constructor).toBe((exactError as Error).constructor);
      expect((fastError as Error).message).toBe((exactError as Error).message);
    }
  });
});

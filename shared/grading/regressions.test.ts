// Adversarial regressions. Each test names the rule it protects.
import { describe, expect, it } from 'vitest';
import { calculate } from './engine';
import { DEFAULT_SCHEME, defaultGradebookSetup } from './defaults';
import { whatIf, solveNeeded } from './what-if';
import { checkSetup } from './setup-check';
import { exportCsv } from './views';
import { arithmeticLine, explain } from './explain';
import type { CalcInput, CalcItem, GradeCategory } from './types';

const due = '2026-01-01T00:00:00.000Z';
const now = '2026-02-01T00:00:00.000Z';
const cat = (id: string, weight: number, lowest = 0, highest = 0, keep = 1, position = 0): GradeCategory => ({ id, courseId: 'c', name: id, position, weight, drop: { lowest, highest, keepAtLeast: keep }, lateApplies: true });
const item = (id: string, categoryId: string | null, score: number | null, points: number, extra: Partial<CalcItem> = {}): CalcItem => ({ assignmentId: id, title: id, categoryId, points, extraCredit: false, countsTowardGrade: true, dueAt: due, position: 0, submission: score === null ? null : { state: 'graded', score, submittedAt: due, released: true }, itemState: null, hypothetical: null, ...extra });
const input = (categories: GradeCategory[], items: CalcItem[], mode: 'weighted' | 'points' = 'weighted', view: 'student' | 'held' = 'student'): CalcInput => ({ setup: defaultGradebookSetup('c', { categories, mode }), studentId: 's', items, view, now, finalOverride: null });

function rng(seed: number) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }

describe('gradebook regressions', () => {
  it('unknown-category items remain visible in the trace', () => {
    const x = input([cat('a', 100)], [item('i1', 'a', 5, 10), item('i2', 'ghost', 10, 10)]);
    let threw = false; let t;
    try { t = calculate(x); } catch { threw = true; }
    if (!threw) expect(t!.categories.flatMap(c => c.items).some(i => i.assignmentId === 'i2')).toBe(true);
  });
  it('duplicate assignment ids are rejected', () => {
    expect(() => calculate(input([cat('a', 100)], [item('i1', 'a', 5, 10), item('i1', 'a', 10, 10)]))).toThrow();
  });
  it('adding extra credit with highest drops cannot lower the points grade', () => {
    const cats = [cat('c0', 40, 0, 1, 1, 0), cat('c1', 60, 0, 0, 1, 1)];
    const items = [item('a1', 'c0', 1.4, 2), item('a2', 'c0', 8.4, 18), item('a3', 'c0', null, 6), item('a4', 'c1', 16.9, 12)];
    const before = calculate(input(cats, items, 'points'));
    const after = calculate(input(cats, [...items, item('a5', 'c0', 5.5, 5, { extraCredit: true })], 'points'));
    expect(after.totals.computed.percent!).toBeGreaterThanOrEqual(before.totals.computed.percent!);
  });
  it('raising a score with lowest drops cannot lower the points grade', () => {
    const r = rng(7); let bad = 0;
    for (let n = 0; n < 1500; n++) {
      const cats = [cat('c0', 50, 1 + Math.floor(r() * 2), 0, 1, 0), cat('c1', 50, Math.floor(r() * 2), 0, 1, 1)];
      const items = Array.from({ length: 3 + Math.floor(r() * 6) }, (_, i) => { const p = 1 + Math.floor(r() * 30); return item(`i${i}`, `c${Math.floor(r() * 2)}`, Math.floor(r() * p * 10) / 10, p, { position: i }); });
      const k = Math.floor(r() * items.length);
      const raised = items.map((it, i) => i === k ? { ...it, submission: { ...it.submission!, score: it.submission!.score! + 0.1 + Math.floor(r() * 50) / 10 } } : it);
      const a = calculate(input(cats, items, 'points')).totals.computed.percent!;
      const b = calculate(input(cats, raised, 'points')).totals.computed.percent!;
      if (b < a - 1e-12) bad++;
    }
    expect(bad).toBe(0);
  });
  it('student traces omit staff-only override reasons', () => {
    const x = input([cat('a', 100)], [item('i1', 'a', 5, 10, { itemState: { excused: null, missing: null, lateWaived: null, override: { score: 8, reason: 'SECRET-OVERRIDE accommodation', by: 'u', at: due } } }), item('i2', 'a', 5, 10, { itemState: { excused: { reason: 'SECRET-EXCUSE medical', studentNote: null, by: 'u', at: due }, missing: null, lateWaived: null, override: null } }), item('i3', 'a', 5, 10, { submission: { state: 'graded', score: 5, submittedAt: '2026-01-02T12:00:00.000Z', released: true }, itemState: { excused: null, missing: null, lateWaived: { reason: 'SECRET-WAIVE', by: 'u', at: due }, override: null } })]);
    x.finalOverride = { courseId: 'c', studentId: 's', letter: 'B', percent: null, reason: 'SECRET-FINAL appeal', by: 'u', at: due, version: 1 };
    expect(JSON.stringify(calculate(x))).not.toMatch(/SECRET/);
  });
  it('student traces hide held raw scores', () => {
    const x = input([cat('a', 100)], [item('i1', 'a', 5, 10), item('i2', 'a', 7.77, 10, { submission: { state: 'graded', score: 7.77, submittedAt: due, released: false } })]);
    expect(JSON.stringify(calculate(x))).not.toMatch(/7\.77/);
  });
  it('timestamps require an explicit timezone offset', () => {
    const x = input([cat('a', 100)], [item('i1', 'a', 5, 10, { dueAt: '2026-01-01T00:00:00' })]);
    expect(() => calculate(x)).toThrow();
  });
  it('final override letters use the rounded percent', () => {
    const x = input([cat('a', 100)], [item('i1', 'a', 5, 10)]);
    x.finalOverride = { courseId: 'c', studentId: 's', letter: null, percent: 89.95, reason: 'r', by: 'u', at: due, version: 1 };
    const t = calculate(x); expect([t.totals.rounded, t.totals.letter]).toEqual([90, 'A-']);
  });
  it('solver uses computed values when a final override is active', () => {
    const x = input([cat('a', 100)], [item('i1', 'a', 5, 10), item('t', 'a', null, 10, { dueAt: '2026-03-01T00:00:00.000Z' })]);
    x.finalOverride = { courseId: 'c', studentId: 's', letter: 'F', percent: 10, reason: 'r', by: 'u', at: due, version: 1 };
    expect(solveNeeded(x, [], 't', { percent: 70 })).toEqual({ score: 9, finalOverrideActive: true });
  });
  it('unknown categories require a setup fix', () => {
    const s = defaultGradebookSetup('c', { categories: [cat('a', 100)] });
    const checks = checkSetup(s, [{ assignmentId: 'i', title: 'i', categoryId: 'ghost', points: 10, extraCredit: false, countsTowardGrade: true, status: 'published', dueAt: due, gradedCount: 1 }], now);
    expect(checks.some(c => c.severity === 'fix' && c.target === 'i')).toBe(true);
  });
  it('CSV text cells that begin with formulas are neutralised', () => {
    const t = calculate(input([cat('a', 100)], [item('i1', 'a', 5, 10)]));
    const csv = exportCsv([t], { items: [{ assignmentId: 'i1', title: '=HYPERLINK("x")' }], categories: [{ categoryId: 'a', name: 'a' }], students: [{ studentId: 's', name: '@SUM(1)', email: 'x@y.z' }] });
    expect(csv).not.toMatch(/(^|,)"?[=@]/m);
  });
  it('explanations trim long floating point tails', () => {
    const t = calculate(input([cat('a', 100)], [item('i1', 'a', 2, 3), item('i2', 'a', 1, 3)]));
    for (const line of explain(t, 'student', 'Priya Natarajan')) expect(line).not.toMatch(/\d\.\d{3,}/);
  });
  it('hourly late periods use hour labels', () => {
    const x = input([cat('a', 100)], [item('i1', 'a', 8, 10, { submission: { state: 'graded', score: 8, submittedAt: '2026-01-01T02:30:00.000Z', released: true } })]);
    x.setup.late.period = 'hour';
    const lines = explain(calculate(x), 'student', 'P').join(' ');
    expect(lines).not.toMatch(/day/);
    expect(lines).toMatch(/hour/);
  });
  it('300 students x 60 items with mixed drops completes within a generous timing bound', () => {
    const r = rng(99);
    const cats = [cat('c0', 20, 2, 0, 2, 0), cat('c1', 20, 1, 1, 2, 1), cat('c2', 20, 2, 0, 1, 2), cat('c3', 20, 0, 0, 1, 3), cat('c4', 20, 1, 0, 1, 4)];
    const start = performance.now();
    for (let s = 0; s < 300; s++) {
      const items = Array.from({ length: 60 }, (_, i) => { const p = 5 + Math.floor(r() * 20); return item(`i${i}`, `c${i % 5}`, Math.floor(r() * p * 10) / 10, p, { position: i }); });
      calculate(input(cats, items));
    }
    const ms = performance.now() - start; console.log('perf ms', ms.toFixed(0));
    expect(ms).toBeLessThanOrEqual(20000);
  }, 25000);
});

describe('round 2 regressions', () => {
  it.each(['weighted', 'points'] as const)('limited drop budget preserves lowest before highest in %s mode', mode => {
    const x = input([cat('a', 100, 1, 1, 2)], [item('low', 'a', 1, 10), item('middle', 'a', 5, 10), item('high', 'a', 9, 10)], mode);
    const trace = calculate(x);
    expect(trace.totals.rounded).toBe(70);
    expect(trace.categories[0].items.filter(i => i.state === 'dropped').map(i => i.assignmentId)).toEqual(['low']);
    expect(trace.categories[0].reasons).toContainEqual({ code: 'drop-limited-by-keep', params: { requested: 2, applied: 1, keep: 2 } });
  });
  it('default setups and supplied option objects have independent nested values', () => {
    const opts = { categories: [cat('a', 100)], studentNotes: [{ categoryId: 'a', text: 'note' }] };
    const a = defaultGradebookSetup('a', opts);
    const b = defaultGradebookSetup('b', opts);
    a.scheme.bands[0].min = 95;
    a.categories[0].drop.lowest = 2;
    a.studentNotes[0].text = 'changed';
    a.late.graceMinutes = 3;
    expect(b.scheme.bands[0].min).toBe(93);
    expect(defaultGradebookSetup('c').scheme.bands[0].min).toBe(93);
    expect(b.categories[0].drop.lowest).toBe(0);
    expect(b.studentNotes[0].text).toBe('note');
    expect(b.late.graceMinutes).toBe(0);
    expect(DEFAULT_SCHEME.bands[0].min).toBe(93);
    expect(a.scheme.rounding).not.toBe(b.scheme.rounding);
    expect(a.missing).not.toBe(b.missing);
    expect(a.extraCredit).not.toBe(b.extraCredit);
    expect(a.dismissedChecks).not.toBe(b.dismissedChecks);
    expect(a.source).not.toBe(b.source);
  });
  it('fractional grace compares exact elapsed milliseconds for late submissions and missing work', () => {
    const x = input([cat('a', 100)], [item('graded', 'a', 10, 10, { submission: { state: 'graded', score: 10, submittedAt: '2026-01-01T00:30:00.001Z', released: true } })]);
    x.setup.late.graceMinutes = 30.000016666;
    expect(calculate(x).totals.rounded).toBe(90);
    x.items = [item('pending', 'a', null, 10)];
    x.now = '2026-01-01T00:30:00.001Z';
    expect(calculate(x).categories[0].items[0].state).toBe('missing');
  });
  it('solver terminates on huge points and returns the minimal sufficient tenth', () => {
    const x = input([cat('a', 100)], [item('target', 'a', null, 1e16, { dueAt: '2026-03-01T00:00:00Z' })], 'points');
    const result = solveNeeded(x, [], 'target', { percent: 90 });
    expect(result).toEqual({ score: 8995000000000000, finalOverrideActive: false });
    if ('score' in result) {
      expect(whatIf(x, [{ assignmentId: 'target', score: result.score }]).trace.totals.rounded).toBeGreaterThanOrEqual(90);
      expect(whatIf(x, [{ assignmentId: 'target', score: result.score - 1 }]).trace.totals.rounded).toBeLessThan(90);
    }
  });
  it('solver score is minimal to one tenth when adjacent tenths are representable', () => {
    const x = input([cat('a', 100)], [item('target', 'a', null, 1e14, { dueAt: '2026-03-01T00:00:00Z' })], 'points');
    const result = solveNeeded(x, [], 'target', { percent: 90 });
    expect(result).toEqual({ score: 89950000000000, finalOverrideActive: false });
    if ('score' in result) {
      expect(whatIf(x, [{ assignmentId: 'target', score: result.score }]).trace.totals.rounded).toBe(90);
      expect(whatIf(x, [{ assignmentId: 'target', score: result.score - 0.1 }]).trace.totals.rounded).toBeLessThan(90);
    }
  });
  it('positive drops with zero planned items require a setup fix', () => {
    const x = input([cat('a', 100, 1, 0, 1)], []);
    expect(checkSetup(x.setup, [], now)).toContainEqual(expect.objectContaining({ code: 'drop-exceeds-items', severity: 'fix', target: 'a' }));
    x.setup.categories[0].drop.lowest = 0;
    expect(checkSetup(x.setup, [], now)).toContainEqual(expect.objectContaining({ code: 'drop-exceeds-items', severity: 'pass', target: 'a' }));
  });
  it.each(['2026-02-30T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T00:60:00Z', '2026-01-01T00:00:00+15:00', '2026-01-01T00:00:00+14:01'])('rejects impossible timestamp %s in engine and setup check', invalid => {
    const x = input([cat('a', 100)], [item('a', 'a', 8, 10, { dueAt: invalid })]);
    expect(() => calculate(x)).toThrow(RangeError);
    expect(() => checkSetup(x.setup, [], invalid)).toThrow(RangeError);
    expect(() => checkSetup(x.setup, [{ assignmentId: 'a', title: 'a', categoryId: 'a', points: 10, extraCredit: false, countsTowardGrade: true, status: 'published', dueAt: invalid, gradedCount: 0 }], now)).toThrow(RangeError);
  });
  it('override arithmetic states computed result before the instructor-set final', () => {
    const x = input([cat('a', 100)], [item('a', 'a', 8, 10)]);
    x.finalOverride = { courseId: 'c', studentId: 's', percent: 90, letter: null, reason: 'appeal', by: 'staff', at: now, version: 1 };
    const trace = calculate(x);
    expect(arithmeticLine(trace, 'student')).toContain('80.00 ÷ 100 = 80.0% → B- · final grade set by your instructor: 90.0% → A-');
    expect(arithmeticLine(trace, 'staff')).toContain('80.00 ÷ 100 = 80.0% → B- · final grade override: 90.0% → A-');
    x.setup.mode = 'points';
    expect(arithmeticLine(calculate(x), 'staff')).toBe('8.00 ÷ 10.00 = 80.0% → B- · final grade override: 90.0% → A-');
  });
  it('solver marks active final overrides for reachable and unreachable targets', () => {
    const x = input([cat('a', 100)], [item('done', 'a', 5, 10), item('target', 'a', null, 10, { dueAt: '2026-03-01T00:00:00Z' })]);
    x.finalOverride = { courseId: 'c', studentId: 's', percent: 100, letter: null, reason: 'appeal', by: 'staff', at: now, version: 1 };
    expect(solveNeeded(x, [], 'target', { percent: 70 })).toEqual({ score: 9, finalOverrideActive: true });
    expect(solveNeeded(x, [], 'target', { percent: 100 })).toEqual({ unreachable: true, finalOverrideActive: true });
  });
  it('keepAtLeast below one is rejected by the engine', () => {
    const x = input([cat('a', 100, 1, 0, 0)], [item('a', 'a', 8, 10)]);
    expect(() => calculate(x)).toThrow(RangeError);
  });
});

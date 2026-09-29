import { describe, expect, it } from 'vitest';
import { calculate } from './engine';
import { defaultGradebookSetup } from './defaults';
import type { CalcInput, CalcItem, TraceCode } from './types';
import { R } from './rational';
import { whatIf } from './what-if';
import { exportCsv } from './views';

const due = '2026-01-01T00:00:00.000Z';
const now = '2026-01-10T00:00:00.000Z';
function item(id: string, score: number | null, points = 10, extraCredit = false): CalcItem {
  return { assignmentId: id, title: id, categoryId: 'c', points, extraCredit, countsTowardGrade: true, dueAt: due, position: 0, submission: score === null ? null : { state: 'graded', score, submittedAt: due, released: true }, itemState: null, hypothetical: null };
}
function input(items: CalcItem[]): CalcInput {
  return { setup: defaultGradebookSetup('course', { categories: [{ id: 'c', courseId: 'course', name: 'Category', position: 0, weight: 100, drop: { lowest: 0, highest: 0, keepAtLeast: 1 }, lateApplies: true }] }), studentId: 'student', items, view: 'student', now, finalOverride: null };
}
function reasons(inputValue: CalcInput): TraceCode[] { return calculate(inputValue).steps.map(s => s.code); }
describe('engine rules', () => {
  it('visibility and held override follow release', () => {
    const a = item('a', 8); a.submission!.released = false; a.itemState = { excused: null, missing: null, lateWaived: null, override: { score: 9, reason: 'correction', by: 'staff', at: now } };
    const x = input([a]); const student = calculate(x); expect(student.categories[0].items[0]).toMatchObject({ state: 'held', counted: false, raw: null }); expect(reasons(x)).toContain('held');
    x.view = 'held'; expect(calculate(x).categories[0].items[0]).toMatchObject({ state: 'override', adjusted: 9, counted: true });
    a.submission = null; x.view = 'student'; expect(calculate(x).totals.rounded).toBe(90);
  });
  it('excused beats override, force missing, and score', () => {
    const a = item('a', 8); a.itemState = { excused: { reason: 'private', studentNote: null, by: 'staff', at: now }, missing: 'force-missing', lateWaived: null, override: { score: 9, reason: 'correction', by: 'staff', at: now } };
    const x = input([a]); expect(calculate(x).categories[0].items[0].reasons.map(r => r.code)).toEqual(['excused']);
    expect(calculate(x).totals.percent).toBeNull();
  });
  it('override beats force missing', () => {
    const a = item('a', 5); a.itemState = { excused: null, missing: 'force-missing', lateWaived: null, override: { score: 9, reason: 'correction', by: 'staff', at: now } };
    expect(calculate(input([a])).categories[0].items[0]).toMatchObject({ state: 'override', adjusted: 9 });
  });
  it('late penalty happens before drop and the zero floor binds', () => {
    const a = item('a', 8), b = item('b', 7); a.submission!.submittedAt = '2026-01-02T00:00:00.000Z';
    const x = input([a, b]); x.setup.categories[0].drop.lowest = 1;
    const t = calculate(x); expect(t.categories[0].items.find(i => i.assignmentId === 'b')!.state).toBe('dropped');
    expect(t.categories[0].items.find(i => i.assignmentId === 'a')!.adjusted).toBe(7.2);
    x.setup.late.basis = 'possible'; x.setup.late.percentPerPeriod = 100;
    expect(calculate(x).categories[0].items.find(i => i.assignmentId === 'a')!.adjusted).toBe(0);
  });
  it('grace threshold and extension', () => {
    const a = item('a', 10); a.submission!.submittedAt = '2026-01-01T00:30:00.000Z';
    const x = input([a]); x.setup.late.graceMinutes = 30;
    expect(reasons(x)).not.toContain('late-penalty');
    a.submission!.submittedAt = '2026-01-01T00:30:00.001Z'; a.extended = true;
    expect(reasons(x)).toEqual(expect.arrayContaining(['extension', 'late-penalty']));
    a.itemState = { excused: null, missing: null, override: null, lateWaived: { reason: 'waiver', by: 'staff', at: now } };
    expect(reasons(x)).toContain('late-waived');
  });
  it('afterMax holds or makes missing', () => {
    const a = item('a', 10); a.submission!.submittedAt = '2026-01-05T00:00:00.000Z';
    const x = input([a]); x.setup.late.maxPeriods = 3;
    expect(calculate(x).categories[0].items[0]).toMatchObject({ state: 'late', adjusted: 7 });
    expect(reasons(x)).toContain('late-over-max');
    x.setup.late.afterMax = 'missing'; expect(calculate(x).categories[0].items[0]).toMatchObject({ state: 'missing', adjusted: 0 });
    expect(reasons(x)).toContain('missing-zero');
  });
  it('missing zeros are not dropped unless policy allows; keep floor limits', () => {
    const x = input([item('a', null), item('b', 9), item('c', 9), item('d', 9)]); x.setup.categories[0].drop.lowest = 1; x.setup.categories[0].drop.keepAtLeast = 2;
    const t = calculate(x); expect(t.categories[0].items.find(i => i.assignmentId === 'a')!.state).toBe('missing');
    expect(reasons(x)).toContain('missing-not-droppable'); expect(t.categories[0].items.find(i => i.assignmentId === 'b')!.state).toBe('graded');
    expect(reasons(x)).toContain('drop-not-beneficial');
    x.setup.missing.droppable = true; expect(calculate(x).categories[0].items.find(i => i.assignmentId === 'a')!.state).toBe('dropped');
    x.setup.categories[0].drop.lowest = 3; expect(reasons(x)).toContain('drop-limited-by-keep');
  });
  it('drop-not-beneficial and highest rules', () => {
    const x = input([item('a', 20), item('b', 19), item('c', null)]); x.setup.categories[0].drop.lowest = 1;
    expect(reasons(x)).toContain('drop-not-beneficial');
    x.setup.categories[0].drop.lowest = 0; x.setup.categories[0].drop.highest = 1;
    expect(calculate(x).categories[0].items.find(i => i.assignmentId === 'a')!.state).toBe('dropped');
  });
  it('pending states and countsTowardGrade false', () => {
    const a = item('a', null), b = item('b', null), c = item('c', null), d = item('d', 8);
    a.dueAt = '2026-02-01T00:00:00.000Z'; b.dueAt = null; c.submission = { state: 'submitted', score: null, released: false, submittedAt: due }; d.countsTowardGrade = false;
    const x = input([a, b, c, d]);
    expect(new Map(calculate(x).categories[0].items.map(i => [i.assignmentId, i.state]))).toEqual(new Map([['a', 'not-due'], ['b', 'not-submitted'], ['c', 'to-grade'], ['d', 'graded']]));
    expect(calculate(x).categories[0].items.find(i => i.assignmentId === 'd')!.counted).toBe(false); expect(reasons(x)).toContain('not-counted');
  });
  it('force-not-missing and exclude-until-graded leave pending items out', () => {
    const a = item('a', null); a.itemState = { excused: null, missing: 'force-not-missing', lateWaived: null, override: null };
    const x = input([a]); expect(calculate(x).categories[0].items[0].counted).toBe(false);
    a.itemState = null; x.setup.missing.treatAs = 'exclude-until-graded';
    expect(calculate(x).categories[0].items[0].counted).toBe(false);
  });
  it('unsubmitted extra credit never becomes missing', () => {
    const x = input([item('a', 8), item('ec', null, 5, true)]);
    expect(calculate(x).categories[0].items.find(i => i.assignmentId === 'ec')).toMatchObject({ state: 'not-submitted', counted: false });
    x.items[1].itemState = { excused: null, missing: 'force-missing', lateWaived: null, override: null };
    expect(calculate(x).categories[0].items.find(i => i.assignmentId === 'ec')).toMatchObject({ state: 'not-submitted', counted: false });
  });
  it('hypothetical replaces missing, held and pending but not a counted grade', () => {
    const x = input([item('a', null)]); x.items[0].hypothetical = 8;
    expect(calculate(x).categories[0].items[0]).toMatchObject({ state: 'what-if', adjusted: 8, counted: true });
    expect(reasons(x)).toContain('what-if');
    x.items[0].submission = { state: 'graded', score: 5, submittedAt: due, released: true };
    expect(calculate(x).categories[0].items[0]).toMatchObject({ state: 'graded', adjusted: 5 });
  });
  it('extra credit category and course caps', () => {
    const x = input([item('a', 10), item('ec', 5, 5, true)]);
    expect(calculate(x).totals.rounded).toBe(100); expect(reasons(x)).toContain('extra-credit-capped');
    x.items[1].categoryId = null; x.setup.extraCredit.courseCapPoints = 2;
    expect(calculate(x).totals.percent).toBe(102); expect(reasons(x)).toContain('extra-credit-capped');
    x.setup.mode = 'points'; expect(calculate(x).totals.percent).toBe(120);
  });
  it('empty category shares weight and weights normalize', () => {
    const x = input([item('a', 8)]); x.setup.categories[0].weight = 20;
    x.setup.categories.push({ ...x.setup.categories[0], id: 'empty', name: 'Empty', position: 1, weight: 80 });
    expect(calculate(x).totals.rounded).toBe(80); expect(reasons(x)).toContain('category-empty-shared');
    x.setup.categories[0].weight = 15; expect(calculate(x).totals.rounded).toBe(80);
  });
  it('points mode includes uncategorized non-EC items', () => {
    const a = item('a', 8), b = item('b', 9); b.categoryId = null;
    const x = input([a, b]); x.setup.mode = 'points';
    expect(calculate(x).totals.rounded).toBe(85); expect(calculate(x).categories.at(-1)!.categoryId).toBe('__uncategorized');
    x.setup.mode = 'weighted'; expect(calculate(x).totals.rounded).toBe(80); expect(reasons(x)).toContain('not-counted');
    expect(calculate(x).categories.at(-1)!.items[0].assignmentId).toBe('b');
  });
  it('final override percent-only and letter-only preserve computed', () => {
    const x = input([item('a', 8)]); x.finalOverride = { courseId: 'course', studentId: 'student', percent: 90, letter: null, reason: 'appeal', by: 'staff', at: now, version: 1 };
    expect(calculate(x).totals).toMatchObject({ rounded: 90, letter: 'A-', computed: { rounded: 80, letter: 'B-' } });
    x.finalOverride.percent = null; x.finalOverride.letter = 'A';
    expect(calculate(x).totals).toMatchObject({ rounded: 80, letter: 'A' }); expect(reasons(x)).toContain('final-override');
  });
  it('every letter boundary uses exact one decimal half-up', () => {
    for (const { letter, min } of defaultGradebookSetup('x').scheme.bands) {
      const x = input([item('a', min - 0.05, 100)]);
      if (min > 0) expect(calculate(x).totals.letter).toBe(letter);
    }
    const x = input([item('a', 89.95, 100)]); expect(calculate(x).totals).toMatchObject({ rounded: 90, letter: 'A-' });
    x.items[0].submission!.score = 89.94; expect(calculate(x).totals).toMatchObject({ rounded: 89.9, letter: 'B+' });
    x.items = [item('a', 0.07, 1), item('b', 89.88, 99)];
    expect(0.07 + 89.88).toBeLessThan(89.95);
    expect(calculate(x).totals.rounded).toBe(90);
  });
  it('validates input', () => {
    const x = input([item('a', 8)]); x.items[0].points = -1; expect(() => calculate(x)).toThrow(RangeError);
    x.items[0].points = 10; x.items[0].dueAt = 'bad'; expect(() => calculate(x)).toThrow(/dueAt/);
    x.items[0].dueAt = due; x.items[0].submission!.score = Infinity; expect(() => calculate(x)).toThrow(RangeError);
  });
  it('rejects duplicate identifiers and timezone-free timestamps', () => {
    const x = input([item('a', 8), item('a', 9)]);
    expect(() => calculate(x)).toThrow(RangeError);
    x.items[1].assignmentId = 'b';
    x.setup.categories.push({ ...x.setup.categories[0] });
    expect(() => calculate(x)).toThrow(RangeError);
    x.setup.categories.pop();
    x.setup.scheme.bands.push({ ...x.setup.scheme.bands[0] });
    expect(() => calculate(x)).toThrow(RangeError);
    x.setup.scheme.bands.pop();
    x.items[0].dueAt = '2026-01-01T00:00:00';
    expect(() => calculate(x)).toThrow(RangeError);
  });
  it('keeps unknown category items in the synthetic category', () => {
    const x = input([item('a', 5), { ...item('b', 9), categoryId: 'ghost' }]);
    const weighted = calculate(x);
    expect(weighted.categories.at(-1)!.items[0].assignmentId).toBe('b');
    expect(weighted.categories.at(-1)!.items[0].reasons).toContainEqual({ code: 'not-counted', params: { why: 'unknown-category' } });
    x.setup.mode = 'points';
    const points = calculate(x);
    expect(points.categories.at(-1)!.items[0].counted).toBe(true);
    expect(points.totals.rounded).toBe(70);
  });
  it('what-if reports final override while calculating without it', () => {
    const x = input([item('a', 5), { ...item('target', null), dueAt: '2026-03-01T00:00:00.000Z' }]);
    x.finalOverride = { courseId: 'course', studentId: 'student', letter: 'F', percent: 10, reason: 'staff-only', by: 'staff', at: now, version: 1 };
    const result = whatIf(x, [{ assignmentId: 'target', score: 9 }]);
    expect(result.finalOverrideActive).toBe(true);
    expect(result.trace.totals.rounded).toBe(70);
    expect(result.base.totals.rounded).toBe(50);
    expect(JSON.stringify(result)).not.toContain('staff-only');
  });
  it('neutralises every text position in CSV without changing numbers', () => {
    const x = input([item('a', 5)]);
    x.setup.scheme = { ...x.setup.scheme, bands: x.setup.scheme.bands.map(b => b.letter === 'F' ? { ...b, letter: '-LETTER' } : b) };
    const csv = exportCsv([calculate(x)], { items: [{ assignmentId: 'a', title: '=TITLE' }], categories: [{ categoryId: 'c', name: '+CATEGORY' }, { categoryId: 'unused', name: '\rCATEGORY' }], students: [{ studentId: 'student', name: '@NAME', email: '\tMAIL' }] });
    expect(csv).toContain("'=TITLE");
    expect(csv).toContain("'+CATEGORY");
    expect(csv).toContain("'@NAME");
    expect(csv).toContain("'\tMAIL");
    expect(csv).toContain("'\rCATEGORY");
    expect(csv).toContain("'-LETTER");
    expect(csv).toContain(',5,');
  });
  it('records rule steps in execution order', () => {
    const a = item('a', 8), b = item('b', null), c = item('c', 6);
    a.submission!.submittedAt = '2026-01-02T00:00:00.000Z';
    const x = input([a, b, c]); x.setup.categories[0].drop.lowest = 1;
    const steps = calculate(x).steps.map(s => s.step);
    expect(steps).toEqual([...steps].sort((m, n) => m - n));
    expect(reasons(x)).toEqual(expect.arrayContaining(['base-score', 'category-total', 'course-total']));
    expect(reasons(input([item('rounded', 89.95, 100)]))).toContain('rounding');
  });
  it('D-041 counterexample stays monotone while naive percentage drops decline', () => {
    const x = input([item('a', 4, 5), item('b', 90.7, 100), item('c', 5, 10)]);
    x.setup.categories[0].drop.lowest = 1;
    const first = calculate(x).totals;
    x.items[2].submission!.score = 8.4;
    const raised = calculate(x).totals;
    expect(R(first.percent!).compare(R(raised.percent!))).toBe(0);
    expect([first.rounded, raised.rounded]).toEqual([90.2, 90.2]);
    const naive = (scores: number[]): number => { const points = [5, 100, 10]; const drop = scores.map((s, i) => ({ i, ratio: s / points[i] })).sort((a, b) => a.ratio - b.ratio)[0].i; return Math.round((scores.reduce((a, b) => a + b, 0) - scores[drop]) / (115 - points[drop]) * 1000) / 10; };
    expect(naive([4, 90.7, 5])).toBe(90.2);
    expect(naive([4, 90.7, 8.4])).toBe(90.1);
  });
});

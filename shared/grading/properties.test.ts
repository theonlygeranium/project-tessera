import { describe, expect, it } from 'vitest';
import { calculate } from './engine';
import { defaultGradebookSetup } from './defaults';
import { bruteForceDrops, bruteForceJointDrops, selectDrops, selectJointDrops, type DropCandidate, type DropGroup } from './drops';
import { R, ZERO, sum } from './rational';
import { cellDisplays, exportRow, toCourseGradeResult } from './views';
import { solveNeeded, whatIf } from './what-if';
import type { CalcInput, CalcItem } from './types';

function random(seed: number): () => number { let x = seed >>> 0; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
const pick = (r: () => number, limit: number): number => Math.floor(r() * limit);
const due = '2026-01-01T00:00:00.000Z';
function generated(r: () => number, index: number): CalcInput {
  const graceMinutes = pick(r, 91);
  const categories = [0, 1, 2].map(k => ({ id: `c${k}`, courseId: 'c', name: `Category ${k}`, position: k, weight: [0, 25, 75][pick(r, 3)], drop: { lowest: pick(r, 4), highest: pick(r, 3), keepAtLeast: 1 + pick(r, 3) }, lateApplies: true }));
  const items: CalcItem[] = Array.from({ length: 5 + pick(r, 8) }, (_, i) => {
    const points = 1 + pick(r, 20);
    const kind = pick(r, 13);
    const score = kind < 2 ? null : pick(r, points * 15 + 1) / 10;
    const submittedAt = kind >= 7 ? '2026-01-03T02:30:00.000Z' : kind === 2 && graceMinutes > 0 ? '2026-01-01T00:00:30.000Z' : due;
    const submission = kind === 0 ? null : { state: (kind === 1 ? 'submitted' : 'graded') as 'submitted' | 'graded', score, submittedAt, released: kind !== 6 };
    const override = kind === 5 ? { score: pick(r, points * 15 + 1) / 10, reason: 'fixture', by: 'staff', at: due } : null;
    const excused = kind === 8 ? { reason: 'fixture', studentNote: null, by: 'staff', at: due } : null;
    const lateWaived = kind === 9 ? { reason: 'fixture', by: 'staff', at: due } : null;
    const missing = kind === 10 ? 'force-missing' as const : kind === 11 ? 'force-not-missing' as const : null;
    return { assignmentId: `a${index}-${i}`, title: `Item ${i}`, categoryId: pick(r, 7) === 0 ? null : `c${pick(r, 3)}`, points, extraCredit: kind === 4 || kind === 12, countsTowardGrade: true, dueAt: kind === 0 && pick(r, 2) === 0 ? '2026-01-15T00:00:00.000Z' : due, position: i, submission, itemState: override || excused || lateWaived || missing ? { excused, missing, lateWaived, override } : null, hypothetical: kind === 6 && pick(r, 2) === 0 ? pick(r, points * 10 + 1) / 10 : null };
  });
  const base = defaultGradebookSetup('c');
  const setup = defaultGradebookSetup('c', { categories, mode: pick(r, 2) ? 'weighted' : 'points', missing: { treatAs: 'zero-after-due', droppable: pick(r, 2) === 1 }, late: { ...base.late, basis: pick(r, 2) ? 'score' : 'possible', afterMax: pick(r, 2) ? 'missing' : 'hold-at-max', maxPeriods: pick(r, 2) ? null : 1 + pick(r, 4), graceMinutes, period: pick(r, 2) ? 'day' : 'hour' }, extraCredit: { categoryCapPercent: pick(r, 2) ? null : 100, courseCapPoints: pick(r, 2) ? null : 1 + pick(r, 10) } });
  return { setup, studentId: `s${index}`, items, view: pick(r, 2) ? 'student' : 'held', now: '2026-01-10T00:00:00.000Z', finalOverride: null };
}
function checkProperty(name: string, seed: number, body: (input: CalcInput, r: () => number) => void): void {
  it(name, () => { const r = random(seed); for (let i = 0; i < 300; i++) body(generated(r, i), r); });
}
describe('seeded grade properties', () => {
  it('generator includes not-yet-due items and submissions on time within grace', () => {
    const r = random(1100);
    let notDue = 0, withinGrace = 0;
    for (let i = 0; i < 300; i++) {
      const x = generated(r, i);
      notDue += x.items.filter(item => item.submission === null && item.dueAt === '2026-01-15T00:00:00.000Z').length;
      withinGrace += x.items.filter(item => item.submission?.submittedAt === '2026-01-01T00:00:30.000Z' && x.setup.late.graceMinutes > 0).length;
    }
    expect(notDue).toBeGreaterThan(0);
    expect(withinGrace).toBeGreaterThan(0);
  });
  it('documents the points-mode denominator counterexample for category-optimal drops', () => {
    const x = generated(random(42), 0);
    x.setup.mode = 'points';
    x.setup.categories[0].drop = { lowest: 0, highest: 1, keepAtLeast: 1 };
    x.setup.categories[1].drop = { lowest: 0, highest: 0, keepAtLeast: 1 };
    const make = (id: string, categoryId: string, score: number | null, points: number, extraCredit = false): CalcItem => ({ assignmentId: id, title: id, categoryId, points, extraCredit, countsTowardGrade: true, dueAt: '2026-01-01T00:00:00.000Z', position: Number(id.slice(1)) || 0, submission: score === null ? null : { state: 'graded', score, submittedAt: due, released: true }, itemState: null, hypothetical: null });
    x.items = [make('a1', 'c0', 1.4, 2), make('a2', 'c0', 8.4, 18), make('a3', 'c0', null, 6), make('a4', 'c1', 16.9, 12)];
    const before = calculate(x);
    const after = calculate({ ...x, items: [...x.items, make('a5', 'c0', 5.5, 5, true)] });
    expect(after.totals.computed.percent!).toBeGreaterThanOrEqual(before.totals.computed.percent!);
  });
  checkProperty('determinism', 1101, input => { expect(calculate(input)).toEqual(calculate(input)); });
  checkProperty('item and category order independence', 1102, (input, r) => {
    const original = calculate(input);
    const shuffled = { ...input, items: [...input.items].sort(() => r() - 0.5), setup: { ...input.setup, categories: [...input.setup.categories].reverse() } };
    expect(calculate(shuffled)).toEqual(original);
  });
  checkProperty('excusing an item equals removing it from arithmetic', 1103, (input, r) => {
    const id = input.items[pick(r, input.items.length)].assignmentId;
    const excused = { ...input, items: input.items.map(i => i.assignmentId === id ? { ...i, itemState: { excused: { reason: 'fixture', studentNote: null, by: 'staff', at: due }, missing: null, lateWaived: null, override: null } } : i) };
    const removed = { ...input, items: input.items.filter(i => i.assignmentId !== id) };
    expect(calculate(excused).totals.computed).toEqual(calculate(removed).totals.computed);
  });
  checkProperty('adding extra credit never lowers the exact grade', 1104, (input, r) => {
    const old = calculate(input);
    const ec: CalcItem = { assignmentId: 'new-ec', title: 'Bonus', categoryId: pick(r, 4) === 0 ? null : input.setup.categories[pick(r, 3)].id, points: 5, extraCredit: true, countsTowardGrade: true, dueAt: due, position: 1000, submission: { state: 'graded', score: pick(r, 101) / 10, submittedAt: due, released: true }, itemState: null, hypothetical: null };
    const next = calculate({ ...input, items: [...input.items, ec] });
    if (input.setup.mode === 'weighted') for (let k = 0; k < old.categories.length; k++) if (old.categories[k].percent !== null && next.categories[k].percent !== null) expect(next.categories[k].percent!).toBeGreaterThanOrEqual(old.categories[k].percent!);
    if (old.totals.computed.percent !== null && next.totals.computed.percent !== null) expect(next.totals.computed.percent).toBeGreaterThanOrEqual(old.totals.computed.percent);
  });
  checkProperty('raising a score never lowers any category or the course across modes and drops', 1105, (input, r) => {
    const eligible = input.items.filter(i => i.submission?.state === 'graded' && i.submission.score !== null);
    const item = eligible.length ? eligible[pick(r, eligible.length)] : input.items[0];
    if (!eligible.length) item.submission = { state: 'graded', score: 0, submittedAt: due, released: true };
    const old = calculate(input);
    const raised = { ...input, items: input.items.map(i => i.assignmentId === item.assignmentId ? { ...i, submission: { ...i.submission!, score: i.submission!.score! + (1 + pick(r, 100)) / 10 }, itemState: i.itemState?.override ? { ...i.itemState, override: { ...i.itemState.override, score: i.itemState.override.score + (1 + pick(r, 100)) / 10 } } : i.itemState, hypothetical: i.hypothetical === null ? null : i.hypothetical + 1 } : i) };
    const next = calculate(raised);
    if (input.setup.mode === 'weighted') for (let k = 0; k < old.categories.length; k++) if (old.categories[k].percent !== null && next.categories[k].percent !== null) expect(next.categories[k].percent!).toBeGreaterThanOrEqual(old.categories[k].percent!);
    if (old.totals.computed.percent !== null && next.totals.computed.percent !== null) expect(next.totals.computed.percent!).toBeGreaterThanOrEqual(old.totals.computed.percent!);
  });
  it('submission, override, and hypothetical raises preserve the course ratio in 300 cases each', () => {
    const r = random(1115);
    for (const source of ['submission', 'override', 'hypothetical'] as const) for (let trial = 0; trial < 300; trial++) {
      const x = generated(r, trial);
      const baseScore = pick(r, 101) / 10;
      const target: CalcItem = { assignmentId: 'raised-target', title: 'Target', categoryId: 'c0', points: 10, extraCredit: false, countsTowardGrade: true, dueAt: due, position: 100, submission: source === 'submission' ? { state: 'graded', score: baseScore, submittedAt: '2026-01-03T02:30:00.000Z', released: true } : null, itemState: source === 'override' ? { excused: null, missing: null, lateWaived: null, override: { score: baseScore, reason: 'fixture', by: 'staff', at: due } } : null, hypothetical: source === 'hypothetical' ? baseScore : null };
      x.items.push(target);
      const before = calculate(x).totals.computed.percent;
      const raised: CalcItem = { ...target, submission: source === 'submission' ? { ...target.submission!, score: baseScore + 0.1 } : null, itemState: source === 'override' ? { ...target.itemState!, override: { ...target.itemState!.override!, score: baseScore + 0.1 } } : null, hypothetical: source === 'hypothetical' ? baseScore + 0.1 : null };
      const after = calculate({ ...x, items: [...x.items.slice(0, -1), raised] }).totals.computed.percent;
      if (before !== null && after !== null) expect(after).toBeGreaterThanOrEqual(before);
    }
  });
  checkProperty('scaling all weights by a positive constant changes nothing', 1106, (input, r) => {
    input.setup.mode = 'weighted';
    const scale = 1 + pick(r, 4);
    const changed = { ...input, setup: { ...input.setup, categories: input.setup.categories.map(c => ({ ...c, weight: c.weight * scale })) } };
    expect(calculate(changed).totals.computed).toEqual(calculate(input).totals.computed);
  });
  checkProperty('contributions sum to weighted earned and percent is the ratio', 1107, input => {
    input.setup.mode = 'weighted';
    const trace = calculate(input);
    const contributions = trace.categories.filter(c => c.contribution !== null).map(c => R(c.contribution!));
    expect(sum(contributions).toNumber()).toBeCloseTo(trace.totals.weightedEarned, 10);
    if (trace.totals.weightedPossible > 0) expect(R(trace.totals.weightedEarned).div(R(trace.totals.weightedPossible)).mul(R(100)).toNumber()).toBeCloseTo(trace.totals.computed.percent!, 10);
  });
  checkProperty('what-if without scores equals student view', 1108, input => {
    input.items = input.items.map(i => ({ ...i, hypothetical: null }));
    expect(whatIf(input, []).trace).toEqual(calculate({ ...input, view: 'student' }));
  });
  checkProperty('grid, result and export derive the same trace', 1109, input => {
    const trace = calculate(input);
    const cells = cellDisplays(trace);
    const row = exportRow(trace, input.items);
    const result = toCourseGradeResult(trace);
    expect(result.percent).toBe(trace.totals.rounded);
    expect(result.letter).toBe(row.at(-2));
    for (const cell of cells) {
      const index = input.items.findIndex(i => i.assignmentId === cell.assignmentId);
      expect(row[index]).toBe(cell.state === 'excused' ? 'EX' : cell.state === 'missing' ? 'MISSING' : cell.adjusted === null ? '' : R(cell.adjusted).roundHalfUp(2).toNumber());
    }
  });
  it('solveNeeded matches exhaustive tenths scans on 300 generated courses', () => {
    const r = random(1110);
    for (let i = 0; i < 300; i++) {
      const x = generated(r, i);
      const points = 1 + pick(r, 10);
      x.items.push({ assignmentId: 'target', title: 'Target', categoryId: x.setup.categories[pick(r, 3)].id, points, extraCredit: false, countsTowardGrade: true, dueAt: '2026-03-01T00:00:00.000Z', position: 100, submission: null, itemState: null, hypothetical: null });
      const target = { percent: pick(r, 101) };
      const result = solveNeeded(x, [], 'target', target);
      let first: number | null = null;
      for (let tenth = 0; tenth <= points * 10; tenth++) {
        const rounded = whatIf(x, [{ assignmentId: 'target', score: tenth / 10 }]).trace.totals.rounded;
        if (rounded !== null && rounded >= target.percent) { first = tenth / 10; break; }
      }
      expect(result).toEqual(first === null ? { unreachable: true, finalOverrideActive: false } : { score: first, finalOverrideActive: false });
    }
  });
  it('drop selector equals exhaustive reference for 300 cases up to 12 items', () => {
    const r = random(1111);
    for (let iteration = 0, checked = 0; checked < 300; iteration++) {
      const count = 2 + pick(r, 11);
      const candidates: DropCandidate[] = Array.from({ length: count }, (_, i) => ({ assignmentId: `a${i}`, score: R(pick(r, 301) / 10), points: R(1 + pick(r, 20)), dueAt: i % 3 ? due : null, position: i }));
      const lowest = pick(r, 4), highest = pick(r, 4);
      if (lowest + highest >= count) continue;
      const earned = sum(candidates.map(c => c.score)).add(R(pick(r, 5)));
      const possible = sum(candidates.map(c => c.points)).add(R(pick(r, 10)));
      const value = (selection: { lowest: string[]; highest: string[] }) => {
        const removed = new Set([...selection.lowest, ...selection.highest]);
        return sum(candidates.filter(c => !removed.has(c.assignmentId)).map(c => c.score)).add(earned.sub(sum(candidates.map(c => c.score)))).div(sum(candidates.filter(c => !removed.has(c.assignmentId)).map(c => c.points)).add(possible.sub(sum(candidates.map(c => c.points)))));
      };
      expect(value(selectDrops(candidates, lowest, highest, earned, possible)).compare(value(bruteForceDrops(candidates, lowest, highest, earned, possible)))).toBe(0);
      checked++;
    }
  });
  it('handles 60 unequal-point items with combined drops', () => {
    const r = random(1112);
    const candidates: DropCandidate[] = Array.from({ length: 60 }, (_, i) => ({ assignmentId: `a${i}`, score: R(pick(r, 400) / 10), points: R(1 + pick(r, 30)), dueAt: i % 4 ? due : null, position: i }));
    const result = selectDrops(candidates, 2, 1, sum(candidates.map(c => c.score)), sum(candidates.map(c => c.points)));
    expect(result.highest).toHaveLength(1);
    expect(result.lowest.length).toBeLessThanOrEqual(2);
    expect(new Set([...result.lowest, ...result.highest]).size).toBe(result.lowest.length + result.highest.length);
  });
  it('joint points drops match exhaustive achieved values for 300 small cases', () => {
    const r = random(1113);
    for (let trial = 0; trial < 300; trial++) {
      const candidates: DropCandidate[] = Array.from({ length: 6 + pick(r, 5) }, (_, i) => ({ assignmentId: `a${i}`, score: R(pick(r, 151) / 10), points: R(1 + pick(r, 20)), dueAt: due, position: i }));
      const groups: DropGroup[] = [0, 1, 2].map(k => {
        const subset = candidates.filter((_, i) => i % 3 === k);
        return { candidates: subset, lowest: Math.min(pick(r, 3), subset.length - 1), highest: pick(r, 2) && subset.length >= 3 ? 1 : 0 };
      });
      const constantEarned = R(pick(r, 30));
      const constantPossible = R(1 + pick(r, 30));
      const earned = sum(candidates.map(c => c.score)).add(constantEarned);
      const possible = sum(candidates.map(c => c.points)).add(constantPossible);
      const value = (selection: { lowest: string[]; highest: string[] }[]) => {
        const ids = new Set(selection.flatMap(s => [...s.lowest, ...s.highest]));
        return sum(candidates.filter(c => !ids.has(c.assignmentId)).map(c => c.score)).add(constantEarned).div(sum(candidates.filter(c => !ids.has(c.assignmentId)).map(c => c.points)).add(constantPossible));
      };
      expect(value(selectJointDrops(groups, earned, possible)).compare(value(bruteForceJointDrops(groups, earned, possible)))).toBe(0);
    }
  });
  it('equal point ties drop the earliest low and high scores', () => {
    const scores = [1, 1, 3, 4, 9, 9];
    const candidates = scores.map((score, i) => ({ assignmentId: `a${i}`, score: R(score), points: R(10), dueAt: due, position: i }));
    expect(selectDrops(candidates, 2, 1, sum(candidates.map(c => c.score)), R(60))).toEqual({ lowest: ['a0', 'a1'], highest: ['a4'] });
  });
  it('calculates 300 students with 60 items and five categories in both modes within a generous timing bound', () => {
    const r = random(1114);
    const categories = [0, 1, 2, 3, 4].map(k => ({ id: `c${k}`, courseId: 'c', name: `Category ${k}`, position: k, weight: 20, drop: { lowest: k === 0 ? 2 : k === 1 ? 1 : 0, highest: k === 0 ? 1 : 0, keepAtLeast: 2 }, lateApplies: true }));
    const base = defaultGradebookSetup('c');
    const start = performance.now();
    const durations: number[] = [];
    for (const mode of ['weighted', 'points'] as const) {
      const modeStart = performance.now();
      for (let student = 0; student < 300; student++) {
      const items: CalcItem[] = Array.from({ length: 60 }, (_, i) => {
        const points = 5 + pick(r, 20);
        return { assignmentId: `a${i}`, title: `Item ${i}`, categoryId: `c${i % 5}`, points, extraCredit: false, countsTowardGrade: true, dueAt: due, position: i, submission: { state: 'graded', score: pick(r, points * 10 + 1) / 10, submittedAt: due, released: true }, itemState: null, hypothetical: null };
      });
      calculate({ setup: { ...base, categories, mode }, studentId: `s${student}`, items, view: 'student', now: '2026-02-01T00:00:00.000Z', finalOverride: null });
      }
      durations.push(performance.now() - modeStart);
    }
    const ms = performance.now() - start;
    console.log(`gradebook 300 x 60: weighted ${durations[0].toFixed(0)} ms, points ${durations[1].toFixed(0)} ms, total ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThanOrEqual(20000);
  }, 25000);
});

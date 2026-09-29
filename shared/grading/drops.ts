import type { Id } from '../domain';
import { Rational, ZERO, sum } from './rational';

export interface DropCandidate { assignmentId: Id; score: Rational; points: Rational; dueAt: string | null; position: number }
export interface DropSelection { lowest: Id[]; highest: Id[] }
export interface DropGroup { candidates: DropCandidate[]; lowest: number; highest: number }

export function compareDropCandidate(a: DropCandidate, b: DropCandidate): number {
  if (a.dueAt !== b.dueAt) {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    const due = Date.parse(a.dueAt) - Date.parse(b.dueAt);
    if (due) return due;
  }
  return a.position - b.position || (a.assignmentId < b.assignmentId ? -1 : a.assignmentId > b.assignmentId ? 1 : 0);
}

function ratio(earned: Rational, possible: Rational): Rational { return possible.n === 0n ? ZERO : earned.div(possible); }
function removedRatio(earned: Rational, possible: Rational, removed: DropCandidate[]): Rational {
  return ratio(earned.sub(sum(removed.map(c => c.score))), possible.sub(sum(removed.map(c => c.points))));
}
function weight(c: DropCandidate, r: Rational): Rational { return c.score.sub(r.mul(c.points)); }
function order(a: DropCandidate, b: DropCandidate, r: Rational, ascending: boolean, keys?: Map<DropCandidate, Rational>): number {
  const left = keys?.get(a) ?? weight(a, r), right = keys?.get(b) ?? weight(b, r);
  return (ascending ? left.compare(right) : right.compare(left)) || compareDropCandidate(a, b);
}
function keysFor(groups: DropGroup[], r: Rational): Map<DropCandidate, Rational> {
  const keys = new Map<DropCandidate, Rational>();
  for (const group of groups) for (const candidate of group.candidates) keys.set(candidate, weight(candidate, r));
  return keys;
}
function flatten(groups: DropGroup[], selections: DropCandidate[][]): DropCandidate[] { return selections.flat(); }
function worstHigh(groups: DropGroup[], lows: DropCandidate[][], earned: Rational, possible: Rational, fast = false): { highs: DropCandidate[][]; value: Rational } {
  const low = flatten(groups, lows);
  const lowIds = new Set(low.map(c => c.assignmentId));
  let q = removedRatio(earned, possible, low);
  for (let iteration = 0; iteration < 100000; iteration++) {
    const keys = fast ? keysFor(groups, q) : undefined;
    const highs = groups.map(g => g.candidates.filter(c => !lowIds.has(c.assignmentId)).sort((a, b) => order(a, b, q, false, keys)).slice(0, g.highest));
    const next = removedRatio(earned, possible, [...low, ...flatten(groups, highs)]);
    if (next.compare(q) === 0) return { highs, value: next };
    q = next;
  }
  throw new Error('Highest drop selection did not converge');
}
function bestLows(groups: DropGroup[], r: Rational, fast = false): DropCandidate[][] {
  const keys = fast ? keysFor(groups, r) : undefined;
  return groups.map(g => {
    const sorted = [...g.candidates].sort((a, b) => order(a, b, r, true, keys));
    const highOrder = fast ? [...g.candidates].sort((a, b) => order(a, b, r, false, keys)) : null;
    let best: DropCandidate[] = [], bestCost: Rational | null = null;
    for (let count = 0; count <= g.lowest; count++) {
      const low = sorted.slice(0, count);
      const high = highOrder ? highOrder.filter(c => !low.includes(c)).slice(0, g.highest) : sorted.slice(count).sort((a, b) => order(a, b, r, false)).slice(0, g.highest);
      const cost = sum([...low, ...high].map(c => keys?.get(c) ?? weight(c, r)));
      if (bestCost === null || cost.compare(bestCost) < 0 || (cost.compare(bestCost) === 0 && count > best.length)) {
        best = low; bestCost = cost;
      }
    }
    return best;
  });
}
/** Exact max-low/min-high ratio over one or more independent drop-budget groups. */
export function selectJointDrops(groupsInput: DropGroup[], earned: Rational, possible: Rational, fast = false): DropSelection[] {
  if (fast && groupsInput.some(g => g.lowest === 0 && g.highest === 0)) {
    const active = groupsInput.filter(g => g.lowest !== 0 || g.highest !== 0);
    if (active.length === 0) return groupsInput.map(() => ({ lowest: [], highest: [] }));
    const selected = selectJointDrops(active, earned, possible, true);
    let index = 0;
    return groupsInput.map(g => g.lowest === 0 && g.highest === 0 ? { lowest: [], highest: [] } : selected[index++]);
  }
  const groups = groupsInput.map(g => ({ ...g, candidates: [...g.candidates].sort(compareDropCandidate) }));
  let r = worstHigh(groups, groups.map(() => []), earned, possible, fast).value;
  for (let iteration = 0; iteration < 100000; iteration++) {
    const lows = bestLows(groups, r, fast);
    const { highs, value } = worstHigh(groups, lows, earned, possible, fast);
    if (value.compare(r) <= 0) return groups.map((_, i) => ({ lowest: lows[i].sort(compareDropCandidate).map(c => c.assignmentId), highest: highs[i].sort(compareDropCandidate).map(c => c.assignmentId) }));
    r = value;
  }
  throw new Error('Lowest drop selection did not converge');
}
export function selectDrops(candidates: DropCandidate[], lowest: number, highest: number, earned: Rational, possible: Rational): DropSelection {
  return selectJointDrops([{ candidates, lowest, highest }], earned, possible)[0];
}

/** Exhaustive reference for small test cases; supports multiple groups and constant earned/possible. */
export function bruteForceJointDrops(groups: DropGroup[], earned: Rational, possible: Rational): DropSelection[] {
  const sorted = groups.map(g => ({ ...g, candidates: [...g.candidates].sort(compareDropCandidate) }));
  const combinations = (pool: DropCandidate[], max: number, exact: boolean): DropCandidate[][] => {
    const out: DropCandidate[][] = [];
    const visit = (from: number, chosen: DropCandidate[]): void => {
      if (!exact || chosen.length === max) out.push(chosen);
      if (chosen.length === max) return;
      for (let i = from; i < pool.length; i++) visit(i + 1, [...chosen, pool[i]]);
    };
    visit(0, []); return out;
  };
  let bestValue: Rational | null = null, bestLows: DropCandidate[][] = [], bestHighs: DropCandidate[][] = [];
  const visitLow = (index: number, lows: DropCandidate[][]): void => {
    if (index < sorted.length) {
      for (const low of combinations(sorted[index].candidates, sorted[index].lowest, false)) visitLow(index + 1, [...lows, low]);
      return;
    }
    let worstValue: Rational | null = null, worstHighs: DropCandidate[][] = [];
    const visitHigh = (group: number, highs: DropCandidate[][]): void => {
      if (group < sorted.length) {
        const excluded = new Set(lows[group].map(c => c.assignmentId));
        for (const high of combinations(sorted[group].candidates.filter(c => !excluded.has(c.assignmentId)), sorted[group].highest, true)) visitHigh(group + 1, [...highs, high]);
        return;
      }
      const value = removedRatio(earned, possible, [...lows.flat(), ...highs.flat()]);
      if (worstValue === null || value.compare(worstValue) < 0) { worstValue = value; worstHighs = highs; }
    };
    visitHigh(0, []);
    const candidateValue = worstValue as Rational | null;
    if (candidateValue !== null && (bestValue === null || candidateValue.compare(bestValue) > 0)) { bestValue = candidateValue; bestLows = lows; bestHighs = worstHighs; }
  };
  visitLow(0, []);
  return sorted.map((_, i) => ({ lowest: (bestLows[i] ?? []).map(c => c.assignmentId), highest: (bestHighs[i] ?? []).map(c => c.assignmentId) }));
}
export function bruteForceDrops(candidates: DropCandidate[], lowest: number, highest: number, earned: Rational, possible: Rational): DropSelection {
  return bruteForceJointDrops([{ candidates, lowest, highest }], earned, possible)[0];
}

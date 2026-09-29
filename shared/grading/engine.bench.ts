// Run: node_modules/.bin/esbuild shared/grading/engine.bench.ts --bundle --platform=node --format=cjs --outfile=/tmp/tessera-gradebook-engine-bench.cjs
// Then: node /tmp/tessera-gradebook-engine-bench.cjs
import { calculate, calculateExact } from './engine';
import { defaultGradebookSetup } from './defaults';
import type { CalcInput, CalcItem, CalculationMode } from './types';

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}
const r = random(0x7e55e2a);
const due = '2026-01-01T00:00:00.000Z';
const late = '2026-01-02T03:00:00.000Z';
const categories = Array.from({ length: 5 }, (_, k) => ({ id: `c${k}`, courseId: 'course', name: `Category ${k}`, position: k,
  weight: 20, drop: { lowest: k === 0 ? 2 : k === 1 ? 1 : 0, highest: k === 0 ? 1 : 0, keepAtLeast: 2 }, lateApplies: true }));
const students = Array.from({ length: 300 }, (_, student) => {
  const items: CalcItem[] = Array.from({ length: 60 }, (_, i) => {
    const points = 5 + Math.floor(r() * 20), kind = Math.floor(r() * 20);
    const submission = kind === 0 || kind === 1 ? null : { state: 'graded' as const, score: Math.floor(r() * (points * 10 + 1)) / 10,
      submittedAt: kind < 5 ? late : due, released: true };
    return { assignmentId: `a${i}`, title: `Item ${i}`, categoryId: `c${i % 5}`, points, extraCredit: kind === 6,
      countsTowardGrade: true, dueAt: due, position: i, submission,
      itemState: kind === 7 ? { excused: { reason: 'fixture', studentNote: null, by: 'staff', at: due }, missing: null, lateWaived: null, override: null } : null,
      hypothetical: null };
  });
  return items;
});
const setup = defaultGradebookSetup('course', { categories, missing: { treatAs: 'zero-after-due', droppable: true } });
function inputs(mode: CalculationMode): CalcInput[] {
  return students.map((items, student) => ({ setup: { ...setup, mode }, studentId: `s${student}`, items, view: 'student',
    now: '2026-02-01T00:00:00.000Z', finalOverride: null }));
}
const fixtures = { weighted: inputs('weighted'), points: inputs('points') };
function median(values: number[]): number { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; }

{
  const rows: { mode: string; exactMs: string; fastMs: string; speedup: string }[] = [];
  for (const mode of ['weighted', 'points'] as const) {
    const timings: Record<'exact' | 'fast', number[]> = { exact: [], fast: [] };
    for (const input of fixtures[mode]) { calculateExact(input); calculate(input); }
    for (let repeat = 0; repeat < 7; repeat++) {
      for (const path of ['exact', 'fast'] as const) {
        const run = path === 'exact' ? calculateExact : calculate;
        const start = performance.now();
        for (const input of fixtures[mode]) run(input);
        timings[path].push(performance.now() - start);
      }
    }
    const exact = median(timings.exact), fast = median(timings.fast);
    rows.push({ mode, exactMs: exact.toFixed(1), fastMs: fast.toFixed(1), speedup: `${(exact / fast).toFixed(2)}x` });
  }
  console.table(rows);
}

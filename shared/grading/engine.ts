import type { CalcInput, CalcItem, CalculationTrace, CellState, GradeCategory, TraceCategory, TraceCode, TraceItem, TraceReason, TraceStep } from './types';
import { R, Rational, ZERO, sum } from './rational';
import { compareDropCandidate, selectJointDrops, type DropCandidate, type DropGroup } from './drops';
import { parseTimestamp } from './timestamp';

export const ENGINE_VERSION = '1.0.0';
type Work = { source: CalcItem; trace: TraceItem; score: Rational | null; raw: Rational | null };
function valid(value: number | null | undefined, label: string): void {
  if (value != null && (!Number.isFinite(value) || value < 0)) throw new RangeError(`${label} must be finite and non-negative`);
}
function time(value: string | null | undefined, label: string): number | null {
  if (value == null) return null;
  return parseTimestamp(value, label);
}
function bandFor(setup: CalcInput['setup'], rounded: number | null): CalculationTrace['totals']['band'] {
  if (rounded === null) return null;
  const bands = [...setup.scheme.bands].sort((a, b) => b.min - a.min || stringCompare(a.letter, b.letter));
  const index = bands.findIndex(b => rounded >= b.min);
  if (index < 0) return null;
  return { letter: bands[index].letter, min: bands[index].min, max: index ? R(bands[index - 1].min).sub(R(0.1)).toNumber() : 100 };
}
function stringCompare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
export function calculate(input: CalcInput): CalculationTrace {
  const { setup } = input;
  const now = time(input.now, 'now')!;
  valid(setup.late.percentPerPeriod, 'percentPerPeriod'); valid(setup.late.graceMinutes, 'graceMinutes');
  valid(setup.late.maxPeriods, 'maxPeriods'); valid(setup.extraCredit.categoryCapPercent, 'categoryCapPercent');
  valid(setup.extraCredit.courseCapPoints, 'courseCapPoints');
  if (new Set(setup.categories.map(c => c.id)).size !== setup.categories.length) throw new RangeError('Duplicate category id');
  if (new Set(setup.scheme.bands.map(b => b.letter)).size !== setup.scheme.bands.length) throw new RangeError('Duplicate scheme letter');
  if (new Set(input.items.map(i => i.assignmentId)).size !== input.items.length) throw new RangeError('Duplicate assignment id');
  for (const category of setup.categories) {
    valid(category.weight, `weight for ${category.id}`);
    if (!Number.isFinite(category.position)) throw new RangeError(`position for ${category.id} must be finite`);
    for (const [key, value] of Object.entries(category.drop)) if (!Number.isInteger(value) || value < (key === 'keepAtLeast' ? 1 : 0)) throw new RangeError(`${key} must be ${key === 'keepAtLeast' ? 'a positive' : 'a non-negative'} integer`);
  }
  for (const band of setup.scheme.bands) valid(band.min, `scheme min for ${band.letter}`);
  for (const item of input.items) {
    valid(item.points, `points for ${item.assignmentId}`); valid(item.hypothetical, `hypothetical for ${item.assignmentId}`);
    if (!Number.isFinite(item.position)) throw new RangeError(`position for ${item.assignmentId} must be finite`);
    valid(item.submission?.score, `score for ${item.assignmentId}`); valid(item.itemState?.override?.score, `override for ${item.assignmentId}`);
    time(item.dueAt, `dueAt for ${item.assignmentId}`); time(item.submission?.submittedAt, `submittedAt for ${item.assignmentId}`);
    time(item.itemState?.override?.at, `override at for ${item.assignmentId}`); time(item.itemState?.excused?.at, `excused at for ${item.assignmentId}`); time(item.itemState?.lateWaived?.at, `lateWaived at for ${item.assignmentId}`);
  }
  if (input.finalOverride) { valid(input.finalOverride.percent, 'final override percent'); time(input.finalOverride.at, 'final override at'); }
  const categories = [...setup.categories].sort((a, b) => a.position - b.position || stringCompare(a.id, b.id));
  const categoryMap = new Map(categories.map(c => [c.id, c]));
  if (input.items.some(i => i.categoryId === null || !categoryMap.has(i.categoryId))) {
    if (categoryMap.has('__uncategorized')) throw new RangeError('Reserved category id');
    categories.push({ id: '__uncategorized', courseId: setup.courseId, name: 'Uncategorized', position: Number.MAX_SAFE_INTEGER, weight: 0, drop: { lowest: 0, highest: 0, keepAtLeast: 1 }, lateApplies: true });
  }
  const categoryId = (i: CalcItem): string => i.categoryId !== null && categoryMap.has(i.categoryId) ? i.categoryId : '__uncategorized';
  const steps: TraceStep[] = [];
  const reason = (step: TraceStep['step'], code: TraceCode, target: TraceStep['target'], params: TraceReason['params'], bucket: TraceReason[]): void => {
    bucket.push({ code, params }); steps.push({ step, code, target, params });
  };
  const ordered = [...input.items].sort((a, b) => compareDropCandidate({ assignmentId: a.assignmentId, score: ZERO, points: ZERO, dueAt: a.dueAt, position: a.position }, { assignmentId: b.assignmentId, score: ZERO, points: ZERO, dueAt: b.dueAt, position: b.position }));
  const works: Work[] = ordered.map(source => ({ source, trace: { assignmentId: source.assignmentId, title: source.title, points: source.points, raw: null, adjusted: null, state: 'not-submitted', counted: false, reasons: [] }, score: null, raw: null }));
  // Phase 1: release visibility. An override without a submission remains visible.
  for (const w of works) {
    if (w.source.itemState?.excused) continue;
    const s = w.source.submission;
    if (input.view === 'student' && s && !s.released && (((s.state === 'graded' || s.state === 'returned') && s.score !== null) || w.source.itemState?.override)) {
      w.trace.state = 'held'; reason(1, 'held', { assignmentId: w.source.assignmentId }, {}, w.trace.reasons);
    }
  }
  // Phase 2: base score. Visibility and excuse are resolved before it can count.
  for (const w of works) {
    if (w.source.itemState?.excused) continue;
    const s = w.source.submission;
    const override = w.source.itemState?.override;
    const graded = s && (s.state === 'graded' || s.state === 'returned') && s.score !== null;
    if (override) {
      w.raw = R(override.score); w.trace.raw = w.trace.state === 'held' ? null : override.score;
      if (w.trace.state !== 'held') reason(2, 'override', { assignmentId: w.source.assignmentId }, input.view === 'held' ? { reason: override.reason } : {}, w.trace.reasons);
      if (w.trace.state !== 'held') { w.score = w.raw; w.trace.state = 'override'; w.trace.counted = true; }
    } else if (graded) {
      w.raw = R(s.score!); w.trace.raw = w.trace.state === 'held' ? null : s.score!;
      if (w.trace.state !== 'held') {
        w.score = w.raw; w.trace.state = 'graded'; w.trace.counted = true;
        reason(2, 'base-score', { assignmentId: w.source.assignmentId }, { score: s.score! }, w.trace.reasons);
      }
    }
  }
  // Phase 3: excusal has absolute precedence.
  for (const w of works) if (w.source.itemState?.excused) {
    w.score = null; w.trace.counted = false; w.trace.state = 'excused'; w.trace.raw = null; w.trace.adjusted = null;
    w.trace.reasons = []; reason(3, 'excused', { assignmentId: w.source.assignmentId }, input.view === 'student' ? (w.source.itemState.excused.studentNote ? { studentNote: w.source.itemState.excused.studentNote } : {}) : { reason: w.source.itemState.excused.reason }, w.trace.reasons);
  }
  // Phase 4: late policy uses the effective due date. Grace determines only the threshold.
  for (const w of works) {
    const i = w.source, s = i.submission, due = time(i.dueAt, 'dueAt');
    if (w.trace.state === 'excused') continue;
    if (i.extended) reason(4, 'extension', { assignmentId: i.assignmentId }, {}, w.trace.reasons);
    if (!w.trace.counted || !s || due === null) continue;
    const submitted = time(s.submittedAt, 'submittedAt')!;
    if (new Rational(BigInt(submitted) - BigInt(due)).compare(R(setup.late.graceMinutes).mul(R(60000))) <= 0) continue;
    const category = i.categoryId === null || !categoryMap.has(i.categoryId) ? (setup.mode === 'points' ? { lateApplies: true } : null) : categoryMap.get(i.categoryId);
    if (!setup.late.enabled || !category?.lateApplies) continue;
    if (i.itemState?.lateWaived) { reason(4, 'late-waived', { assignmentId: i.assignmentId }, input.view === 'held' ? { reason: i.itemState.lateWaived.reason } : {}, w.trace.reasons); continue; }
    const periodMs = setup.late.period === 'day' ? 86400000 : 3600000;
    const period = BigInt(periodMs);
    const periods = Number((BigInt(submitted) - BigInt(due) + period - 1n) / period);
    const max = setup.late.maxPeriods;
    if (max !== null && periods > max) {
      reason(4, 'late-over-max', { assignmentId: i.assignmentId }, { periods, max }, w.trace.reasons);
      if (setup.late.afterMax === 'missing') {
        w.score = ZERO; w.trace.state = 'missing';
        reason(4, 'missing-zero', { assignmentId: i.assignmentId }, {}, w.trace.reasons);
        continue;
      }
    }
    const applied = max === null ? periods : Math.min(periods, max);
    const penaltyBase = setup.late.basis === 'score' ? w.score! : R(i.points);
    const penalty = penaltyBase.mul(R(setup.late.percentPerPeriod)).mul(R(applied)).div(R(100));
    w.score = w.score!.sub(penalty).max(ZERO);
    w.trace.state = 'late';
    reason(4, 'late-penalty', { assignmentId: i.assignmentId }, { periods: applied, period: setup.late.period, percent: R(setup.late.percentPerPeriod).mul(R(applied)).toNumber() }, w.trace.reasons);
  }
  // Phase 5: explicit missing, pending, and hypothetical states.
  for (const w of works) {
    const i = w.source, s = i.submission, due = time(i.dueAt, 'dueAt');
    if (w.trace.state === 'excused') continue;
    const missing = i.itemState?.missing;
    if (missing === 'force-missing' && !i.extraCredit && !i.itemState?.override) {
      w.score = ZERO; w.trace.counted = true; w.trace.state = 'missing';
      reason(5, 'missing-zero', { assignmentId: i.assignmentId }, {}, w.trace.reasons);
    } else if (!w.trace.counted && w.trace.state !== 'missing' && w.trace.state !== 'held') {
      if (s) w.trace.state = 'to-grade';
      else if (due !== null && new Rational(BigInt(now) - BigInt(due)).compare(R(setup.late.graceMinutes).mul(R(60000))) <= 0) w.trace.state = 'not-due';
      else if (!i.extraCredit && missing !== 'force-not-missing' && setup.missing.treatAs === 'zero-after-due' && due !== null) {
        w.score = ZERO; w.trace.counted = true; w.trace.state = 'missing';
        reason(5, 'missing-zero', { assignmentId: i.assignmentId }, {}, w.trace.reasons);
      } else w.trace.state = 'not-submitted';
    }
    if (i.hypothetical !== null && !w.trace.counted) {
      w.score = R(i.hypothetical); w.trace.counted = true; w.trace.state = 'what-if';
      reason(5, 'what-if', { assignmentId: i.assignmentId }, { score: i.hypothetical }, w.trace.reasons);
    } else if (i.hypothetical !== null && w.trace.state === 'missing') {
      w.score = R(i.hypothetical); w.trace.state = 'what-if';
      w.trace.reasons = w.trace.reasons.filter(r => r.code !== 'missing-zero');
      reason(5, 'what-if', { assignmentId: i.assignmentId }, { score: i.hypothetical }, w.trace.reasons);
    }
    if (!i.countsTowardGrade || (setup.mode === 'weighted' && ((i.categoryId !== null && !categoryMap.has(i.categoryId)) || (categoryId(i) === '__uncategorized' && !i.extraCredit)))) {
      w.trace.counted = false;
      reason(5, 'not-counted', { assignmentId: i.assignmentId }, i.categoryId !== null && !categoryMap.has(i.categoryId) ? { why: 'unknown-category' } : {}, w.trace.reasons);
    }
  }
  // Phase 6: extra credit does not add possible points.
  for (const w of works) if (w.source.extraCredit && w.trace.counted) {
    if (w.trace.state !== 'what-if') w.trace.state = 'extra-credit';
    reason(6, 'extra-credit', { assignmentId: w.source.assignmentId }, {}, w.trace.reasons);
  }
  const traceCategories: TraceCategory[] = [];
  const exact = new Map<string, { earned: Rational; possible: Rational; percent: Rational | null; weight: Rational }>();
  // Phase 7: drops, then phase 8: category totals.
  const droppedCategories: { category: GradeCategory; inCategory: Work[]; bucket: TraceReason[]; earned: Rational; possible: Rational; group: DropGroup }[] = [];
  for (const category of categories) {
    const inCategory = works.filter(w => categoryId(w.source) === category.id);
    const bucket: TraceReason[] = [];
    const counted = inCategory.filter(w => w.trace.counted);
    let earned = sum(counted.map(w => w.score!));
    let possible = sum(counted.filter(w => !w.source.extraCredit).map(w => R(w.source.points)));
    const candidates: DropCandidate[] = counted.filter(w => !w.source.extraCredit && w.source.points > 0 && (w.trace.state !== 'missing' || setup.missing.droppable)).map(w => ({ assignmentId: w.source.assignmentId, score: w.score!, points: R(w.source.points), dueAt: w.source.dueAt, position: w.source.position }));
    for (const w of counted) if (w.trace.state === 'missing' && !w.source.extraCredit && !setup.missing.droppable) reason(7, 'missing-not-droppable', { assignmentId: w.source.assignmentId }, {}, w.trace.reasons);
    const requested = category.drop.lowest + category.drop.highest;
    const budget = Math.max(0, Math.min(requested, candidates.length - category.drop.keepAtLeast));
    if (budget < requested) reason(7, 'drop-limited-by-keep', { categoryId: category.id }, { requested, applied: budget, keep: category.drop.keepAtLeast }, bucket);
    const l = Math.min(category.drop.lowest, budget);
    const h = Math.min(category.drop.highest, budget - l);
    droppedCategories.push({ category, inCategory, bucket, earned, possible, group: { candidates, lowest: l, highest: h } });
  }
  const totalEC = sum(works.filter(w => w.source.extraCredit && w.trace.counted).map(w => w.score!));
  const courseCap = setup.extraCredit.courseCapPoints;
  const cappedEC = setup.mode === 'points' && courseCap !== null ? totalEC.min(R(courseCap)) : totalEC;
  const jointEarned = sum(droppedCategories.map(c => c.earned)).sub(totalEC).add(cappedEC);
  const jointPossible = sum(droppedCategories.map(c => c.possible));
  const selections = setup.mode === 'points'
    ? selectJointDrops(droppedCategories.map(c => c.group), jointEarned, jointPossible)
    : droppedCategories.map(c => selectJointDrops([c.group], c.earned, c.possible)[0]);
  for (let index = 0; index < droppedCategories.length; index++) {
    const entry = droppedCategories[index];
    const { category, inCategory, bucket, group } = entry;
    const drops = selections[index];
    if (drops.lowest.length < group.lowest) reason(7, 'drop-not-beneficial', { categoryId: category.id }, { requested: group.lowest, applied: drops.lowest.length }, bucket);
    const equalPoints = group.candidates.every(c => c.points.compare(group.candidates[0]?.points ?? ZERO) === 0) ? 1 : 0;
    for (const [rule, ids] of [['lowest', drops.lowest], ['highest', drops.highest]] as const) for (const id of ids) {
      const w = inCategory.find(x => x.source.assignmentId === id)!;
      entry.earned = entry.earned.sub(w.score!); entry.possible = entry.possible.sub(R(w.source.points));
      w.trace.state = 'dropped'; w.trace.counted = false;
      reason(7, 'dropped', { assignmentId: id }, { rule, equalPoints }, w.trace.reasons);
    }
  }
  for (const { category, inCategory, bucket, earned, possible } of droppedCategories) {
    let percent = possible.n === 0n ? null : earned.div(possible).mul(R(100));
    const cap = setup.extraCredit.categoryCapPercent;
    if (setup.mode === 'weighted' && percent && cap !== null && percent.compare(R(cap)) > 0) {
      percent = R(cap); reason(8, 'extra-credit-capped', { categoryId: category.id }, { cap }, bucket);
    }
    if (percent === null && setup.mode === 'weighted' && category.id !== '__uncategorized') reason(8, 'category-empty-shared', { categoryId: category.id }, { weight: category.weight }, bucket);
    if (percent !== null) reason(8, 'category-total', { categoryId: category.id }, { earned: earned.toNumber(), possible: possible.toNumber(), percent: percent.toNumber() }, bucket);
    const traceCategory: TraceCategory = { categoryId: category.id, name: category.name, weight: category.weight, effectiveWeight: 0, earned: earned.toNumber(), possible: possible.toNumber(), percent: percent?.toNumber() ?? null, contribution: null, items: inCategory.map(w => w.trace), reasons: bucket };
    traceCategories.push(traceCategory); exact.set(category.id, { earned, possible, percent, weight: R(category.weight) });
  }
  for (const w of works) if (w.trace.state !== 'excused') w.trace.adjusted = w.score?.toNumber() ?? null;
  const courseReasons: TraceReason[] = [];
  let weightedEarned = ZERO, weightedPossible = ZERO, coursePercent: Rational | null = null;
  if (setup.mode === 'weighted') {
    const present = traceCategories.filter(c => exact.get(c.categoryId)!.percent !== null);
    weightedPossible = sum(present.map(c => exact.get(c.categoryId)!.weight));
    weightedEarned = sum(present.map(c => exact.get(c.categoryId)!.weight.mul(exact.get(c.categoryId)!.percent!).div(R(100))));
    for (const c of present) {
      const data = exact.get(c.categoryId)!;
      c.effectiveWeight = weightedPossible.n === 0n ? 0 : data.weight.div(weightedPossible).mul(R(100)).toNumber();
      c.contribution = data.weight.mul(data.percent!).div(R(100)).toNumber();
    }
    coursePercent = weightedPossible.n === 0n ? null : weightedEarned.div(weightedPossible).mul(R(100));
  } else {
    weightedEarned = sum(traceCategories.map(c => exact.get(c.categoryId)!.earned)).sub(totalEC).add(cappedEC);
    weightedPossible = sum(traceCategories.map(c => exact.get(c.categoryId)!.possible));
    coursePercent = weightedPossible.n === 0n ? null : weightedEarned.div(weightedPossible).mul(R(100));
  }
  // Uncategorized extra credit contributes course percentage points in weighted mode.
  const uncategorizedEC = works.filter(w => w.source.categoryId === null && w.source.extraCredit && w.trace.counted);
  if (setup.mode === 'weighted' && uncategorizedEC.length && coursePercent !== null) {
    let bonus = sum(uncategorizedEC.map(w => w.score!));
    const cap = setup.extraCredit.courseCapPoints;
    if (cap !== null && bonus.compare(R(cap)) > 0) { bonus = R(cap); reason(9, 'extra-credit-capped', {}, { cap }, courseReasons); }
    const contribution = bonus.mul(weightedPossible).div(R(100));
    weightedEarned = weightedEarned.add(contribution);
    const synthetic = traceCategories.find(c => c.categoryId === '__uncategorized');
    if (synthetic) synthetic.contribution = contribution.toNumber();
    coursePercent = weightedEarned.div(weightedPossible).mul(R(100));
  } else if (setup.mode === 'points' && cappedEC.compare(totalEC) < 0) {
    reason(9, 'extra-credit-capped', {}, { cap: courseCap! }, courseReasons);
  }
  if (coursePercent !== null) reason(9, 'course-total', {}, { percent: coursePercent.toNumber(), earned: weightedEarned.toNumber(), possible: weightedPossible.toNumber() }, courseReasons);
  const computedRounded = coursePercent?.roundHalfUp(1).toNumber() ?? null;
  if (coursePercent !== null && R(computedRounded!).compare(coursePercent) !== 0) reason(10, 'rounding', {}, { from: coursePercent.toNumber(), to: computedRounded! }, courseReasons);
  const computedBand = bandFor(setup, computedRounded);
  let percent = coursePercent?.toNumber() ?? null;
  let rounded = computedRounded;
  let letter = computedBand?.letter ?? null;
  let band = computedBand;
  if (input.finalOverride) {
    if (input.finalOverride.percent !== null) {
      percent = input.finalOverride.percent;
      rounded = R(percent).roundHalfUp(1).toNumber();
      band = bandFor(setup, rounded);
      letter = band?.letter ?? null;
    }
    if (input.finalOverride.letter !== null) {
      letter = input.finalOverride.letter;
      const explicit = setup.scheme.bands.find(b => b.letter === letter);
      if (explicit) band = bandFor(setup, explicit.min);
    }
    reason(11, 'final-override', {}, input.view === 'held' ? { reason: input.finalOverride.reason } : {}, courseReasons);
  }
  return { studentId: input.studentId, view: input.view, mode: setup.mode, rulesVersion: setup.rulesVersion, setupVersion: setup.version, computedAt: input.now, engineVersion: ENGINE_VERSION, categories: traceCategories, steps, totals: { weightedEarned: weightedEarned.toNumber(), weightedPossible: weightedPossible.toNumber(), percent, rounded, letter, computed: { percent: coursePercent?.toNumber() ?? null, rounded: computedRounded, letter: computedBand?.letter ?? null }, band }, reasons: courseReasons };
}

import type { GradebookSetup, SetupCheck, SetupCheckCode, SetupItem } from './types';
import { R, Rational, sum, ZERO } from './rational';
import { parseTimestamp } from './timestamp';

function scaleWeights(setup: GradebookSetup): GradebookSetup['categories'] {
  const categories = [...setup.categories].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const total = sum(categories.map(c => R(Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 0)));
  if (total.n === 0n) return categories.map((c, i) => ({ ...c, weight: i === 0 ? 100 : 0 }));
  const portions = categories.map((c, i) => {
    const exact = R(Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 0).div(total).mul(R(10000));
    const floor = exact.n / exact.d;
    return { i, floor, remainder: exact.sub(new Rational(floor)) };
  });
  let left = 10000n - portions.reduce((n, p) => n + p.floor, 0n);
  for (const p of [...portions].sort((a, b) => b.remainder.compare(a.remainder) || a.i - b.i)) if (left-- > 0n) p.floor++;
  return categories.map((c, i) => ({ ...c, weight: Number(portions[i].floor) / 100 }));
}
export function checkSetup(setup: GradebookSetup, items: SetupItem[], now: string, saved?: GradebookSetup): SetupCheck[] {
  const timestamp = parseTimestamp;
  const nowMs = timestamp(now, 'now');
  const checks: SetupCheck[] = [];
  const add = (code: SetupCheckCode, severity: SetupCheck['severity'], target = '', params: SetupCheck['params'] = {}, fixes: SetupCheck['fixes'] = []): void => { checks.push({ code, severity, target, params, fixes }); };
  const sortedCategories = [...setup.categories].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const sortedItems = [...items].sort((a, b) => a.assignmentId < b.assignmentId ? -1 : a.assignmentId > b.assignmentId ? 1 : 0);
  const categoryIds = new Set(sortedCategories.map(c => c.id));
  const weightInvalid = sortedCategories.filter(c => !Number.isFinite(c.weight) || c.weight < 0 || c.weight > 100);
  if (weightInvalid.length) for (const c of weightInvalid) add('weight-invalid', 'fix', c.id);
  else add('weight-invalid', 'pass');
  if (setup.mode === 'weighted') {
    const total = sum(sortedCategories.map(c => R(Number.isFinite(c.weight) ? c.weight : 0)));
    const delta = total.sub(R(100));
    const absolute = delta.n < 0n ? delta.mul(R(-1)) : delta;
    if (absolute.compare(R(0.01)) > 0) {
      add('weights-not-100', 'fix', '', { total: total.toNumber() }, setup.categories.length ? [{ label: 'Scale weights to 100%', patch: { categories: scaleWeights(setup) } }] : []);
    } else add('weights-not-100', 'pass');
  } else add('weights-not-100', 'pass');
  for (const c of sortedCategories) {
    if (!Number.isInteger(c.drop.keepAtLeast) || c.drop.keepAtLeast < 1) add('keep-at-least-invalid', 'fix', c.id);
    else add('keep-at-least-invalid', 'pass', c.id);
    if (![c.drop.lowest, c.drop.highest].every(n => Number.isInteger(n) && n >= 0)) add('drop-count-invalid', 'fix', c.id);
    else add('drop-count-invalid', 'pass', c.id);
    const planned = sortedItems.filter(i => i.categoryId === c.id && i.status !== 'draft' && i.countsTowardGrade && !i.extraCredit);
    if (c.drop.lowest + c.drop.highest > 0 && c.drop.lowest + c.drop.highest >= planned.length) add('drop-exceeds-items', 'fix', c.id, { requested: c.drop.lowest + c.drop.highest, items: planned.length });
    else add('drop-exceeds-items', 'pass', c.id);
    const graded = planned.filter(i => i.gradedCount > 0).length;
    if (setup.mode === 'weighted' && graded === 0) add('category-empty', 'review', c.id, { weight: c.weight });
    else add('category-empty', 'pass', c.id);
    const remaining = planned.filter(i => i.gradedCount === 0 || i.status === 'scheduled' || (i.dueAt !== null && timestamp(i.dueAt, `dueAt for ${i.assignmentId}`) > nowMs));
    if (c.drop.lowest + c.drop.highest > 0 && remaining.length) add('drop-before-complete', 'review', c.id, { remaining: remaining.length, total: planned.length });
    else add('drop-before-complete', 'pass', c.id);
  }
  const bands = setup.scheme.bands;
  const orderBad = bands.some((b, i) => !Number.isFinite(b.min) || b.min < 0 || b.min > 100 || (i > 0 && b.min > bands[i - 1].min)) || new Set(bands.map(b => b.letter)).size !== bands.length;
  add('scheme-order', orderBad ? 'fix' : 'pass');
  add('scheme-overlap', new Set(bands.map(b => b.min)).size !== bands.length ? 'fix' : 'pass');
  add('scheme-gap', !bands.length || bands[bands.length - 1].min !== 0 ? 'fix' : 'pass');
  for (const i of sortedItems) {
    if (i.categoryId !== null && !categoryIds.has(i.categoryId)) add('item-no-category', 'fix', i.assignmentId, { why: 'unknown-category', categoryId: i.categoryId }, [{ label: 'Assign category', patch: { kind: 'open-item', assignmentId: i.assignmentId } }]);
    else if (setup.mode === 'weighted' && i.status === 'published' && i.countsTowardGrade && !i.extraCredit && i.categoryId === null) add('item-no-category', 'fix', i.assignmentId, {}, [{ label: 'Assign category', patch: { kind: 'open-item', assignmentId: i.assignmentId } }]);
    else add('item-no-category', 'pass', i.assignmentId);
    if (i.countsTowardGrade && !i.extraCredit && i.points === 0) add('item-zero-points', 'review', i.assignmentId);
    else add('item-zero-points', 'pass', i.assignmentId);
    if (i.dueAt !== null) timestamp(i.dueAt, `dueAt for ${i.assignmentId}`);
  }
  add('late-no-cap', setup.late.enabled && setup.late.maxPeriods === null ? 'review' : 'pass');
  add('extra-credit-uncapped', sortedItems.some(i => i.extraCredit && i.categoryId === null) && setup.extraCredit.courseCapPoints === null ? 'review' : 'pass');
  add('missing-droppable', setup.missing.droppable ? 'review' : 'pass');
  add('mode-switch-extra-credit', saved && saved.mode !== setup.mode && sortedItems.some(i => i.extraCredit) ? 'review' : 'pass');
  return checks;
}
export function hasBlockingIssues(checks: SetupCheck[]): boolean { return checks.some(c => c.severity === 'fix'); }

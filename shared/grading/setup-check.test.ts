import { describe, expect, it } from 'vitest';
import { checkSetup, hasBlockingIssues } from './setup-check';
import { defaultGradebookSetup } from './defaults';
import type { GradebookSetup, SetupCheckCode, SetupItem } from './types';

const now = '2026-01-10T00:00:00.000Z';
function base(): { setup: GradebookSetup; items: SetupItem[] } {
  const setup = defaultGradebookSetup('course', { categories: [
    { id: 'c1', courseId: 'course', name: 'First', position: 0, weight: 50, drop: { lowest: 0, highest: 0, keepAtLeast: 1 }, lateApplies: true },
    { id: 'c2', courseId: 'course', name: 'Second', position: 1, weight: 50, drop: { lowest: 0, highest: 0, keepAtLeast: 1 }, lateApplies: true },
  ] });
  const items: SetupItem[] = [1, 2, 3, 4].map((n) => ({ assignmentId: `a${n}`, title: `Item ${n}`, categoryId: n < 3 ? 'c1' : 'c2', points: 10, extraCredit: false, countsTowardGrade: true, status: 'published', dueAt: '2026-01-01T00:00:00.000Z', gradedCount: 1 }));
  return { setup, items };
}
function find(code: SetupCheckCode, change: (fixture: ReturnType<typeof base>) => void, saved?: GradebookSetup) {
  const fixture = base(); change(fixture); return checkSetup(fixture.setup, fixture.items, now, saved).filter(c => c.code === code);
}
describe('setup check', () => {
  it('emits a pass entry for every checked rule', () => {
    const { setup, items } = base(); const checks = checkSetup(setup, items, now);
    expect(hasBlockingIssues(checks)).toBe(false);
    for (const code of ['weights-not-100', 'weight-invalid', 'keep-at-least-invalid', 'drop-count-invalid', 'drop-exceeds-items', 'scheme-gap', 'scheme-overlap', 'scheme-order', 'item-no-category', 'category-empty', 'drop-before-complete', 'late-no-cap', 'extra-credit-uncapped', 'item-zero-points', 'missing-droppable', 'mode-switch-extra-credit'] as SetupCheckCode[]) expect(checks.some(c => c.code === code && c.severity === 'pass')).toBe(true);
  });
  it('weights-not-100 offers exact largest remainder scaling', () => {
    const checks = find('weights-not-100', f => { f.setup.categories = [0, 1, 2].map(i => ({ ...f.setup.categories[0], id: `c${i}`, position: i, weight: 1 })); });
    expect(checks[0].severity).toBe('fix');
    const patch = checks[0].fixes[0].patch as Partial<GradebookSetup>;
    expect(patch.categories!.map(c => c.weight)).toEqual([33.34, 33.33, 33.33]);
    expect(patch.categories!.reduce((a, c) => a + Math.round(c.weight * 100), 0)).toBe(10000);
  });
  const cases: [SetupCheckCode, 'fix' | 'review', (f: ReturnType<typeof base>) => void, GradebookSetup?][] = [
    ['weight-invalid', 'fix', f => { f.setup.categories[0].weight = -1; }],
    ['keep-at-least-invalid', 'fix', f => { f.setup.categories[0].drop.keepAtLeast = 0; }],
    ['drop-count-invalid', 'fix', f => { f.setup.categories[0].drop.lowest = -1; }],
    ['drop-exceeds-items', 'fix', f => { f.setup.categories[0].drop.lowest = 2; }],
    ['scheme-gap', 'fix', f => { f.setup.scheme = { ...f.setup.scheme, bands: f.setup.scheme.bands.slice(0, -1) }; }],
    ['scheme-overlap', 'fix', f => { f.setup.scheme = { ...f.setup.scheme, bands: f.setup.scheme.bands.map((b, i) => i === 1 ? { ...b, min: 93 } : b) }; }],
    ['scheme-order', 'fix', f => { f.setup.scheme = { ...f.setup.scheme, bands: [...f.setup.scheme.bands].reverse() }; }],
    ['item-no-category', 'fix', f => { f.items[0].categoryId = null; }],
    ['category-empty', 'review', f => { f.items.filter(i => i.categoryId === 'c1').forEach(i => { i.gradedCount = 0; }); }],
    ['drop-before-complete', 'review', f => { f.setup.categories[0].drop.lowest = 1; f.items[0].gradedCount = 0; }],
    ['late-no-cap', 'review', f => { f.setup.late.maxPeriods = null; }],
    ['extra-credit-uncapped', 'review', f => { f.items[0].extraCredit = true; f.items[0].categoryId = null; }],
    ['item-zero-points', 'review', f => { f.items[0].points = 0; }],
    ['missing-droppable', 'review', f => { f.setup.missing.droppable = true; }],
    ['mode-switch-extra-credit', 'review', f => { f.setup.mode = 'points'; f.items[0].extraCredit = true; }, base().setup],
  ];
  for (const [code, severity, change, saved] of cases) it(`${code} fires with ${severity}`, () => {
    expect(find(code, change, saved).some(c => c.severity === severity)).toBe(true);
    expect(hasBlockingIssues(find(code, change, saved))).toBe(severity === 'fix');
  });
  it('ordering does not depend on setup or item array order', () => {
    const { setup, items } = base();
    expect(checkSetup(setup, items, now)).toEqual(checkSetup({ ...setup, categories: [...setup.categories].reverse() }, [...items].reverse(), now));
  });
  it('flags an unknown category and rejects timezone-free dates', () => {
    const { setup, items } = base();
    items[0].categoryId = 'ghost';
    expect(checkSetup(setup, items, now)).toContainEqual(expect.objectContaining({ code: 'item-no-category', severity: 'fix', target: 'a1', params: { why: 'unknown-category', categoryId: 'ghost' } }));
    expect(() => checkSetup(setup, items, '2026-02-01T00:00:00')).toThrow(RangeError);
    items[0].dueAt = '2026-01-01T00:00:00';
    expect(() => checkSetup(setup, items, now)).toThrow(RangeError);
  });
});

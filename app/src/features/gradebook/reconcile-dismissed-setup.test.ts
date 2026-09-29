import { describe, expect, it, vi } from 'vitest';
import { fixtureAi } from '../../../../shared/ai';
import type { GradebookSetup } from '../../../../shared/grading/types';
import { seedData } from '../../../../shared/seed';
import { MemoryRepo, dispatch, service, type ServiceContext } from '../../../../shared/service';
import { reconcileDismissedSetup } from './reconcile-dismissed-setup';

const courseId = 'stat110-04';

describe('reconcileDismissedSetup', () => {
  it('blocks a stale tab after another tab saves weights, preserving the saved weights', async () => {
    const repo = new MemoryRepo(seedData());
    let sequence = 0;
    const teacher: ServiceContext = {
      repo, ai: fixtureAi, user: await repo.getUser('u-okafor'),
      now: () => '2026-10-20T19:00:00.000Z', newId: prefix => `${prefix}-dismiss-test-${++sequence}`,
    };
    const tabA = await dispatch(service, teacher, 'getGradebookSetup', { courseId });
    const tabB = await dispatch(service, teacher, 'getGradebookSetup', { courseId });
    const changed: GradebookSetup = {
      ...tabB,
      categories: tabB.categories.map(category => category.id === 'mid' ? { ...category, weight: 25 } : category.id === 'project' ? { ...category, weight: 35 } : category),
    };
    const previewB = await dispatch(service, teacher, 'previewGradebookSetup', { courseId, setup: changed });
    await dispatch(service, teacher, 'saveGradebookSetup', {
      courseId, setup: changed, expectedVersion: tabB.version, hash: previewB.changeSet.hash,
    });

    const dismissed = await dispatch(service, teacher, 'dismissSetupCheck', { courseId, code: 'category-empty', target: 'participation' });
    const result = reconcileDismissedSetup(tabA, dismissed);
    const saveFromTabA = vi.fn(async (setup: GradebookSetup) => {
      const previewA = await dispatch(service, teacher, 'previewGradebookSetup', { courseId, setup });
      return dispatch(service, teacher, 'saveGradebookSetup', {
        courseId, setup, expectedVersion: setup.version, hash: previewA.changeSet.hash,
      });
    });
    if ('ok' in result) await saveFromTabA(result.setup);

    expect(result).toEqual({ stale: true });
    expect(saveFromTabA).not.toHaveBeenCalled();
    const stored = await dispatch(service, teacher, 'getGradebookSetup', { courseId });
    expect(stored.categories.find(category => category.id === 'mid')?.weight).toBe(25);
    expect(stored.categories.find(category => category.id === 'project')?.weight).toBe(35);
    expect(stored.version).toBe(dismissed.version);
  });

  it('adopts the whole dismissed setup when its rules still match the draft', async () => {
    const repo = new MemoryRepo(seedData());
    let sequence = 0;
    const teacher: ServiceContext = {
      repo, ai: fixtureAi, user: await repo.getUser('u-okafor'),
      now: () => '2026-10-20T19:00:00.000Z', newId: prefix => `${prefix}-dismiss-test-${++sequence}`,
    };
    const draft = await dispatch(service, teacher, 'getGradebookSetup', { courseId });
    const next = await dispatch(service, teacher, 'dismissSetupCheck', { courseId, code: 'category-empty', target: 'participation' });

    expect(reconcileDismissedSetup(draft, next)).toEqual({ ok: true, setup: next });
    expect(next.dismissedChecks).toHaveLength(1);
  });
});

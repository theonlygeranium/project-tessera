import type { GradebookSetup, GradeScheme } from './types';

export const DEFAULT_SCHEME: GradeScheme = {
  id: 'default', name: 'Default', bands: [
    { letter: 'A', min: 93 }, { letter: 'A-', min: 90 }, { letter: 'B+', min: 87 }, { letter: 'B', min: 83 }, { letter: 'B-', min: 80 },
    { letter: 'C+', min: 77 }, { letter: 'C', min: 73 }, { letter: 'C-', min: 70 }, { letter: 'D', min: 60 }, { letter: 'F', min: 0 },
  ], rounding: { decimals: 1, mode: 'half-up' }, letterFrom: 'rounded',
};
for (const band of DEFAULT_SCHEME.bands) Object.freeze(band);
Object.freeze(DEFAULT_SCHEME.bands);
Object.freeze(DEFAULT_SCHEME.rounding);
Object.freeze(DEFAULT_SCHEME);
export function defaultGradebookSetup(courseId: string, opts: Partial<GradebookSetup> = {}): GradebookSetup {
  const setup: GradebookSetup = {
    courseId, mode: 'weighted', categories: [],
    late: { enabled: true, percentPerPeriod: 10, period: 'day', basis: 'score', maxPeriods: 3, afterMax: 'hold-at-max', graceMinutes: 0 },
    missing: { treatAs: 'zero-after-due', droppable: false },
    extraCredit: { categoryCapPercent: 100, courseCapPoints: null }, scheme: DEFAULT_SCHEME,
    emptyCategory: 'share-weight', studentNotes: [], dismissedChecks: [], source: { kind: 'manual', designSessionId: null },
    version: 0, rulesVersion: 0, updatedBy: '', updatedAt: '', ...opts,
  };
  return {
    ...setup,
    categories: setup.categories.map(c => ({ ...c, drop: { ...c.drop } })),
    late: { ...setup.late }, missing: { ...setup.missing }, extraCredit: { ...setup.extraCredit },
    scheme: { ...setup.scheme, bands: setup.scheme.bands.map(b => ({ ...b })), rounding: { ...setup.scheme.rounding } },
    studentNotes: setup.studentNotes.map(n => ({ ...n })),
    dismissedChecks: setup.dismissedChecks.map(c => ({ ...c })),
    source: { ...setup.source },
  };
}

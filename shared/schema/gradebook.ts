import { z } from 'zod';
import type * as D from '../domain';
import type { Equal, Expect } from './domain';
import { id, integer, nonnegative, required, string, timestamp } from './domain';
const finite = z.number().finite();
export const GradeEventKindSchema = z.enum([
  'score', 'override', 'excuse', 'unexcuse', 'missing', 'extension',
  'late-waiver', 'final-override', 'release', 'unrelease', 'setup', 'undo'
]);
export const SetupCheckCodeSchema = z.enum([
  'weights-not-100', 'weight-invalid', 'category-empty', 'drop-exceeds-items',
  'drop-before-complete', 'keep-at-least-invalid', 'drop-count-invalid',
  'scheme-gap', 'scheme-overlap', 'scheme-order', 'late-no-cap',
  'extra-credit-uncapped', 'item-no-category', 'item-zero-points',
  'missing-droppable', 'mode-switch-extra-credit'
]);
export const GradeCategorySchema = z.object({
  id,
  courseId: id,
  name: required.max(120),
  position: integer.min(0),
  weight: finite.min(0).max(100),
  drop: z.object({
    lowest: integer.min(0),
    highest: integer.min(0),
    keepAtLeast: integer.min(1)
  }),
  lateApplies: z.boolean()
});
export const GradeSchemeSchema = z.object({
  id,
  name: required.max(120),
  bands: z.array(z.object({
    letter: required.max(12),
    min: finite.min(0).max(100)
  })).min(1).max(50),
  rounding: z.object({
    decimals: z.literal(1),
    mode: z.literal('half-up')
  }),
  letterFrom: z.literal('rounded')
});
export const GradebookSetupSchema = z.object({
  courseId: id,
  mode: z.enum(['weighted', 'points']),
  categories: z.array(GradeCategorySchema).max(100),
  late: z.object({
    enabled: z.boolean(),
    percentPerPeriod: finite.min(0).max(100),
    period: z.enum(['day', 'hour']),
    basis: z.enum(['score', 'possible']),
    maxPeriods: integer.min(0).nullable(),
    afterMax: z.enum(['missing', 'hold-at-max']),
    graceMinutes: integer.min(0).max(525600)
  }),
  missing: z.object({
    treatAs: z.enum(['zero-after-due', 'exclude-until-graded']),
    droppable: z.boolean()
  }),
  extraCredit: z.object({
    categoryCapPercent: finite.min(0).nullable(),
    courseCapPoints: finite.min(0).nullable()
  }),
  scheme: GradeSchemeSchema,
  emptyCategory: z.literal('share-weight'),
  studentNotes: z.array(z.object({
    categoryId: id,
    text: string.max(1000)
  })).max(100),
  dismissedChecks: z.array(z.object({
    code: SetupCheckCodeSchema,
    target: string,
    by: id,
    at: timestamp
  })).max(200),
  source: z.object({
    kind: z.enum(['manual', 'syllabus']),
    designSessionId: id.nullable()
  }),
  version: integer.min(0),
  rulesVersion: integer.min(0),
  updatedBy: string,
  updatedAt: string
});
export const StudentItemStateSchema = z.object({
  assignmentId: id,
  studentId: id,
  courseId: id,
  excused: z.object({
    reason: required.max(500),
    studentNote: string.max(500).nullable(),
    by: id,
    at: timestamp
  }).nullable(),
  missing: z.enum(['force-missing', 'force-not-missing']).nullable(),
  lateWaived: z.object({
    reason: required.max(500),
    by: id,
    at: timestamp
  }).nullable(),
  override: z.object({
    score: nonnegative.finite(),
    reason: required.max(500),
    by: id,
    at: timestamp
  }).nullable(),
  dueAt: timestamp.nullable(),
  version: integer.min(0)
});
export const CourseGradeOverrideSchema = z.object({
  courseId: id,
  studentId: id,
  letter: string.nullable(),
  percent: finite.nullable(),
  reason: required.max(500),
  by: id,
  at: timestamp,
  version: integer.min(0)
});
export const GradeEventSchema = z.object({
  id,
  courseId: id,
  studentId: id.nullable(),
  assignmentId: id.nullable(),
  kind: GradeEventKindSchema,
  before: z.unknown(),
  after: z.unknown(),
  reason: string.nullable(),
  by: id,
  at: timestamp,
  batchId: id.nullable(),
  undoOf: id.nullable(),
  rulesVersion: integer.min(0),
  seq: integer.min(1).optional(),
  requestFingerprint: string.optional(),
  result: z.unknown().optional(),
  batchResult: z.unknown().optional()
});
export const GradeChangeSetSchema = z.object({
  kind: z.enum(['setup', 'release']),
  changes: z.array(z.object({
    studentId: id,
    name: string,
    from: z.object({
      percent: finite.nullable(),
      letter: string.nullable()
    }),
    to: z.object({
      percent: finite.nullable(),
      letter: string.nullable()
    })
  })),
  letterChanges: integer.min(0),
  unchanged: integer.min(0),
  notSent: z.array(z.object({
    submissionId: id,
    studentId: id,
    reason: z.literal('ai-draft-not-reviewed')
  })),
  hash: string
});
export const SetupCheckSchema = z.object({
  code: SetupCheckCodeSchema,
  severity: z.enum(['fix', 'review', 'pass']),
  target: string,
  params: z.record(z.string(), z.union([string, finite])),
  fixes: z.array(z.object({
    label: string,
    patch: z.unknown()
  }))
}) as z.ZodType<D.SetupCheck>;
export const CalculationTraceSchema = z.object({
  studentId: id,
  view: z.enum(['student', 'held']),
  mode: z.enum(['weighted', 'points']),
  rulesVersion: integer,
  setupVersion: integer,
  computedAt: timestamp,
  engineVersion: string,
  categories: z.array(z.unknown()),
  steps: z.array(z.unknown()),
  totals: z.unknown(),
  reasons: z.array(z.unknown())
}) as z.ZodType<D.CalculationTrace>;
export const CourseGradeResultSchema = z.object({
  studentId: id,
  percent: finite.nullable(),
  letter: string.nullable(),
  rulesVersion: integer,
  trace: CalculationTraceSchema
});
export type _GradeCategory = Expect<Equal<z.infer<typeof GradeCategorySchema>, D.GradeCategory>>;
export type _GradeScheme = Expect<Equal<z.infer<typeof GradeSchemeSchema>, D.GradeScheme>>;
export type _GradebookSetup = Expect<Equal<z.infer<typeof GradebookSetupSchema>, D.GradebookSetup>>;
export type _StudentItemState = Expect<Equal<z.infer<typeof StudentItemStateSchema>, D.StudentItemState>>;
export type _CourseGradeOverride = Expect<Equal<z.infer<typeof CourseGradeOverrideSchema>, D.CourseGradeOverride>>;
export type _GradeEvent = Expect<Equal<z.infer<typeof GradeEventSchema>, D.GradeEvent>>;
export type _GradeChangeSet = Expect<Equal<z.infer<typeof GradeChangeSetSchema>, D.GradeChangeSet>>;

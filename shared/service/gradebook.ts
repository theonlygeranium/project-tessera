import type { Assignment, CalcInput, CalculationTrace, CourseGradeOverride, GradebookSetup, GradeChangeSet, GradeEvent, StudentItemState, Submission, User } from '../domain';
import type { GradeSnapshot, GradeWrite } from '../repo';
import type { Service, ServiceContext } from './context';
import { canReachCourse, canTeach, fail, user } from './helpers';
import { validateExtension, validateGradebookSetup, validateReason, validateScore, validateStudentNote } from './validate-gradebook';
import {
  ENGINE_VERSION, calculate, cellDisplays, checkSetup, defaultGradebookSetup,
  explain, exportCsv, hasBlockingIssues, solveNeeded, toCourseGradeResult, whatIf
} from '../grading';
type View = 'student' | 'held';
type Data = {
  assignments: Assignment[];
  allAssignments: Assignment[];
  students: User[];
  submissions: Submission[];
  states: StudentItemState[];
  submissionByCell: Map<string, Submission>;
  stateByCell: Map<string, StudentItemState>;
  setup: GradebookSetup;
  finals: Map<string, CourseGradeOverride>;
  finalRevisions: Map<string, CourseGradeOverride>;
  now: string;
};
const latest = (all: Submission[], assignmentId: string, studentId: string) => all.find(s => !s.deleted && s.assignmentId === assignmentId && s.studentId === studentId) ?? null;
const submissionRevision = (all: Submission[], assignmentId: string, studentId: string) => all.find(s => s.assignmentId === assignmentId && s.studentId === studentId) ?? null;
const stateFor = (all: StudentItemState[], assignmentId: string, studentId: string) => all.find(s => s.assignmentId === assignmentId && s.studentId === studentId) ?? null;
const blankState = (courseId: string, assignmentId: string, studentId: string): StudentItemState => ({
  courseId,
  assignmentId,
  studentId,
  excused: null,
  missing: null,
  lateWaived: null,
  override: null,
  dueAt: null,
  version: 0
});
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item);
const noop = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const sameSubmission = (a: Submission | null, b: Submission | null) => noop(
  a && { ...a, deleted: !!a.deleted }, b && { ...b, deleted: !!b.deleted }
);
async function hash(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function staff(ctx: ServiceContext, courseId: string) {
  if (user(ctx).role === 'administrator') await canReachCourse(ctx, courseId);else await canTeach(ctx, courseId);
}
async function teacher(ctx: ServiceContext, courseId: string) {
  await canTeach(ctx, courseId);
}
async function student(ctx: ServiceContext, courseId: string) {
  if (user(ctx).role !== 'student' || (await ctx.repo.listReportingLines({
    managerId: user(ctx).id
  })).length) fail('forbidden', 'Students only.');
  await canReachCourse(ctx, courseId);
}
async function savedSetup(ctx: ServiceContext, courseId: string, assignments: Assignment[]): Promise<GradebookSetup> {
  const existing = await ctx.repo.getGradebookSetup(courseId);
  if (existing) return existing;
  return defaultGradebookSetup(courseId, {
    mode: 'points',
    categories: [{
      id: `${courseId}-assignments`,
      courseId,
      name: 'Assignments',
      position: 0,
      weight: 100,
      drop: {
        lowest: 0,
        highest: 0,
        keepAtLeast: 1
      },
      lateApplies: true
    }],
    late: {
      enabled: false,
      percentPerPeriod: 0,
      period: 'day',
      basis: 'score',
      maxPeriods: 0,
      afterMax: 'hold-at-max',
      graceMinutes: 0
    },
    missing: {
      treatAs: 'exclude-until-graded',
      droppable: false
    },
    updatedAt: ctx.now()
  });
}
async function load(ctx: ServiceContext, courseId: string): Promise<Data> {
  const [assignments, students, submissions, states, revisions] = await Promise.all([ctx.repo.listAssignments({
    courseId
  }), ctx.repo.listCourseStudents(courseId), ctx.repo.listSubmissions({
    courseId,
    includeDeleted: true
  }), ctx.repo.listStudentItemStates({
    courseId
  }), ctx.repo.listFinalOverrideRevisions(courseId)]);
  const setup = await savedSetup(ctx, courseId, assignments);
  for (const a of assignments) if (a.dueAt !== null) validateExtension(a.dueAt, `assignments.${a.id}.dueAt`);
  for (const s of states) if (s.dueAt !== null) validateExtension(s.dueAt, `itemStates.${s.assignmentId}.${s.studentId}.dueAt`);
  const submissionByCell = new Map<string, Submission>();
  for (const s of submissions) {
    const key = `${s.studentId}:${s.assignmentId}`;
    if (!s.deleted && !submissionByCell.has(key)) submissionByCell.set(key, s);
  }
  const stateByCell = new Map(states.map(s => [`${s.studentId}:${s.assignmentId}`, s]));
  return {
    assignments: assignments.filter(a => a.status === 'published'),
    allAssignments: assignments,
    students,
    submissions,
    states,
    submissionByCell,
    stateByCell,
    setup,
    finals: new Map(revisions.filter(o => o.letter !== null || o.percent !== null).map(o => [o.studentId, o])),
    finalRevisions: new Map(revisions.map(o => [o.studentId, o])),
    now: ctx.now()
  };
}
async function snapshotHash(data: Data, draft: GradebookSetup): Promise<string> {
  return hash({
    draft,
    savedVersion: data.setup.version,
    submissions: data.submissions.map(s => [s.id, s.version ?? 0, s.deleted ?? false, s.grade, s.state, s.feedbackDraft]),
    states: data.states.map(s => [s.assignmentId, s.studentId, s.version, s.excused, s.missing, s.lateWaived, s.override, s.dueAt]),
    finalOverrides: [...data.finalRevisions.values()].map(f => [f.courseId, f.studentId, f.version, f.letter, f.percent]),
    assignments: data.allAssignments.map(a => [a.id, a.points, a.dueAt, a.status, a.categoryId ?? null, a.extraCredit ?? false, a.countsTowardGrade ?? true, a.position]),
    students: data.students.map(s => s.id),
    engineVersion: ENGINE_VERSION
  });
}
function snapshot(data: Data, courseId: string): GradeSnapshot {
  return {
    courseId,
    setup: data.setup,
    assignments: data.allAssignments,
    studentIds: data.students.map(s => s.id),
    submissions: data.submissions,
    states: data.states,
    finalRevisions: [...data.finalRevisions.values()]
  };
}
function input(data: Data, studentId: string, view: View, setup = data.setup): CalcInput {
  return {
    setup,
    studentId,
    view,
    now: data.now,
    finalOverride: data.finals.get(studentId) ?? null,
    items: data.assignments.map(a => {
      const s = data.submissionByCell.get(`${studentId}:${a.id}`) ?? null;
      const st = data.stateByCell.get(`${studentId}:${a.id}`) ?? null;
      return {
        assignmentId: a.id,
        title: a.title,
        categoryId: a.categoryId ?? (setup.mode === 'points' ? setup.categories[0]?.id ?? null : null),
        points: a.points,
        extraCredit: a.extraCredit ?? false,
        countsTowardGrade: a.countsTowardGrade ?? true,
        dueAt: st?.dueAt ?? a.dueAt,
        extended: !!st?.dueAt && st.dueAt !== a.dueAt,
        position: a.position,
        submission: s ? {
          state: s.state,
          submittedAt: s.submittedAt,
          score: s.grade?.score ?? null,
          released: !!s.grade?.releasedAt || s.state === 'returned'
        } : null,
        itemState: st ? {
          excused: st.excused,
          missing: st.missing,
          lateWaived: st.lateWaived,
          override: st.override
        } : null,
        hypothetical: null
      };
    })
  };
}
function trace(data: Data, studentId: string, view: View, setup = data.setup) {
  return calculate(input(data, studentId, view, setup));
}
function hypotheticalInput(source: CalcInput, scores: {
  assignmentId: string;
  score: number;
}[], solveFor?: string): CalcInput {
  const planned = new Set([...scores.map(s => s.assignmentId), ...(solveFor ? [solveFor] : [])]);
  return {
    ...source,
    items: source.items.map(item => planned.has(item.assignmentId) && item.submission && !item.submission.released ? {
      ...item,
      submission: {
        ...item.submission,
        state: 'submitted' as const,
        score: null
      },
      itemState: item.itemState ? {
        ...item.itemState,
        override: null
      } : null
    } : item)
  };
}
function setupItems(data: Data) {
  return data.assignments.map(a => ({
    assignmentId: a.id,
    title: a.title,
    categoryId: a.categoryId ?? (data.setup.mode === 'points' ? data.setup.categories[0]?.id ?? null : null),
    points: a.points,
    extraCredit: a.extraCredit ?? false,
    countsTowardGrade: a.countsTowardGrade ?? true,
    status: a.status,
    dueAt: a.dueAt,
    gradedCount: data.submissions.filter(s => s.assignmentId === a.id && !!s.grade).length
  }));
}
async function setupPreview(data: Data, setup: GradebookSetup) {
  const checks = checkSetup(setup, setupItems(data), data.now, data.setup);
  const changeSet = {
    ...changes('setup', data, id => trace(data, id, 'student'), id => trace(data, id, 'student', setup)),
    hash: await snapshotHash(data, setup)
  };
  return {
    checks,
    changeSet
  };
}
async function releasePreview(data: Data, assignmentId: string) {
  const submissions = data.submissions.filter(s => s.assignmentId === assignmentId && !s.deleted && s.state === 'graded' && !!s.grade);
  const notSent = submissions.filter(s => !!s.feedbackDraft).map(s => ({
    submissionId: s.id,
    studentId: s.studentId,
    reason: 'ai-draft-not-reviewed' as const
  }));
  const ready = submissions.filter(s => !s.feedbackDraft);
  const releasedIds = new Set(ready.map(s => s.id));
  const afterSubmissions = data.submissions.map(s => releasedIds.has(s.id) ? {
    ...s,
    state: 'returned' as const,
    grade: {
      ...s.grade!,
      releasedAt: data.now
    }
  } : s);
  const byId = new Map(afterSubmissions.map(s => [s.id, s]));
  const after: Data = {
    ...data,
    submissions: afterSubmissions,
    submissionByCell: new Map([...data.submissionByCell].map(([key, s]) => [key, byId.get(s.id)!]))
  };
  return {
    ...changes('release', data, id => trace(data, id, 'student'), id => trace(after, id, 'student')),
    notSent,
    hash: await snapshotHash(data, data.setup)
  };
}
function changes(kind: GradeChangeSet['kind'], data: Data, before: (id: string) => CalculationTrace, after: (id: string) => CalculationTrace): Omit<GradeChangeSet, 'hash'> {
  let unchanged = 0;
  const all = data.students.map(s => {
    const prior = before(s.id),
      next = after(s.id);
    return {
      studentId: s.id,
      name: s.name,
      from: {
        percent: prior.totals.rounded,
        letter: prior.totals.letter
      },
      to: {
        percent: next.totals.rounded,
        letter: next.totals.letter
      }
    };
  });
  const changed = all.filter(c => {
    const yes = !noop(c.from, c.to);
    if (!yes) unchanged++;
    return yes;
  }).sort((a, b) =>
    Number(b.from.letter !== b.to.letter) - Number(a.from.letter !== a.to.letter)
    || Math.abs((b.to.percent ?? 0) - (b.from.percent ?? 0))
    - Math.abs((a.to.percent ?? 0) - (a.from.percent ?? 0)));
  return {
    kind,
    changes: changed,
    letterChanges: changed.filter(c => c.from.letter !== c.to.letter).length,
    unchanged,
    notSent: []
  };
}
function event(
  ctx: ServiceContext, kind: GradeEvent['kind'], courseId: string,
  studentId: string | null, assignmentId: string | null, before: unknown,
  after: unknown, reason: string | null, batchId: string | null,
  rulesVersion: number, undoOf: string | null = null
): GradeEvent {
  return {
    id: ctx.newId('ge'),
    courseId,
    studentId,
    assignmentId,
    kind,
    before,
    after,
    reason,
    by: user(ctx).id,
    at: ctx.now(),
    batchId,
    undoOf,
    rulesVersion
  };
}
const ensure = (ok: {
  ok: boolean;
}) => {
  if (!ok.ok) fail('conflict', 'Gradebook changed. Refresh and try again.');
};
async function applyReserved(ctx: ServiceContext, writes: GradeWrite[], events: GradeEvent[], request: unknown, snap?: GradeSnapshot) {
  const courseId = events[0].courseId;
  const batchId = events[0].batchId ?? ctx.newId('batch');
  const fingerprint = await hash(request);
  for (const e of events) {
    e.batchId = batchId;
    e.requestFingerprint = fingerprint;
  }
  return ctx.repo.applyGradeWrites(writes, events, snap, {
    courseId, batchId, by: user(ctx).id, fingerprint, result: { ok: true }, at: ctx.now()
  });
}
function writeKey(write: GradeWrite): string {
  switch (write.kind) {
    case 'setup': return `setup:${write.value.courseId}`;
    case 'state': return `state:${write.value.assignmentId}:${write.value.studentId}`;
    case 'final': return `final:${write.value.courseId}:${write.value.studentId}`;
    default: return `submission:${write.value.id}`;
  }
}
function conflictCurrent(value: unknown) {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const actor = (row.override ?? row.excused ?? row.lateWaived ?? row.grade ?? row) as Record<string, unknown>;
  return {
    value: value ?? null,
    by: typeof actor.by === 'string' ? actor.by : typeof actor.gradedBy === 'string' ? actor.gradedBy : typeof row.updatedBy === 'string' ? row.updatedBy : null,
    at: typeof actor.at === 'string' ? actor.at : typeof actor.gradedAt === 'string' ? actor.gradedAt : typeof row.updatedAt === 'string' ? row.updatedAt : null
  };
}
function projected(data: Data, writes: GradeWrite[]): Data {
  const submissions = [...data.submissions],
    states = [...data.states];
  for (const w of writes) {
    if (w.kind === 'submission') {
      const i = submissions.findIndex(s => s.id === w.value.id);
      if (i < 0) submissions.push(w.value);else submissions[i] = w.value;
    } else if (w.kind === 'state') {
      const i = states.findIndex(s => s.assignmentId === w.value.assignmentId && s.studentId === w.value.studentId);
      if (i < 0) states.push(w.value);else states[i] = w.value;
    }
  }
  const submissionByCell = new Map<string, Submission>();
  for (const s of submissions) if (!s.deleted && !submissionByCell.has(`${s.studentId}:${s.assignmentId}`)) submissionByCell.set(`${s.studentId}:${s.assignmentId}`, s);
  return {
    ...data,
    submissions,
    states,
    submissionByCell,
    stateByCell: new Map(states.map(s => [`${s.studentId}:${s.assignmentId}`, s]))
  };
}
function cellResult(data: Data, studentId: string, assignmentId: string, version: number) {
  const d = cellDisplays(trace(data, studentId, 'held')).find(x => x.assignmentId === assignmentId)!;
  return {
    ok: true as const,
    version,
    display: {
      state: d.state,
      adjusted: d.adjusted,
      raw: d.raw,
      label: d.label
    }
  };
}
async function allGradeEvents(ctx: ServiceContext, filter: {
  courseId: string;
  batchId?: string;
  kind?: GradeEvent['kind'];
}): Promise<GradeEvent[]> {
  const all: GradeEvent[] = [];
  let cursor: string | undefined;
  do {
    const page = await ctx.repo.listGradeEvents({
      ...filter,
      cursor,
      limit: 100
    });
    all.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return all;
}
const assignment = async (ctx: ServiceContext, id: string) => (await ctx.repo.getAssignment(id)) ?? fail('not-found', 'Assignment not found.');
const enrolled = async (ctx: ServiceContext, courseId: string, studentId: string) => {
  const u = await ctx.repo.getUser(studentId);
  if (!u || u.role !== 'student' || !(await ctx.repo.listEnrollments({
    courseId,
    userId: studentId
  })).length) fail('invalid', 'Student is not enrolled in this course.');
  return u;
};
const scoreGrade = (ctx: ServiceContext, score: number, old: Submission['grade']): NonNullable<Submission['grade']> => old ? {
  ...old,
  score,
  gradedBy: user(ctx).id,
  gradedAt: ctx.now()
} : {
  score,
  criteria: [],
  feedback: '',
  feedbackOrigin: 'human',
  feedbackProvenance: null,
  gradedBy: user(ctx).id,
  gradedAt: ctx.now(),
  releasedAt: null
};
const rate = new Map<string, {
  minute: number;
  count: number;
}>();
export function resetWhatIfRateLimit() {
  rate.clear();
}
function rateLimit(ctx: ServiceContext) {
  const id = user(ctx).id;
  const minute = Math.floor(Date.parse(ctx.now()) / 60000);
  const item = rate.get(id);
  if (item && item.minute === minute) {
    if (item.count >= 30) fail('rate-limited', 'Too many what-if requests.');
    item.count++;
  } else rate.set(id, {
    minute,
    count: 1
  });
}
export const gradebook: Pick<Service,
  'getGradebookSetup' | 'previewGradebookSetup' | 'saveGradebookSetup'
  | 'dismissSetupCheck' | 'updateGradeCells' | 'setFinalOverride'
  | 'clearFinalOverride' | 'explainGrade' | 'previewRelease'
  | 'releaseGrades' | 'unreleaseGrades' | 'listGradeEvents'
  | 'undoGradeEvent' | 'getMyGrade' | 'whatIfMyGrade'
  | 'getGradebook' | 'exportGradebook'
> = {
  getGradebookSetup: async (ctx, {
    courseId
  }) => {
    await staff(ctx, courseId);
    const assignments = await ctx.repo.listAssignments({
      courseId
    });
    return savedSetup(ctx, courseId, assignments);
  },
  previewGradebookSetup: async (ctx, {
    courseId,
    setup
  }) => {
    await staff(ctx, courseId);
    const data = await load(ctx, courseId);
    validateGradebookSetup(setup, courseId, new Set(data.assignments.map(a => a.id)));
    return setupPreview(data, setup);
  },
  saveGradebookSetup: async (ctx, {
    courseId,
    setup,
    expectedVersion,
    hash: expectedHash
  }) => {
    await teacher(ctx, courseId);
    const data = await load(ctx, courseId);
    validateGradebookSetup(setup, courseId, new Set(data.assignments.map(a => a.id)));
    const preview = await setupPreview(data, setup);
    if (hasBlockingIssues(preview.checks)) fail('invalid', 'Resolve setup checks before saving.');
    if (expectedVersion !== data.setup.version || expectedHash !== preview.changeSet.hash) fail('conflict', 'Gradebook changed since the preview.');
    const rules = (x: GradebookSetup) => ({
      mode: x.mode,
      categories: x.categories,
      late: x.late,
      missing: x.missing,
      extraCredit: x.extraCredit,
      scheme: x.scheme,
      emptyCategory: x.emptyCategory
    });
    const rulesChanged = !noop(rules(data.setup), rules(setup));
    const next = {
      ...setup,
      courseId,
      version: expectedVersion + 1,
      rulesVersion: data.setup.rulesVersion + Number(rulesChanged),
      updatedBy: user(ctx).id,
      updatedAt: ctx.now()
    };
    const result = await applyReserved(ctx, [{
      kind: 'setup',
      value: next,
      expectedVersion
    }], [event(ctx, 'setup', courseId, null, null, data.setup, next, null, null, next.rulesVersion)], { courseId, setup, expectedVersion, hash: expectedHash }, snapshot(data, courseId));
    ensure(result);
    return next;
  },
  dismissSetupCheck: async (ctx, {
    courseId,
    code,
    target
  }) => {
    await teacher(ctx, courseId);
    const data = await load(ctx, courseId);
    const check = checkSetup(data.setup, setupItems(data), ctx.now()).find(c => c.code === code && c.target === target);
    if (!check || check.severity !== 'review') fail('invalid', 'Only review checks may be dismissed.');
    const next = {
      ...data.setup,
      dismissedChecks: [...data.setup.dismissedChecks, {
        code,
        target,
        by: user(ctx).id,
        at: ctx.now()
      }],
      version: data.setup.version + 1,
      updatedBy: user(ctx).id,
      updatedAt: ctx.now()
    };
    ensure(await ctx.repo.putGradebookSetup(next, data.setup.version, event(ctx, 'setup', courseId, null, null, data.setup, next, null, null, next.rulesVersion)));
    return next;
  },
  explainGrade: async (ctx, {
    courseId,
    studentId,
    view
  }) => {
    await staff(ctx, courseId);
    await enrolled(ctx, courseId, studentId);
    const data = await load(ctx, courseId);
    const t = trace(data, studentId, view ?? 'student');
    return {
      trace: t,
      lines: explain(t, 'staff', data.students.find(s => s.id === studentId)!.name),
      finalOverrideVersion: data.finalRevisions.get(studentId)?.version ?? 0
    };
  },
  getMyGrade: async (ctx, {
    courseId
  }) => {
    await student(ctx, courseId);
    const data = await load(ctx, courseId);
    const id = user(ctx).id;
    const t = trace(data, id, 'student');
    const displays = new Map(cellDisplays(t).map(d => [d.assignmentId, d]));
    return {
      trace: t,
      lines: explain(t, 'student', user(ctx).name),
      items: data.assignments.map(a => {
        const s = data.submissionByCell.get(`${id}:${a.id}`) ?? null,
          st = data.stateByCell.get(`${id}:${a.id}`) ?? null,
          d = displays.get(a.id)!;
        const visibleGrade = s?.grade && (s.grade.releasedAt || s.state === 'returned') ? s.grade : null;
        return {
          assignmentId: a.id,
          state: d.state,
          score: d.adjusted,
          feedback: visibleGrade?.feedback ?? null,
          ...(visibleGrade ? { feedbackOrigin: visibleGrade.feedbackOrigin, feedbackProvenance: visibleGrade.feedbackProvenance } : {}),
          studentNote: st?.excused?.studentNote ?? null
        };
      })
    };
  },
  whatIfMyGrade: async (ctx, {
    courseId,
    scores,
    target,
    solveFor
  }) => {
    await student(ctx, courseId);
    rateLimit(ctx);
    const data = await load(ctx, courseId);
    const source = input(data, user(ctx).id, 'student');
    let result;
    try {
      for (const score of scores) {
        const item = source.items.find(i => i.assignmentId === score.assignmentId);
        if (!item || item.itemState?.excused
          || item.submission?.released && item.submission.score !== null) {
          fail('invalid', `What-if score is unavailable for ${score.assignmentId}.`);
        }
      }
      if (solveFor) {
        const item = source.items.find(i => i.assignmentId === solveFor);
        if (!item || item.itemState?.excused || item.submission?.released && item.submission.score !== null) fail('invalid', `What-if target is unavailable for ${solveFor}.`);
      }
      const planning = hypotheticalInput(source, scores, solveFor);
      result = whatIf(planning, scores);
      const needed = target && solveFor ? solveNeeded(planning, scores, solveFor, target) : null;
      return {
        trace: result.trace,
        delta: result.delta,
        changedReasons: result.changedReasons,
        needed: needed ? 'unreachable' in needed ? {
          unreachable: true as const
        } : {
          assignmentId: solveFor!,
          score: needed.score
        } : null
      };
    } catch (error) {
      if (error instanceof RangeError) fail('invalid', error.message);
      throw error;
    }
  },
  getGradebook: async (ctx, {
    courseId,
    view
  }) => {
    await staff(ctx, courseId);
    const data = await load(ctx, courseId);
    const assignments = data.assignments.map(({
      id,
      title,
      points,
      dueAt
    }) => ({
      id,
      title,
      points,
      dueAt
    }));
    const rows = data.students.map(s => {
      const t = trace(data, s.id, view ?? 'student');
      const displays = new Map(cellDisplays(t).map(d => [d.assignmentId, d]));
      return {
        student: {
          id: s.id,
          name: s.name,
          email: s.email
        },
        cells: data.assignments.map(a => {
          const submission = data.submissionByCell.get(`${s.id}:${a.id}`) ?? null,
            d = displays.get(a.id)!;
          const revision = submissionRevision(data.submissions, a.id, s.id);
          return {
            assignmentId: a.id,
            score: d.adjusted,
            state: (submission?.state ?? 'missing') as 'submitted' | 'graded' | 'returned' | 'missing',
            released: !!submission?.grade?.releasedAt || submission?.state === 'returned',
            submissionVersion: revision?.version ?? 0,
            itemStateVersion: data.stateByCell.get(`${s.id}:${a.id}`)?.version ?? 0,
            display: {
              state: d.state,
              adjusted: d.adjusted,
              raw: d.raw,
              label: d.label
            }
          };
        }),
        total: t.totals.weightedEarned,
        possible: t.totals.weightedPossible,
        result: {
          percent: t.totals.rounded,
          letter: t.totals.letter
        },
        finalOverrideVersion: data.finalRevisions.get(s.id)?.version ?? 0
      };
    });
    return {
      assignments,
      rows,
      setup: {
        rulesVersion: data.setup.rulesVersion,
        mode: data.setup.mode
      }
    };
  },
  exportGradebook: async (ctx, {
    courseId,
    format,
    view
  }) => {
    await staff(ctx, courseId);
    const data = await load(ctx, courseId);
    const traces = data.students.map(s => trace(data, s.id, view ?? 'student'));
    const csv = exportCsv(traces, {
      items: data.assignments.map(a => ({
        assignmentId: a.id,
        title: a.title
      })),
      categories: data.setup.categories.map(c => ({
        categoryId: c.id,
        name: c.name
      })),
      students: data.students.map(s => ({
        studentId: s.id,
        name: s.name,
        email: s.email
      }))
    });
    return format === 'json' ? traces.map(toCourseGradeResult) : {
      csv
    };
  },
  updateGradeCells: async (ctx, {
    courseId,
    batchId,
    changes: requests,
    partial
  }) => {
    await teacher(ctx, courseId);
    if (!batchId.trim() || batchId.length > 128 || !requests.length) fail('invalid', 'A batchId and at least one change are required.');
    const fingerprint = await hash({
      changes: requests,
      partial: partial ?? false
    });
    const replay = await ctx.repo.getGradeBatch(courseId, batchId);
    if (replay) {
      if (replay.by !== user(ctx).id || replay.fingerprint !== fingerprint) fail('conflict', 'Batch ID belongs to a different request.');
      return replay.result as { cells: (ReturnType<typeof cellResult> | { conflict: true; current: ReturnType<typeof conflictCurrent> })[] };
    }
    const data = await load(ctx, courseId);
    const seen = new Set<string>(),
      writes: GradeWrite[] = [],
      events: GradeEvent[] = [],
      versions: number[] = [];
    for (const [index, c] of requests.entries()) {
      const key = `${c.assignmentId}:${c.studentId}`;
      if (seen.has(key)) fail('invalid', `changes.${index}: Duplicate cell.`);
      seen.add(key);
      const a = data.assignments.find(a => a.id === c.assignmentId) ?? fail('invalid', `changes.${index}.assignmentId: Assignment is not published in this course.`);
      await enrolled(ctx, courseId, c.studentId);
      const oldState = stateFor(data.states, c.assignmentId, c.studentId),
        oldSubmission = latest(data.submissions, c.assignmentId, c.studentId);
      if (c.op === 'override' && !oldSubmission) fail('invalid', `changes.${index}: Record a score before overriding it.`);
      const released = !!oldSubmission?.grade?.releasedAt || oldSubmission?.state === 'returned';
      const stamp = {
        by: user(ctx).id,
        at: ctx.now()
      };
      if (c.op === 'score' && !released) {
        const score = validateScore(c.value, `changes.${index}.value`);
        const before = oldSubmission;
        const revision = submissionRevision(data.submissions, a.id, c.studentId);
        const next: Submission = oldSubmission ? {
          ...oldSubmission,
          state: 'graded',
          grade: scoreGrade(ctx, score, oldSubmission.grade),
          version: (oldSubmission.version ?? 0) + 1
        } : revision ? {
          ...revision,
          deleted: false,
          state: 'graded',
          grade: scoreGrade(ctx, score, null),
          version: (revision.version ?? 0) + 1
        } : {
          id: ctx.newId('sub'),
          assignmentId: a.id,
          studentId: c.studentId,
          attempt: 1,
          state: 'graded',
          text: '',
          fileId: null,
          link: '',
          submittedAt: ctx.now(),
          grade: scoreGrade(ctx, score, null),
          version: 1,
          source: 'recorded',
          feedbackDraft: null,
          deleted: false
        };
        writes.push({
          kind: 'submission',
          value: next,
          expectedVersion: c.expectedVersion,
          create: !revision
        });
        events.push(event(ctx, 'score', courseId, c.studentId, a.id, before, next, null, batchId, data.setup.rulesVersion));
        versions.push(next.version ?? 1);
        continue;
      }
      if (c.op === 'clear' && !released) {
        if (!oldSubmission) return fail('invalid', `changes.${index}: No score to clear.`);
        const next: Submission = {
          ...oldSubmission,
          grade: null,
          state: 'submitted',
          version: (oldSubmission.version ?? 0) + 1
        };
        writes.push({
          kind: 'submission',
          value: next,
          expectedVersion: c.expectedVersion
        });
        events.push(event(ctx, 'score', courseId, c.studentId, a.id, oldSubmission, next, null, batchId, data.setup.rulesVersion));
        versions.push(next.version ?? 0);
        continue;
      }
      const before = oldState ?? blankState(courseId, a.id, c.studentId);
      const next: StudentItemState = {
        ...before,
        version: before.version + 1
      };
      let kind: GradeEvent['kind'] = 'override',
        reason: string | null = null;
      switch (c.op) {
        case 'score':
        case 'override':
          next.override = {
            score: validateScore(c.value, `changes.${index}.value`),
            reason: validateReason(c.reason, `changes.${index}.reason`),
            ...stamp
          };
          kind = 'override';
          reason = next.override.reason;
          break;
        case 'clear':
        case 'clear-override':
          next.override = null;
          kind = 'override';
          reason = validateReason(c.reason, `changes.${index}.reason`);
          break;
        case 'excuse':
          next.excused = {
            reason: validateReason(c.reason, `changes.${index}.reason`),
            studentNote: validateStudentNote(c.studentNote, `changes.${index}.studentNote`),
            ...stamp
          };
          kind = 'excuse';
          reason = next.excused.reason;
          break;
        case 'unexcuse':
          next.excused = null;
          kind = 'unexcuse';
          break;
        case 'mark-missing':
          next.missing = 'force-missing';
          kind = 'missing';
          break;
        case 'clear-missing':
          next.missing = 'force-not-missing';
          kind = 'missing';
          break;
        case 'extend':
          next.dueAt = validateExtension(c.value, `changes.${index}.value`);
          kind = 'extension';
          break;
        case 'waive-late':
          next.lateWaived = {
            reason: validateReason(c.reason, `changes.${index}.reason`),
            ...stamp
          };
          kind = 'late-waiver';
          reason = next.lateWaived.reason;
          break;
      }
      if (c.op === 'unexcuse' && !oldState?.excused) fail('invalid', `changes.${index}: No excuse to clear.`);
      if ((c.op === 'clear-override' || c.op === 'clear' && released) && !oldState?.override) fail('invalid', `changes.${index}: No override to clear.`);
      writes.push({
        kind: 'state',
        value: next,
        expectedVersion: c.expectedVersion
      });
      events.push(event(ctx, kind, courseId, c.studentId, a.id, oldState, next, reason, batchId, data.setup.rulesVersion));
      versions.push(next.version);
    }
    const partialConflicts = new Map<number, unknown>();
    if (partial) for (const [i, write] of writes.entries()) {
      const current = write.kind === 'state'
        ? stateFor(data.states, write.value.assignmentId, write.value.studentId)
        : write.kind === 'submission'
          ? submissionRevision(data.submissions, write.value.assignmentId, write.value.studentId)
          : null;
      const matches = write.kind === 'submission' && !write.create
        ? current !== null && current.version === write.expectedVersion
        : write.expectedVersion === 0
          ? current === null
          : current !== null && current.version === write.expectedVersion;
      if (!matches) partialConflicts.set(i, current);
    }
    const selected = writes.map((_, i) => i).filter(i => !partialConflicts.has(i));
    const selectedWrites = selected.map(i => writes[i]);
    const predicted = projected(data, selectedWrites);
    const response = {
      cells: requests.map((c, i) => partialConflicts.has(i)
        ? { conflict: true as const, current: conflictCurrent(partialConflicts.get(i)) }
        : cellResult(predicted, c.studentId, c.assignmentId, versions[i]))
    };
    const selectedEvents = selected.map(i => {
      const e = events[i];
      e.requestFingerprint = fingerprint;
      e.result = response.cells[i];
      if (i === selected[0]) e.batchResult = response;
      return e;
    });
    const result = await ctx.repo.applyGradeWrites(selectedWrites, selectedEvents, undefined, {
      courseId, batchId, by: user(ctx).id, fingerprint, result: response, at: ctx.now()
    });
    if (!result.ok) {
      if (result.conflicts.some(c => c.key === `batch:${courseId}:${batchId}`)) {
        const committed = await ctx.repo.getGradeBatch(courseId, batchId);
        if (committed?.by === user(ctx).id && committed.fingerprint === fingerprint) return committed.result as typeof response;
        fail('conflict', 'Batch ID belongs to a different request.');
      }
      const conflicts = new Map(result.conflicts.map(c => [c.key, c.current]));
      return {
        cells: requests.map((c, i) => ({
          conflict: true as const,
          current: conflictCurrent(
            conflicts.get(writeKey(writes[i]))
            ?? stateFor(data.states, c.assignmentId, c.studentId)
            ?? latest(data.submissions, c.assignmentId, c.studentId)
          )
        }))
      };
    }
    return response;
  },
  setFinalOverride: async (ctx, {
    courseId,
    studentId,
    letter,
    percent,
    reason,
    expectedVersion
  }) => {
    await teacher(ctx, courseId);
    await enrolled(ctx, courseId, studentId);
    const setup = await savedSetup(ctx, courseId, await ctx.repo.listAssignments({
      courseId
    }));
    if (letter != null && !setup.scheme.bands.some(b => b.letter === letter)) fail('invalid', 'Unknown scheme letter.');
    if (percent != null && (!Number.isFinite(percent) || percent < 0 || percent > 200)) fail('invalid', 'Percent must be between 0 and 200.');
    if (letter == null && percent == null) fail('invalid', 'Set a letter or percent.');
    const old = await ctx.repo.getFinalOverride(courseId, studentId);
    const revision = (await ctx.repo.listFinalOverrideRevisions(courseId)).find(x => x.studentId === studentId);
    const next: CourseGradeOverride = {
      courseId,
      studentId,
      letter: letter ?? null,
      percent: percent ?? null,
      reason: validateReason(reason),
      by: user(ctx).id,
      at: ctx.now(),
      version: (revision?.version ?? 0) + 1
    };
    ensure(await applyReserved(ctx, [{ kind: 'final', value: next, expectedVersion }], [event(ctx, 'final-override', courseId, studentId, null, old, next, next.reason, null, setup.rulesVersion)], { courseId, studentId, letter, percent, reason, expectedVersion }));
    return {
      ok: true,
      version: next.version
    };
  },
  clearFinalOverride: async (ctx, {
    courseId,
    studentId,
    reason,
    expectedVersion
  }) => {
    await teacher(ctx, courseId);
    await enrolled(ctx, courseId, studentId);
    const old = await ctx.repo.getFinalOverride(courseId, studentId);
    if (!old) fail('invalid', 'No final override exists.');
    const setup = await savedSetup(ctx, courseId, await ctx.repo.listAssignments({
      courseId
    }));
    const revision = (await ctx.repo.listFinalOverrideRevisions(courseId)).find(x => x.studentId === studentId)!;
    const cleared = { ...revision, letter: null, percent: null, reason: '', version: revision.version + 1 };
    ensure(await applyReserved(ctx, [{ kind: 'final', value: {
      courseId,
      studentId,
      clear: true
    }, expectedVersion }], [event(ctx, 'final-override', courseId, studentId, null, old, cleared, validateReason(reason), null, setup.rulesVersion)], { courseId, studentId, reason, expectedVersion }));
    return {
      ok: true,
      version: old!.version + 1
    };
  },
  previewRelease: async (ctx, {
    assignmentId
  }) => {
    const a = await assignment(ctx, assignmentId);
    await teacher(ctx, a.courseId);
    return releasePreview(await load(ctx, a.courseId), assignmentId);
  },
  releaseGrades: async (ctx, {
    assignmentId,
    hash: expectedHash
  }) => {
    const a = await assignment(ctx, assignmentId);
    await teacher(ctx, a.courseId);
    const data = await load(ctx, a.courseId);
    const preview = await releasePreview(data, assignmentId);
    if (expectedHash !== undefined && expectedHash !== preview.hash) fail('conflict', 'Release preview is stale.');
    const eligible = data.submissions.filter(s => s.assignmentId === assignmentId && !s.deleted && s.state === 'graded' && !!s.grade && !s.feedbackDraft);
    const batchId = ctx.newId('release');
    const writes: GradeWrite[] = eligible.map(s => ({
      kind: 'submission',
      value: {
        ...s,
        state: 'returned',
        grade: {
          ...s.grade!,
          releasedAt: data.now
        },
        version: (s.version ?? 0) + 1
      },
      expectedVersion: s.version ?? 0
    }));
    const ev = event(ctx, 'release', a.courseId, null, a.id, eligible, writes.map(w => w.value), null, batchId, data.setup.rulesVersion);
    if (writes.length) ensure(await applyReserved(ctx, writes, [ev], { assignmentId, hash: expectedHash }, snapshot(data, a.courseId)));
    return {
      ok: true,
      released: eligible.map(s => s.id),
      notSent: preview.notSent
    };
  },
  unreleaseGrades: async (ctx, {
    assignmentId
  }) => {
    const a = await assignment(ctx, assignmentId);
    await teacher(ctx, a.courseId);
    const history = await allGradeEvents(ctx, {
      courseId: a.courseId
    });
    const undone = new Set(history.filter(e => e.kind === 'undo').map(e => e.undoOf).filter((id): id is string => !!id));
    const reversed = new Set(history
      .filter(e => (e.kind === 'unrelease' && !undone.has(e.id))
        || (e.kind === 'undo' && history.some(prior => prior.id === e.undoOf && prior.kind === 'release')))
      .map(e => e.undoOf)
      .filter((id): id is string => !!id));
    const release = history.find(e => e.assignmentId === assignmentId && e.kind === 'release' && !reversed.has(e.id)) ?? fail('invalid', 'No release to reverse.');
    const prior = release.after as Submission[];
    const writes: GradeWrite[] = [];
    for (const s of prior) {
      const current = await ctx.repo.getSubmission(s.id);
      if (!current || current.version !== s.version) return fail('conflict', 'A released grade changed.');
      writes.push({
        kind: 'submission',
        value: {
          ...current,
          state: 'graded',
          grade: current.grade ? {
            ...current.grade,
            releasedAt: null
          } : null,
          version: (current.version ?? 0) + 1
        },
        expectedVersion: current.version ?? 0
      });
    }
    const setup = await savedSetup(ctx, a.courseId, await ctx.repo.listAssignments({
      courseId: a.courseId
    }));
    ensure(await applyReserved(ctx, writes, [event(
      ctx, 'unrelease', a.courseId, null, a.id, prior, writes.map(w => w.value),
      null, ctx.newId('unrelease'), setup.rulesVersion, release.id
    )], { assignmentId }));
    return {
      ok: true
    };
  },
  listGradeEvents: async (ctx, {
    courseId,
    studentId,
    assignmentId,
    kind,
    cursor,
    limit
  }) => {
    await staff(ctx, courseId);
    return ctx.repo.listGradeEvents({
      courseId,
      studentId,
      assignmentId,
      kind,
      cursor,
      limit
    });
  },
  undoGradeEvent: async (ctx, {
    eventId
  }) => {
    const target = (await ctx.repo.getGradeEvent(eventId)) ?? fail('not-found', 'Grade event not found.');
    await teacher(ctx, target.courseId);
    if (target.kind === 'undo') fail('invalid', 'Undo events cannot be undone.');
    const already = await allGradeEvents(ctx, {
      courseId: target.courseId,
      kind: 'undo'
    });
    if (already.some(e => e.undoOf === target.id)) fail('conflict', 'Event was already undone.');
    const group = target.batchId ? await allGradeEvents(ctx, {
      courseId: target.courseId,
      batchId: target.batchId
    }) : [target];
    if (target.batchId) {
      const reservation = await ctx.repo.getGradeBatch(target.courseId, target.batchId);
      if (!reservation || !group.length || group.some(e => e.kind === 'undo' || e.by !== reservation.by || e.requestFingerprint !== reservation.fingerprint))
        fail('conflict', 'Batch history does not match its reservation.');
    }
    if (group.some(e => Date.parse(ctx.now()) < Date.parse(e.at) || Date.parse(ctx.now()) - Date.parse(e.at) > 30 * 86400000)) fail('conflict', 'Undo window has passed.');
    if (group.some(e => already.some(undo => undo.undoOf === e.id))) fail('conflict', 'Event was already undone.');
    const writes: GradeWrite[] = [],
      events: GradeEvent[] = [];
    const undoBatchId = ctx.newId('undo');
    for (const e of group) {
      let write: GradeWrite;
      if (e.kind === 'setup') {
        const current = await ctx.repo.getGradebookSetup(e.courseId);
        if (!current || !noop(current, e.after)) return fail('conflict', 'Setup changed.');
        const previous = e.before as GradebookSetup;
        write = {
          kind: 'setup',
          value: {
            ...previous,
            version: current.version + 1,
            rulesVersion: current.rulesVersion + 1,
            updatedBy: user(ctx).id,
            updatedAt: ctx.now()
          },
          expectedVersion: current.version
        };
      } else if (e.kind === 'final-override') {
        const revision = (await ctx.repo.listFinalOverrideRevisions(e.courseId)).find(x => x.studentId === e.studentId);
        if (!noop(revision ?? null, e.after)) return fail('conflict', 'Final override changed.');
        const previous = e.before as CourseGradeOverride | null;
        write = {
          kind: 'final',
          value: previous ? {
            ...previous,
            version: (revision?.version ?? 0) + 1,
            by: user(ctx).id,
            at: ctx.now()
          } : {
            courseId: e.courseId,
            studentId: e.studentId!,
            clear: true
          },
          expectedVersion: revision?.version ?? 0
        };
      } else if (e.kind === 'release' || e.kind === 'unrelease') {
        const before = e.before as Submission[],
          after = e.after as Submission[];
        for (let i = 0; i < after.length; i++) {
          const current = await ctx.repo.getSubmission(after[i].id);
          if (!sameSubmission(current, after[i])) return fail('conflict', 'Released grade changed.');
          writes.push({
            kind: 'submission',
            value: {
              ...before[i],
              version: (current?.version ?? 0) + 1
            },
            expectedVersion: current?.version ?? 0
          });
        }
        events.push(event(ctx, 'undo', e.courseId, e.studentId, e.assignmentId, e.after, e.before, null, undoBatchId, e.rulesVersion, e.id));
        continue;
      } else if (['score'].includes(e.kind)) {
        const current = await ctx.repo.getSubmission((e.after as Submission).id);
        if (!sameSubmission(current, e.after as Submission)) return fail('conflict', 'Score changed.');
        const before = e.before as Submission | null;
        write = before ? {
          kind: 'submission',
          value: {
            ...before,
            version: (current?.version ?? 0) + 1
          },
          expectedVersion: current?.version ?? 0
        } : {
          kind: 'submission-delete',
          value: {
            id: (e.after as Submission).id,
            clear: true
          },
          expectedVersion: current?.version ?? 0
        };
      } else {
        const current = (await ctx.repo.listStudentItemStates({
          courseId: e.courseId,
          studentId: e.studentId!,
          assignmentId: e.assignmentId!
        }))[0] ?? null;
        if (!noop(current, e.after)) return fail('conflict', 'Cell changed.');
        const before = e.before as StudentItemState | null;
        write = {
          kind: 'state',
          value: {
            ...(before ?? blankState(e.courseId, e.assignmentId!, e.studentId!)),
            version: (current?.version ?? 0) + 1
          },
          expectedVersion: current?.version ?? 0
        };
      }
      writes.push(write);
      events.push(event(ctx, 'undo', e.courseId, e.studentId, e.assignmentId, e.after, e.before, null, undoBatchId, e.rulesVersion, e.id));
    }
    ensure(await applyReserved(ctx, writes, events, { eventId }));
    return {
      ok: true
    };
  }
};

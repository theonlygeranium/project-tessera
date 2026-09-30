import type { CourseGradeOverride, GradebookSetup, StudentItemState, GradeEvent, Submission } from '../shared/domain';
import type { GradeBatch, GradeSnapshot, GradeWrite, GradeWriteResult } from '../shared/repo';
import { ApiError } from '../shared/api';
const json = (value: unknown) => JSON.stringify(value);
const parse = <T,>(value: string): T => JSON.parse(value) as T;
function key(write: GradeWrite): string {
  switch (write.kind) {
    case 'setup': return `setup:${write.value.courseId}`;
    case 'state': return `state:${write.value.assignmentId}:${write.value.studentId}`;
    case 'final': return `final:${write.value.courseId}:${write.value.studentId}`;
    default: return `submission:${write.value.id}`;
  }
}
const version = (value: unknown) => value && typeof value === 'object' && 'version' in value ? Number(value.version ?? 0) : null;
function matchesWrite(w: GradeWrite, row: unknown): boolean {
  if (w.kind === 'submission' && !w.create) {
    return row !== null && version(row) === w.expectedVersion;
  }
  if (w.kind === 'submission' && w.create && w.priorId) {
    return row !== null && (row as Submission).id === w.priorId && version(row) === w.expectedVersion;
  }
  if (w.expectedVersion === 0) return row === null;
  return row !== null && version(row) === w.expectedVersion;
}
export class D1Gradebook {
  constructor(private readonly db: D1Database) {}
  private async first<T>(sql: string, ...bind: (string | number | null)[]): Promise<T | null> {
    return await this.db.prepare(sql).bind(...bind).first<T>();
  }
  private async all<T>(sql: string, ...bind: (string | number | null)[]): Promise<T[]> {
    return (await this.db.prepare(sql).bind(...bind).all<T>()).results;
  }
  async setup(courseId: string): Promise<GradebookSetup | null> {
    const row = await this.first<{
      data: string;
    }>('SELECT data FROM gradebook_setups WHERE course_id=?', courseId);
    return row ? parse(row.data) : null;
  }
  async states(filter: {
    courseId: string;
    studentId?: string;
    assignmentId?: string;
  }): Promise<StudentItemState[]> {
    const rows = await this.all<{
      data: string;
    }>(`SELECT data FROM student_item_states WHERE course_id=?
      AND (? IS NULL OR student_id=?) AND (? IS NULL OR assignment_id=?)
      ORDER BY student_id,assignment_id`,
      filter.courseId, filter.studentId ?? null, filter.studentId ?? null,
      filter.assignmentId ?? null, filter.assignmentId ?? null);
    return rows.map(r => parse(r.data));
  }
  async final(courseId: string, studentId: string): Promise<CourseGradeOverride | null> {
    const row = await this.first<{
      data: string;
    }>('SELECT data FROM course_grade_overrides WHERE course_id=? AND student_id=?', courseId, studentId);
    const value = row ? parse<CourseGradeOverride>(row.data) : null;
    return value && (value.letter !== null || value.percent !== null) ? value : null;
  }
  async batch(courseId: string, batchId: string): Promise<GradeBatch | null> {
    const row = await this.first<{ by_user: string; fingerprint: string; result: string; at: string }>(
      'SELECT by_user,fingerprint,result,at FROM grade_batches WHERE course_id=? AND batch_id=?', courseId, batchId
    );
    return row ? { courseId, batchId, by: row.by_user, fingerprint: row.fingerprint, result: parse(row.result), at: row.at } : null;
  }
  async finalRevisions(courseId: string): Promise<CourseGradeOverride[]> {
    return (await this.all<{
      data: string;
    }>('SELECT data FROM course_grade_overrides WHERE course_id=? ORDER BY student_id', courseId)).map(r => parse(r.data));
  }
  async finals(courseId: string): Promise<CourseGradeOverride[]> {
    return (await this.finalRevisions(courseId)).filter(v => v.letter !== null || v.percent !== null);
  }
  async event(id: string): Promise<GradeEvent | null> {
    const row = await this.first<{
      data: string;
      seq: number;
    }>('SELECT data,seq FROM grade_events WHERE id=?', id);
    return row ? {
      ...parse<GradeEvent>(row.data),
      seq: row.seq
    } : null;
  }
  async events(filter: {
    courseId: string;
    studentId?: string;
    assignmentId?: string;
    kind?: GradeEvent['kind'];
    batchId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    items: GradeEvent[];
    nextCursor: string | null;
  }> {
    let cursor: number | null = null;
    try {
      if (filter.cursor) {
        const value: unknown = JSON.parse(atob(filter.cursor));
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error('Bad cursor');
        cursor = value;
      }
    } catch {
      throw new ApiError('invalid', 'Invalid event cursor.');
    }
    const size = Math.max(1, Math.min(100, filter.limit ?? 20));
    const rows = await this.all<{
      data: string;
      seq: number;
    }>(`SELECT data,seq FROM grade_events WHERE course_id=?
      AND (? IS NULL OR student_id=?) AND (? IS NULL OR assignment_id=?)
      AND (? IS NULL OR kind=?) AND (? IS NULL OR batch_id=?)
      AND (? IS NULL OR seq<?) ORDER BY seq DESC LIMIT ?`,
      filter.courseId, filter.studentId ?? null, filter.studentId ?? null,
      filter.assignmentId ?? null, filter.assignmentId ?? null,
      filter.kind ?? null, filter.kind ?? null, filter.batchId ?? null,
      filter.batchId ?? null, cursor, cursor, size + 1);
    const items = rows.slice(0, size).map(r => ({
      ...parse<GradeEvent>(r.data),
      seq: r.seq
    }));
    return {
      items,
      nextCursor: rows.length > size ? btoa(json(items.at(-1)!.seq)) : null
    };
  }
  async append(event: GradeEvent): Promise<void> {
    if (event.batchId) throw new ApiError('conflict', 'Batched events require a reservation.');
    await this.db.prepare(`INSERT INTO grade_events
      (id,course_id,seq,student_id,assignment_id,kind,data,by_user,at,batch_id)
      SELECT ?,?,COALESCE(MAX(seq),0)+1,?,?,?,?,?,?,?
      FROM grade_events WHERE course_id=?`).bind(
      event.id, event.courseId, event.studentId, event.assignmentId, event.kind,
      json(event), event.by, event.at, event.batchId, event.courseId
    ).run();
  }
  private snapshotChecks(snapshot: GradeSnapshot): {
    sql: string;
    bind: (string | number | null)[];
  }[] {
    const checks: {
      sql: string;
      bind: (string | number | null)[];
    }[] = [];
    const add = (sql: string, ...bind: (string | number | null)[]) => checks.push({
      sql,
      bind
    });
    const courseId = snapshot.courseId;
    add(
      snapshot.setup.version === 0
        ? 'NOT EXISTS(SELECT 1 FROM gradebook_setups WHERE course_id=?)'
        : 'EXISTS(SELECT 1 FROM gradebook_setups WHERE course_id=? AND version=? AND data=?)',
      courseId, ...(snapshot.setup.version === 0 ? [] : [snapshot.setup.version, json(snapshot.setup)])
    );
    add('(SELECT COUNT(*) FROM assignments WHERE course_id=?)=?', courseId, snapshot.assignments.length);
    for (const a of snapshot.assignments) add(
      `EXISTS(SELECT 1 FROM assignments WHERE course_id=? AND id=? AND points IS ?
        AND due_at IS ? AND status IS ? AND category_id IS ?
        AND COALESCE(extra_credit,0)=? AND COALESCE(counts_toward_grade,1)=? AND position=?)`,
      courseId, a.id, a.points, a.dueAt, a.status, a.categoryId ?? null,
      Number(a.extraCredit ?? false), Number(a.countsTowardGrade ?? true), a.position
    );
    add('(SELECT COUNT(*) FROM enrollments e JOIN users u ON u.id=e.user_id WHERE e.course_id=? AND u.role=?)=?', courseId, 'student', snapshot.studentIds.length);
    for (const id of snapshot.studentIds) add(
      'EXISTS(SELECT 1 FROM enrollments e JOIN users u ON u.id=e.user_id WHERE e.course_id=? AND e.user_id=? AND u.role=?)',
      courseId, id, 'student'
    );
    add('(SELECT COUNT(*) FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE a.course_id=?)=?', courseId, snapshot.submissions.length);
    for (const s of snapshot.submissions) add(
      `EXISTS(SELECT 1 FROM submissions WHERE id=? AND version=? AND state=?
        AND grade IS ? AND feedback_draft IS ? AND submitted_at=? AND deleted=?)`,
      s.id, s.version ?? 0, s.state, s.grade ? json(s.grade) : null,
      s.feedbackDraft ? json(s.feedbackDraft) : null, s.submittedAt, Number(s.deleted ?? false)
    );
    add('(SELECT COUNT(*) FROM student_item_states WHERE course_id=?)=?', courseId, snapshot.states.length);
    for (const state of snapshot.states) add(
      'EXISTS(SELECT 1 FROM student_item_states WHERE course_id=? AND assignment_id=? AND student_id=? AND version=? AND data=?)',
      courseId, state.assignmentId, state.studentId, state.version, json(state)
    );
    add('(SELECT COUNT(*) FROM course_grade_overrides WHERE course_id=?)=?', courseId, snapshot.finalRevisions.length);
    for (const value of snapshot.finalRevisions) add(
      'EXISTS(SELECT 1 FROM course_grade_overrides WHERE course_id=? AND student_id=? AND version=? AND data=?)',
      courseId, value.studentId, value.version, json(value)
    );
    return checks;
  }
  private async snapshotMatches(snapshot: GradeSnapshot): Promise<boolean> {
    for (const check of this.snapshotChecks(snapshot)) {
      const row = await this.first<{
        ok: number;
      }>(`SELECT (${check.sql}) AS ok`, ...check.bind);
      if (!row?.ok) return false;
    }
    return true;
  }
  async apply(writes: GradeWrite[], events: GradeEvent[], snapshot?: GradeSnapshot, batch?: GradeBatch): Promise<GradeWriteResult> {
    if (events.some(e => e.batchId && (!batch || e.courseId !== batch.courseId || e.batchId !== batch.batchId || e.by !== batch.by || e.requestFingerprint !== batch.fingerprint)))
      return {ok:false,conflicts:[{key:'batch:unreserved',current:null}]};
    const current = async (w: GradeWrite): Promise<unknown> => {
      switch (w.kind) {
        case 'setup':
          return this.setup(w.value.courseId);
        case 'state':
          return (await this.states({
            courseId: w.value.courseId,
            studentId: w.value.studentId,
            assignmentId: w.value.assignmentId
          }))[0] ?? null;
        case 'final':
          return (await this.finalRevisions(w.value.courseId)).find(v => v.studentId === w.value.studentId) ?? null;
        case 'submission':
          return w.create ? this.submissionForCell(w.value.assignmentId, w.value.studentId) : this.submission(w.value.id);
        case 'submission-delete':
          return this.submission(w.value.id);
      }
    };
    const conflicts: {
      key: string;
      current: unknown;
    }[] = [];
    for (const w of writes) {
      const row = await current(w);
      const valid = matchesWrite(w, row);
      if (!valid) conflicts.push({
        key: key(w),
        current: row
      });
    }
    if (snapshot && !(await this.snapshotMatches(snapshot))) conflicts.push({
      key: `snapshot:${snapshot.courseId}`,
      current: null
    });
    if (batch && (await this.batch(batch.courseId, batch.batchId) || await this.first<{id:string}>('SELECT id FROM grade_events WHERE course_id=? AND batch_id=? LIMIT 1', batch.courseId, batch.batchId))) conflicts.push({
      key: `batch:${batch.courseId}:${batch.batchId}`,
      current: null
    });
    if (conflicts.length) return {
      ok: false,
      conflicts
    };
    const statements: D1PreparedStatement[] = [];
    if (batch) statements.push(this.db.prepare(
      'INSERT INTO grade_batches(course_id,batch_id,by_user,fingerprint,result,at) VALUES (?,?,?,?,?,?)'
    ).bind(batch.courseId, batch.batchId, batch.by, batch.fingerprint, json(batch.result), batch.at));
    if (snapshot) for (const check of this.snapshotChecks(snapshot)) {
      statements.push(this.db.prepare(
        `INSERT INTO gradebook_setups(course_id,data,version,rules_version)
          SELECT ?,NULL,0,0 WHERE NOT (${check.sql})`
      ).bind(`__snapshot__${snapshot.courseId}`, ...check.bind));
    }
    for (const w of writes) {
      const where = w.kind === 'setup' ? {
        table: 'gradebook_setups',
        condition: 'course_id=?',
        ids: [w.value.courseId]
      } : w.kind === 'state' ? {
        table: 'student_item_states',
        condition: 'assignment_id=? AND student_id=?',
        ids: [w.value.assignmentId, w.value.studentId]
      } : w.kind === 'final' ? {
        table: 'course_grade_overrides',
        condition: 'course_id=? AND student_id=?',
        ids: [w.value.courseId, w.value.studentId]
      } : w.kind === 'submission' && w.create ? {
        table: 'submissions',
        condition: 'assignment_id=? AND student_id=?',
        ids: [w.value.assignmentId, w.value.studentId]
      } : {
        table: 'submissions',
        condition: 'id=?',
        ids: [w.value.id]
      };
      const expression = w.kind === 'submission' && w.create && w.priorId
        ? `NOT EXISTS(SELECT 1 FROM submissions WHERE assignment_id=? AND student_id=? ORDER BY attempt DESC, submitted_at DESC LIMIT 1 OFFSET 0) OR
           (SELECT id FROM submissions WHERE assignment_id=? AND student_id=? ORDER BY attempt DESC, submitted_at DESC LIMIT 1)<>? OR
           NOT EXISTS(SELECT 1 FROM submissions WHERE id=? AND version=?)`
        : w.expectedVersion === 0 && !(w.kind === 'submission' && !w.create)
        ? `EXISTS(SELECT 1 FROM ${where.table} WHERE ${where.condition})`
        : `NOT EXISTS(SELECT 1 FROM ${where.table} WHERE ${where.condition} AND version=?)`;
      // A stale guard inserts an invalid NULL data value, aborting the whole D1 batch.
      statements.push(this.db.prepare(
        `INSERT INTO gradebook_setups(course_id,data,version,rules_version)
          SELECT ?,NULL,0,0 WHERE ${expression}`
      ).bind(`__guard__${key(w)}`, ...(w.kind === 'submission' && w.create && w.priorId
        ? [w.value.assignmentId,w.value.studentId,w.value.assignmentId,w.value.studentId,w.priorId,w.priorId,w.expectedVersion]
        : [...where.ids,...(expression.includes('version=?') ? [w.expectedVersion] : [])])));
      if (w.kind === 'setup') {
        const v = w.value;
        statements.push(this.db.prepare(`INSERT INTO gradebook_setups
          (course_id,data,version,rules_version,updated_by,updated_at) VALUES (?,?,?,?,?,?)
          ON CONFLICT(course_id) DO UPDATE SET data=excluded.data,version=excluded.version,
          rules_version=excluded.rules_version,updated_by=excluded.updated_by,updated_at=excluded.updated_at`
        ).bind(v.courseId, json(v), v.version, v.rulesVersion, v.updatedBy, v.updatedAt));
      } else if (w.kind === 'state') {
        const v = w.value;
        statements.push(this.db.prepare(`INSERT INTO student_item_states
          (assignment_id,student_id,course_id,data,version) VALUES (?,?,?,?,?)
          ON CONFLICT(assignment_id,student_id) DO UPDATE SET
          data=excluded.data,version=excluded.version`
        ).bind(v.assignmentId, v.studentId, v.courseId, json(v), v.version));
      } else if (w.kind === 'final') {
        const v = w.value;
        if ('clear' in v) {
          const old = (await current(w)) as CourseGradeOverride;
          const tombstone = {
            ...old,
            letter: null,
            percent: null,
            reason: '',
            version: old.version + 1
          };
          statements.push(this.db.prepare(
            'UPDATE course_grade_overrides SET data=?,version=? WHERE course_id=? AND student_id=? AND version=?'
          ).bind(json(tombstone), tombstone.version, v.courseId, v.studentId, w.expectedVersion));
        } else {
          statements.push(this.db.prepare(`INSERT INTO course_grade_overrides
            (course_id,student_id,data,version) VALUES (?,?,?,?)
            ON CONFLICT(course_id,student_id) DO UPDATE SET data=excluded.data,version=excluded.version`
          ).bind(v.courseId, v.studentId, json(v), v.version));
        }
      } else if (w.kind === 'submission-delete') {
        statements.push(this.db.prepare(
          'UPDATE submissions SET deleted=1,grade=NULL,version=version+1 WHERE id=? AND version=?'
        ).bind(w.value.id, w.expectedVersion));
      } else {
        const v = w.value;
        if (w.create) {
          statements.push(this.db.prepare(
            `INSERT INTO submissions
              (id,assignment_id,student_id,attempt,state,text,file_id,link,submitted_at,grade,version,source,feedback_draft,deleted)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0)`
          ).bind(
            v.id, v.assignmentId, v.studentId, v.attempt, v.state, v.text, v.fileId,
            v.link, v.submittedAt, v.grade ? json(v.grade) : null, v.version ?? 1,
            v.source ?? 'student', v.feedbackDraft ? json(v.feedbackDraft) : null
          ));
        } else {
          statements.push(this.db.prepare(
            'UPDATE submissions SET attempt=?,state=?,text=?,file_id=?,link=?,submitted_at=?,grade=?,version=?,source=?,feedback_draft=?,deleted=0 WHERE id=? AND version=?'
          ).bind(
            v.attempt, v.state, v.text, v.fileId, v.link, v.submittedAt,
            v.grade ? json(v.grade) : null, v.version ?? 1, v.source ?? 'student',
            v.feedbackDraft ? json(v.feedbackDraft) : null, v.id, w.expectedVersion
          ));
        }
      }
    }
    for (const e of events) statements.push(this.db.prepare(`INSERT INTO grade_events
      (id,course_id,seq,student_id,assignment_id,kind,data,by_user,at,batch_id)
      SELECT ?,?,COALESCE(MAX(seq),0)+1,?,?,?,?,?,?,?
      FROM grade_events WHERE course_id=?`
    ).bind(e.id, e.courseId, e.studentId, e.assignmentId, e.kind,
      json(e), e.by, e.at, e.batchId, e.courseId));
    try {
      await this.db.batch(statements);
    } catch (error) {
      const stale = [];
      if (batch && await this.batch(batch.courseId, batch.batchId)) stale.push({
        key: `batch:${batch.courseId}:${batch.batchId}`,
        current: null
      });
      for (const w of writes) {
        const row = await current(w);
        const valid = matchesWrite(w, row);
        if (!valid) stale.push({
          key: key(w),
          current: row
        });
      }
      if (snapshot && !(await this.snapshotMatches(snapshot))) stale.push({
        key: `snapshot:${snapshot.courseId}`,
        current: null
      });
      if (stale.length) return {
        ok: false,
        conflicts: stale
      };
      throw error;
    }
    return {
      ok: true,
      versions: writes.map(w => ({
        key: key(w),
        version: 'clear' in w.value ? w.expectedVersion + 1 : w.value.version ?? 0
      }))
    };
  }
  private async submission(id: string): Promise<Submission | null> {
    const row = await this.first<Record<string, unknown>>('SELECT * FROM submissions WHERE id=?', id);
    return row ? {
      id: String(row.id),
      assignmentId: String(row.assignment_id),
      studentId: String(row.student_id),
      attempt: Number(row.attempt),
      state: row.state as Submission['state'],
      text: String(row.text),
      fileId: row.file_id as string | null,
      link: String(row.link),
      submittedAt: String(row.submitted_at),
      grade: row.grade ? parse(String(row.grade)) : null,
      version: Number(row.version ?? 0),
      source: (row.source ?? 'student') as Submission['source'],
      feedbackDraft: row.feedback_draft ? parse(String(row.feedback_draft)) : null,
      ...(row.deleted ? {
        deleted: true
      } : {})
    } : null;
  }
  private async submissionForCell(assignmentId: string, studentId: string): Promise<Submission | null> {
    const row = await this.first<{
      id: string;
    }>('SELECT id FROM submissions WHERE assignment_id=? AND student_id=? ORDER BY attempt DESC,submitted_at DESC LIMIT 1', assignmentId, studentId);
    return row ? this.submission(row.id) : null;
  }
}

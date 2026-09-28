// D1 implementation of Repo. JSON columns are text; booleans are 0/1.
// `put*` upserts. replaceBlocks, setEnrollments, deleteLesson, and reset each run
// in one batch so a failure leaves the previous rows in place.
import type {
  AccessibleFormat, ActivityKind, Adaptation, AlignableKind, ApiToken, Assignment, Block, BlockContent, BuilderSession, Certificate, CompletionEvent, Course, CourseTemplate, FileRecord, Id, Institution, Invitation, Lesson, ManagerConsent, Module, Outcome, OutcomeLink, Program, ReportingLine, Requirement, Role, Rubric, Submission, TestOut, TutorSetting, User, DesignSession, InstructorProfile,
} from '../shared/domain';
import type {
  AnnouncementRead, Enrollment, Repo, StoredAnnouncement, StoredProgress, FileVersion, StoredScan, StoredFormat, GenerationJob, StoredTutorSession, StoredReadinessItem, TestOutAttempt,
} from '../shared/repo';
import type { SeedData } from '../shared/seed';
import { ApiError } from '../shared/api';
import { normalizeDesignSession } from '../shared/service/design-session-shape';

type SqlBind = string | number | null;
const jobNotes = (job: GenerationJob) => JSON.stringify(job.notes?.length ? { failures: job.failures, notes: job.notes } : job.failures);

const DELETE_ORDER = [
  'manager_consents', 'reporting_lines', 'certificates', 'test_out_attempts', 'test_outs',
  'completion_events', 'requirements', 'outcome_links', 'outcomes', 'readiness_items', 'rubrics', 'templates', 'programs',
  // Night 2 tables first (they reference users, courses, modules, files).
  'idempotency_keys', 'api_tokens', 'format_jobs', 'file_versions', 'access_scans', 'submissions', 'assignments',
  'tutor_sessions', 'tutor_settings', 'adaptations', 'invitations', 'generation_jobs', 'design_sessions', 'instructor_profiles', 'files',
  'announcement_reads',
  'progress',
  'blocks',
  'announcements',
  'builder_sessions',
  'lessons',
  'modules',
  'enrollments',
  'courses',
  'users',
  'institution',
] as const;

export class D1Repo implements Repo {
  constructor(private readonly db: D1Database) {}

  async getInstitution(): Promise<Institution> {
    const row = await this.first<InstitutionRow>('SELECT * FROM institution LIMIT 1');
    if (!row) throw new Error('No institution is stored.');
    return institutionFromRow(row);
  }

  async putInstitution(institution: Institution): Promise<void> {
    await this.institutionStmt(institution).run();
  }

  async getUser(id: Id): Promise<User | null> {
    const row = await this.first<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
    return row ? userFromRow(row) : null;
  }

  async listUsers(filter?: { role?: Role }): Promise<User[]> {
    const role = filter?.role ?? null;
    const rows = await this.all<UserRow>(
      `SELECT * FROM users
       WHERE (? IS NULL OR role = ?)
       ORDER BY CASE role
         WHEN 'administrator' THEN 0
         WHEN 'instructor' THEN 1
         WHEN 'student' THEN 2
         ELSE 3
       END, name, id`,
      [role, role],
    );
    return rows.map(userFromRow);
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const row = await this.first<UserRow>('SELECT * FROM users WHERE lower(email) = lower(?)', [email]);
    return row ? userFromRow(row) : null;
  }

  async putUser(user: User): Promise<void> {
    await this.userStmt(user).run();
  }

  async getCourse(id: Id): Promise<Course | null> {
    const row = await this.first<CourseRow>('SELECT * FROM courses WHERE id = ?', [id]);
    return row ? courseFromRow(row) : null;
  }

  async listCourses(): Promise<Course[]> {
    const rows = await this.all<CourseRow>('SELECT * FROM courses ORDER BY code, id');
    return rows.map(courseFromRow);
  }

  async putCourse(course: Course): Promise<void> {
    await this.courseStmt(course).run();
  }

  async listEnrollments(filter: { courseId?: Id; userId?: Id }): Promise<Enrollment[]> {
    const courseId = filter.courseId ?? null;
    const userId = filter.userId ?? null;
    const rows = await this.all<EnrollmentRow>(
      `SELECT course_id, user_id FROM enrollments
       WHERE (? IS NULL OR course_id = ?) AND (? IS NULL OR user_id = ?)
       ORDER BY course_id, user_id`,
      [courseId, courseId, userId, userId],
    );
    return rows.map((row) => ({ courseId: row.course_id, userId: row.user_id }));
  }

  async setEnrollments(courseId: Id, userIds: Id[]): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM enrollments WHERE course_id = ?').bind(courseId),
      ...userIds.map((userId) => this.enrollmentStmt(courseId, userId)),
    ]);
  }
  async addEnrollment(courseId: Id, userId: Id): Promise<void> {
    await this.db.prepare('INSERT OR IGNORE INTO enrollments (course_id, user_id) VALUES (?, ?)').bind(courseId, userId).run();
  }

  async getModule(id: Id): Promise<Module | null> {
    const row = await this.first<ModuleRow>('SELECT * FROM modules WHERE id = ?', [id]);
    return row ? moduleFromRow(row) : null;
  }

  async listModules(courseId: Id): Promise<Module[]> {
    const rows = await this.all<ModuleRow>(
      'SELECT * FROM modules WHERE course_id = ? ORDER BY position, id',
      [courseId],
    );
    return rows.map(moduleFromRow);
  }

  async putModule(module: Module): Promise<void> {
    await this.moduleStmt(module).run();
  }

  async deleteModule(id: Id): Promise<void> {
    await this.db.prepare('DELETE FROM modules WHERE id = ?').bind(id).run();
  }

  async getLesson(id: Id): Promise<Lesson | null> {
    const row = await this.first<LessonRow>('SELECT * FROM lessons WHERE id = ?', [id]);
    return row ? lessonFromRow(row) : null;
  }

  async listLessons(filter: { courseId?: Id; moduleId?: Id }): Promise<Lesson[]> {
    const courseId = filter.courseId ?? null;
    const moduleId = filter.moduleId ?? null;
    const rows = await this.all<LessonRow>(
      `SELECT l.* FROM lessons l
       JOIN modules m ON m.id = l.module_id
       WHERE l.variant_of IS NULL AND (? IS NULL OR l.course_id = ?) AND (? IS NULL OR l.module_id = ?)
       ORDER BY m.position, l.position, l.id`,
      [courseId, courseId, moduleId, moduleId],
    );
    return rows.map(lessonFromRow);
  }

  async putLesson(lesson: Lesson): Promise<void> {
    await this.lessonStmt(lesson).run();
  }

  async deleteLesson(id: Id): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM blocks WHERE lesson_id IN (SELECT id FROM lessons WHERE id = ? OR variant_of = ?)').bind(id, id),
      this.db.prepare('DELETE FROM progress WHERE lesson_id IN (SELECT id FROM lessons WHERE id = ? OR variant_of = ?)').bind(id, id),
      this.db.prepare('DELETE FROM lessons WHERE id = ?').bind(id),
    ]);
  }

  async getBlock(id: Id): Promise<Block | null> {
    const row = await this.first<BlockRow>('SELECT * FROM blocks WHERE id = ?', [id]);
    return row ? blockFromRow(row) : null;
  }

  async listBlocks(lessonId: Id): Promise<Block[]> {
    const rows = await this.all<BlockRow>(
      'SELECT * FROM blocks WHERE lesson_id = ? ORDER BY position, id',
      [lessonId],
    );
    return rows.map(blockFromRow);
  }

  async replaceBlocks(lessonId: Id, blocks: Block[]): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM blocks WHERE lesson_id = ?').bind(lessonId),
      ...blocks.map((block) => this.blockStmt(block)),
    ]);
  }

  async putBlock(block: Block): Promise<void> {
    await this.blockStmt(block).run();
  }

  async deleteBlock(id: Id): Promise<void> {
    await this.db.prepare('DELETE FROM blocks WHERE id = ?').bind(id).run();
  }

  async getAnnouncement(id: Id): Promise<StoredAnnouncement | null> {
    const row = await this.first<AnnouncementRow>('SELECT * FROM announcements WHERE id = ?', [id]);
    return row ? announcementFromRow(row) : null;
  }

  async listAnnouncements(filter: { courseIds?: Id[] }): Promise<StoredAnnouncement[]> {
    const ids = filter.courseIds;
    if (ids && ids.length === 0) return [];
    const where = ids ? `WHERE course_id IN (${placeholders(ids.length)})` : '';
    const rows = await this.all<AnnouncementRow>(
      `SELECT * FROM announcements ${where}
       ORDER BY COALESCE(published_at, created_at) DESC, id`,
      ids ?? [],
    );
    return rows.map(announcementFromRow);
  }

  async putAnnouncement(announcement: StoredAnnouncement): Promise<void> {
    await this.announcementStmt(announcement).run();
  }

  async deleteAnnouncement(id: Id): Promise<void> {
    await this.db.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
  }

  async listReads(filter: { userId?: Id; announcementId?: Id }): Promise<AnnouncementRead[]> {
    const userId = filter.userId ?? null;
    const announcementId = filter.announcementId ?? null;
    const rows = await this.all<ReadRow>(
      `SELECT announcement_id, user_id, read_at FROM announcement_reads
       WHERE (? IS NULL OR user_id = ?) AND (? IS NULL OR announcement_id = ?)
       ORDER BY announcement_id, user_id`,
      [userId, userId, announcementId, announcementId],
    );
    return rows.map((row) => ({ announcementId: row.announcement_id, userId: row.user_id, readAt: row.read_at }));
  }

  async putRead(read: AnnouncementRead): Promise<void> {
    // A second read keeps the first readAt.
    await this.readStmt(read).run();
  }

  async getProgress(userId: Id, lessonId: Id): Promise<StoredProgress | null> {
    const row = await this.first<ProgressRow>(
      'SELECT * FROM progress WHERE user_id = ? AND lesson_id = ?',
      [userId, lessonId],
    );
    return row ? progressFromRow(row) : null;
  }

  async listProgress(filter: { userId?: Id; lessonIds?: Id[] }): Promise<StoredProgress[]> {
    const clauses: string[] = [];
    const params: SqlBind[] = [];
    if (filter.userId) {
      clauses.push('user_id = ?');
      params.push(filter.userId);
    }
    if (filter.lessonIds) {
      if (filter.lessonIds.length === 0) return [];
      clauses.push(`lesson_id IN (${placeholders(filter.lessonIds.length)})`);
      params.push(...filter.lessonIds);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await this.all<ProgressRow>(
      `SELECT * FROM progress ${where} ORDER BY user_id, lesson_id`,
      params,
    );
    return rows.map(progressFromRow);
  }

  async putProgress(progress: StoredProgress): Promise<void> {
    await this.progressStmt(progress).run();
  }

  async getAdaptation(id: Id): Promise<Adaptation | null> {
    const row = await this.first<AdaptationRow>('SELECT * FROM adaptations WHERE id = ?', [id]);
    return row ? adaptationFromRow(row) : null;
  }

  async listAdaptations(studentId: Id): Promise<Adaptation[]> {
    const rows = await this.all<AdaptationRow>('SELECT * FROM adaptations WHERE student_id = ? ORDER BY applied_at DESC, id DESC', [studentId]);
    return rows.map(adaptationFromRow);
  }

  async putAdaptation(value: Adaptation): Promise<void> { await this.adaptationStmt(value).run(); }

  async putUserWithAdaptations(value: User, adaptations: Adaptation[]): Promise<void> {
    await this.db.batch([this.userStmt(value), ...adaptations.map(adaptation => this.adaptationStmt(adaptation))]);
  }

  async getBuilderSession(id: Id): Promise<BuilderSession | null> {
    const row = await this.first<BuilderRow>('SELECT * FROM builder_sessions WHERE id = ?', [id]);
    return row ? parseJson<BuilderSession>(row.data) : null;
  }

  async listBuilderSessions(courseId: Id): Promise<BuilderSession[]> {
    const rows = await this.all<BuilderRow>(
      'SELECT * FROM builder_sessions WHERE course_id = ? ORDER BY created_at DESC, id',
      [courseId],
    );
    return rows.map((row) => parseJson<BuilderSession>(row.data));
  }

  async putBuilderSession(session: BuilderSession): Promise<void> {
    await this.builderStmt(session).run();
  }

  async getDesignSession(id: Id): Promise<DesignSession | null> {
    const row = await this.first<{ data: string }>('SELECT data FROM design_sessions WHERE id = ?', [id]);
    return row ? normalizeDesignSession(parseJson<DesignSession>(row.data)) : null;
  }

  async listDesignSessions(courseId: Id): Promise<DesignSession[]> {
    const rows = await this.all<{ data: string }>('SELECT data FROM design_sessions WHERE course_id = ? ORDER BY created_at DESC, id', [courseId]);
    return rows.map(row => normalizeDesignSession(parseJson<DesignSession>(row.data)));
  }

  async putDesignSession(session: DesignSession): Promise<void> { await this.designSessionStmt(session).run(); }
  async finishDesignUndo(id: Id, revision: Id, session: DesignSession): Promise<boolean> { const result = await this.db.prepare("UPDATE design_sessions SET data = ?, stage = 'approaches', updated_at = ? WHERE id = ? AND stage = 'undoing' AND json_extract(data, '$.applyRevision') = ?").bind(JSON.stringify(session),session.updatedAt,id,revision).run(); return (result.meta.changes ?? 0) === 1; }
  async revertDesignPreview(id: Id): Promise<boolean> { const result = await this.db.prepare("UPDATE design_sessions SET data = json_set(data, '$.stage', 'approaches', '$.selection', null, '$.plan', null), stage = 'approaches' WHERE id = ? AND stage = 'preview'").bind(id).run(); return (result.meta.changes ?? 0) === 1; }
  async saveDesignPoints(id: Id, values: Record<string, number>): Promise<boolean> { const result = await this.db.prepare("UPDATE design_sessions SET data = json_set(data, '$.confirmedPoints', json(?), '$.plan', null) WHERE id = ? AND stage = 'preview'").bind(JSON.stringify(values),id).run(); return (result.meta.changes ?? 0) === 1; }
  async saveDesignPreview(id: Id, expectedPoints: Record<string, number>, plan: DesignSession['plan'], updatedAt: string): Promise<boolean> { const result = await this.db.prepare("UPDATE design_sessions SET data = json_set(data, '$.plan', json(?), '$.record.plan', json(?), '$.updatedAt', ?), updated_at = ? WHERE id = ? AND stage = 'preview' AND COALESCE(json_extract(data, '$.confirmedPoints'), '{}') = ?").bind(JSON.stringify(plan),JSON.stringify(plan),updatedAt,updatedAt,id,JSON.stringify(expectedPoints)).run(); return (result.meta.changes ?? 0) === 1; }
  async claimDesignApply(session: DesignSession): Promise<boolean> {
    const result = await this.db.prepare("UPDATE design_sessions SET data = ?, stage = 'provisioning', updated_at = ? WHERE id = ? AND stage = 'preview' AND json_extract(data, '$.plan.hash') = ? AND COALESCE(json_extract(data, '$.confirmedPoints'), '{}') = ?").bind(JSON.stringify(session), session.updatedAt, session.id, session.plan?.hash, JSON.stringify(session.confirmedPoints ?? {})).run();
    return (result.meta.changes ?? 0) === 1;
  }
  private designGuard = "EXISTS (SELECT 1 FROM design_sessions WHERE id = ? AND stage = 'provisioning' AND json_extract(data, '$.applyRevision') = ?)";
  private ledgerPath(collection: string, key?: string) { return key === undefined ? `$.created.${collection}[#]` : `$.planIds.${collection}.${JSON.stringify(key)}`; }
  private async designInsert(sessionId: Id, revision: Id, insert: D1PreparedStatement, ledger: D1PreparedStatement): Promise<boolean> {
    const result = await this.db.batch([insert, ledger]);
    return (result[0].meta.changes ?? 0) === 1 && (result[1].meta.changes ?? 0) === 1;
  }
  async putDesignModule(sessionId: Id, revision: Id, key: string, m: Module): Promise<boolean> {
    const index = (await this.getDesignSession(sessionId))?.plan?.modules.findIndex(item => item.key === key) ?? -1;
    if (index < 0) return false;
    return this.designInsert(sessionId, revision,
      this.db.prepare(`INSERT INTO modules (id,course_id,title,position,objective,template_key)
        SELECT ?,?,?,COALESCE((SELECT MAX(position) FROM modules WHERE course_id = ?), -1) + 1,?,? WHERE ${this.designGuard} AND EXISTS (SELECT 1 FROM design_sessions WHERE id = ? AND course_id = ?) AND EXISTS (SELECT 1 FROM courses WHERE id = ?)`)
        .bind(m.id,m.courseId,m.title,m.courseId,m.objective ?? null,m.templateKey ?? null,sessionId,revision,sessionId,m.courseId,m.courseId),
      this.db.prepare(`UPDATE design_sessions SET data = json_set(data, ?, ?, ?, ?, ?, (SELECT position FROM modules WHERE id = ?), ?, (SELECT position FROM modules WHERE id = ?)) WHERE id = ? AND stage = 'provisioning' AND json_extract(data, '$.applyRevision') = ? AND changes() = 1 AND EXISTS (SELECT 1 FROM modules WHERE id = ?)`)
        .bind(this.ledgerPath('moduleIds'),m.id,this.ledgerPath('modules',key),m.id,`$.plan.modules[${index}].position`,m.id,`$.record.plan.modules[${index}].position`,m.id,sessionId,revision,m.id));
  }
  async putDesignLesson(sessionId: Id, revision: Id, key: string, l: Lesson): Promise<boolean> {
    return this.designInsert(sessionId, revision,
      this.db.prepare(`INSERT INTO lessons (id,module_id,course_id,title,minutes,position,status,published_at,template_key,variant_of,variant_audience,variant_synced_at,objective)
        SELECT ?,?,?,?,?,COALESCE((SELECT MAX(position) FROM lessons WHERE module_id = ?), -1) + 1,?,?,?,?,?,?,? WHERE ${this.designGuard} AND EXISTS (SELECT 1 FROM modules WHERE id = ? AND course_id = ?) AND EXISTS (SELECT 1 FROM design_sessions WHERE id = ? AND course_id = ?)`)
        .bind(l.id,l.moduleId,l.courseId,l.title,l.minutes,l.moduleId,l.status,l.publishedAt,l.templateKey ?? null,null,null,null,l.objective ?? null,sessionId,revision,l.moduleId,l.courseId,sessionId,l.courseId),
      this.db.prepare(`UPDATE design_sessions SET data = json_set(data, ?, ?, ?, ?) WHERE id = ? AND stage = 'provisioning' AND json_extract(data, '$.applyRevision') = ? AND changes() = 1 AND EXISTS (SELECT 1 FROM lessons WHERE id = ?)`)
        .bind(this.ledgerPath('lessonIds'),l.id,this.ledgerPath('lessons',key),l.id,sessionId,revision,l.id));
  }
  async putDesignAssignment(sessionId: Id, revision: Id, key: string, a: Assignment, outcomeIds: Id[]): Promise<boolean> {
    const guard = this.designGuard;
    const inserted = this.db.prepare(`INSERT INTO assignments (id,module_id,course_id,title,position,status,published_at,due_at,points,submission_type,rubric,instructions)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard} AND EXISTS (SELECT 1 FROM modules WHERE id = ? AND course_id = ?) AND EXISTS (SELECT 1 FROM design_sessions WHERE id = ? AND course_id = ?) AND ${outcomeIds.length ? `(${outcomeIds.map(() => "EXISTS (SELECT 1 FROM outcomes WHERE id = ? AND course_id = ?) ").join(' AND ')})` : '1=1'}`)
      .bind(a.id,a.moduleId,a.courseId,a.title,a.position,a.status,a.publishedAt,a.dueAt,a.points,a.submissionType,JSON.stringify(a.rubric),JSON.stringify(a.instructions),sessionId,revision,a.moduleId,a.courseId,sessionId,a.courseId,...outcomeIds.flatMap(oid => [oid,a.courseId]));
    const statements = [inserted,
      this.db.prepare(`UPDATE design_sessions SET data = json_set(data, ?, ?, ?, ?) WHERE id = ? AND stage = 'provisioning' AND json_extract(data, '$.applyRevision') = ? AND changes() = 1 AND EXISTS (SELECT 1 FROM assignments WHERE id = ?)`)
        .bind(this.ledgerPath('assignmentIds'),a.id,this.ledgerPath('assignments',key),a.id,sessionId,revision,a.id),
      ...a.instructions.map(b => this.db.prepare(`UPDATE design_sessions SET data = json_insert(data, ?, ?) WHERE id = ? AND ${guard} AND changes() = 1 AND EXISTS (SELECT 1 FROM assignments WHERE id = ?)`)
        .bind(this.ledgerPath('blockIds'),b.id,sessionId,sessionId,revision,a.id)),
      ...outcomeIds.flatMap(oid => [
        this.db.prepare(`INSERT INTO outcome_links (outcome_id,target_kind,target_id) SELECT ?,'assignment',? WHERE ${guard} AND changes() = 1 AND EXISTS (SELECT 1 FROM assignments WHERE id = ?)`)
          .bind(oid,a.id,sessionId,revision,a.id),
        this.db.prepare(`UPDATE design_sessions SET data = json_insert(data, ?, ?) WHERE id = ? AND ${guard} AND changes() = 1 AND EXISTS (SELECT 1 FROM outcome_links WHERE target_kind = 'assignment' AND target_id = ? AND outcome_id = ?)`)
          .bind(this.ledgerPath('linkKeys'),`assignment:${a.id}:${oid}`,sessionId,sessionId,revision,a.id,oid),
      ])];
    const results = await this.db.batch(statements);
    return (results[0].meta.changes ?? 0) === 1;
  }
  async appendDesignOutcome(sessionId: Id, revision: Id, o: Outcome): Promise<boolean> {
    const result = await this.db.batch([
      this.db.prepare(`INSERT INTO outcomes (id,course_id,code,text,position)
        SELECT ?, ?, 'O' || (COALESCE((SELECT MAX(position) FROM outcomes WHERE course_id = ?), -1) + 2), ?, COALESCE((SELECT MAX(position) FROM outcomes WHERE course_id = ?), -1) + 1
        WHERE ${this.designGuard} AND (SELECT COUNT(*) FROM outcomes WHERE course_id = ?) < 30`)
        .bind(o.id,o.courseId,o.courseId,o.text,o.courseId,sessionId,revision,o.courseId),
      this.db.prepare(`UPDATE courses SET outcomes = json_insert(outcomes, '$[#]', ?) WHERE id = ? AND ${this.designGuard} AND changes() = 1 AND EXISTS (SELECT 1 FROM outcomes WHERE id = ?)`)
        .bind(o.text,o.courseId,sessionId,revision,o.id),
      this.db.prepare(`UPDATE design_sessions SET data = json_set(data, ?, ?, ?, ?) WHERE id = ? AND stage = 'provisioning' AND json_extract(data, '$.applyRevision') = ? AND changes() = 1 AND EXISTS (SELECT 1 FROM outcomes WHERE id = ?)`)
        .bind(this.ledgerPath('outcomeIds'),o.id,this.ledgerPath('outcomes',o.code),o.id,sessionId,revision,o.id),
    ]);
    return (result[0].meta.changes ?? 0) === 1;
  }
  async appendDesignOutcomes(sessionId: Id, revision: Id, values: Outcome[]): Promise<Outcome[] | null> {
    if (!values.length) return [];
    if (new Set(values.map(value => value.id)).size !== values.length || values.some(value => value.courseId !== values[0].courseId)) return null;
    const first = values[0];
    const statements: D1PreparedStatement[] = values.map((o, i) => this.db.prepare(`INSERT INTO outcomes (id,course_id,code,text,position)
      SELECT ?, ?, 'O' || (COALESCE((SELECT MAX(position) FROM outcomes WHERE course_id = ?), -1) + 2), ?, COALESCE((SELECT MAX(position) FROM outcomes WHERE course_id = ?), -1) + 1
      WHERE ${this.designGuard} AND EXISTS (SELECT 1 FROM design_sessions WHERE id = ? AND course_id = ?) AND ${i ? 'changes() = 1' : '(SELECT COUNT(*) FROM outcomes WHERE course_id = ?) + ? <= 30'}`)
      .bind(o.id,o.courseId,o.courseId,o.text,o.courseId,sessionId,revision,sessionId,o.courseId,...(i ? [] : [o.courseId,values.length])));
    statements.push(this.db.prepare(`UPDATE courses SET outcomes = json_insert(outcomes, ${values.map(() => "'$[#]', ?").join(', ')}) WHERE id = ? AND ${this.designGuard} AND changes() = 1 AND EXISTS (SELECT 1 FROM outcomes WHERE id = ?)`)
      .bind(...values.map(value => value.text),first.courseId,sessionId,revision,values.at(-1)!.id));
    for (const o of values) statements.push(this.db.prepare(`UPDATE design_sessions SET data = json_set(data, ?, ?, ?, ?) WHERE id = ? AND stage = 'provisioning' AND json_extract(data, '$.applyRevision') = ? AND changes() = 1 AND EXISTS (SELECT 1 FROM outcomes WHERE id = ?)`)
      .bind(this.ledgerPath('outcomeIds'),o.id,this.ledgerPath('outcomes',o.code),o.id,sessionId,revision,o.id));
    const result = await this.db.batch(statements);
    if (result.slice(0, values.length).some(row => (row.meta.changes ?? 0) !== 1)) return null;
    const actual = await this.listOutcomes(first.courseId);
    return values.map(value => actual.find(row => row.id === value.id)!);
  }
  async resetDesignCapacityFailure(id: Id, revision: Id, message: string): Promise<boolean> { const result = await this.db.prepare("UPDATE design_sessions SET stage = 'preview', data = json_set(data, '$.stage', 'preview', '$.provisioning.error', ?) WHERE id = ? AND stage = 'provisioning' AND json_extract(data, '$.applyRevision') = ? AND json_array_length(data, '$.created.outcomeIds') = 0 AND json_array_length(data, '$.created.moduleIds') = 0").bind(message,id,revision).run(); return (result.meta.changes ?? 0) === 1; }
  async saveDesignAppliedPlan(id: Id, revision: Id, plan: DesignSession['plan'], codeMap: Record<string, string>, outcomeIdsByCode: Record<string, Id>): Promise<boolean> { const result = await this.db.prepare("UPDATE design_sessions SET data = json_set(data, '$.plan', json(?), '$.record.plan', json(?), '$.outcomeCodeMap', json(?), '$.planIds.outcomes', json(?)) WHERE id = ? AND stage = 'provisioning' AND json_extract(data, '$.applyRevision') = ?").bind(JSON.stringify(plan),JSON.stringify(plan),JSON.stringify(codeMap),JSON.stringify(outcomeIdsByCode),id,revision).run(); return (result.meta.changes ?? 0) === 1; }
  async cancelDesignApply(sessionId: Id, revision: Id, nextRevision: Id): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare(`UPDATE design_sessions SET data = json_set(data, '$.applyRevision', ?, '$.stage', 'undoing', '$.legacyApply', json(CASE WHEN json_extract(data, '$.applyRevision') IS NULL OR json_extract(data, '$.legacyApply') = 1 THEN 'true' ELSE 'false' END)), stage = 'undoing'
        WHERE id = ? AND stage IN ('provisioning','review') AND COALESCE(json_extract(data, '$.applyRevision'), 'legacy-' || id) = ?`).bind(nextRevision,sessionId,revision),
      this.db.prepare(`UPDATE generation_jobs SET state = 'failed', error = 'Provisioning was undone.' WHERE id =
        (SELECT json_extract(data, '$.provisioning.jobId') FROM design_sessions WHERE id = ?) AND state = 'running' AND changes() = 1`).bind(sessionId),
    ]);
    return (results[0].meta.changes ?? 0) === 1;
  }
  async stopLegacyDesignJob(sessionId: Id, jobId: Id, message: string): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare("UPDATE design_sessions SET data = json_set(data, '$.provisioning.error', ?, '$.legacyApply', json('true')) WHERE id = ? AND stage = 'provisioning' AND json_extract(data, '$.applyRevision') IS NULL AND json_extract(data, '$.provisioning.jobId') = ? AND EXISTS (SELECT 1 FROM generation_jobs WHERE id = ? AND state = 'running')").bind(message,sessionId,jobId,jobId),
      this.db.prepare("UPDATE generation_jobs SET state = 'failed', error = ? WHERE id = ? AND state = 'running' AND changes() = 1").bind(message,jobId),
    ]);
    return (results[0].meta.changes ?? 0) === 1 && (results[1].meta.changes ?? 0) === 1;
  }
  async startDesignJob(sessionId: Id, revision: Id, j: GenerationJob): Promise<boolean> {
    const result = await this.db.prepare(`INSERT INTO generation_jobs (id,course_id,requested_by,state,done,total,lesson_ids,error,created_at,updated_at,work,instruction,failures,runner,kind,session_id)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${this.designGuard} AND NOT EXISTS (SELECT 1 FROM generation_jobs WHERE id = ?)`)
      .bind(j.id,j.courseId,j.requestedBy,j.state,j.done,j.total,JSON.stringify(j.lessonIds),j.error,j.createdAt,j.updatedAt,JSON.stringify(j.work),j.instruction,jobNotes(j),j.runner ?? 'poll',j.kind ?? 'generate',j.sessionId ?? null,sessionId,revision,j.id).run();
    return (result.meta.changes ?? 0) === 1;
  }
  async setDesignRunner(sessionId: Id, revision: Id, jobId: Id, runner: 'poll' | 'workflow'): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE generation_jobs SET runner = ? WHERE id = ? AND state = 'running' AND ${this.designGuard}`).bind(runner,jobId,sessionId,revision).run();
    return (result.meta.changes ?? 0) === 1;
  }
  async setDesignApplyError(sessionId: Id, revision: Id, message: string): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE design_sessions SET data = json_set(data, '$.provisioning.error', ?) WHERE id = ? AND stage = 'provisioning' AND json_extract(data, '$.applyRevision') = ?`)
      .bind(message,sessionId,revision).run();
    return (result.meta.changes ?? 0) === 1;
  }
  async commitDesignScaffold(sessionId: Id, revision: Id, expected: GenerationJob, next: GenerationJob, lesson: Lesson | null, blocks: Block[], outcomeIds: Id[], nextSession: DesignSession): Promise<boolean> {
    const guard = `${this.designGuard} AND EXISTS (SELECT 1 FROM generation_jobs WHERE id = ? AND state = 'running' AND done = ? AND COALESCE(runner,'poll') = ?)`;
    const args = [sessionId, revision,expected.id,expected.done,expected.runner ?? 'poll'] as const;
    const statements: D1PreparedStatement[] = [];
    if (lesson && blocks.length) {
      const b = blocks[0];
      statements.push(this.db.prepare(`INSERT INTO blocks (id,lesson_id,position,type,content,origin,ai_state,provenance,previous,updated_at,template_key,source_block_id,source_hash)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard} AND EXISTS (SELECT 1 FROM lessons WHERE id = ? AND module_id = ? AND title = ? AND objective IS ? AND minutes = ? AND position = ? AND status = ? AND published_at IS ?)
        AND NOT EXISTS (SELECT 1 FROM blocks WHERE lesson_id = ?) AND NOT EXISTS (SELECT 1 FROM lessons WHERE variant_of = ?) ${outcomeIds.map(() => 'AND EXISTS (SELECT 1 FROM outcomes WHERE id = ? AND course_id = ?)').join(' ')}`)
        .bind(b.id,b.lessonId,b.position,b.type,contentJson(b),b.origin,b.aiState,jsonOrNull(b.provenance),jsonOrNull(b.previous),b.updatedAt,b.templateKey ?? null,b.source?.blockId ?? null,b.source?.hash ?? null,...args,lesson.id,lesson.moduleId,lesson.title,lesson.objective ?? null,lesson.minutes,lesson.position,lesson.status,lesson.publishedAt,lesson.id,lesson.id,...outcomeIds.flatMap(oid => [oid,nextSession.courseId])));
      for (const other of blocks.slice(1)) statements.push(this.db.prepare(`INSERT INTO blocks (id,lesson_id,position,type,content,origin,ai_state,provenance,previous,updated_at,template_key,source_block_id,source_hash)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard} AND EXISTS (SELECT 1 FROM blocks WHERE id = ?)`)
        .bind(other.id,other.lessonId,other.position,other.type,contentJson(other),other.origin,other.aiState,jsonOrNull(other.provenance),jsonOrNull(other.previous),other.updatedAt,other.templateKey ?? null,other.source?.blockId ?? null,other.source?.hash ?? null,...args,b.id));
      for (const value of blocks.filter(x => x.type === 'check' || x.type === 'scenario')) for (const oid of outcomeIds) statements.push(this.db.prepare(`INSERT INTO outcome_links (outcome_id,target_kind,target_id) SELECT ?,'block',? WHERE ${guard} AND EXISTS (SELECT 1 FROM blocks WHERE id = ?)`)
        .bind(oid,value.id,...args,value.id));
    }
    const marker = lesson && blocks.length ? ' AND EXISTS (SELECT 1 FROM blocks WHERE id = ?)' : '';
    const markerArgs = lesson && blocks.length ? [blocks[0].id] : [];
    statements.push(this.db.prepare(`UPDATE generation_jobs SET state = ?,done = ?,lesson_ids = ?,error = ?,updated_at = ?,work = ?,failures = ?
      WHERE id = ? AND state = 'running' AND done = ? AND COALESCE(runner,'poll') = ? AND ${this.designGuard}${marker}`)
      .bind(next.state,next.done,JSON.stringify(next.lessonIds),next.error,next.updatedAt,JSON.stringify(next.work),jobNotes(next),expected.id,expected.done,expected.runner ?? 'poll',sessionId,revision,...markerArgs));
    statements.push(this.db.prepare(`UPDATE design_sessions SET data = ?,stage = ?,updated_at = ? WHERE id = ? AND stage = 'provisioning' AND json_extract(data, '$.applyRevision') = ? AND changes() = 1 AND EXISTS (SELECT 1 FROM generation_jobs WHERE id = ? AND done = ?)${marker}`)
      .bind(JSON.stringify(nextSession),nextSession.stage,nextSession.updatedAt,sessionId,revision,next.id,next.done,...markerArgs));
    const result = await this.db.batch(statements);
    return (result[result.length - 1].meta.changes ?? 0) === 1;
  }
  async appendDesignAlternatives(sessionId: Id, revision: Id, lessonId: Id, blocks: Block[]): Promise<boolean> {
    if (blocks.length !== 2) return false;
    const existing = await this.listBlocks(lessonId);
    const last = Math.max(-1, ...existing.map(b => b.position));
    const prepared = blocks.map((b, i) => ({ ...b, position: last + 1 + i } as Block));
    const guard = `EXISTS (SELECT 1 FROM design_sessions WHERE id = ? AND stage = 'review' AND json_extract(data, '$.applyRevision') = ? AND EXISTS (SELECT 1 FROM json_each(data, '$.created.lessonIds') WHERE value = ?))`;
    const insert = (b: Block, condition: string, tail: SqlBind[]) => this.db.prepare(`INSERT INTO blocks (id,lesson_id,position,type,content,origin,ai_state,provenance,previous,updated_at,template_key,source_block_id,source_hash)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard} ${condition}`)
      .bind(b.id,lessonId,b.position,b.type,contentJson(b),b.origin,b.aiState,jsonOrNull(b.provenance),jsonOrNull(b.previous),b.updatedAt,b.templateKey ?? null,b.source?.blockId ?? null,b.source?.hash ?? null,sessionId,revision,lessonId,...tail);
    const result = await this.db.batch([
      insert(prepared[0],"AND (SELECT COALESCE(MAX(position),-1) FROM blocks WHERE lesson_id = ?) = ? AND NOT EXISTS (SELECT 1 FROM blocks WHERE lesson_id = ? AND type = 'document' AND json_extract(content, '$.title') LIKE 'Alternative opening %')",[lessonId,last,lessonId]),
      insert(prepared[1],'AND changes() = 1 AND EXISTS (SELECT 1 FROM blocks WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM blocks WHERE id = ?)',[prepared[0].id,prepared[1].id]),
      this.db.prepare(`UPDATE design_sessions SET data = json_set(json_insert(json_insert(data, '$.created.blockIds[#]', ?), '$.created.blockIds[#]', ?), ?, json(?), ?, json(?))
        WHERE id = ? AND stage = 'review' AND json_extract(data, '$.applyRevision') = ? AND changes() = 1 AND EXISTS (SELECT 1 FROM blocks WHERE id = ?) AND EXISTS (SELECT 1 FROM blocks WHERE id = ?)`)
        .bind(prepared[0].id,prepared[1].id,`$.createdBlocks.${JSON.stringify(prepared[0].id)}`,JSON.stringify(prepared[0]),`$.createdBlocks.${JSON.stringify(prepared[1].id)}`,JSON.stringify(prepared[1]),sessionId,revision,prepared[0].id,prepared[1].id),
    ]);
    return (result[0].meta.changes ?? 0) === 1 && (result[1].meta.changes ?? 0) === 1;
  }
  private undoGuard(collection: 'blockIds' | 'assignmentIds' | 'lessonIds' | 'moduleIds' | 'outcomeIds') { return `EXISTS (SELECT 1 FROM design_sessions WHERE id = ? AND stage = 'undoing' AND json_extract(data, '$.applyRevision') = ? AND EXISTS (SELECT 1 FROM json_each(data, '$.created.${collection}') WHERE value = ?))`; }
  async deleteDesignBlockIfDraft(sessionId: Id, revision: Id, b: Block, expectedOutcomeIds: Id[]): Promise<boolean> {
    const result = await this.db.batch([
      this.db.prepare(`DELETE FROM blocks WHERE id = ? AND lesson_id = ? AND position = ? AND type = ? AND content = ? AND origin = ? AND ai_state = 'draft' AND previous IS NULL AND provenance IS ? AND updated_at = ? AND template_key IS ? AND source_block_id IS ? AND source_hash IS ?
        AND (SELECT json_group_array(outcome_id) FROM (SELECT outcome_id FROM outcome_links WHERE target_kind = 'block' AND target_id = ? ORDER BY outcome_id)) = ? AND ${this.undoGuard('blockIds')}`)
        .bind(b.id,b.lessonId,b.position,b.type,contentJson(b),b.origin,jsonOrNull(b.provenance),b.updatedAt,b.templateKey ?? null,b.source?.blockId ?? null,b.source?.hash ?? null,b.id,JSON.stringify([...expectedOutcomeIds].sort()),sessionId,revision,b.id),
      this.db.prepare("DELETE FROM outcome_links WHERE target_kind = 'block' AND target_id = ? AND changes() = 1 AND NOT EXISTS (SELECT 1 FROM blocks WHERE id = ?)").bind(b.id,b.id),
    ]);
    return (result[0].meta.changes ?? 0) === 1;
  }
  async deleteDesignAssignmentIfUnchanged(sessionId: Id, revision: Id, a: Assignment, expectedOutcomeIds: Id[]): Promise<boolean> {
    const result = await this.db.batch([
      this.db.prepare(`DELETE FROM assignments WHERE id = ? AND module_id = ? AND course_id = ? AND title = ? AND position = ? AND status = ? AND published_at IS ? AND due_at IS ? AND points = ? AND submission_type = ? AND rubric = ? AND instructions = ? AND NOT EXISTS (SELECT 1 FROM submissions WHERE assignment_id = ?)
        AND (SELECT json_group_array(outcome_id) FROM (SELECT outcome_id FROM outcome_links WHERE target_kind = 'assignment' AND target_id = ? ORDER BY outcome_id)) = ? AND ${this.undoGuard('assignmentIds')}`)
        .bind(a.id,a.moduleId,a.courseId,a.title,a.position,a.status,a.publishedAt,a.dueAt,a.points,a.submissionType,JSON.stringify(a.rubric),JSON.stringify(a.instructions),a.id,a.id,JSON.stringify([...expectedOutcomeIds].sort()),sessionId,revision,a.id),
      this.db.prepare("DELETE FROM outcome_links WHERE target_kind = 'assignment' AND target_id = ? AND changes() = 1 AND NOT EXISTS (SELECT 1 FROM assignments WHERE id = ?)").bind(a.id,a.id),
    ]);
    return (result[0].meta.changes ?? 0) === 1;
  }
  async deleteDesignLessonIfUnchanged(sessionId: Id, revision: Id, l: Lesson): Promise<boolean> {
    const result = await this.db.prepare(`DELETE FROM lessons WHERE id = ? AND module_id = ? AND course_id = ? AND title = ? AND objective IS ? AND minutes = ? AND position = ? AND status = ? AND published_at IS ? AND template_key IS ?
      AND NOT EXISTS (SELECT 1 FROM blocks WHERE lesson_id = ?) AND NOT EXISTS (SELECT 1 FROM lessons WHERE variant_of = ?) AND NOT EXISTS (SELECT 1 FROM progress WHERE lesson_id = ?) AND ${this.undoGuard('lessonIds')}`)
      .bind(l.id,l.moduleId,l.courseId,l.title,l.objective ?? null,l.minutes,l.position,l.status,l.publishedAt,l.templateKey ?? null,l.id,l.id,l.id,sessionId,revision,l.id).run();
    return (result.meta.changes ?? 0) === 1;
  }
  async deleteDesignModuleIfUnchanged(sessionId: Id, revision: Id, m: Module): Promise<boolean> {
    const result = await this.db.prepare(`DELETE FROM modules WHERE id = ? AND course_id = ? AND title = ? AND objective IS ? AND position = ? AND template_key IS ?
      AND NOT EXISTS (SELECT 1 FROM lessons WHERE module_id = ?) AND NOT EXISTS (SELECT 1 FROM assignments WHERE module_id = ?) AND ${this.undoGuard('moduleIds')}`)
      .bind(m.id,m.courseId,m.title,m.objective ?? null,m.position,m.templateKey ?? null,m.id,m.id,sessionId,revision,m.id).run();
    return (result.meta.changes ?? 0) === 1;
  }
  async deleteDesignOutcomeIfUnused(sessionId: Id, revision: Id, id: Id, text: string): Promise<boolean> {
    const outcome = await this.first<OutcomeRow>('SELECT * FROM outcomes WHERE id = ?', [id]);
    if (!outcome) return false;
    const mirrored = JSON.stringify((await this.listOutcomes(outcome.course_id)).map(row => row.text));
    const result = await this.db.batch([
      this.db.prepare(`DELETE FROM outcomes WHERE id = ? AND text = ? AND NOT EXISTS (SELECT 1 FROM outcome_links WHERE outcome_id = ?) AND ${this.undoGuard('outcomeIds')}`)
        .bind(id,text,id,sessionId,revision,id),
      this.db.prepare(`UPDATE courses SET outcomes = COALESCE((SELECT json_group_array(text) FROM (SELECT text FROM outcomes WHERE course_id = courses.id ORDER BY position,id)), '[]')
        WHERE id = ? AND outcomes = ? AND changes() = 1 AND NOT EXISTS (SELECT 1 FROM outcomes WHERE id = ?)`)
        .bind(outcome.course_id,mirrored,id),
    ]);
    return (result[0].meta.changes ?? 0) === 1;
  }

  async getInstructorProfile(userId: Id): Promise<InstructorProfile | null> {
    const row = await this.first<{ data: string }>('SELECT data FROM instructor_profiles WHERE user_id = ?', [userId]);
    return row ? parseJson<InstructorProfile>(row.data) : null;
  }

  async putInstructorProfile(profile: InstructorProfile): Promise<void> { await this.instructorProfileStmt(profile).run(); }

  async getGenerationJob(id: Id): Promise<GenerationJob | null> {
    const row = await this.first<GenerationRow>('SELECT * FROM generation_jobs WHERE id = ?', [id]);
    return row ? generationFromRow(row) : null;
  }

  async putGenerationJob(job: GenerationJob): Promise<void> {
    await this.generationStmt(job).run();
  }

  async getFile(id: string) { const r = await this.first<FileRow>('SELECT * FROM files WHERE id = ?', [id]); return r ? await this.fileFromRow(r) : null; }
  async listFiles(courseId: string) {
    const rows = await this.all<FileRow>('SELECT * FROM files WHERE course_id = ? ORDER BY uploaded_at DESC, id', [courseId]);
    return Promise.all(rows.map((r) => this.fileFromRow(r)));
  }
  async putFile(f: FileRecord) {
    await this.db.prepare(`INSERT INTO files (id, course_id, name, kind, mime, size, key, version, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, key = excluded.key, version = excluded.version, size = excluded.size`)
      .bind(f.id, f.courseId, f.name, f.kind, f.mime, f.size, f.key, f.version, f.uploadedBy, f.uploadedAt).run();
  }
  async deleteFile(id: string) {
    await this.db.batch([
      this.db.prepare("DELETE FROM access_scans WHERE target_kind = 'file' AND target_id = ?").bind(id),
      this.db.prepare('DELETE FROM files WHERE id = ?').bind(id),
    ]);
  }
  async putFileVersion(v: FileVersion) {
    await this.db.prepare('INSERT OR REPLACE INTO file_versions (file_id, version, key, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(v.fileId, v.version, v.key, v.note, v.createdBy, v.createdAt).run();
  }
  async listFileVersions(fileId: string) {
    const rows = await this.all<{ file_id: string; version: number; key: string; note: string; created_by: string; created_at: string }>('SELECT * FROM file_versions WHERE file_id = ? ORDER BY version', [fileId]);
    return rows.map((r) => ({ fileId: r.file_id, version: r.version, key: r.key, note: r.note, createdBy: r.created_by, createdAt: r.created_at }));
  }
  async putScan(s: StoredScan) {
    const targetId = s.target.kind === 'lesson' ? s.target.lessonId : s.target.fileId;
    await this.db.prepare(`INSERT OR REPLACE INTO access_scans (id, target_kind, target_id, version, course_id, score, grade, issue_count, by_severity, issues, document, scanned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(s.id, s.target.kind, targetId, s.version, s.courseId, s.score, s.grade, s.issueCount, JSON.stringify(s.bySeverity), JSON.stringify(s.issues), s.document ? JSON.stringify(s.document) : null, s.scannedAt).run();
  }
  async latestScan(targetKind: 'lesson' | 'file', targetId: string) {
    const r = await this.first<ScanRow>('SELECT * FROM access_scans WHERE target_kind = ? AND target_id = ? ORDER BY scanned_at DESC LIMIT 1', [targetKind, targetId]);
    return r ? scanFromRow(r) : null;
  }
  async listScans(filter: { courseId?: string; targetKind?: 'lesson' | 'file'; since?: string }) {
    const where: string[] = []; const params: SqlBind[] = [];
    if (filter.courseId) { where.push('course_id = ?'); params.push(filter.courseId); }
    if (filter.targetKind) { where.push('target_kind = ?'); params.push(filter.targetKind); }
    if (filter.since) { where.push('scanned_at >= ?'); params.push(filter.since); }
    const rows = await this.all<ScanRow>(`SELECT * FROM access_scans${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY scanned_at DESC, id`, params);
    return rows.map(scanFromRow);
  }
  async getFormat(fileId: string, version: number, format: AccessibleFormat) {
    const r = await this.first<FormatRow>('SELECT * FROM format_jobs WHERE file_id = ? AND version = ? AND format = ?', [fileId, version, format]);
    return r ? formatFromRow(r) : null;
  }
  async listFormats(fileId: string, version: number) {
    return (await this.all<FormatRow>('SELECT * FROM format_jobs WHERE file_id = ? AND version = ? ORDER BY format', [fileId, version])).map(formatFromRow);
  }
  async putFormat(f: StoredFormat) {
    await this.db.prepare('INSERT OR REPLACE INTO format_jobs (file_id, version, format, state, output_key, generated_at, error) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(f.fileId, f.version, f.format, f.state, f.outputKey, f.generatedAt, f.error).run();
  }
  private async fileFromRow(r: FileRow): Promise<FileRecord> {
    const scan = await this.latestScan('file', r.id);
    return { id: r.id, courseId: r.course_id, name: r.name, kind: r.kind, mime: r.mime, size: r.size, key: r.key, version: r.version, uploadedBy: r.uploaded_by, uploadedAt: r.uploaded_at,
      scan: scan ? { score: scan.score, grade: scan.grade, issueCount: scan.issueCount, bySeverity: scan.bySeverity, scannedAt: scan.scannedAt } : null };
  }
  async getAssignment(id: Id): Promise<Assignment | null> {
    const row = await this.first<AssignmentRow>('SELECT * FROM assignments WHERE id = ?', [id]);
    return row ? assignmentFromRow(row) : null;
  }
  async listAssignments(filter: { courseId?: Id; moduleId?: Id }): Promise<Assignment[]> {
    const rows = await this.all<AssignmentRow>(`SELECT a.* FROM assignments a JOIN modules m ON m.id = a.module_id
      WHERE (? IS NULL OR a.course_id = ?) AND (? IS NULL OR a.module_id = ?)
      ORDER BY m.position, a.position, a.id`, [filter.courseId ?? null, filter.courseId ?? null, filter.moduleId ?? null, filter.moduleId ?? null]);
    return rows.map(assignmentFromRow);
  }
  async putAssignment(a: Assignment): Promise<void> { await this.assignmentStmt(a).run(); }
  async deleteAssignment(id: Id): Promise<void> { await this.db.prepare('DELETE FROM assignments WHERE id = ?').bind(id).run(); }
  async getSubmission(id: Id): Promise<Submission | null> {
    const row = await this.first<SubmissionRow>('SELECT * FROM submissions WHERE id = ?', [id]);
    return row ? submissionFromRow(row) : null;
  }
  async listSubmissions(filter: { assignmentId?: Id; studentId?: Id }): Promise<Submission[]> {
    const rows = await this.all<SubmissionRow>(`SELECT * FROM submissions WHERE (? IS NULL OR assignment_id = ?) AND (? IS NULL OR student_id = ?)
      ORDER BY student_id, attempt DESC, submitted_at DESC`, [filter.assignmentId ?? null, filter.assignmentId ?? null, filter.studentId ?? null, filter.studentId ?? null]);
    return rows.map(submissionFromRow);
  }
  async putSubmission(s: Submission): Promise<void> { await this.submissionStmt(s).run(); }

  async getTutorSetting(kind: ActivityKind, id: Id): Promise<TutorSetting | null> {
    const r = await this.first<{ activity_kind: ActivityKind; activity_id: Id; mode: TutorSetting['mode']; max_hints: number; allowed_source_ids: string; set_by: Id; set_at: string }>('SELECT * FROM tutor_settings WHERE activity_kind = ? AND activity_id = ?', [kind, id]);
    return r ? { activityKind:r.activity_kind, activityId:r.activity_id, mode:r.mode, maxHints:r.max_hints, allowedSourceIds:JSON.parse(r.allowed_source_ids), setBy:r.set_by, setAt:r.set_at } : null;
  }
  async putTutorSetting(s: TutorSetting): Promise<void> {
    await this.db.prepare(`INSERT INTO tutor_settings (activity_kind,activity_id,mode,max_hints,allowed_source_ids,set_by,set_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(activity_kind,activity_id) DO UPDATE SET mode=excluded.mode,max_hints=excluded.max_hints,allowed_source_ids=excluded.allowed_source_ids,set_by=excluded.set_by,set_at=excluded.set_at`)
      .bind(s.activityKind,s.activityId,s.mode,s.maxHints,JSON.stringify(s.allowedSourceIds),s.setBy,s.setAt).run();
  }
  async getTutorSession(id: Id): Promise<StoredTutorSession | null> {
    const rows = await this.listTutorSessionsBy('id = ?', [id]); return rows[0] ?? null;
  }
  private async listTutorSessionsBy(where: string, binds: SqlBind[]): Promise<StoredTutorSession[]> {
    const rows = await this.all<{ id:Id; student_id:Id; activity_kind:ActivityKind; activity_id:Id; course_id:Id; mode:StoredTutorSession['mode']; hints_used:number; max_hints:number; answer_requests:number; messages:string; started_at:string; updated_at:string }>(`SELECT * FROM tutor_sessions WHERE ${where} ORDER BY started_at, id`, binds);
    return rows.map(r => ({ id:r.id, studentId:r.student_id, activityKind:r.activity_kind, activityId:r.activity_id, courseId:r.course_id, mode:r.mode, hintsUsed:r.hints_used, maxHints:r.max_hints, answerRequests:r.answer_requests, messages:JSON.parse(r.messages), startedAt:r.started_at, updatedAt:r.updated_at }));
  }
  async listTutorSessions(filter: { courseId?: Id; studentId?: Id; activityKind?: ActivityKind; activityId?: Id }): Promise<StoredTutorSession[]> {
    return this.listTutorSessionsBy('(? IS NULL OR course_id = ?) AND (? IS NULL OR student_id = ?) AND (? IS NULL OR activity_kind = ?) AND (? IS NULL OR activity_id = ?)',
      [filter.courseId??null,filter.courseId??null,filter.studentId??null,filter.studentId??null,filter.activityKind??null,filter.activityKind??null,filter.activityId??null,filter.activityId??null]);
  }
  async putTutorSession(s: StoredTutorSession): Promise<void> {
    await this.db.prepare(`INSERT INTO tutor_sessions (id,student_id,activity_kind,activity_id,course_id,mode,hints_used,max_hints,answer_requests,messages,started_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET mode=excluded.mode,hints_used=excluded.hints_used,max_hints=excluded.max_hints,answer_requests=excluded.answer_requests,messages=excluded.messages,updated_at=excluded.updated_at`)
      .bind(s.id,s.studentId,s.activityKind,s.activityId,s.courseId,s.mode,s.hintsUsed,s.maxHints,s.answerRequests,JSON.stringify(s.messages),s.startedAt,s.updatedAt).run();
  }

  async getApiTokenByHash(hash: string) {
    const row = await this.first<TokenRow>('SELECT * FROM api_tokens WHERE hash = ?', [hash]);
    return row ? tokenFromRow(row) : null;
  }
  async listApiTokens(ownerId: string) {
    const rows = await this.all<TokenRow>('SELECT * FROM api_tokens WHERE owner_id = ? ORDER BY created_at DESC, id', [ownerId]);
    return rows.map(tokenFromRow);
  }
  async putApiToken(t: ApiToken & { hash: string }) {
    await this.db.prepare(
      `INSERT INTO api_tokens (id, name, prefix, hash, scopes, owner_id, created_at, expires_at, last_used_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, scopes = excluded.scopes, expires_at = excluded.expires_at,
         last_used_at = excluded.last_used_at, revoked_at = excluded.revoked_at`,
    ).bind(t.id, t.name, t.prefix, t.hash, JSON.stringify(t.scopes), t.ownerId, t.createdAt, t.expiresAt, t.lastUsedAt, t.revokedAt).run();
  }
  async touchApiToken(id: string, usedAt: string) {
    await this.db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').bind(usedAt, id).run();
  }
  async getInvitation(userId: Id): Promise<Invitation | null> {
    const row = await this.first<InvitationRow>('SELECT * FROM invitations WHERE user_id = ?', [userId]);
    return row ? invitationFromRow(row) : null;
  }
  async getInvitationByEmail(email: string): Promise<Invitation | null> {
    const row = await this.first<InvitationRow>('SELECT * FROM invitations WHERE lower(email) = lower(?)', [email]);
    return row ? invitationFromRow(row) : null;
  }
  async listInvitations(): Promise<Invitation[]> {
    return (await this.all<InvitationRow>('SELECT * FROM invitations ORDER BY invited_at DESC, user_id ASC')).map(invitationFromRow);
  }
  async putInvitation(invitation: Invitation): Promise<void> {
    await this.db.prepare(`INSERT INTO invitations (user_id, email, invited_by, invited_at, access_granted, access_error, accepted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, invited_by = excluded.invited_by,
        invited_at = excluded.invited_at, access_granted = excluded.access_granted,
        access_error = excluded.access_error, accepted_at = COALESCE(invitations.accepted_at, excluded.accepted_at)`)
      .bind(invitation.userId, invitation.email, invitation.invitedBy, invitation.invitedAt, Number(invitation.accessGranted), invitation.accessError ?? null, invitation.acceptedAt).run();
  }
  async acceptInvitation(userId: Id, at: string): Promise<void> {
    await this.db.prepare('UPDATE invitations SET accepted_at = ? WHERE user_id = ? AND accepted_at IS NULL').bind(at, userId).run();
  }
  async hasInvitations() {
    const row = await this.first<{ n: number }>('SELECT count(*) AS n FROM invitations');
    return !!row && row.n > 0;
  }

  async listVariantLessons(masterLessonId: Id): Promise<Lesson[]> {
    return (await this.all<LessonRow>('SELECT * FROM lessons WHERE variant_of = ? ORDER BY variant_audience, id', [masterLessonId])).map(lessonFromRow);
  }

  async getProgram(id: Id): Promise<Program | null> { const r = await this.first<ProgramRow>('SELECT * FROM programs WHERE id = ?', [id]); return r ? programFromRow(r) : null; }
  async listPrograms(): Promise<Program[]> { return (await this.all<ProgramRow>('SELECT * FROM programs ORDER BY name, id')).map(programFromRow); }
  async putProgram(p: Program): Promise<void> { await this.programStmt(p).run(); }
  async deleteProgram(id: Id): Promise<void> { await this.db.prepare('DELETE FROM programs WHERE id = ?').bind(id).run(); }

  async getTemplate(id: Id): Promise<CourseTemplate | null> { const r = await this.first<TemplateRow>('SELECT * FROM templates WHERE id = ?', [id]); return r ? templateFromRow(r) : null; }
  async listTemplates(): Promise<CourseTemplate[]> { return (await this.all<TemplateRow>('SELECT * FROM templates ORDER BY name, id')).map(templateFromRow); }
  async putTemplate(t: CourseTemplate): Promise<void> { await this.templateStmt(t).run(); }
  async deleteTemplate(id: Id): Promise<void> { await this.db.prepare('DELETE FROM templates WHERE id = ?').bind(id).run(); }

  async getRubric(id: Id): Promise<Rubric | null> { const r = await this.first<RubricRow>('SELECT * FROM rubrics WHERE id = ?', [id]); return r ? rubricFromRow(r) : null; }
  async listRubrics(): Promise<Rubric[]> { return (await this.all<RubricRow>('SELECT * FROM rubrics ORDER BY name, id')).map(rubricFromRow); }
  async putRubric(r: Rubric): Promise<void> { await this.rubricStmt(r).run(); }
  async deleteRubric(id: Id): Promise<void> { await this.db.prepare('DELETE FROM rubrics WHERE id = ?').bind(id).run(); }

  async listReadinessItems(courseId: Id, rubricId: Id): Promise<StoredReadinessItem[]> {
    return (await this.all<ReadinessRow>('SELECT * FROM readiness_items WHERE course_id = ? AND rubric_id = ? ORDER BY item_id', [courseId, rubricId])).map(readinessFromRow);
  }
  async putReadinessItem(item: StoredReadinessItem): Promise<void> { await this.readinessStmt(item).run(); }

  async listOutcomes(courseId: Id): Promise<Outcome[]> { return (await this.all<OutcomeRow>('SELECT * FROM outcomes WHERE course_id = ? ORDER BY position, id', [courseId])).map(outcomeFromRow); }
  async replaceOutcomes(courseId: Id, outcomes: Outcome[]): Promise<void> {
    const ids = outcomes.map(x => x.id);
    await this.db.batch([
      this.db.prepare(`DELETE FROM outcomes WHERE course_id = ?${ids.length ? ` AND id NOT IN (${placeholders(ids.length)})` : ''}`).bind(courseId, ...ids),
      ...outcomes.map(x => this.outcomeStmt(x)),
    ]);
  }
  async listOutcomeLinks(filter: { courseId?: Id; targetKind?: AlignableKind; targetId?: Id }): Promise<OutcomeLink[]> {
    const courseId = filter.courseId ?? null, kind = filter.targetKind ?? null, targetId = filter.targetId ?? null;
    const rows = await this.all<OutcomeLinkRow>(`SELECT l.* FROM outcome_links l JOIN outcomes o ON o.id = l.outcome_id
      WHERE (? IS NULL OR o.course_id = ?) AND (? IS NULL OR l.target_kind = ?) AND (? IS NULL OR l.target_id = ?)
      ORDER BY l.outcome_id, l.target_kind, l.target_id`, [courseId, courseId, kind, kind, targetId, targetId]);
    return rows.map(linkFromRow);
  }
  async setOutcomeLinks(targetKind: AlignableKind, targetId: Id, outcomeIds: Id[]): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM outcome_links WHERE target_kind = ? AND target_id = ?').bind(targetKind, targetId),
      ...[...new Set(outcomeIds)].map(id => this.linkStmt({ outcomeId: id, targetKind, targetId })),
    ]);
  }

  async getRequirement(id: Id): Promise<Requirement | null> { const r = await this.first<RequirementRow>('SELECT * FROM requirements WHERE id = ?', [id]); return r ? requirementFromRow(r) : null; }
  async listRequirements(filter?: { targetKind?: Requirement['target']['kind']; targetId?: Id }): Promise<Requirement[]> {
    const kind = filter?.targetKind ?? null, id = filter?.targetId ?? null;
    return (await this.all<RequirementRow>('SELECT * FROM requirements WHERE (? IS NULL OR target_kind = ?) AND (? IS NULL OR target_id = ?) ORDER BY created_at DESC, id DESC', [kind, kind, id, id])).map(requirementFromRow);
  }
  async putRequirement(r: Requirement): Promise<void> { await this.requirementStmt(r).run(); }
  async deleteRequirement(id: Id): Promise<void> { await this.db.prepare('DELETE FROM requirements WHERE id = ?').bind(id).run(); }

  async appendCompletionEvent(e: CompletionEvent): Promise<void> { await this.completionEventStmt(e).run(); }
  async listCompletionEvents(filter: { userId?: Id; courseId?: Id; since?: string }): Promise<CompletionEvent[]> {
    const user = filter.userId ?? null, course = filter.courseId ?? null, since = filter.since ?? null;
    return (await this.all<CompletionEventRow>('SELECT * FROM completion_events WHERE (? IS NULL OR user_id = ?) AND (? IS NULL OR course_id = ?) AND (? IS NULL OR at >= ?) ORDER BY at, id', [user, user, course, course, since, since])).map(eventFromRow);
  }

  async getTestOut(courseId: Id): Promise<TestOut | null> { const r = await this.first<TestOutRow>('SELECT * FROM test_outs WHERE course_id = ?', [courseId]); return r ? testOutFromRow(r) : null; }
  async putTestOut(t: TestOut): Promise<void> { await this.testOutStmt(t).run(); }
  async deleteTestOut(courseId: Id): Promise<void> { await this.db.prepare('DELETE FROM test_outs WHERE course_id = ?').bind(courseId).run(); }
  async putTestOutAttempt(a: TestOutAttempt): Promise<void> { await this.testOutAttemptStmt(a).run(); }
  async listTestOutAttempts(userId: Id, courseId: Id): Promise<TestOutAttempt[]> { return (await this.all<TestOutAttemptRow>('SELECT * FROM test_out_attempts WHERE user_id = ? AND course_id = ? ORDER BY at, id', [userId, courseId])).map(attemptFromRow); }

  async getCertificate(id: Id): Promise<Certificate | null> { const r = await this.first<CertificateRow>('SELECT * FROM certificates WHERE id = ?', [id]); return r ? certificateFromRow(r) : null; }
  async getCertificateByCode(code: string): Promise<Certificate | null> { const r = await this.first<CertificateRow>('SELECT * FROM certificates WHERE code = ?', [code]); return r ? certificateFromRow(r) : null; }
  async listCertificates(filter: { userId?: Id; courseId?: Id }): Promise<Certificate[]> {
    const user = filter.userId ?? null, course = filter.courseId ?? null;
    return (await this.all<CertificateRow>('SELECT * FROM certificates WHERE (? IS NULL OR user_id = ?) AND (? IS NULL OR course_id = ?) ORDER BY issued_at DESC, id DESC', [user, user, course, course])).map(certificateFromRow);
  }
  async insertCertificate(c: Certificate): Promise<void> { await this.certificateStmt(c).run(); }
  async markCertificateReplaced(id: Id, replacedBy: Id): Promise<void> {
    const result = await this.db.prepare('UPDATE certificates SET replaced_by = ? WHERE id = ? AND replaced_by IS NULL').bind(replacedBy, id).run();
    if (result.meta.changes !== 1) throw new ApiError('conflict', 'Certificate is missing or already replaced.');
  }

  async listReportingLines(filter: { managerId?: Id; reportId?: Id }): Promise<ReportingLine[]> {
    const manager = filter.managerId ?? null, report = filter.reportId ?? null;
    return (await this.all<ReportingLineRow>('SELECT * FROM reporting_lines WHERE (? IS NULL OR manager_id = ?) AND (? IS NULL OR report_id = ?) ORDER BY manager_id, report_id', [manager, manager, report, report])).map(reportingFromRow);
  }
  async putReportingLine(line: ReportingLine): Promise<void> { await this.reportingLineStmt(line).run(); }
  async deleteReportingLine(managerId: Id, reportId: Id): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM reporting_lines WHERE manager_id = ? AND report_id = ?').bind(managerId, reportId),
      this.db.prepare('DELETE FROM manager_consents WHERE manager_id = ? AND report_id = ?').bind(managerId, reportId),
    ]);
  }
  async listManagerConsents(filter: { managerId?: Id; reportId?: Id }): Promise<ManagerConsent[]> {
    const manager = filter.managerId ?? null, report = filter.reportId ?? null;
    return (await this.all<ConsentRow>('SELECT * FROM manager_consents WHERE (? IS NULL OR manager_id = ?) AND (? IS NULL OR report_id = ?) ORDER BY manager_id, report_id', [manager, manager, report, report])).map(consentFromRow);
  }
  async putManagerConsent(c: ManagerConsent): Promise<void> { await this.managerConsentStmt(c).run(); }

  async isEmpty(): Promise<boolean> {
    const row = await this.first<{ i: number; u: number }>('SELECT (SELECT count(*) FROM institution) AS i, (SELECT count(*) FROM users) AS u');
    return !row || row.i === 0 || row.u === 0;
  }

  async reset(seed: SeedData): Promise<void> {
    await this.db.batch([
      ...DELETE_ORDER.map((table) => this.db.prepare(`DELETE FROM ${table}`)),
      this.institutionStmt(seed.institution),
      ...seed.users.map((user) => this.userStmt(user)),
      ...(seed.programs ?? []).map((p) => this.programStmt(p)),
      ...(seed.templates ?? []).map((t) => this.templateStmt(t)),
      ...seed.courses.map((course) => this.courseStmt(course)),
      ...seed.modules.map((module) => this.moduleStmt(module)),
      ...[...seed.lessons].sort((a, b) => Number(!!a.variantOf) - Number(!!b.variantOf)).map((lesson) => this.lessonStmt(lesson)),
      ...seed.blocks.map((block) => this.blockStmt(block)),
      ...(seed.rubrics ?? []).map((r) => this.rubricStmt(r)),
      ...(seed.outcomes ?? seed.courses.flatMap(course => course.outcomes.flatMap((value, i) => value.trim() ? [{ id: `${course.id}-o${i + 1}`, courseId: course.id, code: `O${i + 1}`, text: value, position: i }] : []))).map((o) => this.outcomeStmt(o)),
      ...(seed.outcomeLinks ?? []).map((link) => this.linkStmt(link)),
      ...(seed.requirements ?? []).map((r) => this.requirementStmt(r)),
      ...(seed.completionEvents ?? []).map((e) => this.completionEventStmt(e)),
      ...(seed.testOuts ?? []).map((t) => this.testOutStmt(t)),
      ...(seed.testOutAttempts ?? []).map((a) => this.testOutAttemptStmt(a)),
      ...(seed.certificates ?? []).map((c) => this.certificateStmt(c)),
      ...(seed.reportingLines ?? []).map((line) => this.reportingLineStmt(line)),
      ...(seed.managerConsents ?? []).map((c) => this.managerConsentStmt(c)),
      ...seed.assignments.map((assignment) => this.assignmentStmt(assignment)),
      ...seed.submissions.map((submission) => this.submissionStmt(submission)),
      ...seed.tutorSettings.map((s) => this.db.prepare('INSERT INTO tutor_settings (activity_kind,activity_id,mode,max_hints,allowed_source_ids,set_by,set_at) VALUES (?,?,?,?,?,?,?)').bind(s.activityKind,s.activityId,s.mode,s.maxHints,JSON.stringify(s.allowedSourceIds),s.setBy,s.setAt)),
      ...seed.tutorSessions.map((s) => this.db.prepare('INSERT INTO tutor_sessions (id,student_id,activity_kind,activity_id,course_id,mode,hints_used,max_hints,answer_requests,messages,started_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(s.id,s.studentId,s.activityKind,s.activityId,s.courseId,s.mode,s.hintsUsed,s.maxHints,s.answerRequests,JSON.stringify(s.messages),s.startedAt,s.updatedAt)),
      ...seed.enrollments.map((row) => this.enrollmentStmt(row.courseId, row.userId)),
      ...seed.announcements.map((announcement) => this.announcementStmt(announcement)),
      ...seed.reads.map((read) => this.readStmt(read)),
      ...seed.progress.map((progress) => this.progressStmt(progress)),
      ...seed.adaptations.map((adaptation) => this.adaptationStmt(adaptation)),
      ...seed.builderSessions.map((session) => this.builderStmt(session)),
      ...(seed.designSessions ?? []).map((session) => this.designSessionStmt(session)),
      ...(seed.instructorProfiles ?? []).map((profile) => this.instructorProfileStmt(profile)),
      ...seed.generationJobs.map((job) => this.generationStmt(job)),
    ]);
  }

  private async all<T extends Record<string, unknown>>(sql: string, params: SqlBind[] = []): Promise<T[]> {
    const { results } = await this.db.prepare(sql).bind(...params).all<T>();
    return results;
  }

  private async first<T extends Record<string, unknown>>(sql: string, params: SqlBind[] = []): Promise<T | null> {
    return this.db.prepare(sql).bind(...params).first<T>();
  }

  private institutionStmt(institution: Institution): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO institution (id, name, short_name, accent, setup_complete, policy, access_policy, template_id, readiness_policy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         short_name = excluded.short_name,
         accent = excluded.accent,
         setup_complete = excluded.setup_complete,
         policy = excluded.policy,
         access_policy = excluded.access_policy,
         template_id = excluded.template_id,
         readiness_policy = excluded.readiness_policy`,
    ).bind(
      institution.id,
      institution.name,
      institution.shortName,
      institution.accent,
      bit(institution.setupComplete),
      JSON.stringify(institution.policy),
      JSON.stringify(institution.accessPolicy),
      institution.templateId ?? null,
      jsonOrNull(institution.readinessPolicy),
    );
  }

  private userStmt(user: User): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO users (id, name, email, role, initials, profile)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         email = excluded.email,
         role = excluded.role,
         initials = excluded.initials,
         profile = excluded.profile`,
    ).bind(user.id, user.name, user.email, user.role, user.initials, jsonOrNull(user.profile));
  }

  private courseStmt(course: Course): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO courses (id, code, title, term, description, welcome, outcomes, instructor_ids, status, program_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         code = excluded.code,
         title = excluded.title,
         term = excluded.term,
         description = excluded.description,
         welcome = excluded.welcome,
         outcomes = excluded.outcomes,
         instructor_ids = excluded.instructor_ids,
         status = excluded.status,
         program_id = excluded.program_id`,
    ).bind(
      course.id,
      course.code,
      course.title,
      course.term,
      course.description,
      course.welcome,
      JSON.stringify(course.outcomes),
      JSON.stringify(course.instructorIds),
      course.status,
      course.programId ?? null,
    );
  }

  private enrollmentStmt(courseId: Id, userId: Id): D1PreparedStatement {
    return this.db.prepare('INSERT INTO enrollments (course_id, user_id) VALUES (?, ?)').bind(courseId, userId);
  }

  private moduleStmt(module: Module): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO modules (id, course_id, title, position, objective, template_key)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         course_id = excluded.course_id,
         title = excluded.title,
         position = excluded.position,
         objective = excluded.objective,
         template_key = excluded.template_key`,
    ).bind(module.id, module.courseId, module.title, module.position, module.objective ?? null, module.templateKey ?? null);
  }

  private lessonStmt(lesson: Lesson): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO lessons (id, module_id, course_id, title, minutes, position, status, published_at, template_key, variant_of, variant_audience, variant_synced_at, objective)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         module_id = excluded.module_id,
         course_id = excluded.course_id,
         title = excluded.title,
         minutes = excluded.minutes,
         position = excluded.position,
         status = excluded.status,
         published_at = excluded.published_at,
         template_key = excluded.template_key,
         variant_of = excluded.variant_of,
         variant_audience = excluded.variant_audience,
         variant_synced_at = excluded.variant_synced_at,
         objective = excluded.objective`,
    ).bind(
      lesson.id,
      lesson.moduleId,
      lesson.courseId,
      lesson.title,
      lesson.minutes,
      lesson.position,
      lesson.status,
      lesson.publishedAt,
      lesson.templateKey ?? null,
      lesson.variantOf?.lessonId ?? null,
      lesson.variantOf?.audience ?? null,
      lesson.variantOf?.syncedAt ?? null,
      lesson.objective ?? null,
    );
  }

  private blockStmt(block: Block): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO blocks (id, lesson_id, position, type, content, origin, ai_state, provenance, previous, updated_at, template_key, source_block_id, source_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         lesson_id = excluded.lesson_id,
         position = excluded.position,
         type = excluded.type,
         content = excluded.content,
         origin = excluded.origin,
         ai_state = excluded.ai_state,
         provenance = excluded.provenance,
         previous = excluded.previous,
         updated_at = excluded.updated_at,
         template_key = excluded.template_key,
         source_block_id = excluded.source_block_id,
         source_hash = excluded.source_hash`,
    ).bind(
      block.id,
      block.lessonId,
      block.position,
      block.type,
      contentJson(block),
      block.origin,
      block.aiState,
      jsonOrNull(block.provenance),
      jsonOrNull(block.previous),
      block.updatedAt,
      block.templateKey ?? null,
      block.source?.blockId ?? null,
      block.source?.hash ?? null,
    );
  }

  private assignmentStmt(a: Assignment): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO assignments (id,module_id,course_id,title,position,status,published_at,due_at,points,submission_type,rubric,instructions)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET module_id=excluded.module_id,course_id=excluded.course_id,title=excluded.title,
      position=excluded.position,status=excluded.status,published_at=excluded.published_at,due_at=excluded.due_at,points=excluded.points,
      submission_type=excluded.submission_type,rubric=excluded.rubric,instructions=excluded.instructions`)
      .bind(a.id,a.moduleId,a.courseId,a.title,a.position,a.status,a.publishedAt,a.dueAt,a.points,a.submissionType,JSON.stringify(a.rubric),JSON.stringify(a.instructions));
  }
  private submissionStmt(s: Submission): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO submissions (id,assignment_id,student_id,attempt,state,text,file_id,link,submitted_at,grade)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET assignment_id=excluded.assignment_id,student_id=excluded.student_id,
      attempt=excluded.attempt,state=excluded.state,text=excluded.text,file_id=excluded.file_id,link=excluded.link,submitted_at=excluded.submitted_at,grade=excluded.grade`)
      .bind(s.id,s.assignmentId,s.studentId,s.attempt,s.state,s.text,s.fileId,s.link,s.submittedAt,jsonOrNull(s.grade));
  }

  private announcementStmt(announcement: StoredAnnouncement): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO announcements (
         id, course_id, author_id, title, body, pinned, status, origin, ai_state, provenance, published_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         course_id = excluded.course_id,
         author_id = excluded.author_id,
         title = excluded.title,
         body = excluded.body,
         pinned = excluded.pinned,
         status = excluded.status,
         origin = excluded.origin,
         ai_state = excluded.ai_state,
         provenance = excluded.provenance,
         published_at = excluded.published_at,
         created_at = excluded.created_at`,
    ).bind(
      announcement.id,
      announcement.courseId,
      announcement.authorId,
      announcement.title,
      announcement.body,
      bit(announcement.pinned),
      announcement.status,
      announcement.origin,
      announcement.aiState,
      jsonOrNull(announcement.provenance),
      announcement.publishedAt,
      announcement.createdAt,
    );
  }

  private readStmt(read: AnnouncementRead): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO announcement_reads (announcement_id, user_id, read_at)
       VALUES (?, ?, ?)
       ON CONFLICT(announcement_id, user_id) DO NOTHING`,
    ).bind(read.announcementId, read.userId, read.readAt);
  }

  private progressStmt(progress: StoredProgress): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO progress (user_id, lesson_id, state, checks, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, lesson_id) DO UPDATE SET
         state = excluded.state,
         checks = excluded.checks,
         updated_at = excluded.updated_at`,
    ).bind(progress.userId, progress.lessonId, progress.state, JSON.stringify(progress.checks), progress.updatedAt);
  }

  private builderStmt(session: BuilderSession): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO builder_sessions (id, course_id, data, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         course_id = excluded.course_id,
         data = excluded.data,
         created_at = excluded.created_at`,
    ).bind(session.id, session.courseId, JSON.stringify(session), session.createdAt);
  }

  private designSessionStmt(session: DesignSession): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO design_sessions (id, course_id, data, stage, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET course_id = excluded.course_id, data = excluded.data,
      stage = excluded.stage, created_by = excluded.created_by, created_at = excluded.created_at,
      updated_at = excluded.updated_at`)
      .bind(session.id, session.courseId, JSON.stringify(session), session.stage, session.createdBy, session.createdAt, session.updatedAt);
  }

  private instructorProfileStmt(profile: InstructorProfile): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO instructor_profiles (user_id, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .bind(profile.userId, JSON.stringify(profile), profile.updatedAt);
  }

  private generationStmt(job: GenerationJob): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO generation_jobs
      (id, course_id, requested_by, state, done, total, lesson_ids, error, created_at, updated_at, work, instruction, failures, runner, kind, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET state = excluded.state, done = excluded.done,
      lesson_ids = excluded.lesson_ids, error = excluded.error, updated_at = excluded.updated_at,
      work = excluded.work, instruction = excluded.instruction, failures = excluded.failures, runner = excluded.runner,
      kind = excluded.kind, session_id = excluded.session_id`)
      .bind(job.id, job.courseId, job.requestedBy, job.state, job.done, job.total,
        JSON.stringify(job.lessonIds), job.error, job.createdAt, job.updatedAt,
        JSON.stringify(job.work), job.instruction, jobNotes(job), job.runner ?? 'poll', job.kind ?? 'generate', job.sessionId ?? null);
  }

  private adaptationStmt(value: Adaptation): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO adaptations (id, student_id, kind, why, before_value, after_value, applied_at, undone_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, why = excluded.why,
        before_value = excluded.before_value, after_value = excluded.after_value, undone_at = excluded.undone_at`)
      .bind(value.id, value.studentId, value.kind, value.why, JSON.stringify({ value: value.before }), JSON.stringify({ value: value.after }), value.appliedAt, value.undoneAt);
  }

  private programStmt(p: Program): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO programs (id,name,description,template_id,brand,created_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,template_id=excluded.template_id,brand=excluded.brand,created_at=excluded.created_at`)
      .bind(p.id, p.name, p.description, p.templateId, JSON.stringify(p.brand), p.createdAt);
  }
  private templateStmt(t: CourseTemplate): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO templates (id,name,description,owner_kind,program_id,body,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,owner_kind=excluded.owner_kind,program_id=excluded.program_id,body=excluded.body,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(t.id, t.name, t.description, t.owner.kind, t.owner.kind === 'program' ? t.owner.programId : null,
        JSON.stringify({ modules: t.modules, tutorDefaults: t.tutorDefaults, accessFloor: t.accessFloor }), t.updatedBy, t.updatedAt);
  }
  private rubricStmt(r: Rubric): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO rubrics (id,name,version,attribution,standards,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,version=excluded.version,attribution=excluded.attribution,standards=excluded.standards,updated_at=excluded.updated_at`)
      .bind(r.id, r.name, r.version, r.attribution, JSON.stringify(r.standards), r.updatedAt);
  }
  private readinessStmt(item: StoredReadinessItem): D1PreparedStatement {
    if (!item.finding && !item.attestation) return this.db.prepare('DELETE FROM readiness_items WHERE course_id = ? AND rubric_id = ? AND item_id = ?').bind(item.courseId, item.rubricId, item.itemId);
    return this.db.prepare(`INSERT INTO readiness_items (course_id,rubric_id,item_id,finding,attestation,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(course_id,rubric_id,item_id) DO UPDATE SET finding=excluded.finding,attestation=excluded.attestation,updated_at=excluded.updated_at`)
      .bind(item.courseId, item.rubricId, item.itemId, jsonOrNull(item.finding), jsonOrNull(item.attestation), item.updatedAt);
  }
  private outcomeStmt(o: Outcome): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO outcomes (id,course_id,code,text,position) VALUES (?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET course_id=excluded.course_id,code=excluded.code,text=excluded.text,position=excluded.position`)
      .bind(o.id, o.courseId, o.code, o.text, o.position);
  }
  private linkStmt(link: OutcomeLink): D1PreparedStatement {
    return this.db.prepare('INSERT INTO outcome_links (outcome_id,target_kind,target_id) VALUES (?,?,?)').bind(link.outcomeId, link.targetKind, link.targetId);
  }
  private requirementStmt(r: Requirement): D1PreparedStatement {
    const targetId = r.target.kind === 'course' ? r.target.courseId : r.target.programId;
    return this.db.prepare(`INSERT INTO requirements (id,target_kind,target_id,audience,due_at,recurrence,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET target_kind=excluded.target_kind,target_id=excluded.target_id,audience=excluded.audience,due_at=excluded.due_at,recurrence=excluded.recurrence,created_by=excluded.created_by,created_at=excluded.created_at`)
      .bind(r.id, r.target.kind, targetId, JSON.stringify(r.audience), r.dueAt, r.recurrence, r.createdBy, r.createdAt);
  }
  private completionEventStmt(e: CompletionEvent): D1PreparedStatement {
    return this.db.prepare('INSERT INTO completion_events (id,at,user_id,course_id,requirement_id,kind,actor_id,detail) VALUES (?,?,?,?,?,?,?,?)')
      .bind(e.id, e.at, e.userId, e.courseId, e.requirementId, e.kind, e.actorId, e.detail);
  }
  private testOutStmt(t: TestOut): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO test_outs (course_id,items,pass_percent,updated_by,updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(course_id) DO UPDATE SET items=excluded.items,pass_percent=excluded.pass_percent,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(t.courseId, JSON.stringify(t.items), t.passPercent, t.updatedBy, t.updatedAt);
  }
  private testOutAttemptStmt(a: TestOutAttempt): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO test_out_attempts (id,course_id,user_id,percent,passed,at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET course_id=excluded.course_id,user_id=excluded.user_id,percent=excluded.percent,passed=excluded.passed,at=excluded.at`)
      .bind(a.id, a.courseId, a.userId, a.percent, bit(a.passed), a.at);
  }
  private certificateStmt(c: Certificate): D1PreparedStatement {
    return this.db.prepare('INSERT INTO certificates (id,code,user_id,learner_name,course_id,course_title,issued_at,basis,replaces,replaced_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(c.id, c.code, c.userId, c.learnerName, c.courseId, c.courseTitle, c.issuedAt, c.basis, c.replaces, c.replacedBy);
  }
  private reportingLineStmt(line: ReportingLine): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO reporting_lines (manager_id,report_id,created_by,created_at) VALUES (?,?,?,?)
      ON CONFLICT(manager_id,report_id) DO UPDATE SET created_by=excluded.created_by`)
      .bind(line.managerId, line.reportId, line.createdBy, line.createdAt);
  }
  private managerConsentStmt(c: ManagerConsent): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO manager_consents (manager_id,report_id,sharing,at) VALUES (?,?,?,?)
      ON CONFLICT(manager_id,report_id) DO UPDATE SET sharing=excluded.sharing,at=excluded.at`)
      .bind(c.managerId, c.reportId, bit(c.sharing), c.at);
  }
}

interface InvitationRow extends Record<string, unknown> { user_id: string; email: string; invited_by: string; invited_at: string; access_granted: number; access_error: string | null; accepted_at: string | null }
function invitationFromRow(row: InvitationRow): Invitation {
  return { userId: row.user_id, email: row.email, invitedBy: row.invited_by, invitedAt: row.invited_at,
    accessGranted: Boolean(row.access_granted), accessError: row.access_error, acceptedAt: row.accepted_at };
}

interface AdaptationRow extends Record<string, unknown> {
  id: string; student_id: string; kind: Adaptation['kind']; why: string;
  before_value: string; after_value: string; applied_at: string; undone_at: string | null;
}
function adaptationFromRow(row: AdaptationRow): Adaptation {
  return { id: row.id, studentId: row.student_id, kind: row.kind, why: row.why,
    before: (JSON.parse(row.before_value) as { value?: unknown }).value,
    after: (JSON.parse(row.after_value) as { value?: unknown }).value,
    appliedAt: row.applied_at, undoneAt: row.undone_at };
}

interface GenerationRow extends Record<string, unknown> {
  id: string; course_id: string; requested_by: string; state: GenerationJob['state'];
  done: number; total: number; lesson_ids: string; error: string | null;
  created_at: string; updated_at: string; work: string; instruction: string; failures: string; runner: 'poll' | 'workflow' | null;
  kind: 'generate' | 'extract' | 'scaffold'; session_id: string | null;
}
function generationFromRow(row: GenerationRow): GenerationJob {
  const stored = JSON.parse(row.failures) as GenerationJob['failures'] | { failures: GenerationJob['failures']; notes: NonNullable<GenerationJob['notes']> };
  return { id: row.id, courseId: row.course_id, requestedBy: row.requested_by,
    state: row.state, done: row.done, total: row.total, lessonIds: JSON.parse(row.lesson_ids),
    error: row.error, createdAt: row.created_at, updatedAt: row.updated_at,
    work: JSON.parse(row.work), instruction: row.instruction, failures: Array.isArray(stored) ? stored : stored.failures,
    ...(!Array.isArray(stored) ? { notes: stored.notes } : {}),
    ...(row.runner === 'workflow' ? { runner: 'workflow' as const } : {}),
    ...(row.kind !== 'generate' ? { kind: row.kind } : {}),
    ...(row.session_id !== null ? { sessionId: row.session_id } : {}) };
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

function bit(value: boolean): number {
  return value ? 1 : 0;
}

function flag(value: unknown): boolean {
  return value === 1 || value === true;
}

function jsonOrNull(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}

function parseJson<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
}

function contentJson(block: Block): string {
  // Every block type: the content is the block minus its metadata columns.
  const { id: _id, lessonId: _l, position: _p, origin: _o, aiState: _a, provenance: _pr, previous: _pv, updatedAt: _u, templateKey: _t, source: _s, ...content } = block;
  return JSON.stringify(content);
}

interface FileRow extends Record<string, unknown> { id: string; course_id: string; name: string; kind: FileRecord['kind']; mime: string; size: number; key: string; version: number; uploaded_by: string; uploaded_at: string }
interface ScanRow extends Record<string, unknown> { id: string; target_kind: 'lesson' | 'file'; target_id: string; version: number | null; course_id: string; score: number; grade: StoredScan['grade']; issue_count: number; by_severity: string; issues: string; document: string | null; scanned_at: string }
interface FormatRow extends Record<string, unknown> { file_id: string; version: number; format: AccessibleFormat; state: StoredFormat['state']; output_key: string | null; generated_at: string | null; error: string | null }
function scanFromRow(r: ScanRow): StoredScan {
  return { id: r.id, courseId: r.course_id, version: r.version, target: r.target_kind === 'lesson' ? { kind: 'lesson', lessonId: r.target_id } : { kind: 'file', fileId: r.target_id, version: r.version ?? 1 },
    score: r.score, grade: r.grade, issueCount: r.issue_count, bySeverity: JSON.parse(r.by_severity), issues: JSON.parse(r.issues), document: r.document ? JSON.parse(r.document) : null, scannedAt: r.scanned_at };
}
function formatFromRow(r: FormatRow): StoredFormat {
  return { fileId: r.file_id, version: r.version, format: r.format, state: r.state, outputKey: r.output_key, generatedAt: r.generated_at, error: r.error };
}

interface TokenRow extends Record<string, unknown> {
  id: string; name: string; prefix: string; hash: string; scopes: string; owner_id: string;
  created_at: string; expires_at: string | null; last_used_at: string | null; revoked_at: string | null;
}
function tokenFromRow(r: TokenRow): ApiToken & { hash: string } {
  return { id: r.id, name: r.name, prefix: r.prefix, hash: r.hash, scopes: JSON.parse(r.scopes), ownerId: r.owner_id, createdAt: r.created_at, expiresAt: r.expires_at, lastUsedAt: r.last_used_at, revokedAt: r.revoked_at };
}

interface ProgramRow extends Record<string, unknown> { id: Id; name: string; description: string; template_id: Id | null; brand: string; created_at: string }
const programFromRow = (r: ProgramRow): Program => ({ id: r.id, name: r.name, description: r.description, templateId: r.template_id, brand: parseJson(r.brand), createdAt: r.created_at });
interface TemplateRow extends Record<string, unknown> { id: Id; name: string; description: string; owner_kind: CourseTemplate['owner']['kind']; program_id: Id | null; body: string; updated_by: Id; updated_at: string }
function templateFromRow(r: TemplateRow): CourseTemplate {
  const body = parseJson<Pick<CourseTemplate, 'modules' | 'tutorDefaults' | 'accessFloor'>>(r.body);
  return { id: r.id, name: r.name, description: r.description, owner: r.owner_kind === 'program' ? { kind: 'program', programId: r.program_id! } : { kind: 'institution' },
    ...body, updatedBy: r.updated_by, updatedAt: r.updated_at };
}
interface RubricRow extends Record<string, unknown> { id: Id; name: string; version: string; attribution: string | null; standards: string; updated_at: string }
const rubricFromRow = (r: RubricRow): Rubric => ({ id: r.id, name: r.name, source: 'custom', version: r.version, attribution: r.attribution, builtIn: false, standards: parseJson(r.standards), updatedAt: r.updated_at });
interface ReadinessRow extends Record<string, unknown> { course_id: Id; rubric_id: Id; item_id: Id; finding: string | null; attestation: string | null; updated_at: string }
const readinessFromRow = (r: ReadinessRow): StoredReadinessItem => ({ courseId: r.course_id, rubricId: r.rubric_id, itemId: r.item_id, finding: r.finding === null ? null : parseJson(r.finding), attestation: r.attestation === null ? null : parseJson(r.attestation), updatedAt: r.updated_at });
interface OutcomeRow extends Record<string, unknown> { id: Id; course_id: Id; code: string; text: string; position: number }
const outcomeFromRow = (r: OutcomeRow): Outcome => ({ id: r.id, courseId: r.course_id, code: r.code, text: r.text, position: r.position });
interface OutcomeLinkRow extends Record<string, unknown> { outcome_id: Id; target_kind: AlignableKind; target_id: Id }
const linkFromRow = (r: OutcomeLinkRow): OutcomeLink => ({ outcomeId: r.outcome_id, targetKind: r.target_kind, targetId: r.target_id });
interface RequirementRow extends Record<string, unknown> { id: Id; target_kind: Requirement['target']['kind']; target_id: Id; audience: string; due_at: string | null; recurrence: Requirement['recurrence']; created_by: Id; created_at: string }
const requirementFromRow = (r: RequirementRow): Requirement => ({ id: r.id, target: r.target_kind === 'course' ? { kind: 'course', courseId: r.target_id } : { kind: 'program', programId: r.target_id }, audience: parseJson(r.audience), dueAt: r.due_at, recurrence: r.recurrence, createdBy: r.created_by, createdAt: r.created_at });
interface CompletionEventRow extends Record<string, unknown> { id: Id; at: string; user_id: Id; course_id: Id; requirement_id: Id | null; kind: CompletionEvent['kind']; actor_id: Id | null; detail: string }
const eventFromRow = (r: CompletionEventRow): CompletionEvent => ({ id: r.id, at: r.at, userId: r.user_id, courseId: r.course_id, requirementId: r.requirement_id, kind: r.kind, actorId: r.actor_id, detail: r.detail });
interface TestOutRow extends Record<string, unknown> { course_id: Id; items: string; pass_percent: number; updated_by: Id; updated_at: string }
const testOutFromRow = (r: TestOutRow): TestOut => ({ courseId: r.course_id, items: parseJson(r.items), passPercent: r.pass_percent, updatedBy: r.updated_by, updatedAt: r.updated_at });
interface TestOutAttemptRow extends Record<string, unknown> { id: Id; course_id: Id; user_id: Id; percent: number; passed: number; at: string }
const attemptFromRow = (r: TestOutAttemptRow): TestOutAttempt => ({ id: r.id, courseId: r.course_id, userId: r.user_id, percent: r.percent, passed: flag(r.passed), at: r.at });
interface CertificateRow extends Record<string, unknown> { id: Id; code: string; user_id: Id; learner_name: string; course_id: Id; course_title: string; issued_at: string; basis: Certificate['basis']; replaces: Id | null; replaced_by: Id | null }
const certificateFromRow = (r: CertificateRow): Certificate => ({ id: r.id, code: r.code, userId: r.user_id, learnerName: r.learner_name, courseId: r.course_id, courseTitle: r.course_title, issuedAt: r.issued_at, basis: r.basis, replaces: r.replaces, replacedBy: r.replaced_by });
interface ReportingLineRow extends Record<string, unknown> { manager_id: Id; report_id: Id; created_by: Id; created_at: string }
const reportingFromRow = (r: ReportingLineRow): ReportingLine => ({ managerId: r.manager_id, reportId: r.report_id, createdBy: r.created_by, createdAt: r.created_at });
interface ConsentRow extends Record<string, unknown> { manager_id: Id; report_id: Id; sharing: number; at: string }
const consentFromRow = (r: ConsentRow): ManagerConsent => ({ managerId: r.manager_id, reportId: r.report_id, sharing: flag(r.sharing), at: r.at });

interface InstitutionRow extends Record<string, unknown> {
  id: string;
  name: string;
  short_name: string;
  accent: Institution['accent'];
  setup_complete: number;
  policy: string;
  access_policy: string | null;
  template_id: string | null;
  readiness_policy: string | null;
}

interface UserRow extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  role: User['role'];
  initials: string;
  profile: string | null;
}

interface CourseRow extends Record<string, unknown> {
  id: string;
  code: string;
  title: string;
  term: string;
  description: string;
  welcome: string;
  outcomes: string;
  instructor_ids: string;
  status: Course['status'];
  program_id: string | null;
}

interface EnrollmentRow extends Record<string, unknown> {
  course_id: string;
  user_id: string;
}

interface ModuleRow extends Record<string, unknown> {
  id: string;
  course_id: string;
  title: string;
  position: number;
  objective: string | null;
  template_key: string | null;
}

interface LessonRow extends Record<string, unknown> {
  id: string;
  module_id: string;
  course_id: string;
  title: string;
  minutes: number;
  position: number;
  status: Lesson['status'];
  published_at: string | null;
  template_key: string | null;
  objective: string | null;
  variant_of: string | null;
  variant_synced_at: string | null; variant_audience: NonNullable<Lesson['variantOf']>['audience'] | null;
}

interface BlockRow extends Record<string, unknown> {
  id: string;
  lesson_id: string;
  position: number;
  type: Block['type'];
  content: string;
  origin: Block['origin'];
  ai_state: Block['aiState'];
  provenance: string | null;
  previous: string | null;
  updated_at: string;
  template_key: string | null;
  source_block_id: string | null;
  source_hash: string | null;
}

interface AnnouncementRow extends Record<string, unknown> {
  id: string;
  course_id: string;
  author_id: string;
  title: string;
  body: string;
  pinned: number;
  status: StoredAnnouncement['status'];
  origin: StoredAnnouncement['origin'];
  ai_state: StoredAnnouncement['aiState'];
  provenance: string | null;
  published_at: string | null;
  created_at: string;
}

interface ReadRow extends Record<string, unknown> {
  announcement_id: string;
  user_id: string;
  read_at: string;
}

interface ProgressRow extends Record<string, unknown> {
  user_id: string;
  lesson_id: string;
  state: StoredProgress['state'];
  checks: string;
  updated_at: string | null;
}

interface BuilderRow extends Record<string, unknown> {
  id: string;
  course_id: string;
  data: string;
  created_at: string;
}

function institutionFromRow(row: InstitutionRow): Institution {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    accent: row.accent,
    setupComplete: flag(row.setup_complete),
    policy: parseJson(row.policy),
    accessPolicy: row.access_policy ? parseJson(row.access_policy) : { minimumScore: 0, blockingSeverities: ['critical'] },
    ...(row.template_id !== null ? { templateId: row.template_id } : {}),
    ...(row.readiness_policy !== null ? { readinessPolicy: parseJson(row.readiness_policy) } : {}),
  };
}

function userFromRow(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    initials: row.initials,
    profile: row.profile == null ? null : parseJson(row.profile),
  };
}

function courseFromRow(row: CourseRow): Course {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    term: row.term,
    description: row.description,
    welcome: row.welcome,
    outcomes: parseJson(row.outcomes),
    instructorIds: parseJson(row.instructor_ids),
    status: row.status,
    ...(row.program_id !== null ? { programId: row.program_id } : {}),
  };
}

function moduleFromRow(row: ModuleRow): Module {
  return { id: row.id, courseId: row.course_id, title: row.title, position: row.position,
    ...(row.objective !== null ? { objective: row.objective } : {}),
    ...(row.template_key !== null ? { templateKey: row.template_key } : {}) };
}

function lessonFromRow(row: LessonRow): Lesson {
  return {
    id: row.id,
    moduleId: row.module_id,
    courseId: row.course_id,
    title: row.title,
    minutes: row.minutes,
    position: row.position,
    status: row.status,
    publishedAt: row.published_at,
    ...(row.template_key !== null ? { templateKey: row.template_key } : {}),
    ...(row.objective !== null ? { objective: row.objective } : {}),
    ...(row.variant_of !== null && row.variant_audience !== null ? { variantOf: { lessonId: row.variant_of, audience: row.variant_audience, syncedAt: row.variant_synced_at ?? '' } } : {}),
  };
}

function blockFromRow(row: BlockRow): Block {
  const content = parseJson<BlockContent>(row.content);
  return {
    ...content,
    id: row.id,
    lessonId: row.lesson_id,
    position: row.position,
    origin: row.origin,
    aiState: row.ai_state ?? null,
    provenance: row.provenance == null ? null : parseJson(row.provenance),
    previous: row.previous == null ? null : parseJson(row.previous),
    updatedAt: row.updated_at,
    ...(row.template_key !== null ? { templateKey: row.template_key } : {}),
    ...(row.source_block_id !== null && row.source_hash !== null ? { source: { blockId: row.source_block_id, hash: row.source_hash } } : {}),
  };
}

function announcementFromRow(row: AnnouncementRow): StoredAnnouncement {
  return {
    id: row.id,
    courseId: row.course_id,
    authorId: row.author_id,
    title: row.title,
    body: row.body,
    pinned: flag(row.pinned),
    status: row.status,
    origin: row.origin,
    aiState: row.ai_state ?? null,
    provenance: row.provenance == null ? null : parseJson(row.provenance),
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

function progressFromRow(row: ProgressRow): StoredProgress {
  return {
    userId: row.user_id,
    lessonId: row.lesson_id,
    state: row.state,
    checks: parseJson(row.checks),
    updatedAt: row.updated_at,
  };
}

interface AssignmentRow extends Record<string, unknown> {
  id: string; module_id: string; course_id: string; title: string; position: number; status: Assignment['status'];
  published_at: string | null; due_at: string | null; points: number; submission_type: Assignment['submissionType']; rubric: string; instructions: string;
}
function assignmentFromRow(r: AssignmentRow): Assignment {
  return { id:r.id,moduleId:r.module_id,courseId:r.course_id,title:r.title,position:r.position,status:r.status,publishedAt:r.published_at,
    dueAt:r.due_at,points:r.points,submissionType:r.submission_type,rubric:parseJson(r.rubric),instructions:parseJson(r.instructions) };
}
interface SubmissionRow extends Record<string, unknown> {
  id: string; assignment_id: string; student_id: string; attempt: number; state: Submission['state']; text: string;
  file_id: string | null; link: string; submitted_at: string; grade: string | null;
}
function submissionFromRow(r: SubmissionRow): Submission {
  return { id:r.id,assignmentId:r.assignment_id,studentId:r.student_id,attempt:r.attempt,state:r.state,text:r.text,fileId:r.file_id,
    link:r.link,submittedAt:r.submitted_at,grade:r.grade ? parseJson(r.grade) : null };
}

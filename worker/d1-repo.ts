// D1 implementation of Repo. JSON columns are text; booleans are 0/1.
// `put*` upserts. replaceBlocks, setEnrollments, deleteLesson, and reset each run
// in one batch so a failure leaves the previous rows in place.
import type {
  AccessibleFormat, ActivityKind, Adaptation, AlignableKind, ApiToken, Assignment, Block, BlockContent, BuilderSession, Certificate, CompletionEvent, Course, CourseTemplate, FileRecord, Id, Institution, Invitation, Lesson, ManagerConsent, Module, Outcome, OutcomeLink, Program, ReportingLine, Requirement, Role, Rubric, Submission, TestOut, TutorSetting, User,
} from '../shared/domain';
import type {
  AnnouncementRead, Enrollment, Repo, StoredAnnouncement, StoredProgress, FileVersion, StoredScan, StoredFormat, GenerationJob, StoredTutorSession, StoredReadinessItem, TestOutAttempt,
} from '../shared/repo';
import type { SeedData } from '../shared/seed';
import { ApiError } from '../shared/api';
import type { IdentityKind, IdentityLinkSuggestion, ToolSession, UserIdentity } from '../shared/domain';
import { asciiLower } from '../shared/service/interop/ascii';

type SqlBind = string | number | null;

const DELETE_ORDER = [
  'identity_link_suggestions', 'tool_sessions', 'user_identities',
  'manager_consents', 'reporting_lines', 'certificates', 'test_out_attempts', 'test_outs',
  'completion_events', 'requirements', 'outcome_links', 'outcomes', 'readiness_items', 'rubrics', 'templates', 'programs',
  // Night 2 tables first (they reference users, courses, modules, files).
  'idempotency_keys', 'api_tokens', 'format_jobs', 'file_versions', 'access_scans', 'submissions', 'assignments',
  'tutor_sessions', 'tutor_settings', 'adaptations', 'invitations', 'generation_jobs', 'files',
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
      `INSERT INTO institution (id, name, short_name, accent, setup_complete, policy, access_policy, template_id, readiness_policy, sso)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         short_name = excluded.short_name,
         accent = excluded.accent,
         setup_complete = excluded.setup_complete,
         policy = excluded.policy,
         access_policy = excluded.access_policy,
         template_id = excluded.template_id,
         readiness_policy = excluded.readiness_policy,
         sso = excluded.sso`,
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
      jsonOrNull(institution.sso),
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
      `INSERT INTO lessons (id, module_id, course_id, title, minutes, position, status, published_at, template_key, variant_of, variant_audience, variant_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
         variant_synced_at = excluded.variant_synced_at`,
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

  private generationStmt(job: GenerationJob): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO generation_jobs
      (id, course_id, requested_by, state, done, total, lesson_ids, error, created_at, updated_at, work, instruction, failures, runner)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET state = excluded.state, done = excluded.done,
      lesson_ids = excluded.lesson_ids, error = excluded.error, updated_at = excluded.updated_at,
      work = excluded.work, instruction = excluded.instruction, failures = excluded.failures, runner = excluded.runner`)
      .bind(job.id, job.courseId, job.requestedBy, job.state, job.done, job.total,
        JSON.stringify(job.lessonIds), job.error, job.createdAt, job.updatedAt,
        JSON.stringify(job.work), job.instruction, JSON.stringify(job.failures), job.runner ?? 'poll');
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
  async getUserIdentity(kind: IdentityKind, key: string): Promise<UserIdentity | null> {
    const row = await this.first<IdentityRow>('SELECT * FROM user_identities WHERE kind = ? AND key = ?', [kind, kind === 'access-email' ? asciiLower(key) : key]);
    return row ? identityFromRow(row) : null;
  }
  async listUserIdentities(userId: Id): Promise<UserIdentity[]> {
    return (await this.all<IdentityRow>('SELECT * FROM user_identities WHERE user_id = ? ORDER BY kind, key', [userId])).map(identityFromRow);
  }
  async insertUserWithIdentity(user: User, identity: UserIdentity): Promise<{ inserted: true; user: User } | { inserted: false; user: User }> {
    const key = identity.kind === 'access-email' ? asciiLower(identity.key) : identity.key;
    const results = await this.db.batch([
      this.db.prepare(`INSERT INTO users (id,name,email,role,initials,profile)
        SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM user_identities WHERE kind=? AND key=?)
        AND NOT EXISTS (SELECT 1 FROM users WHERE lower(email)=?)`)
        .bind(user.id,user.name,user.email,user.role,user.initials,jsonOrNull(user.profile),identity.kind,key,asciiLower(user.email)),
      this.db.prepare(`INSERT INTO user_identities (user_id,kind,key,linked_at,linked_by,last_seen_at)
        SELECT ?,?,?,?,?,? WHERE changes()=1 AND EXISTS (SELECT 1 FROM users WHERE id=?)
        AND NOT EXISTS (SELECT 1 FROM user_identities WHERE kind=? AND key=?)`)
        .bind(user.id,identity.kind,key,identity.linkedAt,identity.linkedBy,identity.lastSeenAt,user.id,identity.kind,key),
    ]);
    if (results[0].meta.changes === 1 && results[1].meta.changes === 1) return { inserted: true, user };
    const found = await this.getUserIdentity(identity.kind, key);
    if (found) {
      const linked = await this.getUser(found.userId);
      if (linked) return { inserted: false, user: linked };
    }
    const emailOwner = await this.findUserByEmail(user.email);
    if (emailOwner && identity.kind === 'access-email') return { inserted: false, user: emailOwner };
    throw new Error('LTI synthetic email or user id collided with an existing user.');
  }
  async touchUserIdentity(kind: IdentityKind, key: string, now: string): Promise<void> {
    await this.db.prepare('UPDATE user_identities SET last_seen_at=? WHERE kind=? AND key=?').bind(now,kind,kind === 'access-email' ? asciiLower(key) : key).run();
  }
  async putIdentityLinkSuggestion(s: IdentityLinkSuggestion): Promise<void> {
    await this.db.prepare(`INSERT OR IGNORE INTO identity_link_suggestions (id,identity_kind,identity_key,from_user_id,target_user_id,email,created_at,resolved_at) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(s.id,s.identityKind,s.identityKey,s.fromUserId,s.targetUserId,s.email,s.createdAt,s.resolvedAt).run();
  }
  async listIdentityLinkSuggestions(filter: { open?: boolean }): Promise<IdentityLinkSuggestion[]> {
    const clause = filter.open === undefined ? '' : filter.open ? ' WHERE resolved_at IS NULL' : ' WHERE resolved_at IS NOT NULL';
    return (await this.all<SuggestionRow>(`SELECT * FROM identity_link_suggestions${clause} ORDER BY created_at,id`)).map(suggestionFromRow);
  }
  async insertToolSession(s: ToolSession): Promise<void> {
    await this.db.prepare(`INSERT INTO tool_sessions (id,token_hash,user_id,course_id,role,platform_id,context_id,resource_link_id,created_at,expires_at,return_url,revoked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(s.id,s.tokenHash,s.userId,s.courseId,s.role,s.platformId,s.contextId,s.resourceLinkId,s.createdAt,s.expiresAt,s.returnUrl,s.revokedAt).run();
  }
  async replaceToolSession(s: ToolSession): Promise<void> {
    await this.db.batch([
      this.db.prepare('UPDATE tool_sessions SET revoked_at=? WHERE user_id=? AND platform_id=? AND context_id=? AND revoked_at IS NULL')
        .bind(s.createdAt,s.userId,s.platformId,s.contextId),
      this.db.prepare(`INSERT INTO tool_sessions (id,token_hash,user_id,course_id,role,platform_id,context_id,resource_link_id,created_at,expires_at,return_url,revoked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(s.id,s.tokenHash,s.userId,s.courseId,s.role,s.platformId,s.contextId,s.resourceLinkId,s.createdAt,s.expiresAt,s.returnUrl,s.revokedAt),
    ]);
  }
  async getToolSessionByHash(hash: string): Promise<ToolSession | null> {
    const row = await this.first<ToolSessionRow>('SELECT * FROM tool_sessions WHERE token_hash=?',[hash]);
    return row ? toolSessionFromRow(row) : null;
  }
  async extendToolSession(id: Id, expiresAt: string, now: string): Promise<boolean> {
    const result = await this.db.prepare('UPDATE tool_sessions SET expires_at=? WHERE id=? AND revoked_at IS NULL AND expires_at>? AND expires_at<?')
      .bind(expiresAt,id,now,expiresAt).run();
    return result.meta.changes > 0;
  }
  async revokeToolSessions(filter: { userId: Id; platformId?: Id; contextId: Id }, now: string, exceptId?: Id): Promise<number> {
    const result = await this.db.prepare('UPDATE tool_sessions SET revoked_at=? WHERE user_id=? AND (? IS NULL OR platform_id=?) AND context_id=? AND revoked_at IS NULL AND id<>?')
      .bind(now,filter.userId,filter.platformId ?? null,filter.platformId ?? null,filter.contextId,exceptId ?? '').run();
    return result.meta.changes;
  }
}

interface IdentityRow extends Record<string, unknown> { user_id: Id; kind: IdentityKind; key: string; linked_at: string; linked_by: UserIdentity['linkedBy']; last_seen_at: string | null }
const identityFromRow = (r: IdentityRow): UserIdentity => ({ userId:r.user_id,kind:r.kind,key:r.key,linkedAt:r.linked_at,linkedBy:r.linked_by,lastSeenAt:r.last_seen_at });
interface SuggestionRow extends Record<string, unknown> { id: Id; identity_kind: IdentityKind; identity_key: string; from_user_id: Id; target_user_id: Id; email: string; created_at: string; resolved_at: string | null }
const suggestionFromRow = (r: SuggestionRow): IdentityLinkSuggestion => ({ id:r.id,identityKind:r.identity_kind,identityKey:r.identity_key,fromUserId:r.from_user_id,targetUserId:r.target_user_id,email:r.email,createdAt:r.created_at,resolvedAt:r.resolved_at });
interface ToolSessionRow extends Record<string, unknown> { id: Id; token_hash: string; user_id: Id; course_id: Id; role: ToolSession['role']; platform_id: Id; context_id: Id; resource_link_id: string | null; created_at: string; expires_at: string; return_url: string | null; revoked_at: string | null }
const toolSessionFromRow = (r: ToolSessionRow): ToolSession => ({ id:r.id,tokenHash:r.token_hash,userId:r.user_id,courseId:r.course_id,role:r.role,platformId:r.platform_id,contextId:r.context_id,resourceLinkId:r.resource_link_id,createdAt:r.created_at,expiresAt:r.expires_at,returnUrl:r.return_url,revokedAt:r.revoked_at });

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
}
function generationFromRow(row: GenerationRow): GenerationJob {
  return { id: row.id, courseId: row.course_id, requestedBy: row.requested_by,
    state: row.state, done: row.done, total: row.total, lessonIds: JSON.parse(row.lesson_ids),
    error: row.error, createdAt: row.created_at, updatedAt: row.updated_at,
    work: JSON.parse(row.work), instruction: row.instruction, failures: JSON.parse(row.failures),
    ...(row.runner === 'workflow' ? { runner: 'workflow' as const } : {}) };
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
  sso: string | null;
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
    ...(row.sso !== null ? { sso: parseJson(row.sso) } : {}),
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

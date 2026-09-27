// D1 implementation of Repo. JSON columns are text; booleans are 0/1.
// `put*` upserts. replaceBlocks, setEnrollments, deleteLesson, and reset each run
// in one batch so a failure leaves the previous rows in place.
import type {
  Block, BlockContent, BuilderSession, Course, Id, Institution, Lesson, Module, Role, User, ApiToken,
} from '../shared/domain';
import type {
  AnnouncementRead, Enrollment, Repo, StoredAnnouncement, StoredProgress,
} from '../shared/repo';
import type { SeedData } from '../shared/seed';

type SqlBind = string | number | null;

const DELETE_ORDER = [
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
    const row = await this.first<UserRow>('SELECT * FROM users WHERE email = ?', [email]);
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
       WHERE (? IS NULL OR l.course_id = ?) AND (? IS NULL OR l.module_id = ?)
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
      this.db.prepare('DELETE FROM blocks WHERE lesson_id = ?').bind(id),
      this.db.prepare('DELETE FROM progress WHERE lesson_id = ?').bind(id),
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
  async hasInvitations() {
    const row = await this.first<{ n: number }>('SELECT count(*) AS n FROM invitations');
    return !!row && row.n > 0;
  }

  async isEmpty(): Promise<boolean> {
    const row = await this.first<{ i: number; u: number }>('SELECT (SELECT count(*) FROM institution) AS i, (SELECT count(*) FROM users) AS u');
    return !row || row.i === 0 || row.u === 0;
  }

  async reset(seed: SeedData): Promise<void> {
    await this.db.batch([
      ...DELETE_ORDER.map((table) => this.db.prepare(`DELETE FROM ${table}`)),
      this.institutionStmt(seed.institution),
      ...seed.users.map((user) => this.userStmt(user)),
      ...seed.courses.map((course) => this.courseStmt(course)),
      ...seed.modules.map((module) => this.moduleStmt(module)),
      ...seed.lessons.map((lesson) => this.lessonStmt(lesson)),
      ...seed.blocks.map((block) => this.blockStmt(block)),
      ...seed.enrollments.map((row) => this.enrollmentStmt(row.courseId, row.userId)),
      ...seed.announcements.map((announcement) => this.announcementStmt(announcement)),
      ...seed.reads.map((read) => this.readStmt(read)),
      ...seed.progress.map((progress) => this.progressStmt(progress)),
      ...seed.builderSessions.map((session) => this.builderStmt(session)),
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
      `INSERT INTO institution (id, name, short_name, accent, setup_complete, policy)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         short_name = excluded.short_name,
         accent = excluded.accent,
         setup_complete = excluded.setup_complete,
         policy = excluded.policy`,
    ).bind(
      institution.id,
      institution.name,
      institution.shortName,
      institution.accent,
      bit(institution.setupComplete),
      JSON.stringify(institution.policy),
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
      `INSERT INTO courses (id, code, title, term, description, welcome, outcomes, instructor_ids, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         code = excluded.code,
         title = excluded.title,
         term = excluded.term,
         description = excluded.description,
         welcome = excluded.welcome,
         outcomes = excluded.outcomes,
         instructor_ids = excluded.instructor_ids,
         status = excluded.status`,
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
    );
  }

  private enrollmentStmt(courseId: Id, userId: Id): D1PreparedStatement {
    return this.db.prepare('INSERT INTO enrollments (course_id, user_id) VALUES (?, ?)').bind(courseId, userId);
  }

  private moduleStmt(module: Module): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO modules (id, course_id, title, position)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         course_id = excluded.course_id,
         title = excluded.title,
         position = excluded.position`,
    ).bind(module.id, module.courseId, module.title, module.position);
  }

  private lessonStmt(lesson: Lesson): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO lessons (id, module_id, course_id, title, minutes, position, status, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         module_id = excluded.module_id,
         course_id = excluded.course_id,
         title = excluded.title,
         minutes = excluded.minutes,
         position = excluded.position,
         status = excluded.status,
         published_at = excluded.published_at`,
    ).bind(
      lesson.id,
      lesson.moduleId,
      lesson.courseId,
      lesson.title,
      lesson.minutes,
      lesson.position,
      lesson.status,
      lesson.publishedAt,
    );
  }

  private blockStmt(block: Block): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO blocks (id, lesson_id, position, type, content, origin, ai_state, provenance, previous, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         lesson_id = excluded.lesson_id,
         position = excluded.position,
         type = excluded.type,
         content = excluded.content,
         origin = excluded.origin,
         ai_state = excluded.ai_state,
         provenance = excluded.provenance,
         previous = excluded.previous,
         updated_at = excluded.updated_at`,
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
    );
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
  const { id: _id, lessonId: _l, position: _p, origin: _o, aiState: _a, provenance: _pr, previous: _pv, updatedAt: _u, ...content } = block;
  return JSON.stringify(content);
}

interface TokenRow extends Record<string, unknown> {
  id: string; name: string; prefix: string; hash: string; scopes: string; owner_id: string;
  created_at: string; expires_at: string | null; last_used_at: string | null; revoked_at: string | null;
}
function tokenFromRow(r: TokenRow): ApiToken & { hash: string } {
  return { id: r.id, name: r.name, prefix: r.prefix, hash: r.hash, scopes: JSON.parse(r.scopes), ownerId: r.owner_id, createdAt: r.created_at, expiresAt: r.expires_at, lastUsedAt: r.last_used_at, revokedAt: r.revoked_at };
}

interface InstitutionRow extends Record<string, unknown> {
  id: string;
  name: string;
  short_name: string;
  accent: Institution['accent'];
  setup_complete: number;
  policy: string;
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
  };
}

function moduleFromRow(row: ModuleRow): Module {
  return { id: row.id, courseId: row.course_id, title: row.title, position: row.position };
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

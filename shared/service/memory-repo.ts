import type { Announcement, Assignment, Block, BuilderSession, Course, Institution, Lesson, Module, Submission, User, ApiToken, FileRecord, AccessibleFormat } from '../domain';
import type { Repo, Enrollment, StoredAnnouncement, AnnouncementRead, StoredProgress, FileVersion, StoredScan, StoredFormat } from '../repo';
import type { SeedData } from '../seed';

declare const structuredClone: <T>(value: T) => T;
const copy = <T>(value: T): T => structuredClone(value);
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;
const byNewest = (a: { publishedAt: string | null; createdAt: string }, b: { publishedAt: string | null; createdAt: string }) =>
  (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt);

export class MemoryRepo implements Repo {
  private data: SeedData;
  constructor(seed: SeedData) { this.data = copy(seed); }
  async getInstitution(): Promise<Institution> { return copy(this.data.institution); }
  async putInstitution(value: Institution) { this.data.institution = copy(value); }
  async getUser(id: string): Promise<User | null> { return copy(this.data.users.find(x => x.id === id) ?? null); }
  async listUsers(filter?: { role?: User['role'] }): Promise<User[]> {
    const order = { administrator: 0, instructor: 1, student: 2 };
    return copy(this.data.users.filter(x => !filter?.role || x.role === filter.role).sort((a, b) => order[a.role] - order[b.role] || byName(a, b)));
  }
  async findUserByEmail(email: string): Promise<User | null> { return copy(this.data.users.find(x => x.email.toLowerCase() === email.toLowerCase()) ?? null); }
  async putUser(value: User) { this.upsert(this.data.users, value); }
  async getCourse(id: string): Promise<Course | null> { return copy(this.data.courses.find(x => x.id === id) ?? null); }
  async listCourses(): Promise<Course[]> { return copy(this.data.courses.sort((a,b) => a.code.localeCompare(b.code))); }
  async putCourse(value: Course) { this.upsert(this.data.courses, value); }
  async listEnrollments(filter: { courseId?: string; userId?: string }): Promise<Enrollment[]> {
    return copy(this.data.enrollments.filter(x => (!filter.courseId || x.courseId === filter.courseId) && (!filter.userId || x.userId === filter.userId)).sort((a,b) => a.courseId.localeCompare(b.courseId) || a.userId.localeCompare(b.userId)));
  }
  async setEnrollments(courseId: string, userIds: string[]) {
    this.data.enrollments = this.data.enrollments.filter(x => x.courseId !== courseId);
    this.data.enrollments.push(...[...new Set(userIds)].map(userId => ({ courseId, userId })));
  }
  async getModule(id: string): Promise<Module | null> { return copy(this.data.modules.find(x => x.id === id) ?? null); }
  async listModules(courseId: string): Promise<Module[]> { return copy(this.data.modules.filter(x => x.courseId === courseId).sort(byPosition)); }
  async putModule(value: Module) { this.upsert(this.data.modules, value); }
  async deleteModule(id: string) { this.data.modules = this.data.modules.filter(x => x.id !== id); }
  async getLesson(id: string): Promise<Lesson | null> { return copy(this.data.lessons.find(x => x.id === id) ?? null); }
  async listLessons(filter: { courseId?: string; moduleId?: string }): Promise<Lesson[]> {
    const positions = new Map(this.data.modules.map(x => [x.id, x.position]));
    return copy(this.data.lessons.filter(x => (!filter.courseId || x.courseId === filter.courseId) && (!filter.moduleId || x.moduleId === filter.moduleId))
      .sort((a,b) => (positions.get(a.moduleId) ?? 0) - (positions.get(b.moduleId) ?? 0) || a.position - b.position));
  }
  async putLesson(value: Lesson) { this.upsert(this.data.lessons, value); }
  async deleteLesson(id: string) {
    this.data.lessons = this.data.lessons.filter(x => x.id !== id);
    this.data.blocks = this.data.blocks.filter(x => x.lessonId !== id);
    this.data.progress = this.data.progress.filter(x => x.lessonId !== id);
  }
  async getBlock(id: string): Promise<Block | null> { return copy(this.data.blocks.find(x => x.id === id) ?? null); }
  async listBlocks(lessonId: string): Promise<Block[]> { return copy(this.data.blocks.filter(x => x.lessonId === lessonId).sort(byPosition)); }
  async replaceBlocks(lessonId: string, blocks: Block[]) {
    this.data.blocks = this.data.blocks.filter(x => x.lessonId !== lessonId);
    this.data.blocks.push(...copy(blocks));
  }
  async putBlock(value: Block) { this.upsert(this.data.blocks, value); }
  async deleteBlock(id: string) { this.data.blocks = this.data.blocks.filter(x => x.id !== id); }
  async getAssignment(id: string): Promise<Assignment | null> { return copy(this.data.assignments.find(x => x.id === id) ?? null); }
  async listAssignments(filter: { courseId?: string; moduleId?: string }): Promise<Assignment[]> {
    const positions = new Map(this.data.modules.map(x => [x.id, x.position]));
    return copy(this.data.assignments.filter(x => (!filter.courseId || x.courseId === filter.courseId) && (!filter.moduleId || x.moduleId === filter.moduleId))
      .sort((a,b) => (positions.get(a.moduleId) ?? 0) - (positions.get(b.moduleId) ?? 0) || a.position - b.position || a.id.localeCompare(b.id)));
  }
  async putAssignment(value: Assignment) { this.upsert(this.data.assignments, value); }
  async deleteAssignment(id: string) { this.data.assignments = this.data.assignments.filter(x => x.id !== id); this.data.submissions = this.data.submissions.filter(x => x.assignmentId !== id); }
  async getSubmission(id: string): Promise<Submission | null> { return copy(this.data.submissions.find(x => x.id === id) ?? null); }
  async listSubmissions(filter: { assignmentId?: string; studentId?: string }): Promise<Submission[]> {
    return copy(this.data.submissions.filter(x => (!filter.assignmentId || x.assignmentId === filter.assignmentId) && (!filter.studentId || x.studentId === filter.studentId))
      .sort((a,b) => a.studentId.localeCompare(b.studentId) || b.attempt - a.attempt || b.submittedAt.localeCompare(a.submittedAt)));
  }
  async putSubmission(value: Submission) { this.upsert(this.data.submissions, value); }
  async getAnnouncement(id: string): Promise<StoredAnnouncement | null> { return copy(this.data.announcements.find(x => x.id === id) ?? null); }
  async listAnnouncements(filter: { courseIds?: string[] }): Promise<StoredAnnouncement[]> {
    return copy(this.data.announcements.filter(x => !filter.courseIds || filter.courseIds.includes(x.courseId)).sort(byNewest));
  }
  async putAnnouncement(value: StoredAnnouncement) { this.upsert(this.data.announcements, value); }
  async deleteAnnouncement(id: string) {
    this.data.announcements = this.data.announcements.filter(x => x.id !== id);
    this.data.reads = this.data.reads.filter(x => x.announcementId !== id);
  }
  async listReads(filter: { userId?: string; announcementId?: string }): Promise<AnnouncementRead[]> {
    return copy(this.data.reads.filter(x => (!filter.userId || x.userId === filter.userId) && (!filter.announcementId || x.announcementId === filter.announcementId)));
  }
  async putRead(value: AnnouncementRead) {
    if (!this.data.reads.some(x => x.userId === value.userId && x.announcementId === value.announcementId)) this.data.reads.push(copy(value));
  }
  async getProgress(userId: string, lessonId: string): Promise<StoredProgress | null> { return copy(this.data.progress.find(x => x.userId === userId && x.lessonId === lessonId) ?? null); }
  async listProgress(filter: { userId?: string; lessonIds?: string[] }): Promise<StoredProgress[]> {
    return copy(this.data.progress.filter(x => (!filter.userId || x.userId === filter.userId) && (!filter.lessonIds || filter.lessonIds.includes(x.lessonId))));
  }
  async putProgress(value: StoredProgress) {
    const i = this.data.progress.findIndex(x => x.userId === value.userId && x.lessonId === value.lessonId);
    if (i < 0) this.data.progress.push(copy(value)); else this.data.progress[i] = copy(value);
  }
  async getBuilderSession(id: string): Promise<BuilderSession | null> { return copy(this.data.builderSessions.find(x => x.id === id) ?? null); }
  async listBuilderSessions(courseId: string): Promise<BuilderSession[]> { return copy(this.data.builderSessions.filter(x => x.courseId === courseId).sort((a,b) => b.createdAt.localeCompare(a.createdAt))); }
  async putBuilderSession(value: BuilderSession) { this.upsert(this.data.builderSessions, value); }
  // Like D1Repo, a file's `scan` is derived from its latest stored scan.
  private withScan(f: FileRecord): FileRecord {
    const s = this.data.scans.filter(x => x.target.kind === 'file' && x.target.fileId === f.id).sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))[0];
    return copy({ ...f, scan: s ? { score: s.score, grade: s.grade, issueCount: s.issueCount, bySeverity: s.bySeverity, scannedAt: s.scannedAt } : null });
  }
  async getFile(id: string) { const f = this.data.files.find(x => x.id === id); return f ? this.withScan(f) : null; }
  async listFiles(courseId: string) { return this.data.files.filter(x => x.courseId === courseId).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || a.id.localeCompare(b.id)).map(f => this.withScan(f)); }
  async putFile(file: FileRecord) { this.upsert(this.data.files, file); }
  async deleteFile(id: string) {
    this.data.files = this.data.files.filter(x => x.id !== id);
    this.data.fileVersions = this.data.fileVersions.filter(x => x.fileId !== id);
    this.data.formats = this.data.formats.filter(x => x.fileId !== id);
    this.data.scans = this.data.scans.filter(x => !(x.target.kind === 'file' && x.target.fileId === id));
  }
  async putFileVersion(v: FileVersion) { const i = this.data.fileVersions.findIndex(x => x.fileId === v.fileId && x.version === v.version); if (i < 0) this.data.fileVersions.push(copy(v)); else this.data.fileVersions[i] = copy(v); }
  async listFileVersions(fileId: string) { return copy(this.data.fileVersions.filter(x => x.fileId === fileId).sort((a, b) => a.version - b.version)); }
  async putScan(scan: StoredScan) { this.upsert(this.data.scans, scan); }
  async latestScan(targetKind: 'lesson' | 'file', targetId: string) {
    const list = this.data.scans.filter(s => s.target.kind === targetKind && (s.target.kind === 'lesson' ? s.target.lessonId : s.target.fileId) === targetId).sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
    return list[0] ? copy(list[0]) : null;
  }
  async listScans(filter: { courseId?: string; targetKind?: 'lesson' | 'file'; since?: string }) {
    return copy(this.data.scans.filter(s => (!filter.courseId || s.courseId === filter.courseId) && (!filter.targetKind || s.target.kind === filter.targetKind) && (!filter.since || s.scannedAt >= filter.since)).sort((a, b) => b.scannedAt.localeCompare(a.scannedAt)));
  }
  async getFormat(fileId: string, version: number, format: AccessibleFormat) { const f = this.data.formats.find(x => x.fileId === fileId && x.version === version && x.format === format); return f ? copy(f) : null; }
  async listFormats(fileId: string, version: number) { return copy(this.data.formats.filter(x => x.fileId === fileId && x.version === version)); }
  async putFormat(f: StoredFormat) { const i = this.data.formats.findIndex(x => x.fileId === f.fileId && x.version === f.version && x.format === f.format); if (i < 0) this.data.formats.push(copy(f)); else this.data.formats[i] = copy(f); }
  async getApiTokenByHash(hash: string) { const t = this.data.apiTokens.find(x => x.hash === hash); return t ? copy(t) : null; }
  async listApiTokens(ownerId: string) { return copy(this.data.apiTokens.filter(x => x.ownerId === ownerId)); }
  async putApiToken(token: ApiToken & { hash: string }) { this.upsert(this.data.apiTokens, token); }
  async touchApiToken(id: string, usedAt: string) { const t = this.data.apiTokens.find(x => x.id === id); if (t) t.lastUsedAt = usedAt; }
  async hasInvitations() { return this.data.invitations.length > 0; }
  async isEmpty(): Promise<boolean> { return this.data.users.length === 0; }
  async reset(seed: SeedData) { this.data = copy(seed); }
  private upsert<T extends { id: string }>(items: T[], value: T) {
    const i = items.findIndex(x => x.id === value.id);
    if (i < 0) items.push(copy(value)); else items[i] = copy(value);
  }
}

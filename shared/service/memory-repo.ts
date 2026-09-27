import type { Announcement, Block, BuilderSession, Course, Institution, Lesson, Module, User, ApiToken } from '../domain';
import type { Repo, Enrollment, StoredAnnouncement, AnnouncementRead, StoredProgress } from '../repo';
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

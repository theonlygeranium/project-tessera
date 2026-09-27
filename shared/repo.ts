// Storage contract for the service layer (shared/service/). Two implementations:
//   - MemoryRepo (shared/service/memory-repo.ts): in memory; the mock adapter and unit tests.
//   - D1Repo (worker/d1-repo.ts): Cloudflare D1; production and previews (D-014).
// Both must behave identically. `put*` is an upsert by id. Lists are returned in a
// stable order: by `position` where the entity has one, otherwise as documented.
import type {
  Announcement, Block, BuilderSession, Course, Id, Institution, Lesson, LessonProgress, Module, Role, Timestamp, User,
} from './domain';
import type { SeedData } from './seed';

export type StoredAnnouncement = Omit<Announcement, 'courseTitle' | 'authorName' | 'authorInitials' | 'read'>;
export type StoredProgress = LessonProgress & { userId: Id };
export interface Enrollment { courseId: Id; userId: Id }
export interface AnnouncementRead { announcementId: Id; userId: Id; readAt: Timestamp }

export interface Repo {
  getInstitution(): Promise<Institution>;
  putInstitution(institution: Institution): Promise<void>;

  getUser(id: Id): Promise<User | null>;
  /** Ordered by role (administrator, instructor, student), then name. */
  listUsers(filter?: { role?: Role }): Promise<User[]>;
  findUserByEmail(email: string): Promise<User | null>;
  putUser(user: User): Promise<void>;

  getCourse(id: Id): Promise<Course | null>;
  /** Ordered by code. */
  listCourses(): Promise<Course[]>;
  putCourse(course: Course): Promise<void>;

  listEnrollments(filter: { courseId?: Id; userId?: Id }): Promise<Enrollment[]>;
  /** Replaces the course's enrollments. */
  setEnrollments(courseId: Id, userIds: Id[]): Promise<void>;

  getModule(id: Id): Promise<Module | null>;
  listModules(courseId: Id): Promise<Module[]>;
  putModule(module: Module): Promise<void>;
  deleteModule(id: Id): Promise<void>;

  getLesson(id: Id): Promise<Lesson | null>;
  /** Ordered by module position, then lesson position, when filtered by course. */
  listLessons(filter: { courseId?: Id; moduleId?: Id }): Promise<Lesson[]>;
  putLesson(lesson: Lesson): Promise<void>;
  /** Also deletes the lesson's blocks and progress. */
  deleteLesson(id: Id): Promise<void>;

  getBlock(id: Id): Promise<Block | null>;
  listBlocks(lessonId: Id): Promise<Block[]>;
  /** Replaces all of the lesson's blocks with these (positions as given). */
  replaceBlocks(lessonId: Id, blocks: Block[]): Promise<void>;
  putBlock(block: Block): Promise<void>;
  deleteBlock(id: Id): Promise<void>;

  getAnnouncement(id: Id): Promise<StoredAnnouncement | null>;
  /** Newest first (publishedAt, else createdAt). */
  listAnnouncements(filter: { courseIds?: Id[] }): Promise<StoredAnnouncement[]>;
  putAnnouncement(announcement: StoredAnnouncement): Promise<void>;
  deleteAnnouncement(id: Id): Promise<void>;

  listReads(filter: { userId?: Id; announcementId?: Id }): Promise<AnnouncementRead[]>;
  /** Idempotent: a second read keeps the first `readAt`. */
  putRead(read: AnnouncementRead): Promise<void>;

  getProgress(userId: Id, lessonId: Id): Promise<StoredProgress | null>;
  listProgress(filter: { userId?: Id; lessonIds?: Id[] }): Promise<StoredProgress[]>;
  putProgress(progress: StoredProgress): Promise<void>;

  getBuilderSession(id: Id): Promise<BuilderSession | null>;
  /** Newest first. */
  listBuilderSessions(courseId: Id): Promise<BuilderSession[]>;
  putBuilderSession(session: BuilderSession): Promise<void>;

  /** Whether any data exists (the Worker seeds an empty database on first request). */
  isEmpty(): Promise<boolean>;
  /** Deletes everything and loads the seed. */
  reset(seed: SeedData): Promise<void>;
}

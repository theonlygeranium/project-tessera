// Storage contract for the service layer (shared/service/). Two implementations:
//   - MemoryRepo (shared/service/memory-repo.ts): in memory; the mock adapter and unit tests.
//   - D1Repo (worker/d1-repo.ts): Cloudflare D1; production and previews (D-014).
// Both must behave identically. `put*` is an upsert by id. Lists are returned in a
// stable order: by `position` where the entity has one, otherwise as documented.
import type {
  AccessibleFormat, AccessReport, Announcement, ApiToken, Assignment, Block, BuilderSession, Course, FileRecord, FormatStatus, Id, Institution, Lesson, LessonProgress, Module, Role, Submission, Timestamp, User,
} from './domain';
import type { SeedData } from './seed';

/** One element to draft; `variant: 'video-script'` is a document written as scenes with narration. */
export interface GenerationItem { lessonId: Id; type: Block['type']; variant?: 'video-script' }
export interface GenerationFailure extends GenerationItem { message: string }
export interface GenerationJob {
  id: Id; courseId: Id; requestedBy: Id; state: 'running' | 'done' | 'failed';
  done: number; total: number; lessonIds: Id[]; error: string | null;
  work: GenerationItem[]; instruction: string; failures: GenerationFailure[];
  createdAt: Timestamp; updatedAt: Timestamp;
}

export type StoredAnnouncement = Omit<Announcement, 'courseTitle' | 'authorName' | 'authorInitials' | 'read'>;
export interface FileVersion { fileId: Id; version: number; key: string; note: string; createdBy: Id; createdAt: Timestamp }
/** One scan of a lesson or file version; `courseId` lets reports roll up. */
export type StoredScan = AccessReport & { id: Id; courseId: Id; version: number | null };
export interface StoredFormat { fileId: Id; version: number; format: AccessibleFormat; state: FormatStatus['state']; outputKey: string | null; generatedAt: Timestamp | null; error: string | null }
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

  getAssignment(id: Id): Promise<Assignment | null>;
  /** Ordered by module position, then assignment position. */
  listAssignments(filter: { courseId?: Id; moduleId?: Id }): Promise<Assignment[]>;
  putAssignment(assignment: Assignment): Promise<void>;
  /** Also deletes submissions for the assignment. */
  deleteAssignment(id: Id): Promise<void>;
  getSubmission(id: Id): Promise<Submission | null>;
  /** Ordered by student id, then descending attempt. */
  listSubmissions(filter: { assignmentId?: Id; studentId?: Id }): Promise<Submission[]>;
  putSubmission(submission: Submission): Promise<void>;

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

  getGenerationJob(id: Id): Promise<GenerationJob | null>;
  putGenerationJob(job: GenerationJob): Promise<void>;

  /** Files in R2 (D-019). `listFiles` is newest first. */
  getFile(id: Id): Promise<FileRecord | null>;
  listFiles(courseId: Id): Promise<FileRecord[]>;
  putFile(file: FileRecord): Promise<void>;
  deleteFile(id: Id): Promise<void>;
  putFileVersion(v: FileVersion): Promise<void>;
  listFileVersions(fileId: Id): Promise<FileVersion[]>;

  /** Accessibility scans (D-022). `latestScan` is the newest for the target; `listScans` newest first, optionally per course. */
  putScan(scan: StoredScan): Promise<void>;
  latestScan(targetKind: 'lesson' | 'file', targetId: Id): Promise<StoredScan | null>;
  listScans(filter: { courseId?: Id; targetKind?: 'lesson' | 'file'; since?: Timestamp }): Promise<StoredScan[]>;

  /** Generated accessible formats per file version. */
  getFormat(fileId: Id, version: number, format: AccessibleFormat): Promise<StoredFormat | null>;
  listFormats(fileId: Id, version: number): Promise<StoredFormat[]>;
  putFormat(f: StoredFormat): Promise<void>;

  /** API tokens (D-020). `hash` is the SHA-256 of the secret; never the secret. */
  getApiTokenByHash(hash: string): Promise<(ApiToken & { hash: string }) | null>;
  listApiTokens(ownerId: Id): Promise<(ApiToken & { hash: string })[]>;
  putApiToken(token: ApiToken & { hash: string }): Promise<void>;
  touchApiToken(id: Id, usedAt: Timestamp): Promise<void>;
  /** Whether any invitation exists (D-021): once one does, the persona cookie no longer signs anyone in. */
  hasInvitations(): Promise<boolean>;

  /** True when there's no institution or no users: a database the Worker must seed on first request. */
  isEmpty(): Promise<boolean>;
  /** Deletes everything and loads the seed. */
  reset(seed: SeedData): Promise<void>;
}

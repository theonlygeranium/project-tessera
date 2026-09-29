// Storage contract for the service layer (shared/service/). Two implementations:
//   - MemoryRepo (shared/service/memory-repo.ts): in memory; the mock adapter and unit tests.
//   - D1Repo (worker/d1-repo.ts): Cloudflare D1; production and previews (D-014).
// Both must behave identically. `put*` is an upsert by id. Lists are returned in a
// stable order: by `position` where the entity has one, otherwise as documented.
import type {
  AccessibleFormat, AccessReport, ActivityKind, Adaptation, Announcement, ApiToken, Assignment, Block, BuilderSession, Course, FileRecord, FormatStatus, Id, Institution, Invitation, Lesson, LessonProgress, Module, Role, Submission, Timestamp, TutorMessage, TutorMode, TutorSetting, User,
  AiFinding, AlignableKind, Attestation, Certificate, CompletionEvent, CourseTemplate, ManagerConsent, Outcome, OutcomeLink, Program, ReportingLine, Requirement, Rubric, TestOut, DesignSession, InstructorProfile,
} from './domain';
import type { SeedData } from './seed';

/** One element to draft; `variant: 'video-script'` is a document written as scenes with narration. */
export interface GenerationItem { lessonId: Id; type: Block['type']; variant?: 'video-script' }
export interface GenerationFailure extends GenerationItem { message: string }
export interface GenerationJob {
  id: Id; courseId: Id; requestedBy: Id; state: 'running' | 'done' | 'failed';
  done: number; total: number; lessonIds: Id[]; error: string | null;
  work: GenerationItem[]; instruction: string; failures: GenerationFailure[];
  notes?: { lessonId: Id; message: string }[];
  createdAt: Timestamp; updatedAt: Timestamp;
  /** Night 3: who advances the job. Absent means 'poll' (each status poll advances it). */
  runner?: 'poll' | 'workflow';
  kind?: 'generate' | 'extract' | 'scaffold';
  sessionId?: Id | null;
}

export type StoredAnnouncement = Omit<Announcement, 'courseTitle' | 'authorName' | 'authorInitials' | 'read'>;
export interface FileVersion { fileId: Id; version: number; key: string; note: string; createdBy: Id; createdAt: Timestamp }
/** One scan of a lesson or file version; `courseId` lets reports roll up. */
export type StoredScan = AccessReport & { id: Id; courseId: Id; version: number | null };
export interface StoredFormat { fileId: Id; version: number; format: AccessibleFormat; state: FormatStatus['state']; outputKey: string | null; generatedAt: Timestamp | null; error: string | null }
export type StoredProgress = LessonProgress & { userId: Id };
export interface Enrollment { courseId: Id; userId: Id }
export interface AnnouncementRead { announcementId: Id; userId: Id; readAt: Timestamp }
export interface StoredTutorSession {
  id: Id; studentId: Id; activityKind: ActivityKind; activityId: Id; courseId: Id;
  mode: TutorMode; hintsUsed: number; maxHints: number; answerRequests: number;
  messages: TutorMessage[]; startedAt: Timestamp; updatedAt: Timestamp;
}

/** Night 3: a course's stored AI finding and attestation for one rubric item. */
export interface StoredReadinessItem {
  courseId: Id; rubricId: Id; itemId: Id;
  finding: AiFinding | null; attestation: Attestation | null; updatedAt: Timestamp;
}
export interface TestOutAttempt { id: Id; courseId: Id; userId: Id; percent: number; passed: boolean; at: Timestamp }

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
  /** Idempotent: adds one enrollment; never removes any. */
  addEnrollment(courseId: Id, userId: Id): Promise<void>;

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

  getTutorSetting(activityKind: ActivityKind, activityId: Id): Promise<TutorSetting | null>;
  putTutorSetting(setting: TutorSetting): Promise<void>;
  getTutorSession(id: Id): Promise<StoredTutorSession | null>;
  /** Ordered by startedAt then id. */
  listTutorSessions(filter: { courseId?: Id; studentId?: Id; activityKind?: ActivityKind; activityId?: Id }): Promise<StoredTutorSession[]>;
  putTutorSession(session: StoredTutorSession): Promise<void>;

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

  getAdaptation(id: Id): Promise<Adaptation | null>;
  /** A student's changes, newest first (id breaks timestamp ties). */
  listAdaptations(studentId: Id): Promise<Adaptation[]>;
  putAdaptation(adaptation: Adaptation): Promise<void>;
  /** Atomically stores a profile change with every adaptation describing it. */
  putUserWithAdaptations(user: User, adaptations: Adaptation[]): Promise<void>;

  getBuilderSession(id: Id): Promise<BuilderSession | null>;
  /** Newest first. */
  listBuilderSessions(courseId: Id): Promise<BuilderSession[]>;
  putBuilderSession(session: BuilderSession): Promise<void>;

  getDesignSession(id: Id): Promise<DesignSession | null>;
  putDesignSession(session: DesignSession): Promise<void>;
  finishDesignUndo(sessionId: Id, revision: Id, session: DesignSession): Promise<boolean>;
  revertDesignPreview(sessionId: Id): Promise<boolean>;
  saveDesignPoints(sessionId: Id, values: Record<Id, number>): Promise<boolean>;
  saveDesignPreview(sessionId: Id, expectedPoints: Record<Id, number>, plan: DesignSession['plan'], updatedAt: string): Promise<boolean>;
  /** Atomically claims a preview for one apply; false when another request claimed it. */
  claimDesignApply(session: DesignSession): Promise<boolean>;
  /** Commit one created item and its ledger entry only while this apply revision is current. */
  putDesignModule(sessionId: Id, revision: Id, key: string, module: Module): Promise<boolean>;
  putDesignLesson(sessionId: Id, revision: Id, key: string, lesson: Lesson): Promise<boolean>;
  putDesignAssignment(sessionId: Id, revision: Id, key: string, assignment: Assignment, outcomeIds: Id[]): Promise<boolean>;
  appendDesignOutcome(sessionId: Id, revision: Id, outcome: Outcome): Promise<boolean>;
  appendDesignOutcomes(sessionId: Id, revision: Id, outcomes: Outcome[]): Promise<Outcome[] | null>;
  resetDesignCapacityFailure(sessionId: Id, revision: Id, message: string): Promise<boolean>;
  saveDesignAppliedPlan(sessionId: Id, revision: Id, plan: DesignSession['plan'], codeMap: Record<string, string>, outcomeIdsByCode: Record<string, Id>): Promise<boolean>;
  /** Changes the revision and stops the job in one operation. */
  cancelDesignApply(sessionId: Id, revision: Id, nextRevision: Id): Promise<boolean>;
  /** Fail an old-shape provisioning job without attempting to scaffold it. */
  stopLegacyDesignJob(sessionId: Id, jobId: Id, message: string): Promise<boolean>;
  startDesignJob(sessionId: Id, revision: Id, job: GenerationJob): Promise<boolean>;
  setDesignRunner(sessionId: Id, revision: Id, jobId: Id, runner: 'poll' | 'workflow'): Promise<boolean>;
  setDesignApplyError(sessionId: Id, revision: Id, message: string): Promise<boolean>;
  /** An owned, empty lesson gets blocks, links and progress in one operation. */
  commitDesignScaffold(sessionId: Id, revision: Id, expectedJob: GenerationJob, nextJob: GenerationJob, lesson: Lesson | null, blocks: Block[], outcomeIds: Id[], nextSession: DesignSession): Promise<boolean>;
  appendDesignAlternatives(sessionId: Id, revision: Id, lessonId: Id, blocks: Block[]): Promise<boolean>;
  /** Append one record entry without replacing a possibly stale session snapshot. */
  appendDesignDecision(sessionId: Id, decision: DesignSession['record']['decisions'][number]): Promise<boolean>;
  /** Stop an active design job and display the reason on its session. */
  stopDesignJob(sessionId: Id, jobId: Id, message: string): Promise<boolean>;
  deleteDesignBlockIfDraft(sessionId: Id, revision: Id, expected: Block, expectedOutcomeIds: Id[]): Promise<boolean>;
  deleteDesignAssignmentIfUnchanged(sessionId: Id, revision: Id, expected: Assignment, expectedOutcomeIds: Id[]): Promise<boolean>;
  deleteDesignLessonIfUnchanged(sessionId: Id, revision: Id, expected: Lesson): Promise<boolean>;
  deleteDesignModuleIfUnchanged(sessionId: Id, revision: Id, expected: Module): Promise<boolean>;
  deleteDesignOutcomeIfUnused(sessionId: Id, revision: Id, id: Id, expectedText: string): Promise<boolean>;
  /** Newest by createdAt, then id. */
  listDesignSessions(courseId: Id): Promise<DesignSession[]>;
  getInstructorProfile(userId: Id): Promise<InstructorProfile | null>;
  putInstructorProfile(profile: InstructorProfile): Promise<void>;

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
  getInvitation(userId: Id): Promise<Invitation | null>;
  getInvitationByEmail(email: string): Promise<Invitation | null>;
  /** Newest first by invitation time, then user id. */
  listInvitations(): Promise<Invitation[]>;
  putInvitation(invitation: Invitation): Promise<void>;
  /** First acceptance wins. */
  acceptInvitation(userId: Id, at: Timestamp): Promise<void>;
  /** Whether any invitation exists (D-021): once one does, the persona cookie no longer signs anyone in. */
  hasInvitations(): Promise<boolean>;

  // ---- Night 3 (D-024 to D-029; migration 0006) ----
  // Lessons: `listLessons` never returns variant lessons (`variantOf` set); `getLesson` returns any lesson.
  // Deleting a master lesson also deletes its variants (and their blocks and progress).

  /** Variant lessons of a master, ordered by audience ('micro', then 'plain'). */
  listVariantLessons(masterLessonId: Id): Promise<Lesson[]>;

  getProgram(id: Id): Promise<Program | null>;
  /** Ordered by name, then id. */
  listPrograms(): Promise<Program[]>;
  putProgram(program: Program): Promise<void>;
  deleteProgram(id: Id): Promise<void>;

  getTemplate(id: Id): Promise<CourseTemplate | null>;
  /** Ordered by name, then id. */
  listTemplates(): Promise<CourseTemplate[]>;
  putTemplate(template: CourseTemplate): Promise<void>;
  deleteTemplate(id: Id): Promise<void>;

  /** Custom rubrics only (built-ins live in shared/quality/rubrics.ts). Ordered by name, then id. */
  getRubric(id: Id): Promise<Rubric | null>;
  listRubrics(): Promise<Rubric[]>;
  putRubric(rubric: Rubric): Promise<void>;
  deleteRubric(id: Id): Promise<void>;

  /** Ordered by item id. */
  listReadinessItems(courseId: Id, rubricId: Id): Promise<StoredReadinessItem[]>;
  /** Upsert by (courseId, rubricId, itemId); a row with neither a finding nor an attestation is deleted. */
  putReadinessItem(item: StoredReadinessItem): Promise<void>;

  /** Ordered by position. */
  listOutcomes(courseId: Id): Promise<Outcome[]>;
  /** Replaces the course's outcomes with these; outcomes not in the list are deleted with their links. */
  replaceOutcomes(courseId: Id, outcomes: Outcome[]): Promise<void>;
  /** Links for a course's outcomes, or for one target. Ordered by outcome id, then target kind and id. */
  listOutcomeLinks(filter: { courseId?: Id; targetKind?: AlignableKind; targetId?: Id }): Promise<OutcomeLink[]>;
  /** Replaces the outcomes linked to one target. */
  setOutcomeLinks(targetKind: AlignableKind, targetId: Id, outcomeIds: Id[]): Promise<void>;

  getRequirement(id: Id): Promise<Requirement | null>;
  /** Newest first (createdAt, then id). */
  listRequirements(filter?: { targetKind?: Requirement['target']['kind']; targetId?: Id }): Promise<Requirement[]>;
  putRequirement(requirement: Requirement): Promise<void>;
  deleteRequirement(id: Id): Promise<void>;

  /** Append-only: a second event with the same id is refused (throws). */
  appendCompletionEvent(event: CompletionEvent): Promise<void>;
  /** Chronological (at, then id). `since` is inclusive. */
  listCompletionEvents(filter: { userId?: Id; courseId?: Id; since?: Timestamp }): Promise<CompletionEvent[]>;

  getTestOut(courseId: Id): Promise<TestOut | null>;
  putTestOut(testOut: TestOut): Promise<void>;
  deleteTestOut(courseId: Id): Promise<void>;
  putTestOutAttempt(attempt: TestOutAttempt): Promise<void>;
  /** Oldest first. */
  listTestOutAttempts(userId: Id, courseId: Id): Promise<TestOutAttempt[]>;

  getCertificate(id: Id): Promise<Certificate | null>;
  getCertificateByCode(code: string): Promise<Certificate | null>;
  /** Newest first (issuedAt, then id). */
  listCertificates(filter: { userId?: Id; courseId?: Id }): Promise<Certificate[]>;
  /** Inserts a new certificate; an existing id or code is refused (throws). */
  insertCertificate(certificate: Certificate): Promise<void>;
  /** Sets `replacedBy` once; throws ApiError('conflict') if it's already set or the certificate doesn't exist. */
  markCertificateReplaced(id: Id, replacedBy: Id): Promise<void>;

  /** Ordered by manager id, then report id. */
  listReportingLines(filter: { managerId?: Id; reportId?: Id }): Promise<ReportingLine[]>;
  /** Upsert by (managerId, reportId); keeps the first createdAt. */
  putReportingLine(line: ReportingLine): Promise<void>;
  /** Also deletes the report's consent for that manager. */
  deleteReportingLine(managerId: Id, reportId: Id): Promise<void>;
  /** Ordered by manager id, then report id. */
  listManagerConsents(filter: { managerId?: Id; reportId?: Id }): Promise<ManagerConsent[]>;
  putManagerConsent(consent: ManagerConsent): Promise<void>;

  /** True when there's no institution or no users: a database the Worker must seed on first request. */
  isEmpty(): Promise<boolean>;
  /** Deletes everything and loads the seed. */
  reset(seed: SeedData): Promise<void>;
}

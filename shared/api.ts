// The Tessera API contract (D-020). One table drives three things:
//   1. the Worker router (worker/): method, path, and which roles may call it;
//   2. the app's HTTP adapter (app/src/data/http.ts), generically;
//   3. the app's mock adapter (app/src/data/mock.ts), which must behave the same.
//
// Every operation takes one input object (or none) and returns JSON.
// Path parameters (":courseId") are read from the input object by name. For GET and
// DELETE the remaining input fields become the query string; otherwise they're the
// JSON body. Role rules here are the first check; handlers also check resource
// access (an instructor must teach the course, a student must be enrolled). API
// tokens must also carry the route's scope (D-020).
import type {
  AccessIssue, AccessPolicy, AccessReport, AccessibleFormat, Adaptation, AiPolicy, Announcement, ApiToken, Assignment,
  Block, BlockContent, BlockType, BuilderSession, CheckResult, Course, CourseAccessReport, CourseBrief, CourseOutline,
  CourseSummary, FileRecord, FormatStatus, Grade, GradebookRow, Id, Institution, InstitutionAccessReport, Invitation,
  LearningProfile, Lesson, LessonDetail, LessonProgress, LessonProgressState, Module, OutlineDraft, Overview, Preset,
  Provenance, Role, RosterEntry, RubricCriterion, ScenarioNode, Scope, StudentLesson, Submission, SubmissionType, Today,
  Timestamp, TutorMessage, TutorSession, TutorSetting, TutorSummary, User,
  // Night 3
  AlignableKind, Brand, Certificate, CertificateVerification, CompletionEvent, ComplianceRow, CourseTemplate, ManagerView,
  MyVisibility, Outcome, PageTranscription, OutcomeLink, Program, ReadinessPolicy, ReadinessResult, RequiredTraining, Requirement,
  RequirementAudience, Rubric, RubricCheckKind, AutomaticCheck, StudentTestOut, TemplateChangeSet, TemplateModule,
  TestOut, LessonVariant, ReportingLine, TrainingStatus, VariantAudience, VariantDiff, WorkerColumnMap, WorkerImportSource, WorkerChangeSet, WorkerImportResult, WorkerRecord, WorkerLink, RulePreview, RuleApplyResult, WorkerField,
} from './domain';

/** Every API route lives under this prefix (D-020). `/api` without a version is an alias during Night 2. */
export const API_PREFIX = '/api/v1';

/** A page of results: cursor pagination on every list (D-020). */
export interface Page<T> { items: T[]; nextCursor: string | null }
export interface PageInput { limit?: number; cursor?: string }

export interface SessionInfo {
  user: User | null;
  institution: Institution;
}

/** A block as the editor sends it: existing blocks keep their id; new ones have none. */
export type BlockInput = { id?: Id } & BlockContent;

export type Ok = { ok: true };

/** Every operation: its input and output. */
export interface ApiSpec {
  // Session and demo sign-in (D-014: a persona picker behind Cloudflare Access)
  getSession: { input: void; output: SessionInfo };
  signIn: { input: { userId: Id }; output: SessionInfo };
  signOut: { input: void; output: Ok };
  listDemoUsers: { input: void; output: User[] };
  resetDemo: { input: void; output: Ok };

  // Administrator
  updateInstitution: { input: Partial<Pick<Institution, 'name' | 'shortName' | 'accent' | 'setupComplete'>>; output: Institution };
  updatePolicy: { input: AiPolicy; output: Institution };
  getOverview: { input: void; output: Overview };
  listUsers: { input: { role?: Role }; output: User[] };
  createUser: { input: { name: string; email: string; role: Role }; output: User };
  /** CSV with a header row: name,email,role */
  importUsers: { input: { csv: string }; output: { created: User[]; errors: { line: number; message: string }[] } };
  updateUser: { input: { userId: Id; name?: string; role?: Role }; output: User };

  // Courses
  listCourses: { input: void; output: CourseSummary[] };
  /**
   * Night 3: instructors can create courses too (they become its instructor). With a
   * program, the course joins it; the effective template's skeleton is created unless
   * `skipTemplate` is set (D-024).
   */
  createCourse: { input: { code: string; title: string; term: string; description?: string; programId?: Id | null; skipTemplate?: boolean }; output: Course };
  /** Learner view: published lessons with the viewer's progress; for staff, only when the course is required training for them. */
  getCourseOutline: { input: { courseId: Id; asLearner?: boolean }; output: CourseOutline };
  updateCourse: {
    input: { courseId: Id } & Partial<Pick<Course, 'code' | 'title' | 'term' | 'description' | 'welcome' | 'outcomes'>>;
    output: Course;
  };
  setCourseInstructors: { input: { courseId: Id; userIds: Id[] }; output: Course };
  getCourseEnrollments: { input: { courseId: Id }; output: { userIds: Id[] } };
  setCourseEnrollments: { input: { courseId: Id; userIds: Id[] }; output: { userIds: Id[] } };
  getRoster: { input: { courseId: Id }; output: RosterEntry[] };

  // Course structure (instructor)
  createModule: { input: { courseId: Id; title: string }; output: Module };
  updateModule: { input: { moduleId: Id; title?: string; position?: number; objective?: string | null }; output: Module };
  /** Only an empty module can be deleted (409 otherwise). */
  deleteModule: { input: { moduleId: Id }; output: Ok };
  createLesson: { input: { moduleId: Id; title: string; minutes?: number }; output: Lesson };
  updateLesson: { input: { lessonId: Id; title?: string; minutes?: number; position?: number; moduleId?: Id }; output: Lesson };
  deleteLesson: { input: { lessonId: Id }; output: Ok };
  getLesson: { input: { lessonId: Id }; output: LessonDetail };
  /**
   * Replaces the lesson's blocks, in order. Blocks with an id keep their origin and AI
   * state; editing an AI draft keeps it a draft (a person still has to keep it) and
   * records the prior content in `previous`. Blocks without an id are new human blocks.
   */
  saveBlocks: { input: { lessonId: Id; blocks: BlockInput[] }; output: LessonDetail };
  /** A person keeps an AI draft block (D-003). */
  keepBlock: { input: { blockId: Id }; output: LessonDetail };
  /** Restores `previous`; an AI block with no previous content is removed. */
  revertBlock: { input: { blockId: Id }; output: LessonDetail };
  /** Asks the AI for a new version; the block becomes a draft with `previous` set. */
  regenerateBlock: { input: { blockId: Id; instruction?: string }; output: LessonDetail };
  /** 409 `not-ready` (with the ReadinessReport as `details`) unless the lesson is ready. */
  publishLesson: { input: { lessonId: Id }; output: Lesson };
  unpublishLesson: { input: { lessonId: Id }; output: Lesson };

  // Student
  saveProfile: { input: Omit<LearningProfile, 'completedAt'>; output: User };
  getToday: { input: void; output: Today };
  /** Night 3: `version: 'full'` skips a matching variant (the way back, principle #7); default 'auto'. */
  getStudentLesson: { input: { lessonId: Id; version?: 'auto' | 'full' }; output: StudentLesson };
  answerCheck: { input: { lessonId: Id; blockId: Id; optionId: string }; output: CheckResult };
  setLessonProgress: { input: { lessonId: Id; state: Exclude<LessonProgressState, 'not-started'> }; output: LessonProgress };

  // Announcements (communication center)
  listAnnouncements: { input: { courseId?: Id }; output: Announcement[] };
  /**
   * `aiDraft` marks an announcement that started from `draftAnnouncement`; it's
   * stored with origin "ai". Publishing it counts as the instructor keeping it.
   */
  createAnnouncement: {
    input: { courseId: Id; title: string; body: string; pinned: boolean; publish: boolean; aiDraft?: Provenance };
    output: Announcement;
  };
  updateAnnouncement: {
    input: { announcementId: Id; title?: string; body?: string; pinned?: boolean; publish?: boolean };
    output: Announcement;
  };
  deleteAnnouncement: { input: { announcementId: Id }; output: Ok };
  markAnnouncementRead: { input: { announcementId: Id }; output: Ok };
  draftAnnouncement: { input: { courseId: Id; prompt: string }; output: { title: string; body: string; provenance: Provenance } };

  // AI course builder (lane F, #20)
  listBuilderSessions: { input: { courseId: Id }; output: BuilderSession[] };
  /** Creates a session and drafts the brief from the prompt and sources. */
  createBuilderSession: { input: { courseId: Id; prompt: string; sources: { name: string; text: string }[] }; output: BuilderSession };
  getBuilderSession: { input: { sessionId: Id }; output: BuilderSession };
  updateBuilderSession: { input: { sessionId: Id; brief?: CourseBrief; outline?: OutlineDraft }; output: BuilderSession };
  generateOutline: { input: { sessionId: Id }; output: BuilderSession };
  /** Creates modules, lessons, and AI draft blocks in the course from the outline. */
  generateDrafts: { input: { sessionId: Id }; output: BuilderSession };

  // ---- Night 2 ----

  // Identity (D-021)
  /** Who the Access session is (email) and the Tessera user it maps to, if any. */
  whoAmI: { input: void; output: { email: string | null; user: User | null; viewingAs: User | null } };
  /** Administrators only: act as another user for support and QA. */
  viewAs: { input: { userId: Id | null }; output: SessionInfo };
  listInvitations: { input: PageInput; output: Page<Invitation> };
  inviteUser: { input: { name: string; email: string; role: Role }; output: Invitation };

  // API tokens (D-020)
  listApiTokens: { input: void; output: ApiToken[] };
  createApiToken: { input: { name: string; scopes: Scope[]; expiresInDays?: number }; output: { token: ApiToken; secret: string } };
  revokeApiToken: { input: { tokenId: Id }; output: Ok };

  // Files (D-019)
  listFiles: { input: { courseId: Id } & PageInput; output: Page<FileRecord> };
  /** Multipart upload is handled by the Worker; this records the file after the bytes are stored. */
  getFile: { input: { fileId: Id }; output: FileRecord };
  deleteFile: { input: { fileId: Id }; output: Ok };
  getFormats: { input: { fileId: Id }; output: FormatStatus[] };
  requestFormat: { input: { fileId: Id; format: AccessibleFormat }; output: FormatStatus };

  // Tessera Access (D-022)
  getLessonAccess: { input: { lessonId: Id }; output: AccessReport };
  scanFile: { input: { fileId: Id }; output: AccessReport };
  getFileAccess: { input: { fileId: Id }; output: AccessReport };
  /** Applies a fix to a document as a new version (alt text, table header, metadata). */
  fixFileIssue: { input: { fileId: Id; issueIndex: number; fix: { kind: 'alt-text'; element: number; alt: string; decorative: boolean } | { kind: 'table-header'; element: number } | { kind: 'metadata'; title?: string; language?: string } | { kind: 'ocr'; language?: string } }; output: AccessReport };
  /** AI suggestion for an issue (alt text from the image, rewrite, link text): a draft the person applies. */
  suggestFix: { input: { target: { lessonId: Id; blockId: Id } | { fileId: Id; element: number }; kind: 'alt-text' | 'rewrite' | 'link-text' }; output: { suggestion: string; provenance: Provenance } };
  getCourseAccess: { input: { courseId: Id }; output: CourseAccessReport };
  getInstitutionAccess: { input: void; output: InstitutionAccessReport };
  exportInstitutionAccess: { input: void; output: { csv: string } };
  updateAccessPolicy: { input: AccessPolicy; output: Institution };
  /** Night 3: AI transcriptions of low-confidence scanned pages for the file's current version (page image: GET /files/:fileId/pages/:page). */
  listTranscriptions: { input: { fileId: Id }; output: PageTranscription[] };
  /** A person keeps or discards one page's transcription (D-003). Returns the file's transcriptions. */
  reviewTranscription: { input: { fileId: Id; page: number; decision: 'keep' | 'discard' }; output: PageTranscription[] };

  // Assignments, submissions, grading (plan §5.3)
  createAssignment: { input: { moduleId: Id; title: string; submissionType: SubmissionType; points: number; dueAt?: Timestamp | null }; output: Assignment };
  /** Staff see drafts and published assignments; students see published ones. */
  listAssignments: { input: { courseId: Id }; output: Assignment[] };
  getAssignment: { input: { assignmentId: Id }; output: Assignment };
  /** `instructions` accepts heading, text, and callout blocks only. */
  updateAssignment: { input: { assignmentId: Id } & Partial<Pick<Assignment, 'title' | 'dueAt' | 'points' | 'submissionType' | 'rubric' | 'position'>> & { instructions?: BlockInput[] }; output: Assignment };
  deleteAssignment: { input: { assignmentId: Id }; output: Ok };
  publishAssignment: { input: { assignmentId: Id }; output: Assignment };
  listSubmissions: { input: { assignmentId: Id } & PageInput; output: Page<Submission & { student: Pick<User, 'id' | 'name' | 'email'> }> };
  submit: { input: { assignmentId: Id; text?: string; fileId?: Id; link?: string }; output: Submission };
  getMySubmission: { input: { assignmentId: Id }; output: Submission | null };
  gradeSubmission: { input: { submissionId: Id; criteria: Grade['criteria']; score: number; feedback: string; feedbackOrigin: 'human' | 'ai'; feedbackProvenance?: Provenance | null }; output: Submission };
  /** AI-drafted feedback from the rubric result and the submission (a draft, D-003). */
  draftFeedback: { input: { submissionId: Id; criteria: Grade['criteria'] }; output: { feedback: string; provenance: Provenance } };
  releaseGrades: { input: { assignmentId: Id }; output: Ok };
  getGradebook: { input: { courseId: Id }; output: { assignments: Pick<Assignment, 'id' | 'title' | 'points' | 'dueAt'>[]; rows: GradebookRow[] } };
  exportGradebook: { input: { courseId: Id }; output: { csv: string } };

  // Tutor (D-005, plan §5.4)
  getTutorSetting: { input: { activityKind: 'lesson' | 'assignment'; activityId: Id }; output: TutorSetting | null };
  setTutorSetting: { input: Omit<TutorSetting, 'setBy' | 'setAt'>; output: TutorSetting };
  startTutorSession: { input: { activityKind: 'lesson' | 'assignment'; activityId: Id }; output: TutorSession };
  sendTutorMessage: { input: { sessionId: Id; text: string; intent: 'hint' | 'explain' | 'answer' | 'chat' }; output: { session: TutorSession; reply: TutorMessage } };
  getTutorSummaries: { input: { courseId: Id }; output: TutorSummary[] };

  // Adaptations (D-004, principle #7)
  listPresets: { input: void; output: Preset[] };
  suggestPreset: { input: void; output: { preset: Preset; why: string; provenance: Provenance | null } };
  applyPreset: { input: { presetId: Preset['id'] }; output: Adaptation[] };
  listAdaptations: { input: void; output: Adaptation[] };
  undoAdaptation: { input: { adaptationId: Id }; output: Adaptation };

  // AI authoring at any scope (plan §5.2)
  /** Generates drafts for a scope: whole course, modules, lessons, or element types; returns a job. */
  generateAtScope: { input: { courseId: Id; scope: { moduleIds?: Id[]; lessonIds?: Id[]; elementTypes?: BlockType[]; wholeCourse?: boolean; /** Also draft a video script (a document of scenes) for each lesson. */ videoScript?: boolean }; instruction?: string }; output: { jobId: Id } };
  getGenerationJob: { input: { jobId: Id }; output: { jobId: Id; state: 'running' | 'done' | 'failed'; done: number; total: number; lessonIds: Id[]; error: string | null; failures: { lessonId: Id; type: BlockType; message: string }[] } };
  /** Generates one element as a draft block in a lesson. */
  generateElement: { input: { lessonId: Id; type: BlockType; instruction?: string; position?: number }; output: LessonDetail };

  // Import (D-020)
  importCourse: { input: { course: { code: string; title: string; term: string; description?: string; welcome?: string; outcomes?: string[] }; modules: { title: string; lessons: { title: string; minutes?: number; blocks: BlockInput[] }[] }[] }; output: CourseOutline };

  // ---- Night 3 (D-024 to D-029) ----

  // Programs and templates (lane A, #24)
  listPrograms: { input: void; output: Program[] };
  createProgram: { input: { name: string; description?: string; templateId?: Id | null; brand?: Brand }; output: Program };
  updateProgram: { input: { programId: Id; name?: string; description?: string; templateId?: Id | null; brand?: Brand }; output: Program };
  /** 409 while courses belong to it. */
  deleteProgram: { input: { programId: Id }; output: Ok };
  setCourseProgram: { input: { courseId: Id; programId: Id | null }; output: Course };
  listTemplates: { input: void; output: CourseTemplate[] };
  getTemplate: { input: { templateId: Id }; output: CourseTemplate };
  createTemplate: { input: TemplateInput; output: CourseTemplate };
  updateTemplate: { input: { templateId: Id } & Partial<TemplateInput>; output: CourseTemplate };
  /** 409 while the institution or a program uses it. */
  deleteTemplate: { input: { templateId: Id }; output: Ok };
  setInstitutionTemplate: { input: { templateId: Id | null }; output: Institution };
  /** What applying the course's effective template (or `templateId`) would add. */
  previewTemplate: { input: { courseId: Id; templateId?: Id }; output: TemplateChangeSet };
  /** Applies exactly the previewed change set; 409 if the course or template changed since (`hash` differs). */
  applyTemplate: { input: { courseId: Id; templateId?: Id; hash: string }; output: CourseOutline };

  // Readiness rubrics and outcomes (lane B, #25)
  /** Built-in (Tessera standard, OSCQR) and custom rubrics. */
  listRubrics: { input: void; output: Rubric[] };
  getRubric: { input: { rubricId: Id }; output: Rubric };
  createRubric: { input: RubricInput; output: Rubric };
  /** Custom rubrics only; built-ins are read-only. */
  updateRubric: { input: { rubricId: Id } & Partial<RubricInput>; output: Rubric };
  /** Custom rubrics only; 409 while the readiness policy uses it. */
  deleteRubric: { input: { rubricId: Id }; output: Ok };
  updateReadinessPolicy: { input: ReadinessPolicy; output: Institution };
  /** Automatic items computed now; AI findings and attestations as stored. Defaults to the policy's rubric. */
  getCourseReadiness: { input: { courseId: Id; rubricId?: Id }; output: ReadinessResult };
  /** Runs AI-assisted items (all, or `itemIds`) and stores each finding as a draft. */
  runReadinessAi: { input: { courseId: Id; rubricId?: Id; itemIds?: Id[] }; output: ReadinessResult };
  /** A person accepts or dismisses an AI finding (D-003: AI never auto-passes an item). */
  reviewFinding: { input: { courseId: Id; itemId: Id; rubricId?: Id; decision: 'accept' | 'dismiss' }; output: ReadinessResult };
  attestItem: { input: { courseId: Id; itemId: Id; rubricId?: Id; status: 'attested' | 'not-applicable'; note: string }; output: ReadinessResult };
  clearAttestation: { input: { courseId: Id; itemId: Id; rubricId?: Id }; output: ReadinessResult };
  listOutcomes: { input: { courseId: Id }; output: Outcome[] };
  /** Replaces the course's outcomes in order (existing ones keep their id); mirrors the text into `Course.outcomes`. Removing an outcome removes its links. */
  saveOutcomes: { input: { courseId: Id; outcomes: { id?: Id; text: string }[] }; output: Outcome[] };
  listOutcomeLinks: { input: { courseId: Id }; output: OutcomeLink[] };
  /** Replaces the outcomes a check, scenario, or assignment is tagged with. */
  setOutcomeLinks: { input: { courseId: Id; targetKind: AlignableKind; targetId: Id; outcomeIds: Id[] }; output: OutcomeLink[] };

  // Persona variants (lane C, #23). A variant is a lesson; publish and delete it like one.
  listVariants: { input: { lessonId: Id }; output: LessonVariant[] };
  /** AI derives the variant from the master as draft blocks (D-003). One variant per audience per lesson. */
  createVariant: { input: { lessonId: Id; audience: VariantAudience }; output: LessonDetail };
  getVariantDiff: { input: { variantId: Id }; output: VariantDiff };
  /** AI rewrites diverged (or listed) variant blocks from the current master, as drafts. */
  resyncVariant: { input: { variantId: Id; blockIds?: Id[] }; output: LessonDetail };
  /** "Keep variant": marks the listed blocks in sync with the current master without rewriting them. */
  keepVariant: { input: { variantId: Id; blockIds: Id[] }; output: LessonDetail };

  // Required training, test-out, certificates (lane D, #22)
  listRequirements: { input: { courseId?: Id }; output: Requirement[] };
  /** Enrolls the audience in the course(s) and records "assigned" events. */
  createRequirement: { input: { target: Requirement['target']; audience: RequirementAudience; dueAt?: Timestamp | null; recurrence?: Requirement['recurrence'] }; output: Requirement };
  /** Records "due-date-changed" events for affected people. */
  updateRequirement: { input: { requirementId: Id; dueAt?: Timestamp | null; recurrence?: Requirement['recurrence'] }; output: Requirement };
  /** Records "unassigned" events; enrollments and completions stay. */
  deleteRequirement: { input: { requirementId: Id }; output: Ok };
  getComplianceReport: { input: { courseId?: Id; status?: TrainingStatus } & PageInput; output: Page<ComplianceRow> };
  listCompletionEvents: { input: { courseId?: Id; userId?: Id } & PageInput; output: Page<CompletionEvent> };
  exportCompletionEvents: { input: { courseId?: Id; since?: Timestamp }; output: { csv: string } };
  /** The signed-in person's required training, soonest due first. */
  listMyTraining: { input: void; output: RequiredTraining[] };
  getTestOut: { input: { courseId: Id }; output: TestOut | null };
  saveTestOut: { input: { courseId: Id; items: TestOut['items']; passPercent: number }; output: TestOut };
  deleteTestOut: { input: { courseId: Id }; output: Ok };
  /** Without the answer key; null when the course has no test-out. */
  getMyTestOut: { input: { courseId: Id }; output: StudentTestOut | null };
  /** Passing completes the course as "tested out" and issues a certificate. */
  takeTestOut: { input: { courseId: Id; answers: { itemId: string; optionId: string }[] }; output: { passed: boolean; percent: number; certificate: Certificate | null } };
  listMyCertificates: { input: void; output: Certificate[] };
  /** The learner, an administrator, or a manager the learner shares with. */
  getCertificate: { input: { certificateId: Id }; output: Certificate };
  /** Public: validity, course, and date only, never the name (D-027). Also served as a page at /verify/:code. */
  verifyCertificate: { input: { code: string }; output: CertificateVerification };
  /** A correction: issues a new certificate and marks this one replaced (certificates are immutable). */
  reissueCertificate: { input: { certificateId: Id; learnerName?: string }; output: Certificate };

  // HRIS compliance M1
  getWorkerColumnMap: { input: void; output: WorkerColumnMap | null };
  saveWorkerColumnMap: { input: { columns: Partial<Record<WorkerField,string>>; dateFormat: WorkerColumnMap['dateFormat'] }; output: WorkerColumnMap };
  previewWorkerImport: { input: { source: WorkerImportSource }; output: WorkerChangeSet };
  applyWorkerImport: { input: { source: WorkerImportSource; asOf: Timestamp; hash: string }; output: WorkerImportResult };
  listWorkerRecords: { input: { employeeId?: string; history?: boolean }; output: WorkerRecord[] };
  listWorkerLinkSuggestions: { input: void; output: { employeeId: string; name: string; email: string; userId: Id; userName: string }[] };
  confirmWorkerLink: { input: { employeeId: string; userId: Id }; output: WorkerLink };
  previewRule: { input: { requirementId: Id }; output: RulePreview };
  applyRule: { input: { requirementId: Id; hash: string }; output: RuleApplyResult };

  // Managers (lane D2, D-025, D-026)
  listReportingLines: { input: { managerId?: Id; reportId?: Id }; output: ReportingLine[] };
  addReportingLine: { input: { managerId: Id; reportId: Id }; output: ReportingLine };
  /** Also clears the learner's sharing choice for that manager. */
  removeReportingLine: { input: { managerId: Id; reportId: Id }; output: Ok };
  /** The signed-in person's managers and what each can see. */
  getMyVisibility: { input: void; output: MyVisibility };
  /** Opt in or out per manager; opting out removes visibility immediately. A person's own choice: browser only. */
  setManagerSharing: { input: { managerId: Id; sharing: boolean }; output: MyVisibility };
  /** Completion only, for people who opted in (shared/managers/policy.ts). */
  getManagerView: { input: void; output: ManagerView };
}

/** Template fields an administrator edits. */
export interface TemplateInput {
  name: string;
  description?: string;
  owner: CourseTemplate['owner'];
  modules: TemplateModule[];
  tutorDefaults: CourseTemplate['tutorDefaults'];
  accessFloor: number | null;
}

/** A custom rubric as an administrator enters it; ids are assigned by Tessera. */
export interface RubricInput {
  name: string;
  version?: string;
  attribution?: string | null;
  standards: { number: string; title: string; description?: string; items: { number: string; text: string; kind: RubricCheckKind; check?: AutomaticCheck | null; criteria?: string }[] }[];
}

export type Operation = keyof ApiSpec;
export type Input<K extends Operation> = ApiSpec[K]['input'];
export type Output<K extends Operation> = ApiSpec[K]['output'];

/** The client-side API: one async function per operation. */
export type TesseraApi = {
  [K in Operation]: Input<K> extends void ? () => Promise<Output<K>> : (input: Input<K>) => Promise<Output<K>>;
};

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/** `public`: anyone; `signed-in`: any persona; otherwise the listed roles. */
export type Access = 'public' | 'signed-in' | Role[];

export interface Route {
  method: HttpMethod;
  /** Relative to API_PREFIX. */
  path: string;
  access: Access;
  /** The scope an API token needs (browser sessions need none). */
  scope: Scope | null;
  /** Session and demo operations: refused for API tokens. */
  browserOnly?: true;
}

const ADMIN: Role[] = ['administrator'];
const STAFF: Role[] = ['administrator', 'instructor'];
const INSTRUCTOR: Role[] = ['instructor'];
const STUDENT: Role[] = ['student'];

/** Permissions as data (D-011 foundations): the Worker and the mock adapter both enforce this table. */
export const ROUTES: { [K in Operation]: Route } = {
  getSession: { method: 'GET', path: '/session', access: 'public', scope: null },
  signIn: { method: 'POST', path: '/session', access: 'public', scope: null, browserOnly: true },
  signOut: { method: 'DELETE', path: '/session', access: 'public', scope: null, browserOnly: true },
  listDemoUsers: { method: 'GET', path: '/demo/users', access: 'public', scope: null, browserOnly: true },
  resetDemo: { method: 'POST', path: '/demo/reset', access: ADMIN, scope: 'people:write', browserOnly: true },

  updateInstitution: { method: 'PATCH', path: '/institution', access: ADMIN, scope: 'people:write' },
  updatePolicy: { method: 'PUT', path: '/institution/policy', access: ADMIN, scope: 'people:write' },
  getOverview: { method: 'GET', path: '/overview', access: ADMIN, scope: 'people:read' },
  listUsers: { method: 'GET', path: '/users', access: ADMIN, scope: 'people:read' },
  createUser: { method: 'POST', path: '/users', access: ADMIN, scope: 'people:write' },
  importUsers: { method: 'POST', path: '/users/import', access: ADMIN, scope: 'people:write' },
  updateUser: { method: 'PATCH', path: '/users/:userId', access: ADMIN, scope: 'people:write' },

  listCourses: { method: 'GET', path: '/courses', access: 'signed-in', scope: 'courses:read' },
  createCourse: { method: 'POST', path: '/courses', access: STAFF, scope: 'courses:write' },
  getCourseOutline: { method: 'GET', path: '/courses/:courseId', access: 'signed-in', scope: 'courses:read' },
  updateCourse: { method: 'PATCH', path: '/courses/:courseId', access: STAFF, scope: 'courses:write' },
  setCourseInstructors: { method: 'PUT', path: '/courses/:courseId/instructors', access: ADMIN, scope: 'courses:write' },
  getCourseEnrollments: { method: 'GET', path: '/courses/:courseId/enrollments', access: STAFF, scope: 'courses:read' },
  setCourseEnrollments: { method: 'PUT', path: '/courses/:courseId/enrollments', access: ADMIN, scope: 'courses:write' },
  getRoster: { method: 'GET', path: '/courses/:courseId/roster', access: STAFF, scope: 'courses:read' },

  createModule: { method: 'POST', path: '/courses/:courseId/modules', access: INSTRUCTOR, scope: 'content:write' },
  updateModule: { method: 'PATCH', path: '/modules/:moduleId', access: INSTRUCTOR, scope: 'content:write' },
  deleteModule: { method: 'DELETE', path: '/modules/:moduleId', access: INSTRUCTOR, scope: 'content:write' },
  createLesson: { method: 'POST', path: '/modules/:moduleId/lessons', access: INSTRUCTOR, scope: 'content:write' },
  updateLesson: { method: 'PATCH', path: '/lessons/:lessonId', access: INSTRUCTOR, scope: 'content:write' },
  deleteLesson: { method: 'DELETE', path: '/lessons/:lessonId', access: INSTRUCTOR, scope: 'content:write' },
  getLesson: { method: 'GET', path: '/lessons/:lessonId', access: STAFF, scope: 'content:read' },
  saveBlocks: { method: 'PUT', path: '/lessons/:lessonId/blocks', access: INSTRUCTOR, scope: 'content:write' },
  keepBlock: { method: 'POST', path: '/blocks/:blockId/keep', access: INSTRUCTOR, scope: 'content:write' },
  revertBlock: { method: 'POST', path: '/blocks/:blockId/revert', access: INSTRUCTOR, scope: 'content:write' },
  regenerateBlock: { method: 'POST', path: '/blocks/:blockId/regenerate', access: INSTRUCTOR, scope: 'ai:run' },
  publishLesson: { method: 'POST', path: '/lessons/:lessonId/publish', access: INSTRUCTOR, scope: 'content:write' },
  unpublishLesson: { method: 'POST', path: '/lessons/:lessonId/unpublish', access: INSTRUCTOR, scope: 'content:write' },

  saveProfile: { method: 'PUT', path: '/me/profile', access: STUDENT, scope: null },
  getToday: { method: 'GET', path: '/me/today', access: STUDENT, scope: null },
  getStudentLesson: { method: 'GET', path: '/me/lessons/:lessonId', access: 'signed-in', scope: null, browserOnly: true },
  answerCheck: { method: 'POST', path: '/me/lessons/:lessonId/checks/:blockId', access: 'signed-in', scope: null, browserOnly: true },
  setLessonProgress: { method: 'POST', path: '/me/lessons/:lessonId/progress', access: 'signed-in', scope: null, browserOnly: true },

  listAnnouncements: { method: 'GET', path: '/announcements', access: 'signed-in', scope: 'courses:read' },
  createAnnouncement: { method: 'POST', path: '/courses/:courseId/announcements', access: INSTRUCTOR, scope: 'courses:write' },
  updateAnnouncement: { method: 'PATCH', path: '/announcements/:announcementId', access: INSTRUCTOR, scope: 'courses:write' },
  deleteAnnouncement: { method: 'DELETE', path: '/announcements/:announcementId', access: INSTRUCTOR, scope: 'courses:write' },
  markAnnouncementRead: { method: 'POST', path: '/announcements/:announcementId/read', access: 'signed-in', scope: 'courses:write' },
  draftAnnouncement: { method: 'POST', path: '/ai/announcement', access: INSTRUCTOR, scope: 'ai:run' },

  listBuilderSessions: { method: 'GET', path: '/courses/:courseId/builder', access: INSTRUCTOR, scope: 'content:read' },
  createBuilderSession: { method: 'POST', path: '/courses/:courseId/builder', access: INSTRUCTOR, scope: 'ai:run' },
  getBuilderSession: { method: 'GET', path: '/builder/:sessionId', access: INSTRUCTOR, scope: 'content:read' },
  updateBuilderSession: { method: 'PATCH', path: '/builder/:sessionId', access: INSTRUCTOR, scope: 'content:write' },
  generateOutline: { method: 'POST', path: '/builder/:sessionId/outline', access: INSTRUCTOR, scope: 'ai:run' },
  generateDrafts: { method: 'POST', path: '/builder/:sessionId/draft', access: INSTRUCTOR, scope: 'ai:run' },

  whoAmI: { method: 'GET', path: '/me', access: 'public', scope: null },
  viewAs: { method: 'POST', path: '/session/view-as', access: ADMIN, scope: null, browserOnly: true },
  listInvitations: { method: 'GET', path: '/invitations', access: ADMIN, scope: 'people:read' },
  inviteUser: { method: 'POST', path: '/invitations', access: ADMIN, scope: 'people:write' },

  listApiTokens: { method: 'GET', path: '/tokens', access: STAFF, scope: null },
  createApiToken: { method: 'POST', path: '/tokens', access: STAFF, scope: null },
  revokeApiToken: { method: 'DELETE', path: '/tokens/:tokenId', access: STAFF, scope: null },

  listFiles: { method: 'GET', path: '/courses/:courseId/files', access: 'signed-in', scope: 'content:read' },
  getFile: { method: 'GET', path: '/files/:fileId', access: 'signed-in', scope: 'content:read' },
  deleteFile: { method: 'DELETE', path: '/files/:fileId', access: INSTRUCTOR, scope: 'content:write' },
  getFormats: { method: 'GET', path: '/files/:fileId/formats', access: 'signed-in', scope: 'content:read' },
  requestFormat: { method: 'POST', path: '/files/:fileId/formats', access: 'signed-in', scope: 'content:read' },

  getLessonAccess: { method: 'GET', path: '/lessons/:lessonId/access', access: STAFF, scope: 'access:read' },
  scanFile: { method: 'POST', path: '/files/:fileId/access/scan', access: STAFF, scope: 'access:write' },
  getFileAccess: { method: 'GET', path: '/files/:fileId/access', access: STAFF, scope: 'access:read' },
  fixFileIssue: { method: 'POST', path: '/files/:fileId/access/fix', access: INSTRUCTOR, scope: 'access:write' },
  suggestFix: { method: 'POST', path: '/access/suggest', access: INSTRUCTOR, scope: 'ai:run' },
  getCourseAccess: { method: 'GET', path: '/courses/:courseId/access', access: STAFF, scope: 'access:read' },
  getInstitutionAccess: { method: 'GET', path: '/access/institution', access: ADMIN, scope: 'access:read' },
  exportInstitutionAccess: { method: 'GET', path: '/access/institution/export', access: ADMIN, scope: 'access:read' },
  updateAccessPolicy: { method: 'PUT', path: '/institution/access-policy', access: ADMIN, scope: 'people:write' },
  listTranscriptions: { method: 'GET', path: '/files/:fileId/transcriptions', access: STAFF, scope: 'access:read' },
  reviewTranscription: { method: 'POST', path: '/files/:fileId/transcriptions/review', access: INSTRUCTOR, scope: 'access:write' },

  createAssignment: { method: 'POST', path: '/modules/:moduleId/assignments', access: INSTRUCTOR, scope: 'content:write' },
  listAssignments: { method: 'GET', path: '/courses/:courseId/assignments', access: 'signed-in', scope: 'content:read' },
  getAssignment: { method: 'GET', path: '/assignments/:assignmentId', access: 'signed-in', scope: 'content:read' },
  updateAssignment: { method: 'PATCH', path: '/assignments/:assignmentId', access: INSTRUCTOR, scope: 'content:write' },
  deleteAssignment: { method: 'DELETE', path: '/assignments/:assignmentId', access: INSTRUCTOR, scope: 'content:write' },
  publishAssignment: { method: 'POST', path: '/assignments/:assignmentId/publish', access: INSTRUCTOR, scope: 'content:write' },
  listSubmissions: { method: 'GET', path: '/assignments/:assignmentId/submissions', access: STAFF, scope: 'grades:read' },
  submit: { method: 'POST', path: '/assignments/:assignmentId/submissions', access: STUDENT, scope: null },
  getMySubmission: { method: 'GET', path: '/assignments/:assignmentId/submissions/me', access: STUDENT, scope: null },
  gradeSubmission: { method: 'POST', path: '/submissions/:submissionId/grade', access: INSTRUCTOR, scope: 'grades:write' },
  draftFeedback: { method: 'POST', path: '/submissions/:submissionId/draft-feedback', access: INSTRUCTOR, scope: 'ai:run' },
  releaseGrades: { method: 'POST', path: '/assignments/:assignmentId/release', access: INSTRUCTOR, scope: 'grades:write' },
  getGradebook: { method: 'GET', path: '/courses/:courseId/gradebook', access: STAFF, scope: 'grades:read' },
  exportGradebook: { method: 'GET', path: '/courses/:courseId/gradebook/export', access: STAFF, scope: 'grades:read' },

  getTutorSetting: { method: 'GET', path: '/tutor/settings', access: 'signed-in', scope: 'content:read' },
  setTutorSetting: { method: 'PUT', path: '/tutor/settings', access: INSTRUCTOR, scope: 'content:write' },
  startTutorSession: { method: 'POST', path: '/tutor/sessions', access: STUDENT, scope: null },
  sendTutorMessage: { method: 'POST', path: '/tutor/sessions/:sessionId/messages', access: STUDENT, scope: null },
  getTutorSummaries: { method: 'GET', path: '/courses/:courseId/tutor/summaries', access: INSTRUCTOR, scope: 'courses:read' },

  listPresets: { method: 'GET', path: '/presets', access: 'signed-in', scope: null },
  suggestPreset: { method: 'POST', path: '/me/preset/suggest', access: STUDENT, scope: null },
  applyPreset: { method: 'POST', path: '/me/preset', access: STUDENT, scope: null },
  listAdaptations: { method: 'GET', path: '/me/adaptations', access: STUDENT, scope: null },
  undoAdaptation: { method: 'POST', path: '/me/adaptations/:adaptationId/undo', access: STUDENT, scope: null },

  generateAtScope: { method: 'POST', path: '/courses/:courseId/generate', access: INSTRUCTOR, scope: 'ai:run' },
  getGenerationJob: { method: 'GET', path: '/generate/:jobId', access: INSTRUCTOR, scope: 'ai:run' },
  generateElement: { method: 'POST', path: '/lessons/:lessonId/generate', access: INSTRUCTOR, scope: 'ai:run' },

  importCourse: { method: 'POST', path: '/courses/import', access: ADMIN, scope: 'courses:write' },

  // ---- Night 3 ----
  listPrograms: { method: 'GET', path: '/programs', access: STAFF, scope: 'courses:read' },
  createProgram: { method: 'POST', path: '/programs', access: ADMIN, scope: 'courses:write' },
  updateProgram: { method: 'PATCH', path: '/programs/:programId', access: ADMIN, scope: 'courses:write' },
  deleteProgram: { method: 'DELETE', path: '/programs/:programId', access: ADMIN, scope: 'courses:write' },
  setCourseProgram: { method: 'PUT', path: '/courses/:courseId/program', access: ADMIN, scope: 'courses:write' },
  listTemplates: { method: 'GET', path: '/templates', access: STAFF, scope: 'courses:read' },
  getTemplate: { method: 'GET', path: '/templates/:templateId', access: STAFF, scope: 'courses:read' },
  createTemplate: { method: 'POST', path: '/templates', access: ADMIN, scope: 'courses:write' },
  updateTemplate: { method: 'PATCH', path: '/templates/:templateId', access: ADMIN, scope: 'courses:write' },
  deleteTemplate: { method: 'DELETE', path: '/templates/:templateId', access: ADMIN, scope: 'courses:write' },
  setInstitutionTemplate: { method: 'PUT', path: '/institution/template', access: ADMIN, scope: 'people:write' },
  previewTemplate: { method: 'GET', path: '/courses/:courseId/template', access: STAFF, scope: 'content:read' },
  applyTemplate: { method: 'POST', path: '/courses/:courseId/template/apply', access: STAFF, scope: 'content:write' },

  listRubrics: { method: 'GET', path: '/rubrics', access: STAFF, scope: 'courses:read' },
  getRubric: { method: 'GET', path: '/rubrics/:rubricId', access: STAFF, scope: 'courses:read' },
  createRubric: { method: 'POST', path: '/rubrics', access: ADMIN, scope: 'people:write' },
  updateRubric: { method: 'PATCH', path: '/rubrics/:rubricId', access: ADMIN, scope: 'people:write' },
  deleteRubric: { method: 'DELETE', path: '/rubrics/:rubricId', access: ADMIN, scope: 'people:write' },
  updateReadinessPolicy: { method: 'PUT', path: '/institution/readiness-policy', access: ADMIN, scope: 'people:write' },
  getCourseReadiness: { method: 'GET', path: '/courses/:courseId/readiness', access: STAFF, scope: 'courses:read' },
  runReadinessAi: { method: 'POST', path: '/courses/:courseId/readiness/ai', access: STAFF, scope: 'ai:run' },
  reviewFinding: { method: 'POST', path: '/courses/:courseId/readiness/items/:itemId/review', access: STAFF, scope: 'content:write' },
  attestItem: { method: 'PUT', path: '/courses/:courseId/readiness/items/:itemId/attestation', access: STAFF, scope: 'content:write' },
  clearAttestation: { method: 'DELETE', path: '/courses/:courseId/readiness/items/:itemId/attestation', access: STAFF, scope: 'content:write' },
  listOutcomes: { method: 'GET', path: '/courses/:courseId/outcomes', access: 'signed-in', scope: 'courses:read' },
  saveOutcomes: { method: 'PUT', path: '/courses/:courseId/outcomes', access: STAFF, scope: 'courses:write' },
  listOutcomeLinks: { method: 'GET', path: '/courses/:courseId/outcome-links', access: STAFF, scope: 'content:read' },
  setOutcomeLinks: { method: 'PUT', path: '/courses/:courseId/outcome-links', access: INSTRUCTOR, scope: 'content:write' },

  listVariants: { method: 'GET', path: '/lessons/:lessonId/variants', access: STAFF, scope: 'content:read' },
  createVariant: { method: 'POST', path: '/lessons/:lessonId/variants', access: INSTRUCTOR, scope: 'ai:run' },
  getVariantDiff: { method: 'GET', path: '/variants/:variantId/diff', access: STAFF, scope: 'content:read' },
  resyncVariant: { method: 'POST', path: '/variants/:variantId/resync', access: INSTRUCTOR, scope: 'ai:run' },
  keepVariant: { method: 'POST', path: '/variants/:variantId/keep', access: INSTRUCTOR, scope: 'content:write' },

  listRequirements: { method: 'GET', path: '/requirements', access: ADMIN, scope: 'people:read' },
  createRequirement: { method: 'POST', path: '/requirements', access: ADMIN, scope: 'people:write' },
  updateRequirement: { method: 'PATCH', path: '/requirements/:requirementId', access: ADMIN, scope: 'people:write' },
  deleteRequirement: { method: 'DELETE', path: '/requirements/:requirementId', access: ADMIN, scope: 'people:write' },
  getComplianceReport: { method: 'GET', path: '/compliance', access: ADMIN, scope: 'people:read' },
  listCompletionEvents: { method: 'GET', path: '/compliance/events', access: ADMIN, scope: 'people:read' },
  exportCompletionEvents: { method: 'GET', path: '/compliance/events/export', access: ADMIN, scope: 'people:read' },
  listMyTraining: { method: 'GET', path: '/me/training', access: 'signed-in', scope: null },
  getTestOut: { method: 'GET', path: '/courses/:courseId/test-out', access: STAFF, scope: 'content:read' },
  saveTestOut: { method: 'PUT', path: '/courses/:courseId/test-out', access: INSTRUCTOR, scope: 'content:write' },
  deleteTestOut: { method: 'DELETE', path: '/courses/:courseId/test-out', access: INSTRUCTOR, scope: 'content:write' },
  getMyTestOut: { method: 'GET', path: '/me/courses/:courseId/test-out', access: 'signed-in', scope: null },
  takeTestOut: { method: 'POST', path: '/me/courses/:courseId/test-out', access: 'signed-in', scope: null, browserOnly: true },
  listMyCertificates: { method: 'GET', path: '/me/certificates', access: 'signed-in', scope: null },
  getCertificate: { method: 'GET', path: '/certificates/:certificateId', access: 'signed-in', scope: 'people:read' },
  verifyCertificate: { method: 'GET', path: '/verify/:code', access: 'public', scope: null },
  reissueCertificate: { method: 'POST', path: '/certificates/:certificateId/reissue', access: ADMIN, scope: 'people:write' },

  // HRIS compliance M1
  getWorkerColumnMap: { method: 'GET', path: '/hr/column-map', access: ADMIN, scope: 'people:read' },
  saveWorkerColumnMap: { method: 'PUT', path: '/hr/column-map', access: ADMIN, scope: 'people:write' },
  previewWorkerImport: { method: 'POST', path: '/hr/imports/preview', access: ADMIN, scope: 'people:write' },
  applyWorkerImport: { method: 'POST', path: '/hr/imports/apply', access: ADMIN, scope: 'people:write' },
  listWorkerRecords: { method: 'GET', path: '/hr/records', access: ADMIN, scope: 'people:read' },
  listWorkerLinkSuggestions: { method: 'GET', path: '/hr/links/suggestions', access: ADMIN, scope: 'people:read' },
  confirmWorkerLink: { method: 'POST', path: '/hr/links', access: ADMIN, scope: 'people:write' },
  previewRule: { method: 'POST', path: '/requirements/:requirementId/rule/preview', access: ADMIN, scope: 'people:write' },
  applyRule: { method: 'POST', path: '/requirements/:requirementId/rule/apply', access: ADMIN, scope: 'people:write' },

  listReportingLines: { method: 'GET', path: '/reporting-lines', access: ADMIN, scope: 'people:read' },
  addReportingLine: { method: 'POST', path: '/reporting-lines', access: ADMIN, scope: 'people:write' },
  removeReportingLine: { method: 'DELETE', path: '/reporting-lines', access: ADMIN, scope: 'people:write' },
  getMyVisibility: { method: 'GET', path: '/me/visibility', access: 'signed-in', scope: null },
  setManagerSharing: { method: 'PUT', path: '/me/visibility/:managerId', access: 'signed-in', scope: null, browserOnly: true },
  getManagerView: { method: 'GET', path: '/me/team', access: 'signed-in', scope: 'people:read' },
};

/** All scopes, for the token form and the docs. */
export const SCOPES: { id: Scope; description: string }[] = [
  { id: 'courses:read', description: 'Read courses, outlines, rosters, announcements' },
  { id: 'courses:write', description: 'Create and change courses, enrollments, announcements' },
  { id: 'content:read', description: 'Read lessons, blocks, files, assignments' },
  { id: 'content:write', description: 'Create and change modules, lessons, blocks, files, assignments; publish' },
  { id: 'people:read', description: 'Read people and invitations' },
  { id: 'people:write', description: 'Add and change people, institution settings, policies' },
  { id: 'access:read', description: 'Read accessibility reports' },
  { id: 'access:write', description: 'Run scans and apply document fixes' },
  { id: 'grades:read', description: 'Read submissions and gradebooks' },
  { id: 'grades:write', description: 'Grade and release' },
  { id: 'ai:run', description: 'Run AI drafting and suggestions' },
];

// ---- Errors ------------------------------------------------------------------------------

export type ApiErrorCode =
  | 'unauthenticated' // 401: no persona signed in
  | 'forbidden' //       403: wrong role, or not your course
  | 'not-found' //       404
  | 'invalid' //         400: bad input; `details` may list field errors
  | 'conflict' //        409: for example deleting a non-empty module
  | 'not-ready' //       409: publish blocked; `details` is the ReadinessReport
  | 'ai-disabled' //     403: the administrator turned AI authoring off
  | 'ai-failed' //       502: the model call failed or returned unusable output
  | 'rate-limited' //    429: too many requests for this token
  | 'too-large' //       413: upload over the size limit
  | 'unsupported'; //    415: file type not supported

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  'not-found': 404,
  invalid: 400,
  conflict: 409,
  'not-ready': 409,
  'ai-disabled': 403,
  'ai-failed': 502,
  'rate-limited': 429,
  'too-large': 413,
  unsupported: 415,
};

/** Error body: `{ error: { code, message, details? } }` */
export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(public code: ApiErrorCode, message: string, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
  get status() {
    return ERROR_STATUS[this.code];
  }
}

// ---- Path helpers shared by the router and the HTTP client ---------------------------

/** Names of the `:params` in a route path. */
export function pathParams(path: string): string[] {
  return [...path.matchAll(/:(\w+)/g)].map((m) => m[1]);
}

/** Fills a route path from the input object; returns the path and the remaining fields. */
export function fillPath(path: string, input: Record<string, unknown> = {}) {
  const rest: Record<string, unknown> = { ...input };
  const filled = path.replace(/:(\w+)/g, (_, name: string) => {
    const value = rest[name];
    delete rest[name];
    if (typeof value !== 'string' || !value) throw new ApiError('invalid', `Missing path parameter "${name}"`);
    return encodeURIComponent(value);
  });
  return { path: filled, rest };
}

/** Matches a concrete path against a route path; returns the params or null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const names: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, n: string) => { names.push(n); return '([^/]+)'; }) + '/?$');
  const m = re.exec(path);
  if (!m) return null;
  return Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
}

// Re-exported so callers can import everything from one module.
export type { Block, Timestamp };

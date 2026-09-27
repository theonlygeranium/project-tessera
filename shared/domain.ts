// Tessera's domain model (D-002, D-003, D-004, D-005, D-014, D-019 to D-022).
// Shared by the app (app/src) and the Worker API (worker/). Everything the server
// enforces is modeled here as data so both sides agree on it.
//
// Structure: institution → course → module → lesson → block. There is no other
// content hierarchy; AI features edit this structure (principle #1).

export type Id = string;
/** ISO 8601 timestamp, UTC. */
export type Timestamp = string;

// ---- People --------------------------------------------------------------------

/** The three Night 1 personas (D-016). */
export type Role = 'administrator' | 'instructor' | 'student';

export interface User {
  id: Id;
  name: string;
  email: string;
  role: Role;
  /** Two letters for the text avatar. */
  initials: string;
  /** Students only; null until onboarding is finished. */
  profile: LearningProfile | null;
}

/**
 * The student's learning profile (D-004): goals, time, language, accessibility,
 * reminders. Never "learning styles".
 */
export interface LearningProfile {
  goals: LearningGoal[];
  goalNote: string;
  /** Minutes a week the student plans to study. */
  weeklyMinutes: number;
  language: string;
  readingLevel: 'standard' | 'plain';
  accessibility: {
    captions: boolean;
    reducedMotion: boolean;
    largerText: boolean;
    screenReader: boolean;
  };
  reminders: 'off' | 'daily' | 'weekly';
  completedAt: Timestamp;
}

export type LearningGoal = 'finish-degree' | 'career-change' | 'upskill' | 'compliance' | 'curiosity';

// ---- Institution and policy ------------------------------------------------------

export type TutorMode = 'off' | 'hints' | 'explain' | 'open';

/** Program-level AI limits set by the administrator (D-005). Enforced by the server. */
export interface AiPolicy {
  /** Whether instructors can use the AI course builder and AI drafting. */
  aiAuthoring: boolean;
  /** Tutor modes instructors may choose, by activity kind. */
  tutorModes: { graded: TutorMode[]; practice: TutorMode[] };
}

/** Brand accents an institution can pick. Each maps to a contrast-checked token set. */
export type AccentId = 'teal' | 'blue' | 'plum' | 'rust';

export interface Institution {
  id: Id;
  name: string;
  /** Short wordmark shown in the app shell, for example "Meridian State". */
  shortName: string;
  accent: AccentId;
  /** False until an administrator finishes first-run setup. */
  setupComplete: boolean;
  policy: AiPolicy;
  /** Publishing rules for accessibility (D-022). */
  accessPolicy: AccessPolicy;
}

// ---- Courses and structure -------------------------------------------------------

export type CourseStatus = 'active' | 'archived';

export interface Course {
  id: Id;
  code: string;
  title: string;
  term: string;
  description: string;
  /** The instructor's welcome on the course home (teaching presence). */
  welcome: string;
  outcomes: string[];
  instructorIds: Id[];
  status: CourseStatus;
}

/** A course as it appears in a list, with counts for the viewer's role. */
export interface CourseSummary extends Course {
  instructorNames: string[];
  moduleCount: number;
  lessonCount: number;
  publishedLessonCount: number;
  studentCount: number;
  /** Students only: completed ÷ published lessons, 0–1. */
  progress: number | null;
  /** Students only: published lessons in progress or completed (so a card can say "In progress" at 0%). */
  startedLessonCount: number | null;
}

export interface Module {
  id: Id;
  courseId: Id;
  title: string;
  position: number;
}

export type LessonStatus = 'draft' | 'published';

export interface Lesson {
  id: Id;
  moduleId: Id;
  courseId: Id;
  title: string;
  /** Estimated minutes (principle #4). */
  minutes: number;
  position: number;
  status: LessonStatus;
  publishedAt: Timestamp | null;
}

/** A lesson in an outline, with the viewer's progress (students) or block counts (staff). */
export interface LessonSummary extends Lesson {
  progress: LessonProgressState | null;
  /** Staff only: blocks that are AI drafts not yet kept. */
  draftBlockCount: number | null;
}

export interface ModuleWithLessons extends Module {
  lessons: LessonSummary[];
}

/**
 * A course with its module and lesson outline. Students only ever receive
 * published lessons, and modules with no published lessons are omitted.
 */
export interface CourseOutline {
  course: CourseSummary;
  modules: ModuleWithLessons[];
}

// ---- Blocks and AI provenance (D-003, D-006) --------------------------------------------

export type AiTask = 'brief' | 'outline' | 'lesson-draft' | 'block-regenerate' | 'announcement';

/** Where AI output came from. Shown next to every AI block ("names what it is and its source"). */
export interface Provenance {
  /** Model id, for example "palmyra-x6", or "fixture" for the deterministic test provider. */
  model: string;
  task: AiTask;
  generatedAt: Timestamp;
  sources: { id: Id; name: string }[];
  /** One line saying what was asked, shown in the block's source line. */
  summary: string;
}

/**
 * Human blocks have `origin: 'human'` and `aiState: null`. AI blocks start as
 * `draft` and become `kept` only when a person keeps them. A lesson can't be
 * published while any block is a draft (D-003).
 */
export interface BlockMeta {
  id: Id;
  lessonId: Id;
  position: number;
  origin: 'human' | 'ai';
  aiState: 'draft' | 'kept' | null;
  provenance: Provenance | null;
  /** The previous content when a person edited or regenerated an AI block (for the diff and Revert). */
  previous: BlockContent | null;
  updatedAt: Timestamp;
}

export type BlockContent =
  | { type: 'heading'; level: 2 | 3; text: string }
  /** Plain text; paragraphs are separated by a blank line. */
  | { type: 'text'; text: string }
  | { type: 'callout'; tone: 'info' | 'tip' | 'warning'; title: string; text: string }
  /** `alt` is required for publishing; an empty string only when `decorative` is true. */
  | { type: 'image'; src: string; alt: string; decorative: boolean; caption: string }
  | {
      type: 'check';
      question: string;
      options: { id: string; text: string }[];
      correctOptionId: string;
      feedbackCorrect: string;
      feedbackIncorrect: string;
    }
  // ---- Night 2 block types (D-022, plan §5.1) ----
  /** A long-form handout: sections of headings and paragraphs, rendered in the reading view and exportable. */
  | { type: 'document'; title: string; sections: { heading: string; text: string }[] }
  /** An uploaded PDF, DOCX, or PPTX (a `File` in R2). Students get the accessible formats menu. */
  | { type: 'file'; fileId: Id; title: string; description: string }
  /** A video embed or upload. Captions or a transcript are required to publish (WCAG 1.2.2). */
  | { type: 'video'; src: string; provider: 'youtube' | 'vimeo' | 'upload'; title: string; captionsFileId: Id | null; transcript: string; minutes: number }
  /** Rows and columns; the first row is the header row when `headerRow` is true. */
  | { type: 'table'; caption: string; headerRow: boolean; rows: string[][] }
  /** A branching decision practice ("simulation"): the student chooses, sees the consequence, and gets feedback. */
  | { type: 'scenario'; title: string; setting: string; nodes: ScenarioNode[]; startNodeId: string }
  /** A descriptive link (WCAG 2.4.4). Embeds are allow-listed by provider in the player. */
  | { type: 'link'; href: string; text: string; description: string };

export interface ScenarioNode {
  id: string;
  /** The situation the student is in. */
  text: string;
  /** Empty for an ending node. */
  choices: { id: string; text: string; nextNodeId: string; feedback: string; quality: 'best' | 'okay' | 'poor' }[];
  /** Shown when the node is an ending. */
  outcome: string;
}

export type BlockType = BlockContent['type'];
export type Block = BlockMeta & BlockContent;

/** What a student receives for a check block: no answer key. */
export type StudentCheckContent = Omit<Extract<BlockContent, { type: 'check' }>, 'correctOptionId' | 'feedbackCorrect' | 'feedbackIncorrect'>;
/** `origin` and `provenance` let the player label AI-written (kept) blocks (D-003, D-006). */
type StudentBlockMeta = Pick<BlockMeta, 'id' | 'position' | 'origin' | 'provenance'>;
export type StudentBlock =
  | (StudentBlockMeta & Exclude<BlockContent, { type: 'check' }>)
  | (StudentBlockMeta & StudentCheckContent);

/** A lesson with its blocks, as staff see it. */
export interface LessonDetail {
  lesson: Lesson;
  moduleTitle: string;
  courseTitle: string;
  blocks: Block[];
  readiness: ReadinessReport;
}

/** A published lesson as a student sees it. */
export interface StudentLesson {
  lesson: Lesson;
  moduleTitle: string;
  courseTitle: string;
  blocks: StudentBlock[];
  progress: LessonProgress;
  previousLessonId: Id | null;
  nextLessonId: Id | null;
}

// ---- Publish readiness (principle #12) ----------------------------------------------

export type ReadinessCode = 'empty-lesson' | 'draft-block' | 'missing-alt' | 'heading-order' | 'check-incomplete';

export interface ReadinessIssue {
  code: ReadinessCode;
  blockId: Id | null;
  message: string;
}

export interface ReadinessReport {
  ready: boolean;
  issues: ReadinessIssue[];
  /** Blocks from AI, and how many of them a person has kept. */
  aiBlocks: number;
  keptAiBlocks: number;
}

// ---- Progress -------------------------------------------------------------------------

export type LessonProgressState = 'not-started' | 'in-progress' | 'completed';

export interface LessonProgress {
  lessonId: Id;
  state: LessonProgressState;
  /** Knowledge-check results by block id. */
  checks: Record<Id, { correct: boolean; attempts: number }>;
  updatedAt: Timestamp | null;
}

export interface CheckResult {
  correct: boolean;
  feedback: string;
  attempts: number;
}

// ---- Announcements (communication center) ----------------------------------------------

export interface Announcement {
  id: Id;
  courseId: Id;
  courseTitle: string;
  authorId: Id;
  authorName: string;
  authorInitials: string;
  title: string;
  /** Plain text; paragraphs separated by a blank line. */
  body: string;
  pinned: boolean;
  status: 'draft' | 'published';
  /** AI-assisted announcements stay drafts until the instructor edits or keeps them (D-003). */
  origin: 'human' | 'ai';
  aiState: 'draft' | 'kept' | null;
  provenance: Provenance | null;
  publishedAt: Timestamp | null;
  createdAt: Timestamp;
  /** For the viewer: whether they've read it. Staff always see true. */
  read: boolean;
}

// ---- Student Today (principle #2) -----------------------------------------------------------

export interface TaskItem {
  id: Id;
  kind: 'start' | 'resume' | 'next';
  title: string;
  /** "STAT 110 · Module 1" */
  context: string;
  minutes: number;
  courseId: Id;
  lessonId: Id;
  state: LessonProgressState;
}

export interface Today {
  doNext: TaskItem[];
  /** Unread first, newest first, at most 5. */
  announcements: Announcement[];
  unreadCount: number;
  courses: CourseSummary[];
  week: { minutesGoal: number; minutesDone: number };
}

// ---- Rosters and overview ------------------------------------------------------------------

export interface RosterEntry {
  user: Pick<User, 'id' | 'name' | 'email' | 'initials'>;
  completedLessons: number;
  publishedLessons: number;
  lastActivity: Timestamp | null;
}

export interface Overview {
  people: Record<Role, number>;
  courses: number;
  publishedLessons: number;
  draftLessons: number;
  announcements: number;
}

// ---- AI course builder (#20, lane F) ---------------------------------------------------

export interface SourceDoc {
  id: Id;
  name: string;
  /** Plain text extracted from a paste or a .txt/.md upload. */
  text: string;
}

export interface CourseBrief {
  audience: string;
  outcomes: string[];
  moduleCount: number;
  lessonsPerModule: number;
  lessonMinutes: number;
  tone: string;
  notes: string;
}

export interface OutlineDraft {
  modules: { title: string; lessons: { title: string; minutes: number; objective: string }[] }[];
}

export type BuilderStage = 'brief' | 'outline' | 'draft' | 'review';

export interface BuilderSession {
  id: Id;
  courseId: Id;
  prompt: string;
  sources: SourceDoc[];
  stage: BuilderStage;
  brief: CourseBrief | null;
  outline: OutlineDraft | null;
  /** Lessons created by the draft step, in order. */
  lessonIds: Id[];
  provenance: Provenance | null;
  createdAt: Timestamp;
}

// ---- Files and documents (D-019, D-022) -------------------------------------------------

export type FileKind = 'pdf' | 'docx' | 'pptx' | 'image' | 'captions' | 'other';

/** An uploaded file. The bytes live in R2 under `key`; versions never overwrite the original. */
export interface FileRecord {
  id: Id;
  courseId: Id;
  name: string;
  kind: FileKind;
  mime: string;
  size: number;
  /** R2 object key of the current version. */
  key: string;
  version: number;
  uploadedBy: Id;
  uploadedAt: Timestamp;
  /** The latest accessibility scan, when one exists. */
  scan: AccessSummary | null;
}

export type AccessibleFormat = 'reading' | 'audio' | 'epub' | 'ocr';

export interface FormatStatus {
  format: AccessibleFormat;
  state: 'none' | 'generating' | 'ready' | 'failed';
  /** Set when ready: the file id of the generated artifact, served through the files API. */
  outputFileId: Id | null;
  generatedAt: Timestamp | null;
}

// ---- Tessera Access: accessibility reports (D-022) ------------------------------------------

export type AccessSeverity = 'critical' | 'serious' | 'moderate' | 'minor';
export type WcagLevel = 'A' | 'AA' | 'AAA';

/** One accessibility issue, with its WCAG 2.2 mapping and where it is. */
export interface AccessIssue {
  code: string;
  severity: AccessSeverity;
  wcag: { sc: string; level: WcagLevel; title: string };
  title: string;
  description: string;
  fixHint: string;
  /** For lessons: the block id. For documents: a page or slide number and an element index. */
  location: { blockId?: Id; page?: number; element?: number; label?: string };
  count: number;
  /** Fixes the product can apply or draft (alt text, rewrite, header row, metadata). */
  fix: 'alt-text' | 'rewrite' | 'link-text' | 'table-header' | 'metadata' | 'captions' | 'manual';
}

export interface AccessSummary {
  score: number;
  grade: 'Perfect' | 'Good' | 'Moderate' | 'Low' | 'Very low';
  issueCount: number;
  bySeverity: Record<AccessSeverity, number>;
  scannedAt: Timestamp;
}

export interface AccessReport extends AccessSummary {
  target: { kind: 'lesson'; lessonId: Id } | { kind: 'file'; fileId: Id; version: number };
  issues: AccessIssue[];
  /** Documents: pages or slides, whether text was extractable, image count. */
  document: { pages: number; hasText: boolean; images: number; tagged: boolean | null } | null;
}

/** Administrator policy for publishing (D-022). */
export interface AccessPolicy {
  minimumScore: number;
  blockingSeverities: AccessSeverity[];
}

export interface AccessTrendPoint { at: Timestamp; score: number; issueCount: number }

export interface CourseAccessReport {
  courseId: Id;
  summary: AccessSummary;
  lessons: { lessonId: Id; title: string; status: LessonStatus; summary: AccessSummary | null }[];
  files: { fileId: Id; name: string; kind: FileKind; summary: AccessSummary | null }[];
  topIssues: { code: string; title: string; count: number; wcag: AccessIssue['wcag'] }[];
  trend: AccessTrendPoint[];
}

export interface InstitutionAccessReport {
  summary: AccessSummary;
  courses: { courseId: Id; code: string; title: string; instructorNames: string[]; summary: AccessSummary | null }[];
  topIssues: CourseAccessReport['topIssues'];
  trend: AccessTrendPoint[];
}

// ---- API tokens (D-020) ----------------------------------------------------------------

export type Scope =
  | 'courses:read' | 'courses:write'
  | 'content:read' | 'content:write'
  | 'people:read' | 'people:write'
  | 'access:read' | 'access:write'
  | 'grades:read' | 'grades:write'
  | 'ai:run';

/** A token as listed. The secret is shown once, at creation, and stored only as a hash. */
export interface ApiToken {
  id: Id;
  name: string;
  /** The first 8 characters after `tsk_`, for recognition. */
  prefix: string;
  scopes: Scope[];
  ownerId: Id;
  createdAt: Timestamp;
  expiresAt: Timestamp | null;
  lastUsedAt: Timestamp | null;
  revokedAt: Timestamp | null;
}

// ---- Assignments, submissions, grading (plan §5.3) --------------------------------------------

export type SubmissionType = 'text' | 'file' | 'link';

export interface RubricCriterion {
  id: string;
  title: string;
  description: string;
  levels: { id: string; title: string; points: number; description: string }[];
}

export interface Assignment {
  id: Id;
  moduleId: Id;
  courseId: Id;
  title: string;
  position: number;
  status: LessonStatus;
  publishedAt: Timestamp | null;
  dueAt: Timestamp | null;
  points: number;
  submissionType: SubmissionType;
  rubric: RubricCriterion[];
  /** Instructions are blocks, like a lesson's. */
  instructions: Block[];
}

export type SubmissionState = 'submitted' | 'graded' | 'returned';

export interface Submission {
  id: Id;
  assignmentId: Id;
  studentId: Id;
  attempt: number;
  state: SubmissionState;
  text: string;
  fileId: Id | null;
  link: string;
  submittedAt: Timestamp;
  grade: Grade | null;
}

export interface Grade {
  score: number;
  /** Points chosen per rubric criterion. */
  criteria: { criterionId: string; levelId: string; points: number; comment: string }[];
  /** The feedback the student sees; may have started as an AI draft (D-003). */
  feedback: string;
  feedbackOrigin: 'human' | 'ai';
  feedbackProvenance: Provenance | null;
  gradedBy: Id;
  gradedAt: Timestamp;
  /** Students see the grade only after release. */
  releasedAt: Timestamp | null;
}

export interface GradebookRow {
  student: Pick<User, 'id' | 'name' | 'email'>;
  cells: { assignmentId: Id; score: number | null; state: SubmissionState | 'missing'; released: boolean }[];
  total: number;
  possible: number;
}

// ---- Tutor (D-005, plan §5.4) -------------------------------------------------------------

export type ActivityKind = 'lesson' | 'assignment';

/** The instructor's tutor setting for one activity, within the administrator's limits. */
export interface TutorSetting {
  activityKind: ActivityKind;
  activityId: Id;
  mode: TutorMode;
  maxHints: number;
  /** Which sources the tutor may cite: the activity's published blocks and course sources. Never an answer key. */
  allowedSourceIds: Id[];
  setBy: Id;
  setAt: Timestamp;
}

export interface TutorMessage {
  id: Id;
  role: 'student' | 'tutor';
  text: string;
  /** Tutor messages: what kind of help this was. */
  kind: 'hint' | 'explain' | 'answer' | 'refusal' | 'chat' | null;
  hintNumber: number | null;
  cites: { id: Id; name: string }[];
  at: Timestamp;
}

export interface TutorSession {
  id: Id;
  studentId: Id;
  activityKind: ActivityKind;
  activityId: Id;
  mode: TutorMode;
  hintsUsed: number;
  maxHints: number;
  /** What the student sees about visibility (D-005). */
  visibility: string;
  messages: TutorMessage[];
}

/** What an instructor sees: a summary, never the transcript (D-005). */
export interface TutorSummary {
  studentId: Id;
  studentName: string;
  sessions: number;
  hintsUsed: number;
  answerRequests: number;
  /** AI-written summary of themes and misconceptions, labeled as such. */
  summary: string;
  provenance: Provenance | null;
}

// ---- Adaptations: presets, why, undo (D-004, principle #7) ------------------------------------

export type PresetId = 'undergraduate' | 'working-learner' | 'compliance' | 'certification' | 'graduate';

export interface Preset {
  id: PresetId;
  title: string;
  description: string;
  sessionMinutes: number;
  reminders: LearningProfile['reminders'];
  readingLevel: LearningProfile['readingLevel'];
}

/** One change the system made for a student, with its reason; each can be undone. */
export interface Adaptation {
  id: Id;
  studentId: Id;
  kind: 'preset' | 'session-length' | 'task-order' | 'reminders' | 'reading-level';
  why: string;
  before: unknown;
  after: unknown;
  appliedAt: Timestamp;
  undoneAt: Timestamp | null;
}

// ---- Identity (D-021) -------------------------------------------------------------------------

export interface Invitation {
  userId: Id;
  email: string;
  invitedBy: Id;
  invitedAt: Timestamp;
  /** Whether the email was added to the Access group. */
  accessGranted: boolean;
  acceptedAt: Timestamp | null;
}


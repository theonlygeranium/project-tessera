// Tessera's domain model (D-002, D-003, D-004, D-005, D-014).
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
    };

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

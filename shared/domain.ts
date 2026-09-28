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
  /** Preferred session length in minutes (set by a preset, D-004); absent means no preference. */
  sessionMinutes?: number;
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
  workloadRates?: WorkloadRates;
  designPartner?: { enabled: boolean; allowedArchitectures: ArchitectureId[] | null };
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
  /** Night 3: the institution's course template (D-024), when one is set. */
  templateId?: Id | null;
  /** Night 3: the readiness rubric and whether a minimum result blocks publishing (D-029). */
  readinessPolicy?: ReadinessPolicy;
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
  /** Night 3: the program the course belongs to (at most one); its template applies (D-024). */
  programId?: Id | null;
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
  /** Night 3: the course's program and its brand, for every viewer (D-024). */
  program?: { id: Id; name: string; accent: AccentId | null } | null;
}

export interface Module {
  id: Id;
  courseId: Id;
  title: string;
  position: number;
  /** Night 3: what a learner can do after the module (a readiness item checks it's present). */
  objective?: string | null;
  /** Night 3: the template item this module came from, so readiness can spot deviations. */
  templateKey?: string | null;
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
  /** D-033: the intended outcome for this lesson. */
  objective?: string | null;
  /** Night 3: the template item this lesson came from. */
  templateKey?: string | null;
  /**
   * Night 3: set on a variant lesson (#23); variants never appear in outlines. `syncedAt`
   * is when the variant was made or last resynced: master blocks changed after it and not
   * covered by the variant show as new in the diff.
   */
  variantOf?: { lessonId: Id; audience: VariantAudience; syncedAt: Timestamp } | null;
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
  /** Staff only: the current syllabus design session. */
  designSession?: { id: Id; stage: DesignStage } | null;
}

// ---- Blocks and AI provenance (D-003, D-006) --------------------------------------------

export type AiTask = 'brief' | 'outline' | 'lesson-draft' | 'block-regenerate' | 'announcement' | 'feedback' | 'alt-text' | 'rewrite' | 'link-text' | 'element' | 'tutor' | 'tutor-summary' | 'agent' | 'readiness-item' | 'variant' | 'syllabus-extract' | 'syllabus-analyze' | 'structure-options' | 'module-scaffold' | 'objective-rewrite';

/** Where AI output came from. Shown next to every AI block ("names what it is and its source"). */
export interface Provenance {
  /** Model id, for example "palmyra-x6", or "fixture" for the deterministic test provider. */
  model: string;
  task: AiTask;
  generatedAt: Timestamp;
  sources: { id: Id; name: string; span?: SourceSpan }[];
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
  /** Night 3: the template item this block came from (a required block). */
  templateKey?: string | null;
  /** Night 3, variants only: the master block this came from and the master's content hash at the last sync. */
  source?: { blockId: Id; hash: string } | null;
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
  /** Staff review guidance derived from the design plan. */
  design?: { moduleWhy: { text: string; cites: SourceSpan[]; frameworks: string[] }; nextSteps: { text: string; action: 'choose-reading' | 'add-example' | 'move-lesson' | 'confirm-weight' | 'set-tutor' | null; target?: FixTarget }[] };
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
  /** Night 3: set when the student is reading a variant, with why and the way back (D-004, principle #7). */
  variant?: { audience: VariantAudience; why: string; fullLessonId: Id } | null;
  /** Night 3: set on the full lesson when a variant matches the student, so the player can offer it. */
  variantAvailable?: { audience: VariantAudience; lessonId: Id; why: string } | null;
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
  /** Set when the institution's accessibility policy blocks publishing (D-022). */
  accessPolicy?: { score: number; reasons: string[] };
  /** Night 3: set when the readiness policy's minimum blocks publishing (D-029). */
  rubric?: { rubricName: string; percent: number; minimum: number };
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
  /** Night 3: required training, shown first, soonest due first (#22). */
  required?: RequiredTraining[];
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

// ---- Night 4 · Syllabus design partner (D-030 to D-036) ----
export type FieldOrigin = 'extracted' | 'inferred' | 'user_supplied' | 'missing';
export interface SourceSpan { page: number | null; text: string }            // page null for pasted text
export interface Extracted<T> { value: T | null; origin: FieldOrigin; confidence: number; spans: SourceSpan[] }

export type DesignSourceKind = 'syllabus' | 'brief';                           // D-035
export interface DesignSource {
  kind: DesignSourceKind;
  fileId: Id | null;                      // FileRecord when uploaded or chosen; null when pasted or sample
  version: number | null;
  name: string;
  /** Section text with anchors; from checkDocument() for files or the fictional sample, one section for a paste. */
  sections: { page: number | null; heading: string; level: number; text: string; lines: string[] }[];
  chars: number;
  ocr: boolean;
}

export interface CourseProfile {
  code: Extracted<string>; title: Extracted<string>; credits: Extracted<number>;
  termWeeks: Extracted<number>; termStart: Extracted<string>; termEnd: Extracted<string>;   // ISO dates
  meeting: Extracted<{ days: string[]; minutes: number }>;
  modality: Extracted<'in-person' | 'online-async' | 'online-sync' | 'hybrid' | 'hyflex'>;
  level: Extracted<string>; prerequisites: Extracted<string[]>; enrolment: Extracted<number>;
  instructor: Extracted<{ name: string; email: string; officeHours: string }>;
  description: Extracted<string>; materials: Extracted<{ title: string; kind: 'textbook' | 'reading' | 'tool'; span: SourceSpan }[]>;
  /** Industry brief only (D-035). */
  business: Extracted<{ goal: string; metric: string; audienceRole: string }>;
  weeklyHoursBudget: number;              // computed: credits × 3 (34 CFR 600.2), or the brief's seat time
}

export interface ExtractedOutcome { id: string; text: string; span: SourceSpan | null; origin: FieldOrigin }
export interface ExtractedAssessment { id: string; title: string; weightPercent: number | null; dueAt: string | null; format: string; span: SourceSpan | null }
export interface ScheduleRow { week: number; dates: string; topic: string; reading: string; due: string; span: SourceSpan | null; empty: boolean }
export interface PolicyItem { kind: 'attendance' | 'late-work' | 'integrity' | 'ai-use' | 'accommodations' | 'other'; text: string; span: SourceSpan }

export interface SyllabusExtraction {
  profile: CourseProfile; outcomes: ExtractedOutcome[]; assessments: ExtractedAssessment[];
  schedule: ScheduleRow[]; policies: PolicyItem[];
  /** Rule failures, each becoming a question (§6.2). */
  problems: { code: ExtractionProblemCode; message: string; spans: SourceSpan[] }[];
  provenance: Provenance;
}
export type ExtractionProblemCode = 'weights-not-100' | 'week-count-mismatch' | 'empty-week' | 'due-outside-term' | 'objective-no-verb' | 'missing-field';

export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
export type FinkCategory = 'foundational' | 'application' | 'integration' | 'human' | 'caring' | 'learning-how';
export interface OutcomeAudit {
  outcomeId: string; measurable: boolean; verb: string | null; bloom: BloomLevel | null; fink: FinkCategory | null;
  /** Industry: Mager parts present (D-035). */
  mager: { performance: boolean; condition: boolean; criterion: boolean } | null;
  assessedBy: { assessmentId: string; fit: 'assessed' | 'verb-mismatch' }[];
  suggestion: { text: string; why: string } | null;   // labelled alternative; original text is never replaced
}
export interface WorkloadEstimate {
  weeklyBudgetHours: number; averageHours: number;
  weeks: { week: number; hours: number; overBudget: boolean; drivers: string[] }[];
  rates: WorkloadRates; assumptions: string[];
}
export interface WorkloadRates { readingPagesPerHour: number; problemSetHours: number; writingHoursPerPage: number; projectHours: number; quizMinutes: number; discussionMinutes: number }
export interface LearnerCenteredness {
  palmer: { score: number; max: 46; band: 'content-focused' | 'transitional' | 'learning-focused'; components: { name: string; score: number; max: number; evidence: SourceSpan | null }[] };
  cullenHarris: { community: number; powerAndControl: number; evaluation: number; evidence: { factor: string; quote: SourceSpan }[] };
}
export interface Deficiency { code: string; message: string; rubricRefs: { rubric: 'tessera' | 'oscqr' | 'qm'; item: string }[]; spans: SourceSpan[] }

export interface InstructionalRead {
  summary: string;                          // the .ai--note paragraph; must cite spans via `cites`
  cites: SourceSpan[];
  outcomeAudits: OutcomeAudit[];
  alignment: { outcomeId: string; assessmentId: string; state: 'assessed' | 'verb-mismatch' | 'none' }[];
  workload: WorkloadEstimate;
  learnerCenteredness: LearnerCenteredness | null;   // null for industry briefs
  deficiencies: Deficiency[];
  provenance: Provenance;
}

export interface DesignQuestion {
  id: string; text: string; spans: SourceSpan[]; kind: 'choice' | 'number' | 'text';
  options: { id: string; text: string }[]; required: false;                   // every question is skippable
  answer: { optionId: string | null; value: string | null; skipped: boolean } | null;
  fromProblem: ExtractionProblemCode | null;
}

export type ArchitectureId = 'weekly' | 'thematic' | 'case' | 'project' | 'competency' | 'flipped' | 'scaffolded' | 'performance' | 'micro' | 'hyflex';
export type OverlayId = 'bookends' | 'spaced-review' | 'udl-choice' | 'teaching-presence';
export interface StructureOption {
  id: ArchitectureId; label: string; tag: string;                             // "Closest to your syllabus"
  description: string; fits: { text: string; span: SourceSpan | null }[]; changes: string; tradeoffs: string; evidence: string;
  frameworks: string[];                                                       // "Tessera standard 2.2", "OSCQR 44", "backward design"
  modules: { title: string; objective: string; outcomeIds: string[]; weeks: number[]; lessons: number; lessonMinutes: number; assessment: string; hours: number }[];
  workload: { averageHours: number; peakHours: number; peakModule: number };
}
export interface ApproachSelection { optionIds: ArchitectureId[]; overlays: OverlayId[]; rationale: string; combinationNote: string | null }

/** The change set (D-003, principle #11). Same discipline as TemplateChangeSet. */
export interface ProvisionPlan {
  sessionId: Id; courseId: Id;
  outcomes: { code: string; text: string; source: 'confirmed' | 'rewritten' }[];
  modules: { key: string; title: string; objective: string; position: number; outcomeCodes: string[]; templateKey: string | null;
    overlaps: { moduleId: Id; title: string } | null;
    lessons: { key: string; title: string; objective: string; minutes: number; week: number | null; skeleton: LessonSkeleton }[];
    assignment: { key: string; title: string; points: number; dueAt: string | null; outcomeCodes: string[]; replaces: string | null } | null;
    hours: number; leastSure: boolean }[];
  readings: { title: string; span: SourceSpan; moduleKey: string }[];       // only readings with a span
  placeholders: number;                                                     // "[Reading to select]" count
  counts: { modules: number; lessons: number; checks: number; assignments: number; outcomes: number; links: number };
  summary: string;                                                          // "Adds … Renames nothing. Removes nothing."
  template: { name: string; satisfied: string[]; missing: string[] } | null;
  readinessForecast: { check: AutomaticCheck; expected: 'met' | 'not-met' }[];
  hash: string;
}
export type LessonSkeleton = 'gagne' | 'merrill' | 'case' | 'milestone' | 'start-here' | 'wrap-up';

export interface DesignRecord {
  sessionId: Id; source: Pick<DesignSource, 'name' | 'kind' | 'chars'>;
  extraction: SyllabusExtraction | null; read: InstructionalRead | null; questions: DesignQuestion[];
  confirmedOutcomes: { code: string; text: string; originalText: string }[];
  optionsShown: StructureOption[]; selection: ApproachSelection | null;
  plan: ProvisionPlan | null; appliedAt: Timestamp | null; undoneAt: Timestamp | null;
  decisions: { at: Timestamp; who: Id; what: string }[];                     // per-item keep/revert etc. summarised
}

export type DesignStage = 'start' | 'read' | 'confirm' | 'approaches' | 'preview' | 'provisioning' | 'review';
export interface DesignSession {
  id: Id; courseId: Id; mode: 'syllabus'; stage: DesignStage; createdBy: Id; createdAt: Timestamp; updatedAt: Timestamp;
  source: DesignSource; consent: { syllabusOnly: true; at: Timestamp; rememberProfile: boolean };
  extraction: SyllabusExtraction | null; read: InstructionalRead | null; questions: DesignQuestion[];
  confirmedOutcomes: { code: string; text: string; originalText: string }[] | null; teachingNote: string;
  /** Per-session assumptions override institution workload rates. */
  workloadRates?: WorkloadRates | null;
  options: StructureOption[] | null; selection: ApproachSelection | null;
  plan: ProvisionPlan | null; provisioning: { jobId: Id | null; done: number; total: number; error: string | null } | null;
  /** Everything the plan created, for undo. */
  created: { outcomeIds: Id[]; moduleIds: Id[]; lessonIds: Id[]; blockIds: Id[]; assignmentIds: Id[]; linkKeys: string[] };
  record: DesignRecord;
}

/** D-033: persisted on the instructor, editable, visible. */
export interface InstructorProfile {
  userId: Id; teachingApproach: string; voice: string;
  assessmentPreferences: { formativeEveryModule: boolean; prefers: ('project' | 'exam' | 'case' | 'discussion' | 'quiz')[] };
  disclosureText: string;                   // the AI-use statement drafted into "Start here"
  updatedAt: Timestamp;
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

/**
 * Night 3 (carry-over 3): an AI transcription of a scanned page Tesseract couldn't read
 * clearly. A draft until a person keeps it (D-003); only kept ones reach the reading
 * version and e-book, labeled with who reviewed them.
 */
export interface PageTranscription {
  fileId: Id;
  version: number;
  /** 1-based page number. */
  page: number;
  /** Tesseract's mean word confidence for the page, 0–100. */
  confidence: number;
  text: string;
  provenance: Provenance;
  state: 'pending' | 'kept' | 'discarded';
  reviewedBy: Id | null;
  reviewedByName: string | null;
  reviewedAt: Timestamp | null;
}

export interface FormatStatus {
  format: AccessibleFormat;
  state: 'none' | 'generating' | 'ready' | 'failed';
  /** Set when ready: the file id of the generated artifact, served through the files API. */
  /** Set when ready. Download with `GET /api/v1/files/{fileId}/content?format={format}`. */
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
  fix: 'alt-text' | 'rewrite' | 'link-text' | 'table-header' | 'metadata' | 'captions' | 'ocr' | 'manual';
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
  accessError?: string | null;
  acceptedAt: Timestamp | null;
}

// =====================================================================================
// ---- Night 3 (D-024 to D-029) --------------------------------------------------------
// =====================================================================================

// ---- Programs and templates (D-024, #24) ----------------------------------------------------

/** A group of courses that share a template and brand. A course belongs to at most one. */
export interface Program {
  id: Id;
  name: string;
  description: string;
  /** The program's template; null means its courses use the institution's. */
  templateId: Id | null;
  brand: Brand;
  createdAt: Timestamp;
}

/** Brand applied to a program's courses. The accent comes from `accent-options` (D-007). */
export interface Brand {
  accent: AccentId | null;
  /** An uploaded image; alt text is required. */
  logo: { fileId: Id; alt: string } | null;
}

/** A required block inside a template lesson: a label for the report and starter content. */
export interface TemplateBlock {
  /** Stable within the template, for example "contact". */
  key: string;
  /** What's required, in words: "Instructor contact". */
  label: string;
  content: BlockContent;
}

export interface TemplateLesson {
  key: string;
  title: string;
  minutes: number;
  blocks: TemplateBlock[];
}

export interface TemplateModule {
  key: string;
  title: string;
  /** Where the module goes when applied to an existing course. */
  placement: 'start' | 'end';
  objective: string;
  lessons: TemplateLesson[];
}

/**
 * The required structure and defaults for courses (D-024). Applying a template never
 * deletes or renames content; deviations show up in the readiness report.
 */
export interface CourseTemplate {
  id: Id;
  name: string;
  description: string;
  /** Who owns it: the institution, or one program. */
  owner: { kind: 'institution' } | { kind: 'program'; programId: Id };
  modules: TemplateModule[];
  /** Default tutor mode per activity kind, clamped to the AI policy when applied. */
  tutorDefaults: { lesson: TutorMode; assignment: TutorMode };
  /** An accessibility floor at or above the institution's minimum score, or null. */
  accessFloor: number | null;
  updatedBy: Id;
  updatedAt: Timestamp;
}

/** What applying a template would do: shown before Apply (principle #11, D-003). */
export interface TemplateChangeSet {
  courseId: Id;
  templateId: Id;
  templateName: string;
  addModules: { key: string; title: string; placement: 'start' | 'end' }[];
  addLessons: { key: string; moduleTitle: string; title: string }[];
  addBlocks: { key: string; lessonTitle: string; label: string }[];
  /** "Adds 2 lessons and 3 blocks. Renames nothing. Removes nothing." Templates never remove or rename. */
  summary: string;
  /** Pass back to `applyTemplate` so what's applied is what was previewed. */
  hash: string;
}

// ---- Readiness rubrics (D-024, D-029, #25) ----------------------------------------------------

/** How an item is judged. AI-assisted findings are drafts until a person reviews them. */
export type RubricCheckKind = 'automatic' | 'ai' | 'attestation';

/** Automatic checks computed from course data (shared/quality/checks.ts). */
export type AutomaticCheck =
  | 'outcomes-present'
  | 'module-objectives'
  | 'assessments-aligned'
  | 'outcomes-assessed'
  | 'access-score'
  | 'reading-level'
  | 'navigation-instructions'
  | 'instructor-contact'
  | 'template-followed'
  | 'time-estimates'
  | 'ai-drafts-kept'
  | 'media-alternatives'
  | 'descriptive-links';

export interface RubricItem {
  id: Id;
  /** As printed, for example "1.2" or "17". */
  number: string;
  text: string;
  kind: RubricCheckKind;
  /** Set when `kind` is automatic. */
  check: AutomaticCheck | null;
  /** For AI-assisted items: what the model judges against. For attestations: what the reviewer confirms. */
  criteria: string;
}

export interface RubricStandard {
  id: Id;
  number: string;
  title: string;
  description: string;
  items: RubricItem[];
}

export interface Rubric {
  id: Id;
  name: string;
  /** Built-in rubrics ship with Tessera and can't be edited. QM text is never built in (D-024). */
  source: 'tessera' | 'oscqr' | 'custom';
  version: string;
  /** Required for OSCQR (CC BY 4.0). */
  attribution: string | null;
  builtIn: boolean;
  standards: RubricStandard[];
  updatedAt: Timestamp;
}

/** D-029: advisory by default; a minimum makes it block publishing, like the accessibility policy. */
export interface ReadinessPolicy {
  rubricId: Id;
  /** 0–100, or null for advisory only. */
  minimumPercent: number | null;
}

/** Where to go to fix an item. */
export type FixTarget =
  | { kind: 'block'; lessonId: Id; blockId: Id }
  | { kind: 'lesson'; lessonId: Id }
  | { kind: 'module'; moduleId: Id }
  | { kind: 'assignment'; assignmentId: Id }
  | { kind: 'course'; courseId: Id; field: 'outcomes' | 'welcome' | 'description' | 'program' }
  | { kind: 'template'; courseId: Id }
  | { kind: 'access'; courseId: Id };

export interface FixLink {
  label: string;
  target: FixTarget;
}

/** An AI judgment of one item: a draft with evidence until a person accepts or dismisses it. */
export interface AiFinding {
  verdict: 'likely-met' | 'likely-not-met' | 'unclear';
  evidence: string;
  suggestion: string;
  provenance: Provenance;
  state: 'draft' | 'accepted' | 'dismissed';
  reviewedBy: Id | null;
  /** The reviewer's name when they reviewed it. */
  reviewedByName?: string | null;
  reviewedAt: Timestamp | null;
}

/** A named reviewer's confirmation of an item. */
export interface Attestation {
  status: 'attested' | 'not-applicable';
  by: Id;
  byName: string;
  note: string;
  at: Timestamp;
}

export type ItemStatus = 'met' | 'not-met' | 'needs-review' | 'attested' | 'not-applicable';

export interface ItemResult {
  itemId: Id;
  number: string;
  text: string;
  kind: RubricCheckKind;
  status: ItemStatus;
  /** Plain sentences: what was found. */
  evidence: string[];
  fixes: FixLink[];
  finding: AiFinding | null;
  attestation: Attestation | null;
}

export interface StandardResult {
  standardId: Id;
  number: string;
  title: string;
  /** Met or attested items, and items that apply. */
  met: number;
  applicable: number;
  status: 'met' | 'partly-met' | 'not-met' | 'not-applicable';
  items: ItemResult[];
}

export interface ReadinessResult {
  courseId: Id;
  rubricId: Id;
  rubricName: string;
  attribution: string | null;
  computedAt: Timestamp;
  met: number;
  applicable: number;
  /** 0–100, rounded down. */
  percent: number;
  needsReview: number;
  standards: StandardResult[];
  /** True when the policy has a minimum and the result is below it (D-029). */
  blocksPublishing: boolean;
}

// ---- Outcomes and alignment (#25) ------------------------------------------------------------

/** A course learning outcome as an entity, so activities can be aligned to it. */
export interface Outcome {
  id: Id;
  courseId: Id;
  /** Short label shown in tags, for example "O2". */
  code: string;
  text: string;
  position: number;
}

export type AlignableKind = 'block' | 'assignment';

/** A check, scenario, or assignment tagged with an outcome it assesses. */
export interface OutcomeLink {
  outcomeId: Id;
  targetKind: AlignableKind;
  targetId: Id;
}

// ---- Persona variants (D-028, #23) -------------------------------------------------------------

/** Plain language, or a micro-path of at most 15 minutes with essentials only. */
export type VariantAudience = 'plain' | 'micro';

export interface LessonVariant {
  /** The variant's own lesson id. */
  lessonId: Id;
  masterLessonId: Id;
  audience: VariantAudience;
  title: string;
  minutes: number;
  status: LessonStatus;
  syncedAt: Timestamp;
  /** Variant blocks whose master block changed since the last sync. */
  divergedBlocks: number;
  /** Master blocks added since the last sync that the variant doesn't cover. */
  uncoveredBlocks: number;
}

export type VariantRowState = 'in-sync' | 'diverged' | 'master-removed' | 'new-in-master' | 'variant-only';

/** One row of the side-by-side diff. */
export interface VariantDiffRow {
  state: VariantRowState;
  master: Block | null;
  variant: Block | null;
}

export interface VariantDiff {
  variant: LessonVariant;
  rows: VariantDiffRow[];
}

// ---- Required training, test-out, certificates (D-026, D-027, #22) ---------------------------

export type RequirementAudience =
  | { kind: 'role'; role: Role }
  | { kind: 'users'; userIds: Id[] };

/** An administrator's assignment of required training. */
export interface Requirement {
  id: Id;
  target: { kind: 'course'; courseId: Id } | { kind: 'program'; programId: Id };
  audience: RequirementAudience;
  dueAt: Timestamp | null;
  recurrence: 'none' | 'annual';
  createdBy: Id;
  createdAt: Timestamp;
}

export type TrainingStatus = 'not-started' | 'in-progress' | 'completed' | 'tested-out' | 'overdue';

/** One person's required course, as they (and an opted-in manager) see it. */
export interface RequiredTraining {
  requirementId: Id;
  courseId: Id;
  courseTitle: string;
  dueAt: Timestamp | null;
  status: TrainingStatus;
  completedAt: Timestamp | null;
  certificateId: Id | null;
}

export type CompletionEventKind =
  | 'assigned'
  | 'unassigned'
  | 'started'
  | 'completed'
  | 'tested-out'
  | 'certificate-issued'
  | 'certificate-replaced'
  | 'due-date-changed';

/** Append-only audit trail (the table refuses updates). */
export interface CompletionEvent {
  id: Id;
  at: Timestamp;
  userId: Id;
  courseId: Id;
  requirementId: Id | null;
  kind: CompletionEventKind;
  /** Who did it; null when Tessera did it (for example a completion). */
  actorId: Id | null;
  /** One plain sentence, for example "Due date changed from 1 Oct to 15 Oct." */
  detail: string;
}

/** A placement check: pass it and the course completes as "tested out". */
export interface TestOut {
  courseId: Id;
  items: { id: string; question: string; options: { id: string; text: string }[]; correctOptionId: string }[];
  /** 1–100. */
  passPercent: number;
  updatedBy: Id;
  updatedAt: Timestamp;
}

/** What a learner receives: no answer key. */
export interface StudentTestOut {
  courseId: Id;
  items: { id: string; question: string; options: { id: string; text: string }[] }[];
  passPercent: number;
  /** This learner's earlier attempts (never shown to managers). */
  attempts: { at: Timestamp; percent: number; passed: boolean }[];
}

/** Immutable once issued; a correction issues a new certificate and marks this one replaced. */
export interface Certificate {
  id: Id;
  /** Public verification code, for example "TSR-7K2M-94QD". */
  code: string;
  userId: Id;
  learnerName: string;
  courseId: Id;
  courseTitle: string;
  issuedAt: Timestamp;
  basis: 'completed' | 'tested-out';
  replaces: Id | null;
  replacedBy: Id | null;
}

/** What the public verification URL shows (D-027): never the learner's name. */
export interface CertificateVerification {
  code: string;
  valid: boolean;
  courseTitle: string | null;
  issuedAt: Timestamp | null;
  replaced: boolean;
}

/** One row of the administrator's compliance report. */
export interface ComplianceRow {
  user: Pick<User, 'id' | 'name' | 'email'>;
  training: RequiredTraining;
}

// ---- Managers (D-025, D-026) --------------------------------------------------------------

/** Who reports to whom: a relationship on any user, not a role (D-026). */
export interface ReportingLine {
  managerId: Id;
  reportId: Id;
  createdBy: Id;
  createdAt: Timestamp;
}

/** A learner's choice per manager. Removing the reporting line clears it. */
export interface ManagerConsent {
  managerId: Id;
  reportId: Id;
  sharing: boolean;
  at: Timestamp;
}

/** The learner's "Who sees this" panel. */
export interface MyVisibility {
  managers: { manager: Pick<User, 'id' | 'name' | 'initials'>; sharing: boolean; since: Timestamp | null }[];
  /** What a manager sees when sharing is on, and what they never see (shared/managers/policy.ts). */
  sees: string[];
  neverSees: string[];
}

/** What a manager sees about one person who opted in: completion only (D-025). */
export interface ManagerTrainingRow {
  courseId: Id;
  courseTitle: string;
  dueAt: Timestamp | null;
  status: TrainingStatus;
  completedAt: Timestamp | null;
  certificate: { id: Id; code: string } | null;
}

export interface ManagerReportRow {
  person: Pick<User, 'id' | 'name' | 'initials'>;
  training: ManagerTrainingRow[];
}

export interface ManagerView {
  rows: ManagerReportRow[];
  /** People who report to this manager and haven't chosen to share. Names are not shown. */
  notSharingCount: number;
}

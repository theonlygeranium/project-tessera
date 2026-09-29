# Build spec: Authoring at scale (quizzes and question banks, bulk operations, versioned reuse, QTI)

*Status: approved by owner for build planning (2026-09-28); proposed decisions still await owner ruling. Decisions D-053 to D-059 below are proposals. **Gated on `night4` merging to `main`:** this spec touches the builder, lesson editor and assignment code that Night 4's design partner extends, and it must be written against the merged code, not against `night4` files (PARALLEL-AGENTS §3). Research: `research/lms-best-practices-gaps-2026-09-28.md` (the gap report; §3 rank 5, §5.1 to §5.4, §6.1, §7 area 3). Related: `handoff/GRADEBOOK-SPEC.md` (quiz scores and grade-by-question), `handoff/SYLLABUS-DESIGN-PARTNER-SPEC.md` (provisioned assignments; `InstructorProfile.assessmentPreferences` includes `quiz`). Artboards: proposed in §8.*

This document is written for the implementing agent. It assumes `CLAUDE.md`, `AGENTS.md`, `handoff/PARALLEL-AGENTS.md`, `design/DECISIONS.md`, `handoff/NIGHT-3-PLAN.md` and the merged Night 4 code are known. Where it says "as today", the existing code is the reference and must not be rewritten.

---

## 0. What this is, in one paragraph

Three things instructors lose the most time to, done the Tessera way. **Quizzes and question banks:** Tessera has only an ungraded `check` block and a course test-out; this adds graded quizzes built from shareable, versioned question banks with fixed and random-draw sections, six item types, time limits with per-student accommodations, grade-by-question for essays (through the gradebook), and **QTI 2.1** import and export so publisher and legacy banks come in. **Bulk operations:** multi-select in the course outline to move, duplicate, publish or unpublish, shift dates, and apply a template, each shown as a change set before it runs and undone in one action, with a keyboard path that never needs drag and drop. **Versioned reuse (prototype):** a lesson can be shared from a source and linked into other courses; a new source version shows each linked course a per-block preview, keeps local edits as visible exceptions, and never touches an attempt in progress. AI can draft questions from a lesson's published content, but they are drafts in the bank until a person keeps them (D-003).

Why (gap report): authoring is where vendors are investing in 2026 (Blackboard's new editor has about 1,300 requests behind it, Canvas is piloting a block editor, D2L launched Createspace for versioned content; §1, §5.1); Canvas can't multi-select and move module items (§5.1 item 2); New Quizzes dropped question groups, so one exam might need 15 item banks, and teachers want shareable quizzes and results by section (§5.1 item 7); SCORM updates break in-progress learners (§5.1 item 4); Blueprint sync silently skips edited items (§5.1 item 5). The report scores this area 4 × 5 = 20 and flags quizzes and banks as a likely table-stakes gap (§5.4 item 3, §6.1). Tessera's difference: preview-before-apply and one-action undo, already proven on templates, extended to bulk edits, bank updates and lesson sync; exceptions are shown, not silently skipped; AI question drafting is included, not premium-gated (§5.4 item 7).

## 1. Decisions (proposed, 2026-09-28)

| # | Decision | Consequence in this build |
|---|---|---|
| **D-053** | **A quiz is a kind of assignment**, not a new structure. `Assignment.submissionType` gains `'quiz'`, with a `quiz` settings object. It lives in a module like any assignment and feeds the gradebook as one column. The `check` block stays ungraded practice inside lessons (D-002 unchanged). | The gradebook, release, tutor settings (`ActivityKind 'assignment'`) and passback (spec 1) work without a new column type. **Check first** whether `assignments.submission_type` has a `CHECK` list in `0002_night2.sql`; if so, adding `quiz` is a table rebuild and needs the owner (see §8). |
| **D-054** | **Question banks** belong to a course, a program, or the institution, and are shared at that scope. Items are **versioned**; a quiz attempt pins the versions it drew. MVP item types: single choice, multiple answer, true/false, numeric (exact or tolerance), short text (accepted answers, case and whitespace rules), essay (manual). Matching, ordering, hotspot, formula and file-response are later. | Sections are `fixed` (listed items) or `draw` (N at random from a bank, optionally filtered by tag or outcome, fixed points each). Question groups are back (the New Quizzes gap). |
| **D-055** | **QTI 2.1** import and export for items and banks in the MVP (content packages with `imsmanifest.xml`). QTI 3.0 and Common Cartridge are later (Common Cartridge export is in spec 7). | Unsupported interactions are reported per item, never silently dropped. Images come in as Files (R2) with alt text required before publishing (as the Access policy). |
| **D-056** | **The answer key never leaves the server before release.** Students receive items without correct answers or feedback; results and correct answers show only per the quiz's `showResults` and `showCorrectAnswers` settings (defaults: score after release, answers never). The tutor never sees items' keys (D-005). | New `StudentQuizItem` type mirrors `StudentCheckContent`. A P1 review rule already covers `correctOptionId` leaks; extend it to quiz items. |
| **D-057** | **AI-drafted questions are bank drafts.** The `question-items` task writes items with `origin: 'ai'`, `aiState: 'draft'`, provenance naming the lesson and blocks used. A draft item can't be drawn or placed in a published quiz until a person keeps it (D-003). Sources are only published or instructor-selected blocks of the course, never an answer key. | Mirrors the block keep, revert and regenerate flow. |
| **D-058** | **Bulk outline operations are change sets.** Multi-select (modules, lessons, assignments) → action → preview listing every change → apply by hash → one-action undo that restores prior values and reports anything edited since. Publishing in bulk still respects drafts (D-003), the Access policy (D-022) and the readiness policy (D-029). | Reuses the template change-set helpers and Night 4's `ChangeSetTable` component. Keyboard: checkboxes plus a "Move selected to…" dialog; drag and drop is an extra, never the only way. |
| **D-059** | **Versioned lesson sync is a prototype behind a policy flag.** A shared lesson has versions; linked copies in other courses get a sync preview per block (states reuse `VariantRowState`); local edits are exceptions shown and kept; accepting is per course by an instructor; attempts in progress are never changed. | Builds on the variant lineage (`BlockMeta.source`) from D-028. Full rollout depends on owner review of the prototype. |

## 2. Scope

**In (MVP, one Night after `night4` merges):**
1. Question banks: create, share at scope, tag, link items to outcomes (existing `Outcome` codes), retire items, item history.
2. Item editor for six types, with feedback per item and per option, points, and preview as a student.
3. Quiz assignment: sections (fixed and draw), time limit, availability window, attempts (1 to unlimited), score policy (highest, latest, average), shuffle items and options, results and answers visibility, per-student accommodations (extra time multiplier, extra attempts) that come from the gradebook's accommodation record when `GRADEBOOK-SPEC.md` provides one, else a quiz-level list.
4. Student quiz player: one question per page or all on one page (instructor choice), autosave every answer, timer with warnings at 5 and 1 minutes announced politely to screen readers, resume after disconnect, submit confirmation listing unanswered items.
5. Auto-scoring at submit; essays and short-text items marked "needs review" go to the gradebook's grade-by-question view (`GRADEBOOK-SPEC.md`); final score written as the assignment's `Grade`.
6. Item statistics hook: per-item responses stored so spec 6 can compute difficulty and discrimination.
7. QTI 2.1 import (zip) with a report, and export of a bank or a quiz's items.
8. AI question drafting from a lesson (`question-items`).
9. Bulk outline operations: move, duplicate (with internal link rewriting), publish, unpublish, shift dates, apply template to selection; preview and undo.
10. Versioned lesson sync prototype (D-059) behind `AiPolicy`-style institution flag `features.lessonSync`.

**Out (explicitly):** proctoring and lockdown browsers; AI grading of essays (AI can draft feedback as today, never the score); adaptive or item-response-theory testing; discussions (not in this spec; a separate backlog item if the owner wants it); HTML source view per block (gap report §5.4 item 6; later).

**Later:** matching, ordering, hotspot, formula and file-response items; QTI 3.0; Common Cartridge and Canvas course import with a link and media validator; clean paste from Word and Docs; block-level history view; results by section once sections exist in the roster model; full versioned sync rollout.

## 3. The flow (normative)

| Stage | Who sees what | Server does | Gate |
|---|---|---|---|
| Bank | Instructor: Course → Question banks → new bank, add items or import QTI | `createBank`, `saveItem` (new version on each save after first use) | Items in draft AI state are marked and excluded from draws |
| Draft with AI | "Draft questions from a lesson": choose lesson, count (3 to 10), types, Bloom level target | `question-items` task → draft items with provenance | `aiAuthoring` policy; per-item Keep, Edit, Revert, Regenerate |
| Build quiz | Instructor adds an assignment of type Quiz; adds sections (pick items, or "Draw 5 from Bank 'Sampling' tagged week-3"); settings | `createAssignment` (as today) with `submissionType: 'quiz'`, `saveQuizSettings` | Publish blocked while a fixed item is a draft or a draw section's pool is smaller than N (message says which) |
| Preview | "Preview as student" runs a full attempt that is not saved | Same player, `preview: true` | None |
| Take | Student: Today and the course show the quiz; start page shows time limit, attempts left, what the tutor may do (from the tutor setting), then the player | `startQuizAttempt` freezes items, versions, order; autosave `saveQuizResponse`; `submitQuizAttempt` scores | Availability window, attempts, time (server-enforced, with a 60 s grace for network) |
| Review | Instructor: quiz results; essays in grade-by-question; release as today | Scores merged into `Grade`; release per `releaseGrades` | Release (as today) |
| Results | Student sees score and, if allowed, answers | `getMyQuizAttempt` filters per D-056 | Visibility settings |
| Bulk | Instructor selects 4 lessons → "Move to module 3" → preview "Moves 4 lessons. Renames nothing. Removes nothing." → Apply → "Undo" in the notice and in course history for 7 days | `previewBulk`, `applyBulk(hash)`, `undoBulk` | Hash; publish rules as today |
| Sync (prototype) | Source owner publishes version 3; each linked course's instructor sees "Source updated: 5 blocks changed, 1 conflicts with your edit" → per-block preview → Accept all / choose | `previewLessonSync`, `applyLessonSync(hash)` | Per-course acceptance; attempts untouched |

Voice: the quiz start page and results are plain ("You have 1 of 2 attempts left. Time limit 30 minutes."). No "AI-generated" wording; AI items show the Marginalia markup with source until kept.

## 4. Domain model (`shared/domain.ts`)

Added at the end of the file (small, added at the end of the section):

```ts
// ---- Question banks and quizzes (D-053 to D-057) ----
export type QuestionType = 'single' | 'multiple' | 'true-false' | 'numeric' | 'short-text' | 'essay';
export type BankScope = { kind: 'course'; courseId: Id } | { kind: 'program'; programId: Id } | { kind: 'institution' };

export interface QuestionBank {
  id: Id; title: string; description: string; scope: BankScope;
  ownerId: Id; itemCount: number; createdAt: Timestamp; updatedAt: Timestamp;
}

export type ItemKey =
  | { type: 'single' | 'true-false'; correctOptionId: string }
  | { type: 'multiple'; correctOptionIds: string[]; partialCredit: boolean }
  | { type: 'numeric'; value: number; tolerance: number; toleranceKind: 'absolute' | 'percent' }
  | { type: 'short-text'; accepted: string[]; caseSensitive: boolean; trimWhitespace: true }
  | { type: 'essay'; guidance: string };        // for graders; never shown to students

export interface QuestionItem {
  id: Id; bankId: Id; version: number; type: QuestionType;
  stem: string;                                // plain text with blank-line paragraphs (as `text` blocks)
  imageFileId: Id | null; imageAlt: string;    // alt required to publish
  options: { id: string; text: string; feedback: string }[];   // choice types only
  key: ItemKey; points: number;
  feedbackCorrect: string; feedbackIncorrect: string;
  tags: string[]; outcomeCodes: string[];
  bloom: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create' | null;
  origin: 'human' | 'ai'; aiState: 'draft' | 'kept' | null;
  provenance: Provenance | null; previous: Omit<QuestionItem, 'previous'> | null;
  status: 'active' | 'retired'; updatedBy: Id; updatedAt: Timestamp;
}

/** What a student receives: no key, no feedback before release (D-056). */
export type StudentQuizItem = Pick<QuestionItem, 'id' | 'type' | 'stem' | 'imageFileId' | 'imageAlt' | 'points'> & {
  options: { id: string; text: string }[]; position: number;
};

export type QuizSection =
  | { id: string; kind: 'fixed'; title: string; items: { itemId: Id }[] }
  | { id: string; kind: 'draw'; title: string; bankId: Id; count: number; pointsEach: number; tags: string[]; outcomeCodes: string[] };

export interface QuizSettings {
  sections: QuizSection[];
  layout: 'one-per-page' | 'all-on-one-page';
  timeLimitMinutes: number | null;
  attemptsAllowed: number | null;              // null = unlimited
  scorePolicy: 'highest' | 'latest' | 'average';
  shuffleItems: boolean; shuffleOptions: boolean;
  availableFrom: Timestamp | null; availableUntil: Timestamp | null;
  showResults: 'after-submit' | 'after-release';
  showCorrectAnswers: 'never' | 'after-release' | 'after-available-until';
  accommodations: { studentId: Id; timeMultiplier: number; extraAttempts: number }[];
}

export interface QuizAttempt {
  id: Id; assignmentId: Id; studentId: Id; number: number;
  state: 'in-progress' | 'submitted' | 'needs-review' | 'scored';
  startedAt: Timestamp; deadline: Timestamp | null; submittedAt: Timestamp | null;
  /** Frozen at start: which item versions, in what order, with option order. */
  items: { itemId: Id; version: number; sectionId: string; position: number; optionOrder: string[]; points: number }[];
  responses: { itemId: Id; value: string | string[] | number | null; savedAt: Timestamp }[];
  itemScores: { itemId: Id; score: number | null; by: 'auto' | Id }[];
  score: number | null; possible: number;
}

// ---- Bulk operations (D-058) ----
export type BulkAction =
  | { kind: 'move'; targetModuleId: Id; position: 'start' | 'end' }
  | { kind: 'duplicate'; targetModuleId: Id }
  | { kind: 'publish' } | { kind: 'unpublish' }
  | { kind: 'shift-dates'; days: number }
  | { kind: 'apply-template'; templateId: Id };
export interface BulkSelection { courseId: Id; moduleIds: Id[]; lessonIds: Id[]; assignmentIds: Id[] }
export interface BulkChangeSet {
  selection: BulkSelection; action: BulkAction;
  rows: { kind: 'module' | 'lesson' | 'assignment'; id: Id; title: string; was: string; willBe: string; blocked: string | null }[];
  summary: string;                             // "Moves 4 lessons. Renames nothing. Removes nothing."
  hash: string;
}
export interface BulkOperation {
  id: Id; courseId: Id; changeSet: BulkChangeSet; appliedBy: Id; appliedAt: Timestamp;
  undo: { before: unknown; undoneAt: Timestamp | null; kept: { id: Id; reason: string }[] };
}

// ---- Versioned lesson sync, prototype (D-059) ----
export interface SharedLesson { id: Id; sourceLessonId: Id; ownerId: Id; version: number; publishedAt: Timestamp; scope: BankScope }
export interface LessonLink { sharedLessonId: Id; lessonId: Id; courseId: Id; syncedVersion: number; linkedAt: Timestamp }
export interface LessonSyncPreview {
  lessonId: Id; fromVersion: number; toVersion: number;
  rows: { blockId: Id | null; state: VariantRowState | 'local-edit-conflict'; summary: string }[];
  hash: string;
}
```

Also:
- `SubmissionType` gains `'quiz'`; `Assignment.quiz?: QuizSettings | null` (present only for quizzes).
- `AiTask` union gains `'question-items'`.
- `Institution.features?: { lessonSync: boolean }` (default false).

## 5. API (`shared/api.ts`)

Added at the end of `ApiSpec` and `ROUTES`.

| Operation | Method · path | Access · scope | Notes |
|---|---|---|---|
| `listBanks` | `GET /banks?courseId=` | STAFF · `content:read` | banks visible at the course, its program, and the institution |
| `createBank` / `updateBank` | `POST /banks`, `PATCH /banks/:bankId` | STAFF · `content:write` | program and institution scope: admin only |
| `listItems` | `GET /banks/:bankId/items` | STAFF · `content:read` | filters: tag, outcome, type, aiState |
| `saveItem` | `PUT /banks/:bankId/items/:itemId` | STAFF · `content:write` | new version when the prior version was ever drawn |
| `keepItem` / `revertItem` / `regenerateItem` | `POST /items/:itemId/keep`, `/revert`, `/regenerate` | INSTRUCTOR · `content:write` / `ai:run` | D-057 |
| `retireItem` | `POST /items/:itemId/retire` | STAFF · `content:write` | never deletes; drawn attempts keep their version |
| `draftItems` | `POST /banks/:bankId/draft` | INSTRUCTOR · `ai:run` | `{ lessonId, blockIds?, count, types, bloom? }` |
| `importQti` | `POST /banks/:bankId/import` | STAFF · `content:write` | multipart zip → `{ imported, skipped: { file, reason }[] }` |
| `exportQti` | `GET /banks/:bankId/export` | STAFF · `content:read` | zip |
| `saveQuizSettings` | `PUT /assignments/:assignmentId/quiz` | INSTRUCTOR · `content:write` | validates pools and drafts |
| `startQuizAttempt` | `POST /me/assignments/:assignmentId/attempts` | STUDENT, browserOnly | returns `StudentQuizItem[]` and deadline |
| `saveQuizResponse` | `PUT /me/attempts/:attemptId/responses/:itemId` | STUDENT, browserOnly | idempotent |
| `submitQuizAttempt` | `POST /me/attempts/:attemptId/submit` | STUDENT, browserOnly | server also auto-submits at deadline + grace |
| `getMyQuizAttempt` | `GET /me/attempts/:attemptId` | STUDENT | filtered per D-056 |
| `listQuizAttempts` | `GET /assignments/:assignmentId/attempts` | STAFF · `grades:read` | |
| `scoreQuizItem` | `POST /attempts/:attemptId/items/:itemId/score` | INSTRUCTOR · `grades:write` | used by grade-by-question |
| `previewBulk` / `applyBulk` / `undoBulk` | `POST /courses/:courseId/bulk/preview`, `/bulk/apply`, `/bulk/:opId/undo` | INSTRUCTOR · `content:write` | hash on apply |
| `shareLesson` / `linkLesson` / `previewLessonSync` / `applyLessonSync` | `POST /lessons/:lessonId/share`, `POST /courses/:courseId/linked-lessons`, `GET /lessons/:lessonId/sync`, `POST /lessons/:lessonId/sync` | INSTRUCTOR · `content:write` | prototype; 404 unless `features.lessonSync` |

MCP: read tools for banks and items; `draft_items` (creates drafts only). No MCP tool starts or submits attempts.

## 6. Service logic (over `Repo`)

### 6.1 Banks and items (`shared/service/banks.ts`)
- Versioning: an item's first version is editable in place until it is drawn into any real attempt (instructor previews don't count); after that, every save creates version N+1 and the old version stays readable for attempts that pinned it.
- Validation: choice types need 2 to 10 options with unique ids and a key that references them; true/false has exactly two options; numeric tolerance ≥ 0; short-text accepted list non-empty; essay has no key; stem non-empty; alt text required when an image is present and not decorative.
- Retire: excluded from new draws and pickers; history kept.

### 6.2 Quiz assembly and attempts (`shared/service/quizzes.ts`)
- `startQuizAttempt`: check availability, attempts (plus accommodations), no other attempt in progress; draw per section with a seeded RNG (`attemptId` as seed, so a resumed attempt is identical); a draw never repeats an item within an attempt; freeze versions and option order; set deadline = start + limit × multiplier, capped at `availableUntil` (an accommodation can extend past `availableUntil` only when the instructor ticks it).
- Scoring: single and true/false: all or nothing; multiple: all or nothing, or partial credit = max(0, (correct picked − wrong picked) / correct count) × points; numeric: within tolerance; short-text: normalized match; essay and any short-text with no match → `needs-review` only if the instructor enabled "review unmatched short answers".
- Submit writes or updates a `Submission` (`attempt` = number, `state: 'submitted'` or `'graded'` when fully auto-scored) and a `Grade` with `criteria: []`, `feedbackOrigin: 'human'`, `releasedAt: null` (release as today). Score policy picks which attempt's score becomes the grade.
- Server-side deadline: a scheduled sweep (every minute via Cron, or on next read) auto-submits expired attempts with saved responses.
- Per-item responses stored normalized (`quiz_responses`) for spec 6 item analysis.

### 6.3 QTI 2.1 (`shared/service/qti.ts`, parsing in the Worker)
- Import: read `imsmanifest.xml`, each `assessmentItem`: `choiceInteraction` (maxChoices 1 → single, >1 → multiple, two options named true/false → true-false), `textEntryInteraction` with a float `baseType` → numeric (tolerance from `mapping` if present), string → short-text, `extendedTextInteraction` → essay. Everything else → skipped with the reason. Strip scripts and style; convert simple HTML to plain text with paragraph breaks; images → Files.
- Export: the inverse, with `responseDeclaration` and `outcomeDeclaration`; one item per file plus a manifest; banks as `assessmentSection` groupings.

### 6.4 AI drafting
- Input is the published or selected blocks' text (never `check` answers, never test-out items, never other quiz items' keys). Output items validated as 6.1; any item whose correct answer text doesn't appear supported by the sources is still a draft (people decide), but the provenance lists the blocks.

### 6.5 Bulk operations (`shared/service/bulk.ts`)
- `previewBulk` is pure and deterministic; rows mark `blocked` with a reason (for example "Has 2 AI drafts not kept" for publish; "Access score below the minimum" as the publish gate does today).
- `applyBulk(hash)`: verify hash; write all rows in one D1 batch; store `before` for undo. Duplicate copies blocks as `origin` preserved, `aiState` preserved (a kept block stays kept; drafts stay drafts), rewrites internal lesson links to the copies, and never copies student data.
- `undoBulk`: compare-and-set per row against the post-apply value; rows changed since are kept and listed. This is code that overwrites content: compare-and-set in both repos and an Astra review before merge (PARALLEL-AGENTS §8).

### 6.6 Lesson sync prototype (`shared/service/lesson-sync.ts`)
- Sharing snapshots the source lesson's blocks as version 1. Linking copies the snapshot into the target course with `BlockMeta.source` lineage.
- Preview compares the linked lesson to the new version by lineage and hash: unchanged locally + changed at source → update; changed locally → `local-edit-conflict` (kept, shown); new at source → add; removed at source → mark, never delete.
- Apply: compare-and-set per block; attempts and progress untouched.

## 7. AI tasks (`shared/ai.ts`, prompts in `worker/ai/palmyra.ts`, fixtures for mock mode)

Small additions at the end of `PROMPTS`, `SCHEMAS`, `MAP`, `MAX_TOKENS` (hotspot rule).

| Task | Input | Output | Fixture behaviour (deterministic) |
|---|---|---|---|
| `question-items` | `{ courseTitle, lessonTitle, objective, blocks: { id, text }[], count, types, bloom?, outcomes }` | `{ items: { type, stem, options?, key, feedbackCorrect, feedbackIncorrect, bloom, sourceBlockIds }[] }` | One single-choice item per heading, the correct option = the first sentence under the heading, three distractors from other headings |

System prompt additions: write questions only from the provided blocks; one clearly correct answer for single choice; plausible distractors from common misconceptions in the text; no "all of the above" or "none of the above"; no trick negatives; plain language; never the phrase "learning styles". Validation rejects items that fail 6.1 and items with sources outside the input.

## 8. Worker, data, app

- **Migration:** new migration, next free at build time (>=0009). Additive: `question_banks`, `question_items` (id, version, bank_id, data JSON, status; primary key `(id, version)`), `quiz_attempts`, `quiz_responses`, `bulk_operations`, `shared_lessons`, `lesson_links`; nullable `assignments.quiz` (JSON). **If `assignments.submission_type` or `blocks.type` has a `CHECK` list, stop and ask the owner** (a rebuild is not additive on the shared preview D1). Apply to preview D1 before pushing code; production only with the owner's OK and a restore point.
- **Worker:** QTI zip parsing reuses JSZip (as today); a minute Cron for expired attempts (or lazy auto-submit on read if the owner prefers no Cron).
- **App:** `app/src/features/banks/` (`BanksPage`, `BankDetail`, `ItemEditor`, `QtiImport`), `app/src/features/quizzes/` (`QuizSettings`, `QuizPlayer`, `QuizStart`, `QuizResults`), outline multi-select in the course workspace (`BulkBar`, `MoveDialog`, `BulkPreview`), `LessonSyncPanel` (prototype). Paths added at the end of `app/src/paths.ts`.
- **Shared components:** `ItemEditor` pieces, `Timer` (visible and announced; never colour alone), `SelectableOutlineRow` (real checkbox with label). `ChangeSetTable` reused from Night 4.
- **Artboards (recommended before build):** `design/canvas/QuizPlayer.dc.html` (learner row, y = 0; desktop and 390 wide states, 44px targets) and `design/canvas/BankEditor.dc.html` (instructor row, y = 1240). Owner review recommended because the quiz player is a new learner surface.
- **Mock mode:** seed a STAT 110 bank "Sampling and bias" with 12 items across types, a "Week 3 quiz" with one fixed and one draw section, and one AI draft item; Priya has one submitted attempt.
- **Docs:** `mintlify/product/quizzes.mdx` and a bulk-actions section in `product/authoring.mdx`.

## 9. Governance and policy (must-haves)
- Answer keys never reach students before the release rule allows (D-056); tests assert the payload shape.
- The tutor on a quiz follows the graded tutor modes (D-005); its sources exclude every quiz item.
- AI items are drafts until kept (D-003); a quiz can't publish with a draft fixed item; draws ignore drafts.
- Accommodations are visible only to staff; the student sees only their own time.
- Integrity is framed around authorship, not detection (gap report §2.3); no AI-likelihood scores.
- Accessibility: the player is fully keyboard operable; radio and checkbox groups are real inputs with `fieldset`/`legend`; the timer is announced at 5 and 1 minutes via a polite live region and can be hidden visually; focus moves to the question heading on page change; 44px learner targets; 320px reflow; no stripes (D-017); tokens only.
- Bulk and sync never delete content; undo is compare-and-set.

## 10. Tests and definition of done
1. **Unit:** item validation per type; versioning on save after first draw; seeded draws (same seed → same items; no repeats; pool too small blocks publish); scoring per type including partial credit and tolerance; score policies; deadline with multiplier and cap; auto-submit; D-056 payload filters (no key or feedback before release, correct answers only per setting); QTI round trip for each supported type and a skipped report for an unsupported one; bulk preview determinism, blocked rows, undo compare-and-set keeps edited rows; lesson sync states.
2. **Repo contract:** new methods; both repos pass.
3. **AI validation:** malformed `question-items` output rejected, nothing written.
4. **e2e** (mock): Journey 21+ (claimed at build time): (a) Dr. Okafor drafts 5 items from a lesson, keeps 3, builds a quiz with a draw section, publishes; Priya takes it, reloads mid-way and resumes, submits; the essay appears in grade-by-question; release; Priya sees her score and no answers; (b) bulk move 3 lessons, then undo; (c) import a QTI fixture with one unsupported item and see the report.
5. **a11y:** zero violations with new routes and stories added to `tools/a11y_audit.mjs`; screen-reader spot check of the player with VoiceOver (record in the QA log).
6. **Definition of done:** CLAUDE.md full lane; preview D1 migrated first; owner reviews the quiz player against the artboard; the owner merges.

## 11. Milestones (suggested worktrees; Sol implements, Astra reviews, Claude verifies and commits)
0. **Gate:** `night4` merged to `main`; D-053 to D-059 approved; `CHECK` constraint question answered.
1. `authoring/banks` in `../tessera-authoring-banks`: domain, migration, banks and items service, item editor, repo contract.
2. `authoring/quizzes`: quiz settings, attempts, scoring, player, results, gradebook write (coordinate with the gradebook branch on `Grade` and grade-by-question).
3. `authoring/qti-ai`: QTI import and export, `question-items` task and fixture, keep and revert for items.
4. `authoring/bulk`: selection UI, change sets, apply, undo (Astra review mandatory: overwrite code).
5. `authoring/lesson-sync` (prototype): share, link, preview, apply, behind the flag; owner review decides rollout.
6. Docs, e2e, a11y, QA log.

Each brief: the sections above, the acceptance tests, the hotspot rule (small, added at the end of the section) and the CLAUDE.md hard rules. Read every diff before pushing.

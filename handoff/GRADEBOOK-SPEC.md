# Build spec: Gradebook

*Status: approved by owner for build planning (2026-09-28); proposed decisions still await owner ruling. Decisions D-039 to D-044 below are proposals for the owner; none is accepted until Jeff approves it, and the numbers are claimed at approval time (take the next free numbers if D-039 to D-044 are gone). Mockup artboards (M0, mockups approved by owner 2026-09-28): `design/explorations/gradebook/GradebookGrid.dc.html`, `GradebookStudentPanel.dc.html`, `GradebookSetup.dc.html`, `GradebookWhatIf.dc.html`, each with a rendered `.png` beside it; moving them into `design/canvas/` (row H, gallery slugs `gradebook-*`) with `canvas.json` and `tools/build_docs.py` registration is a follow-up step. Reference arithmetic for the artboards' numbers: `handoff/gradebook/engine_check.py`. Research: `research/lms-best-practices-gaps-2026-09-28.md` §3 (rank 3), §4 (gradebook deep dive) and §7 (area 2).*

This document is written for the implementing agent. It assumes `CLAUDE.md`, `design/DECISIONS.md`, `design/DESIGN-NOTES.md`, `design/tokens.json` and the syllabus spec (`handoff/SYLLABUS-DESIGN-PARTNER-SPEC.md`) are known. Where it says "as today", the existing code is the reference and must not be rewritten: `shared/service/grading.ts` (assignments, submissions, rubric grading, `draftFeedback`, `releaseGrades`, `getGradebook`, `exportGradebook`), the `Assignment` / `Submission` / `Grade` / `GradebookRow` types in `shared/domain.ts`, and `app/src/features/grading/GradingPages.tsx`. **No code is written until the owner approves the mockups (M0, §11).**

---

## 0. What this is, in one paragraph

A real gradebook for Tessera. Today the course has assignments with points, due dates, text/file/link submissions and rubrics; submissions with attempts and a submitted / graded / returned state; per-criterion grades with human or AI feedback provenance and `releasedAt`; and a compact `DataTable` plus CSV export that sums released points. This build adds **categories and weights, drop rules, extra credit, late / missing / excused policies, overrides with a reason and an audit trail, a letter-grade scheme with one rounding rule**, and, above all, **one deterministic calculation engine** that every surface calls: the faculty grid, the student's own grade, the student's what-if, the CSV export and (later) grade passback. The engine emits a **calculation trace**, which powers **"How this grade was calculated"** for the instructor and the student alike. A **setup check** runs live while the instructor edits the grading rules (weights that don't total 100%, empty categories, drop rules larger than the items, drops that start before the items are in), and every setup change shows an **impact preview** of whose grade moves before it is saved. The grid is keyboard-first like a spreadsheet, dense but calm, and states are shown with icons and words, never colour alone. AI may draft feedback (labelled, reviewed, never auto-released); **AI never computes, suggests or changes a grade**.

Why this is not "just another gradebook table" (`research/lms-best-practices-gaps-2026-09-28.md` §4.3 and §6.2): gradebook inaccuracy and opacity is the research's rank-3 pain point overall and the one with strong evidence in higher education, where faculty report wrong or opaque totals, drop-lowest surprises when drops start before all scores are in, blank cells that break drop rules, extra-credit workarounds with zero-weight groups, quiz scores that fail to sync into the gradebook, and what-if results that differ from the real calculation. The research's gap map (§6.1) marks "explainable gradebook, setup linter, exact what-if" as not yet planned anywhere in Tessera, and its differentiation list (§6.2 item 2) notes that no major platform markets this. This spec answers each complaint with a structural fix rather than a feature: one engine (no mismatch is possible), a trace (no opaque total is possible), explicit missing and excused states (no blank-cell ambiguity), first-class extra credit, a live setup check and an impact preview (no silent surprises), and owner-approved mockups before code, so the result is as beautiful as it is functional.

## 1. Decisions (proposed, 2026-09-28; each needs the owner's approval)

| # | Decision | Consequence in this build |
|---|---|---|
| **D-039** | **Mockups before code.** The gradebook UI is drawn as high-fidelity artboards and approved by the owner before any product code is written, following the D-025 precedent (the manager view got an artboard the owner reviewed and approved as drawn before it was built, recorded under D-026). | M0 in §11 is a hard gate. The four artboards in `design/explorations/gradebook/` were approved by the owner on 2026-09-28 (M0); they move to `design/canvas/` as a follow-up and are the visual spec. App screens are checked against them before merge. |
| **D-040** | **One deterministic calculation engine** is the only code that computes a grade. It is a pure function in `shared/grading/` that returns a calculation trace. Faculty grid, student view, what-if, CSV export and future passback all call it; nothing else sums points. **AI never computes, suggests or changes grades.** | §6.1 to §6.3. The engine has no I/O, no clock (the caller passes `now`) and no floating-point rounding surprises (§6.1 step 10). The trace is the source of every "why" string. `ai.run` is never called from the engine or from any grade-writing path. |
| **D-041** | **Grading model.** Weighted categories (or total points). Per-category drop lowest / highest with a "keep at least" floor; **drops maximise the student's category percentage**, which equals "drop the lowest score" whenever items carry equal points and guarantees that raising a score never lowers a grade. Extra credit is a first-class item flag (earned points only, capped). Missing, late and excused are explicit states with course policies; **missing zeros are not droppable by default**; excused removes the item from earned and possible; a category with nothing counted shares its weight with the others and says so. | §4, §6.1. The monotonicity guarantee matters: with unequal point values, "drop the lowest percentage" can make a better score produce a lower category grade (a brute-force check while drafting this spec found cases, e.g. items 4/5, 90.7/100 and 5/10 with one drop: raising 5/10 to 8.4/10 lowers the category from 90.2% to 90.1%). The optimal-drop rule removes that surprise. |
| **D-042** | **Letter scheme and rounding.** An institution default scheme, editable per course. Percentages round **half up to one decimal place**; **the letter comes from the rounded value**; the grid, student view, what-if, export and passback all show that same number. | `GradeScheme` in §4; `checkSetup` rejects gaps and overlaps (§6.4). No surface re-rounds. The trace shows the band ("B+ (87.0 to 89.9)"). |
| **D-043** | **Release and visibility.** Students see released scores only (as today) and their current grade is computed from released scores only. Instructors see held scores with a "Released only / Include held" toggle; the default matches what students see. Releasing previews exactly what students will see. Unreviewed AI feedback drafts are never released. Managers never see scores (D-026). | §3 release stage, §6.2, §9. `releaseGrades` gains a preview and a hash (§5). Setup changes that move visible grades show an impact preview and are logged. |
| **D-044** | **Edits are audited, conflict-safe and undoable.** Every score, override, excuse, extension, release and setup change writes an append-only `GradeEvent` with who, when, before and after, and a reason (required for overrides and excusals). Writes are compare-and-set on a version. Undo is an inverse event, available for 30 days (the existing change-set convention). Grade passback (LTI AGS, SIS) is out of the MVP, but the engine output and export contract are designed for it. | §4, §6.5, §6.6. A stale write returns `conflict` with the current value; the grid shows who changed it. |

## 2. Scope

**In (MVP):**
1. Gradebook setup: calculation mode (weighted / points), categories with weights, drop lowest / highest and keep-at-least, per-category late-policy exemption, course late policy, missing policy, excused rules, extra-credit cap, letter scheme and rounding; prefill from the syllabus design partner's extracted weights when a design record exists (§7).
2. Assignment additions: `categoryId`, `extraCredit`, `countsTowardGrade`.
3. Per-student item state: excuse (with reason), mark missing / not missing, score override (with reason), due-date extension, instructor-recorded score for work with no online submission.
4. Course-level final grade override (letter or percent, reason required).
5. The calculation engine, the trace, and the deterministic explanation text.
6. Live setup check and impact preview with a hash; save with compare-and-set.
7. Faculty grid (§3A): sticky student column and headers, category bands, density toggle, keyboard cell editing, fill down, bulk actions, undo, filters, held toggle, student side panel with the trace.
8. Release flow with a preview of what students will see, per assignment.
9. Student "Your grade" with the same trace, and exact what-if (server engine, private, not saved), including "what would I need" for a target letter; works on a phone.
10. History view (grade events, filterable, exportable).
11. CSV export upgraded to the engine's output (category subtotals, current percent, letter, rules version); JSON trace export.
12. Tests (§10), a11y, docs page, mock seed matching the artboards.

**Out (later):** LTI 1.3 AGS passback and SIS final-grade submit with a pre-flight check (research §4.1 item 9; the export contract in §5 is shaped for it); grading periods and term weighting; standards / mastery grading that feeds the official grade (research §4.4 item 6); grade-by-question grading view; quizzes and question banks (`AUTHORING-AT-SCALE-SPEC.md`, research §6.3); group assignments; anonymous grading; multiple sections with different setups (one setup per course in the MVP); institution-level bulk gradebook export for continuity (research §4.1 item 10) beyond the per-course CSV/JSON.

**Interfaces other specs rely on** (see `FOCUS-AREAS-INDEX.md`; those specs were drafted in parallel and need reconciling when approved): the one engine, release and held states, missing / late / excused handling, and per-student extensions (`GradeExtension.dueAt`) are **in** this MVP. AGS passback (`INTEROP-LTI-SPEC.md` D-051) reads released `CourseGradeResult` values and never re-computes. Quizzes (`AUTHORING-AT-SCALE-SPEC.md` D-053) are assignments, so they appear as ordinary columns. **Open, owner to decide:** a grade-by-question view for essay items, a general accommodation record (beyond extensions), saved what-if scenarios (`MOBILE-PLAYER-SPEC.md` expects saving, this MVP keeps what-if private and unsaved), and an external score source for package scores. They are listed as later here; any of them can move into MVP without changing the engine.

**Later, designed for now:** passback reads `CourseGradeResult` from the engine (never re-computes); `GradeEvent` carries enough to reconstruct any past grade; the setup has a `rulesVersion` so a passback record can cite the rules it used.

## 3. The flow (normative)

View switcher on the course's Grades page: **Grid · Setup · Release · History** (staff), plus the existing **Assignments** tab, which stays as today. Students get **Your grade** on the course page.

| Stage | Instructor sees (artboard) | Server does | Gate |
|---|---|---|---|
| Setup (`GradebookSetup`) | Categories and weights table with inline inputs, "was N%" beside edited values, a weight meter, late / missing / excused / extra credit / letter-grade cards; **Setup check** panel (to fix / to review / passed) updating as they type; **If you save** impact preview | `previewGradebookSetup` runs `checkSetup` and the engine for every student on the draft, returns checks + change set + `hash` | Save disabled while any check has severity `fix`. `saveGradebookSetup` requires `expectedVersion` and `hash`; `conflict` if either is stale |
| Grid (`GradebookGrid`) | Students × items, category bands, state labels, current grade and letter, filters, held toggle, density toggle, keyboard editing | `getGradebook` returns the engine's per-student results and cell states for the chosen view | Every write is compare-and-set; reasons required for override / excuse |
| Explain (`GradebookStudentPanel`) | Side panel for one student: current grade, held-included grade, the calculation trace, arithmetic line, AI feedback draft state, recent history | `explainGrade` returns the trace for `view: 'student' \| 'held'` | None; read-only, plus shortcuts to excuse / override / preview student view |
| Release (dialog from grid header or assignment) | "What students will see": count of grades released, each student's before / after current grade, feedback that goes with it, AI drafts that will **not** go (not reviewed), late / missing notes that become visible | `previewRelease` computes the change set and a `hash` | `releaseGrades({ assignmentId, hash })`; `conflict` if anything changed since preview |
| History | Filterable log of grade events with undo where allowed | `listGradeEvents`; `undoGradeEvent` | Undo is compare-and-set against the event's `after` |
| Student: Your grade (`GradebookWhatIf`, Current tab) | Current grade and letter from released scores; "How this was calculated" (same trace, second person); items with states and feedback | `getMyGrade` | Released scores only |
| Student: What-if (`GradebookWhatIf`) | Inputs for items without a released score; result with delta and the reasons that changed (e.g. a quiz that would now be dropped); "Aim for" a letter shows the score needed on one chosen item | `whatIfMyGrade` runs the engine with hypothetical scores; nothing is stored | Hypotheticals only for items the student has no released score on |

Voice rules (UI copy): state what happened and why, in plain words ("Lowest score dropped: HW 3, 7 less 10% for 1 day late"), never "error" for a policy outcome; never blame the student; setup-check messages suggest, with one-click fixes, and never auto-apply; no decision codes in UI copy (NQ-18); no "magic", "AI-powered", "instantly". Student-facing text uses "you"; staff-facing text uses the student's name.

## 3A. UI and interaction design (normative; the brief for the M0 mockups)

Jeff's requirement: **a beautiful gradebook UI that is as beautiful as it is richly functional and intuitive for faculty to use.** The artboards are the proposal; this section is what they must show and what the build must match.

**Visual language (from the repo, not invented).** Paper ground `#F4F1EB`, white surfaces, `surface-alt #FAF8F4` for headers and rails, ink `#1C1B19`, one teal accent `#0E6B63`, violet `#5B4BAF` for AI marks only (D-007, `design/tokens.json`). Fraunces for page titles, the big grade numbers and all AI text; IBM Plex Sans for UI with tabular numerals in the grid; Plex Mono for shortcuts and the arithmetic line. Compact density on instructor screens (13.5px base, 28px minimum targets); comfortable density on student screens (15px, 44px targets). Radii 7 / 10 / 12px; 1px neutral borders separate panels. Same app header as `InstructorCommand.dc.html` (Today · Create · **Grade** · Insights, ⌘K search, avatar); page head, card and chip conventions as in the Syllabus artboards.

**Hard rules.** No coloured edge stripes on anything (D-017; `tools/no-stripes.test.ts` must pass): the current row is a full-row tint, the current tab is a lifted tile, categories are separated by 1px neutral rules and a faint alternating band fill. No sparkles, stars, gradients or glowing effects for AI (D-006, D-018): an AI feedback draft is marked with the Marginalia caret mark and the words "feedback draft"; AI notes use the `.ai .ai--note` markup contract. Warning **text** is `#7A5310`; `#9A6A12` is for icons and bars only.

**The grid (`GradebookGrid`).**
- **Structure:** a real `<table role="grid">` with `aria-rowcount` / `aria-colcount`, a row header per student (`<th scope="row">`), column headers per item (`scope="col"`) and category band headers (`scope="colgroup"`). Sticky student column (with a selection checkbox column before it), sticky two-row header (category band row, then item row) and sticky **Current** column on the right.
- **Category bands:** band header shows the category name, weight and drop rule ("Quizzes 20% · drop lowest 1"); alternate bands get a faint fill (`#FCFBF8`) and a 1px rule at the band's end. Item headers show a short title, points and due date, and the class average of graded scores (or a **Held** chip for an unreleased column).
- **Cells:** right-aligned tabular numbers; a small state line under the number when the state isn't plain "graded" (see cell states). Row height 44px compact, 56px comfortable (**density toggle** in the toolbar, remembered per user).
- **Keyboard-first editing like a spreadsheet:** arrow keys move the active cell; **Enter** or typing starts editing; **Enter** saves and moves down, **Tab** saves and moves right, **Esc** cancels; **⌘D / Ctrl+D fills down** the active value over the selected range; **Shift+arrows** extend a range; **E** excuses (opens the reason prompt), **M** marks missing, **O** overrides, **Space** opens the student panel, **?** lists shortcuts. A small tooltip under the editing cell names the keys (artboard 1). Values accept `8`, `8/10`, `80%`, `EX`, `-` (clear).
- **Bulk actions:** select rows (checkboxes) or a cell range; a toolbar offers set score, excuse (one reason for all), mark missing / not missing, extend due date, clear. Each bulk action is one `batchId` and undoes as one.
- **Undo:** the status bar shows the last change in words with **Undo (⌘Z)**; History holds 30 days.
- **Toolbar:** find a student; "Show only" filter chips with counts (To grade, Missing, Late, Excused, Feedback drafts); **Released only / Include held** toggle; density toggle. Page head: Setup check chip (links to Setup when anything needs review), Export CSV, and the primary **Release …** action for the column with held grades.
- **Current column:** percent and letter chip; D and F letters use the warning chip (with the letter as text). "released only" is written in the header so nobody mistakes the number.
- **Legend:** always visible in the status bar, icon plus words for every state.

**Cell states (icon + text, never colour alone).**

| State | Number shows | State line | Treatment |
|---|---|---|---|
| Graded | score | none | plain |
| Late | score after penalty | clock icon + "late 2d" | warning text `#7A5310` |
| Missing | 0 | circle-slash icon + "missing" | `error-soft` fill, `error-text` |
| Excused | EX | minus-circle icon + "excused" | paper fill, muted text |
| Dropped | struck-through score | arrow-to-line icon + "dropped" (or "late, dropped") | muted |
| Override | override score | pencil icon + "override" | ink-3 |
| Held (unreleased) | score | eye-off icon + "held"; column header chip "Held" | muted |
| AI feedback draft | score | Marginalia caret + "feedback draft" | label in `ai-strong` `#3F3380`; no AI fill |
| Submitted, to grade | – | tray icon + "to grade" | accent-dark text |
| Extra credit | +3 | none (column is labelled "Extra credit") | plain |

Screen readers get the full phrase from the cell (`aria-label`: "Priya Raman, HW 3, 6.3 of 10, late 1 day, dropped"), not the icon.

**Student side panel (`GradebookStudentPanel`).** Opens from a row (Space or click) and pushes the grid (no overlay, grid stays usable; focus moves into the panel and returns to the cell on close, D-010). Shows: name, previous / next student (J / K), close; the current grade in Fraunces with the letter; a "As Priya sees it / With held" toggle and the held-included grade; **How this grade was calculated**: per category weight, earned / possible, percent and weighted contribution, with the reasons indented under each (dropped item and why, excused item, drop not applied because of keep-at-least, held item, empty category sharing its weight, extra credit); the arithmetic line in mono ("14.50 + 17.00 + 16.20 + 36.00 = 83.70 of 95 · 83.70 ÷ 95 = 88.1% → B+ (87.0 to 89.9)"); a one-line provenance note ("Priya sees this same breakdown. One engine powers it, her what-if and CSV export; AI never calculates grades."); any AI feedback draft as a Marginalia note with "not reviewed" and a link to the grader; actions (Preview Priya's view, Excuse an item, Override a score); the latest history event and a link to all.

**Grade setup (`GradebookSetup`).** Categories table with inline weight inputs ("was 20%" beside changed values), items per category ("3 graded · 2 to come"), drop lowest, keep at least, late penalty applies / exempt; weight meter with labelled segments and "Total 100%" with a check (or the shortfall in error text); late / missing / excused card; extra credit card; letter grades card with the rounding rule in words. Right column: **Setup check** (counts of to fix / to review / passed; each finding has a title, one plain sentence and one-click fixes; passed checks listed compactly) and **If you save** (how many current grades change, which letters change, the largest moves, and the reassurance that scores themselves don't change). Save button reads the consequence ("Save setup · 12 grades change").

**Release flow.** A dialog, not a page: "Release Project draft to 12 students". Rows: student, current grade now → after release, feedback that goes with it; a separate list "Not sent: 3 AI feedback drafts not reviewed" with links; a "Preview as Priya" button that renders the student view with the post-release data. Primary button "Release 12 grades". After release: toast with Undo (undo re-holds and records an event; students who already looked are not un-notified, so the dialog says "Students may have seen it" for undo after 60 seconds).

**Student what-if (`GradebookWhatIf`, phone first).** Current / What-if segmented control; the what-if grade large with "Now" and the delta beside it; the reasons that changed in one plain sentence ("With a Quiz 4 score you'd have 3 quizzes, so your lowest, Quiz 1 (16 / 20), would be dropped."); "See the full calculation"; inputs (44px) for every item without a released score, including held ones ("Graded, not released yet"); **Aim for** a letter → "You'd need 38.3 of 40 on the Final report, with your other what-if scores as they are." (or "not reachable with the remaining points"); footer "What-if scores are private to you and never saved. They use the same rules as your official grade."

**Accessibility (WCAG 2.2 AA, D-010).** Text contrast at least 4.5:1 (all state labels use the `*-text` tokens on their fills); targets at least 24px (28px compact, 44px learner); visible focus: 3px `#1F4F9C` ring on the active cell and every control; grid follows the ARIA grid pattern (single tab stop into the grid, roving `tabindex`, `aria-selected`, `aria-readonly` on computed cells, edit mode announced); every state has text; the student panel is also a complete **accessible single-student view** (research §4.1 item 8) usable instead of the grid; 320px reflow: below 720px the grid becomes a per-student list with the same data and the same actions, and the setup page stacks; `prefers-reduced-motion` respected; forced-colors mode keeps state icons (`CanvasText`).

**Performance.** 300 students × 60 items (18,000 cells) must stay smooth: row and column virtualisation with sticky panes, cell components memoised by `(studentId, assignmentId, version)`, edits applied optimistically and reconciled from the server result; the engine runs on the server for official views and may also run in the browser for instant feedback while typing, with the server result authoritative (same module, same version). Targets for the build to measure and record in the QA log: first render of a 300 × 60 mock under 1 s on the owner's laptop, keyboard navigation with no visible lag, engine run for the full course under 50 ms in the Worker.

## 4. Domain model (`shared/domain.ts`)

Add after the grading types (all serialisable; validated in a new `shared/service/validate-gradebook.ts`):

```ts
// ---- Gradebook (D-039 to D-044) ----
export type CalculationMode = 'weighted' | 'points';

export interface GradeCategory {
  id: Id; courseId: Id; name: string; position: number;
  weight: number;                                     // percent 0..100; ignored in 'points' mode
  drop: { lowest: number; highest: number; keepAtLeast: number };   // keepAtLeast >= 1
  lateApplies: boolean;                               // false = exempt (e.g. an exam)
}

export interface LatePolicy {
  enabled: boolean;
  percentPerPeriod: number;                           // e.g. 10
  period: 'day' | 'hour';
  basis: 'score' | 'possible';                        // deduct a share of the earned score (default) or of possible points
  maxPeriods: number;                                 // after this the work is treated per `afterMax`
  afterMax: 'missing' | 'hold-at-max';
  graceMinutes: number;
}
export interface MissingPolicy { treatAs: 'zero-after-due' | 'exclude-until-graded'; droppable: boolean }   // D-041 default: zero-after-due, droppable false
export interface ExtraCreditPolicy { categoryCapPercent: number | null; courseCapPoints: number | null }  // default 100, null

export interface GradeScheme {
  id: Id; name: string;
  bands: { letter: string; min: number }[];           // descending by min; last band min 0
  rounding: { decimals: 1; mode: 'half-up' };         // D-042
  letterFrom: 'rounded';
}

export interface GradebookSetup {
  courseId: Id; mode: CalculationMode; categories: GradeCategory[];
  late: LatePolicy; missing: MissingPolicy; extraCredit: ExtraCreditPolicy; scheme: GradeScheme;
  emptyCategory: 'share-weight';                      // D-041
  studentNotes: { categoryId: Id; text: string }[];   // e.g. "Drop applies as quizzes are graded"
  dismissedChecks: { code: SetupCheckCode; target: string; by: Id; at: Timestamp }[];
  source: { kind: 'manual' | 'syllabus'; designSessionId: Id | null };
  version: number;                                    // compare-and-set (D-044)
  rulesVersion: number;                               // bumps on any change that can move a grade
  updatedBy: Id; updatedAt: Timestamp;
}

/** Per-student state for one item; a row exists only when something is non-default. */
export interface StudentItemState {
  assignmentId: Id; studentId: Id; courseId: Id;
  excused: { reason: string; studentNote: string | null; by: Id; at: Timestamp } | null;
  missing: 'force-missing' | 'force-not-missing' | null;
  lateWaived: { reason: string; by: Id; at: Timestamp } | null;
  override: { score: number; reason: string; by: Id; at: Timestamp } | null;
  dueAt: Timestamp | null;                            // extension / accommodation; null = assignment due date
  version: number;
}

export interface CourseGradeOverride {
  courseId: Id; studentId: Id; letter: string | null; percent: number | null;
  reason: string; by: Id; at: Timestamp; version: number;
}

export type GradeEventKind = 'score' | 'override' | 'excuse' | 'unexcuse' | 'missing' | 'extension' | 'late-waiver'
  | 'final-override' | 'release' | 'unrelease' | 'setup' | 'undo';
export interface GradeEvent {
  id: Id; courseId: Id; studentId: Id | null; assignmentId: Id | null; kind: GradeEventKind;
  before: unknown; after: unknown; reason: string | null;
  by: Id; at: Timestamp; batchId: Id | null; undoOf: Id | null; rulesVersion: number;
}

// ---- Engine input / output (pure; no I/O) ----
export interface CalcItem {
  assignmentId: Id; title: string; categoryId: Id | null; points: number; extraCredit: boolean; countsTowardGrade: boolean;
  dueAt: Timestamp | null;                            // effective: extension applied by the caller
  position: number;
  submission: { state: SubmissionState; submittedAt: Timestamp; score: number | null; released: boolean } | null;
  itemState: Pick<StudentItemState, 'excused' | 'missing' | 'lateWaived' | 'override'> | null;
  hypothetical: number | null;                        // what-if only
}
export interface CalcInput { setup: GradebookSetup; studentId: Id; items: CalcItem[]; view: 'student' | 'held'; now: Timestamp; finalOverride: CourseGradeOverride | null }

export type CellState = 'graded' | 'late' | 'missing' | 'excused' | 'dropped' | 'override' | 'held' | 'to-grade' | 'not-submitted' | 'not-due' | 'extra-credit' | 'what-if';
export type TraceCode = 'late-penalty' | 'late-waived' | 'late-over-max' | 'dropped' | 'drop-limited-by-keep' | 'excused' | 'held'
  | 'missing-zero' | 'missing-not-droppable' | 'extra-credit' | 'extra-credit-capped' | 'category-empty-shared'
  | 'override' | 'extension' | 'final-override' | 'not-counted' | 'what-if';
export interface TraceReason { code: TraceCode; params: Record<string, string | number> }   // text is rendered by explain.ts
export interface TraceItem {
  assignmentId: Id; title: string; points: number; raw: number | null; adjusted: number | null;
  state: CellState; counted: boolean; reasons: TraceReason[];
}
export interface TraceCategory {
  categoryId: Id; name: string; weight: number; effectiveWeight: number;   // effective = share after empty categories
  earned: number; possible: number; percent: number | null; contribution: number | null;
  items: TraceItem[]; reasons: TraceReason[];
}
export interface CalculationTrace {
  studentId: Id; view: 'student' | 'held'; mode: CalculationMode; rulesVersion: number; setupVersion: number; computedAt: Timestamp;
  categories: TraceCategory[];
  totals: { weightedEarned: number; weightedPossible: number; percent: number | null; rounded: number | null;
            letter: string | null; band: { letter: string; min: number; max: number } | null };
  reasons: TraceReason[];                             // course-level (final override, empty categories)
}
export interface CourseGradeResult { studentId: Id; percent: number | null; letter: string | null; rulesVersion: number; trace: CalculationTrace }

// ---- Setup check (§6.4) and change sets ----
export type SetupCheckCode = 'weights-not-100' | 'weight-invalid' | 'category-empty' | 'drop-exceeds-items' | 'drop-before-complete'
  | 'keep-at-least-invalid' | 'scheme-gap' | 'scheme-overlap' | 'scheme-order' | 'late-no-cap' | 'extra-credit-uncapped'
  | 'item-no-category' | 'item-zero-points' | 'missing-droppable' | 'mode-switch-extra-credit';
export interface SetupCheck {
  code: SetupCheckCode; severity: 'fix' | 'review' | 'pass'; target: string;
  params: Record<string, string | number>;            // message text is rendered from code + params
  fixes: { label: string; patch: Partial<GradebookSetup> | { kind: 'open-item'; assignmentId: Id } }[];
}
export interface GradeChangeSet {
  kind: 'setup' | 'release';
  changes: { studentId: Id; name: string; from: { percent: number | null; letter: string | null }; to: { percent: number | null; letter: string | null } }[];
  letterChanges: number; unchanged: number;
  notSent: { submissionId: Id; studentId: Id; reason: 'ai-draft-not-reviewed' }[];   // release only
  hash: string;
}
```

Also (additive, optional fields so existing rows keep working):
- `Assignment.categoryId?: Id | null`, `Assignment.extraCredit?: boolean` (default false), `Assignment.countsTowardGrade?: boolean` (default true).
- `Submission.version?: number` (default 0), `Submission.source?: 'student' | 'recorded'` (default `'student'`; `'recorded'` = score entered by the instructor for work with no online submission), `Submission.feedbackDraft?: { text: string; provenance: Provenance; createdAt: Timestamp } | null` (an AI draft stored for later review; never shown to students; keeping it moves the text into `Grade.feedback` with `feedbackOrigin: 'ai'`, as today).
- `GradebookRow` stays; `getGradebook` adds `cells[].display: { state: CellState; adjusted: number | null; label: string }`, `result: { percent, letter }` and a top-level `setup: { rulesVersion, mode }` (§5).
- `AiTask` gains nothing new for the MVP (the existing `'feedback'` task is reused, §7).

## 5. API (`shared/api.ts`)

Staff routes use the existing `STAFF` / `INSTRUCTOR` access and the existing scopes `grades:read` / `grades:write` (D-020). Student routes use the student's own session and return only their own data. Routes under `/api/v1`.

| Operation | Method · path | Access · scope | Notes |
|---|---|---|---|
| `getGradebook` (extended) | `GET /courses/:courseId/gradebook?view=student\|held` | STAFF · `grades:read` | As today plus `display`, `result`, `setup` (§4). Default `view=student`. Fix while here: query submissions by course, not all submissions (`book()` currently calls `listSubmissions({})`) |
| `getGradebookSetup` | `GET /courses/:courseId/gradebook/setup` | STAFF · `grades:read` | Returns the setup or a default derived from existing assignments (one "Assignments" category, points mode) |
| `previewGradebookSetup` | `POST /courses/:courseId/gradebook/setup/preview` | STAFF · `grades:read` | `{ setup }` → `{ checks: SetupCheck[]; changeSet: GradeChangeSet }`; pure, no writes |
| `saveGradebookSetup` | `PUT /courses/:courseId/gradebook/setup` | INSTRUCTOR · `grades:write` | `{ setup, expectedVersion, hash }`; `invalid` if any `fix` check; `conflict` if version or hash is stale; writes a `setup` event |
| `dismissSetupCheck` | `POST /courses/:courseId/gradebook/setup/dismiss` | INSTRUCTOR · `grades:write` | `{ code, target }`; `review` checks only |
| `updateGradeCells` | `PATCH /courses/:courseId/gradebook/cells` | INSTRUCTOR · `grades:write` | `{ batchId, changes: { assignmentId, studentId, op: 'score'\|'clear'\|'excuse'\|'unexcuse'\|'mark-missing'\|'clear-missing'\|'override'\|'clear-override'\|'extend'\|'waive-late', value?, reason?, studentNote?, expectedVersion }[] }` → per-cell `{ ok, version, display } \| { conflict, current }`; the batch is atomic (all or nothing) unless `partial: true`; `Idempotency-Key` honoured |
| `setFinalOverride` | `PUT /courses/:courseId/gradebook/students/:studentId/final` | INSTRUCTOR · `grades:write` | `{ letter?, percent?, reason, expectedVersion }`; `DELETE` clears |
| `explainGrade` | `GET /courses/:courseId/gradebook/students/:studentId/trace?view=student\|held` | STAFF · `grades:read` | `CalculationTrace` + rendered `lines: string[]` |
| `previewRelease` | `GET /assignments/:assignmentId/release/preview` | INSTRUCTOR · `grades:read` | `GradeChangeSet` (`kind: 'release'`) with `notSent` |
| `releaseGrades` (extended) | `POST /assignments/:assignmentId/release` | INSTRUCTOR · `grades:write` | Accepts optional `{ hash }`; with a hash, `conflict` if the preview is stale. Grades whose AI feedback draft isn't kept are skipped and reported. Without a hash, behaves as today (API compatibility) |
| `unreleaseGrades` | `POST /assignments/:assignmentId/unrelease` | INSTRUCTOR · `grades:write` | Re-holds grades released by the last release event; writes `unrelease` |
| `listGradeEvents` | `GET /courses/:courseId/gradebook/events?studentId&assignmentId&kind&cursor` | STAFF · `grades:read` | Cursor pagination (D-020) |
| `undoGradeEvent` | `POST /gradebook/events/:eventId/undo` | INSTRUCTOR · `grades:write` | Undoes the event or its whole batch; compare-and-set against `after`; 30-day window |
| `exportGradebook` (extended) | `GET /courses/:courseId/gradebook/export?format=csv\|json&view=student\|held` | STAFF · `grades:read` | CSV columns: Student, Email, each item (adjusted score or `EX` / `MISSING`), each category percent, Current %, Letter, Rules version. JSON = `CourseGradeResult[]`. Output is the engine's, byte for byte what the grid shows |
| `getMyGrade` | `GET /courses/:courseId/grades/me` | Student (self) | Released only; `CalculationTrace` + rendered lines in second person + items with states and released feedback |
| `whatIfMyGrade` | `POST /courses/:courseId/grades/me/what-if` | Student (self) | `{ scores: { assignmentId, score }[]; target?: { letter } \| { percent }; solveFor?: assignmentId }` → `{ trace, delta, changedReasons, needed: { assignmentId, score } \| { unreachable: true } \| null }`. Rejects hypotheticals for items with a released score. Nothing stored; rate limited |

MCP (`mcp/`): read-only tools `gradebook_get`, `gradebook_explain`, `gradebook_setup_preview`. No write tools in the MVP: Tessera's MCP server already leaves destructive actions out, and grade writes are treated the same way because they are high-stakes and need a reason and a person. OpenAPI regenerates from the Zod schemas.

## 6. Service logic

Business logic lives once: `shared/grading/engine.ts` (pure), `shared/grading/explain.ts` (pure), `shared/grading/setup-check.ts` (pure) and `shared/service/gradebook.ts` (over `Repo`, following `grading.ts` for shape). Both `MemoryRepo` and `d1-repo` implement the new repo methods (`getGradebookSetup`, `putGradebookSetup`, `listStudentItemStates`, `putStudentItemState`, `getFinalOverride`, `putFinalOverride`, `appendGradeEvent`, `listGradeEvents`) and pass `repo-contract.ts`.

### 6.1 The engine: `calculate(input: CalcInput): CalculationTrace`
Order of operations (normative; the trace records each step that changed anything):
1. **Visibility.** `view: 'student'` counts only released scores; a graded but unreleased item becomes `held` and is not counted. `view: 'held'` counts graded scores whether released or not. Hypothetical scores (what-if) count as released for that run and are marked `what-if`.
2. **Base score.** `override.score` if present (reason `override`), else the submission's grade score, else none.
3. **Excused.** Excused items are removed from earned and possible (`excused`); nothing else about them applies.
4. **Late.** Using the effective due date (extension already applied by the caller, reason `extension`) and `graceMinutes`, periods late = ceiling of the lateness in periods. If `lateApplies` for the category and the policy is enabled and not waived: adjusted = base minus `percentPerPeriod` × periods × (base or points, per `basis`), never below 0 (`late-penalty`). Beyond `maxPeriods`: `afterMax: 'missing'` makes it a missing zero (`late-over-max`); `'hold-at-max'` caps the penalty.
5. **Missing.** No submission, not excused, `now` past the effective due date, and `treatAs: 'zero-after-due'` (or `missing: 'force-missing'`): counted as 0 (`missing-zero`). `force-not-missing` or `exclude-until-graded` leaves it out (`not-counted`). Not yet due: `not-due`, not counted. Submitted but ungraded: `to-grade`, not counted.
6. **Extra credit.** Items with `extraCredit` add their adjusted score to the category's earned points and nothing to possible (`extra-credit`).
7. **Drops (D-041).** Candidates: counted, non-extra-credit items, excluding missing zeros unless `missing.droppable`. Number to drop = `min(lowest + highest, candidates - keepAtLeast)`, floored at 0; if limited, reason `drop-limited-by-keep`. Choose the drop set that **maximises the category percent** (lowest) and, separately, removes the highest-percent items (highest). Implementation: the parametric method (binary search on the target ratio r, selecting by `score - r × points`), cross-checked against brute force in tests for up to 12 items. Ties break by earlier effective due date, then `position`, then `assignmentId`, so the result is deterministic. With equal points per item this is exactly "drop the lowest score", which is what the trace text says in that case; with unequal points the text says "dropped to give you the highest category score".
8. **Category.** earned = sum of adjusted counted scores + extra credit; possible = sum of counted points; percent = earned / possible, capped at `categoryCapPercent` (`extra-credit-capped`). No counted items: percent null, reason `category-empty-shared`.
9. **Course.** Weighted mode: sum of weight × percent over categories with a percent, divided by the sum of those weights (effective weights recorded per category). Points mode: total earned / total possible across categories, extra credit capped by `courseCapPoints`. No category with a percent: percent null ("No graded work yet").
10. **Rounding (D-042).** All arithmetic in exact rationals (numerator / denominator as integers scaled from inputs with at most 2 decimal places) so the result never depends on floating-point order; round half up to one decimal on the final value only; the letter comes from the rounded value; `band` records min and max for display.
11. **Final override.** If present, `letter` and / or `percent` are replaced for display and export, the computed values stay in the trace, and reason `final-override` carries the reason text for staff (students see "set by your instructor").

The engine never reads the clock, the repo or the network; `now` and all data come in `CalcInput`. It is versioned: any change to the algorithm bumps `ENGINE_VERSION`, which is included in `rulesVersion` hashes.

### 6.2 One engine for every view
- **Faculty grid:** `getGradebook` builds one `CalcInput` per student and calls `calculate`; the cell `display` is taken from the trace items, never recomputed.
- **Student view:** `getMyGrade` = the same call with `view: 'student'` for the caller.
- **What-if:** the same call with `hypothetical` scores; `needed` solves for the minimum score on `solveFor` (to 0.1 points) that reaches the target after rounding, by bisection over the engine itself (so rounding and drops are honoured exactly); returns `unreachable` when full marks don't reach it. The phone and desktop use the same endpoint.
- **Export and passback:** `exportGradebook` serialises `CourseGradeResult`; passback (later) sends `percent` / `letter` from the same result and records `rulesVersion`.
- **Browser preview:** the grid may import `engine.ts` to show a provisional value while typing; the server's response replaces it.

### 6.3 Explain this grade
`explain(trace, audience: 'staff' | 'student', name)` renders deterministic sentences from `TraceReason` codes and params (templates in `shared/grading/explain.ts`, one per code, second person for students). Examples (from the artboards): "Lowest score dropped: HW 3, 7 less 10% for 1 day late." · "Quiz 3 excused. No quiz dropped: the rule keeps at least 2 scores." · "Draft (34 / 40) is held, so it isn't counted until you release it." · "No items yet, so its 5% is shared across the other categories." The arithmetic line is built from `contribution` values. No model is involved; the same trace always gives the same words.

### 6.4 Setup check (`checkSetup(setup, items, now)`, runs on every edit)
| Code | Severity | Rule | Message and fixes |
|---|---|---|---|
| `weights-not-100` | fix | weighted mode and category weights don't total 100 (±0.01) | "Weights total N%." Fixes: set a named category back to its saved value; "Scale weights to 100%" (proportional, shown before applying) |
| `weight-invalid` | fix | a weight < 0 or > 100, or not a number | inline on the field |
| `keep-at-least-invalid` | fix | keepAtLeast < 1 | inline |
| `drop-exceeds-items` | fix | drop lowest + highest ≥ planned items in the category (published + scheduled) | "Quizzes drops 3 but has 3 items." Fix: reduce drops |
| `scheme-gap` / `scheme-overlap` / `scheme-order` | fix | bands don't cover 0 to 100 exactly once, descending | highlight the band |
| `item-no-category` | fix | weighted mode and a published, counting item has no category | "Assign category" |
| `category-empty` | review | a weighted category has no graded items | "Until something is graded, its N% is shared across the other categories. Students see this line in their breakdown." Fixes: add an item, set weight to 0% |
| `drop-before-complete` | review | a category with drops has items still to come | "2 of 5 quizzes are still to come, so each student's dropped quiz can change as they're graded." Fix: add a student-view note (`studentNotes`) |
| `late-no-cap` | review | late policy enabled with no `maxPeriods` | suggest a cap |
| `extra-credit-uncapped` | review | extra credit with no category and no course cap | suggest a cap |
| `item-zero-points` | review | a counting item with 0 points that isn't extra credit | suggest marking as extra credit or not counting |
| `missing-droppable` | review | `missing.droppable` turned on | "Missing zeros can now be dropped; students who skip one item lose nothing." |
| `mode-switch-extra-credit` | review | switching weighted ↔ points while extra credit exists | shows how extra credit will behave in the new mode (avoids the known Moodle-style conversion surprise, research §4.1 item 3) |

Checks are pure and fast (the whole list reruns per keystroke in the browser and on `previewGradebookSetup` on the server; the server result is authoritative). `fix` blocks save; `review` can be dismissed, and a dismissal is recorded.

### 6.5 Impact preview and compare-and-set
- `previewGradebookSetup` runs the engine for every student on the saved setup and on the draft (`view: 'student'`) and returns the `GradeChangeSet` sorted by letter changes first, then absolute change; `hash` = SHA-256 of the canonical JSON of (draft setup, saved `version`, the max submission / item-state versions for the course, `ENGINE_VERSION`). `saveGradebookSetup` recomputes the hash and refuses with `conflict` if it differs ("Grades changed since you previewed; review the new preview").
- Cells: `Submission.version`, `StudentItemState.version`, `CourseGradeOverride.version` and `GradebookSetup.version` increment on every write; writes carry `expectedVersion`; mismatch returns `conflict` with the current value, who changed it and when; the grid shows "Changed by Dr. Okafor at 4:12 PM: keep theirs / use yours".
- **Released grades stay immutable** (as today: `gradeSubmission` refuses to change a returned grade). Editing a released score from the grid creates an `override` with a required reason; the student sees the new score and "updated by your instructor" with the date.
- Instructor-entered scores for items with no submission create a `Submission` with `source: 'recorded'`, `state: 'graded'`, attempt 1, empty content.

### 6.6 Events and undo
Every write appends a `GradeEvent` in the same transaction as the change (D1 batch). `undoGradeEvent` writes the inverse change (compare-and-set against the event's `after`) and an `undo` event pointing at it; batches undo together; setup undo restores the previous setup and bumps `rulesVersion`. Events are never deleted or edited. Undo window: 30 days; release undo is allowed but labelled (students may have seen the grade).

### 6.7 Performance
The engine is O(items) per student (drops: O(k log k) per category via the parametric method). `getGradebook` loads assignments, enrollments, submissions (course-filtered, latest attempt per student and item) and item states in four queries and computes in memory. Targets to measure at build time (not claims): 300 × 60 computed under 50 ms in the Worker; `getGradebook` p95 under 800 ms against preview D1 with a seeded 300 × 60 course.

## 7. AI tasks (optional; `shared/ai.ts`, prompts in `worker/ai/palmyra.ts`, fixtures for mock mode)

AI in the gradebook is limited and governed (D-003, D-040):
- **Feedback drafting (existing `feedback` task, reused).** From the grid, "Draft feedback for N graded submissions" queues one `feedback` run per selected graded submission (same input as `draftFeedback` today: rubric, criteria results, submission text; no student names, no other students' data, no grades from other items). Each result is stored as `Submission.feedbackDraft` with provenance ("AI draft from your rubric · Palmyra-X6"). Cells show "feedback draft"; the student panel shows it as a Marginalia `.ai--note` with "not reviewed". The instructor keeps (as is or edited) or discards in the grader. **Release never sends an unkept draft** (§5 `notSent`). Runs as a background job with the existing generation machinery; one failure affects one draft only.
- **Setup from the syllabus (optional, deterministic mapping).** If the course has a design record (syllabus spec), `SyllabusExtraction.assessments[].weightPercent` pre-fills a draft setup (categories named from the assessments, weights as written, source "From your syllabus, p. N"). This is a proposed setup, shown with the setup check (a syllabus whose weights don't total 100 raises `weights-not-100` exactly as the syllabus spec's rule does); nothing saves until the instructor saves.
- **Never:** AI never computes a grade, suggests a score or a letter, excuses, marks missing, overrides, chooses drops, releases, or writes the explanation text. No AI call exists anywhere in `shared/grading/` or in any grade-writing service path (a test asserts it, §10). No sparkle or gradient treatment anywhere (D-006, D-018).

Validation: feedback drafts go through the existing `feedback` output schema; empty or over-length output is rejected with `invalid` and nothing is stored.

## 8. Worker, data, app

- **Migration** `migrations/00NN_gradebook.sql`, where NN is **the next free number at build time, 0009 or later** (0008 is claimed by the syllabus build; check `migrations/` and open branches first). **Additive only**, because every branch preview shares the preview D1 `tessera-preview` and older preview code must keep working: `CREATE TABLE gradebook_setups (course_id TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL, rules_version INTEGER NOT NULL, updated_by TEXT, updated_at TEXT)`; `student_item_states (assignment_id TEXT, student_id TEXT, course_id TEXT, data TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY (assignment_id, student_id))` + index `(course_id)`; `course_grade_overrides (course_id TEXT, student_id TEXT, data TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY (course_id, student_id))`; `grade_events (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, student_id TEXT, assignment_id TEXT, kind TEXT NOT NULL, data TEXT NOT NULL, by_user TEXT NOT NULL, at TEXT NOT NULL, batch_id TEXT)` + indexes `(course_id, at)`, `(course_id, student_id, at)`; new nullable / defaulted columns for the `Assignment` and `Submission` additions, following however those tables store fields today (columns or JSON `data`; check `0001_init.sql` and `0006_night3.sql`). No drops, renames or type changes. **Apply to preview D1 with `npm run db:migrate:preview` before pushing code that needs it** (CLAUDE.md). **Production migration needs Jeff's explicit go-ahead and a D1 restore point (Time Travel bookmark) recorded first.**
- **Hotspot files** (shared with other agents; keep edits **small and added at the end of the relevant section**, never reorder or reformat): `shared/domain.ts`, `shared/api.ts`, `shared/service/index` (service wiring), the `Repo` interface, `repo-contract.ts`, `d1-repo`, the memory repo, `shared/seed.ts`, `worker/router.ts`, `app/src/paths.ts`, `tools/a11y_audit.mjs`, `mintlify/docs.json`. New code goes in new files: `shared/grading/engine.ts`, `explain.ts`, `setup-check.ts`, `shared/service/gradebook.ts`, `shared/service/validate-gradebook.ts`.
- **Routes**: `worker/router.ts` additions per §5; MCP read tools; OpenAPI regenerates.
- **App** (`app/src/features/gradebook/`): `GradebookGrid.tsx`, `StudentPanel.tsx`, `SetupPage.tsx`, `ReleaseDialog.tsx`, `HistoryPage.tsx`; student `MyGrade.tsx` and `WhatIf.tsx` under the student course area. The existing `GradesPage` keeps the Assignments tab; its Gradebook tab renders the new grid (the old `DataTable` view is removed from that tab only). Paths: `teach.gradebook(courseId)` (exists) plus `teach.gradebookSetup`, `teach.gradebookHistory`; `student.grades(courseId)`.
- **Shared components** (`app/src/components/`, each with `.module.css` on tokens and a Storybook story with every state): `DataGrid` (ARIA grid, virtualised, sticky panes, keyboard model of §3A), `GradeCell` (all cell states), `StateLabel` (icon + text), `CalculationTrace` (table + arithmetic line), `SetupCheckList`, `WeightMeter` (with a text alternative), `ChangeSetTable` (reuse the syllabus spec's component if it has landed; otherwise build it to that spec), `SegmentedControl` if not already present.
- **Mock mode**: `shared/seed.ts` gains STAT 110 Section 04 at Meridian State with Dr. Adaeze Okafor and the twelve fictional students, items and states exactly as drawn in the artboards (the golden fixture, §10), so `?data=mock&as=u-okafor` and `?data=mock&as=<Priya's id>` walk every screen.
- **Docs**: `mintlify/product/gradebook.mdx` (setup, the grid, explain this grade, release, what-if; vocabulary: category, weight, drop, keep at least, extra credit, excused, missing, held, released, override); `mintlify/product/grading.mdx` links to it and its Gradebook section is updated; release notes when shipped; `docs:sync` picks up screens and stories.

## 9. Governance and policy (must-haves)
- **Who sees scores.** Gradebook routes are STAFF (instructors of the course, administrators) as today. **Managers never see scores, attempts or grades** (D-026): the manager relationship grants no gradebook access, and no manager-facing payload may include a `CalculationTrace`, `CourseGradeResult` or event. Tokens need `grades:read` / `grades:write`.
- **Students see released only**, their own data only; what-if never reveals a held score (hypotheticals are the student's own input; the held item shows only "Graded, not released yet", which is the existing submission state).
- **Excuse reasons are private by default.** Reasons often touch accommodations or health; the reason is staff-only, and the student sees "Excused" plus an optional note the instructor writes for them. Accommodation documents are never stored in the gradebook.
- **Audit log.** `grade_events` is append-only; administrators can export a course's events (CSV) for grade appeals; every override, excusal and final override has a reason; event retention follows the course record.
- **AI provenance.** Feedback drafts carry provenance and review state; students see "Drafted with AI · reviewed by your instructor" only after keep and release (as today in `StudentAssignmentPage`). No roster, grade history or other students' work is sent to the model.
- **Release is deliberate.** Nothing becomes visible to students except through release (or an override on an already released grade, which is visible by design and logged).
- **Accessibility**: §3A; zero automated violations (D-010); the screen-reader walkthrough of the grid and panel is a human task added to the existing backlog item.
- **Stripes and AI marks**: D-017, D-006, D-018 hold everywhere; `npm test` guards stripes.

## 10. Tests and definition of done
1. **Engine unit tests** (`shared/grading/engine.test.ts`): each `TraceCode` has a case; order-of-operations cases (late then drop; excused then drop; missing not droppable; keep-at-least limiting drops; extra credit cap; empty category sharing weight; points mode; final override; extensions and grace; `afterMax` both ways; rounding at every letter boundary, e.g. 89.95 → 90.0 → A-, 89.94 → 89.9 → B+).
2. **Golden fixture** = the artboards' data (STAT 110, Section 04), asserted exactly: Priya Raman 88.1% B+ released only and 86.7% B with held; her trace contributions 14.50 / 17.00 / 16.20 / 36.00 of 95; Diego Ramírez 66.3% D and 70.2% C- with held; Hannah Brooks 79.9% C+; Jordan Ellis 57.1% F; class mean of current grades 81.7%; Priya's what-if with HW 5 = 9, Quiz 4 = 17, Final report = 36 gives 88.4% B+ and drops Quiz 1; the score needed on the Final report for A- is 38.3; changing Midterm 20 → 25% and Project 40 → 35% changes all 12 current grades and one letter (Brooks C+ → B-). If the engine disagrees with the artboards, the artboards are wrong and get corrected in the same PR, with the owner told.
3. **Property tests** (fast-check; add as a dev dependency if absent): determinism (same input, same trace); input order independence; excusing an item equals removing it; adding extra credit never lowers a grade; **raising any score never lowers a category or course grade** (D-041 monotonicity; fails with a lowest-percentage drop rule, which is the point); scaling all weights by a constant changes nothing; trace contributions re-sum to the total; what-if with no hypotheticals equals the student view; `needed` is minimal (needed − 0.1 doesn't reach the target); drops match brute force for up to 12 items.
4. **One-engine tests**: for the fixture, grid cells, `explainGrade`, `getMyGrade`, `whatIfMyGrade` (no hypotheticals) and CSV export agree exactly for every student; an architecture test fails if any file outside `shared/grading/` computes a weighted grade (grep for summing `points` in services) or if `shared/grading/` imports `ai`.
5. **Service tests** (`shared/service/gradebook.test.ts`): setup check codes; save refuses `fix`; stale version and stale hash give `conflict`; batch atomicity; reasons required; released grade edit becomes an override; recorded submissions; release skips unkept AI drafts and reports them; undo and undo conflicts; managers get `forbidden`; students can't read others or hypothesise released items.
6. **Repo contract**: new methods in `repo-contract.ts`; both repos pass.
7. **e2e** (`tests/e2e`, mock data): open the grid → keyboard-edit a score → fill down → excuse with a reason → undo → open Priya's panel and read the trace → change a weight in Setup, see the check and impact, save → release the Project draft with preview → as Priya, see the new grade and the same trace → what-if and "Aim for".
8. **a11y**: `npm run a11y` zero violations with the new routes and stories added to `tools/a11y_audit.mjs`; keyboard-only walk of grid, panel, setup, release and what-if; 320px reflow checks; contrast checks on every cell state.
9. **Performance**: a seeded 300 × 60 course; record render, scroll, edit latency and engine time in the QA log against the §3A / §6.7 targets.
10. **Journey**: add **Journey 21+ (claimed at build time)**, "An instructor sets up weights, grades, explains and releases; a student understands and plans", to the acceptance journeys.
11. **Definition of done** = CLAUDE.md full lane: build, audit, walk every screen locally with screenshots against the approved artboards, push the branch, migrate preview D1 first, check the preview, then merge to `main` after the owner's visual review. Production D1 migration only with Jeff's go-ahead and a restore point.

## 11. Milestones (suggested worktrees; Sol implements, Astra reviews, Claude verifies and commits)
0. **M0 · Mockups approved by owner 2026-09-28** (hard gate met; artboards in `design/explorations/gradebook/`). The four artboards (grid, student panel with explain-this-grade, setup with the live check, student what-if on a phone) are reviewed by the owner and approved, edited or rejected, as with the manager view under D-025. The release dialog and history view are drawn as two more artboards in this milestone if the owner asks. Approved boards move to `design/canvas/` (row H) and `canvas.json`, and D-039 to D-044 are recorded in `design/DECISIONS.md` as accepted or amended. **No product code, migration or branch work starts before this approval.**
1. `agent/gradebook-engine`: `shared/grading/engine.ts`, `explain.ts`, `setup-check.ts`; domain types; unit, golden and property tests. No UI, no storage. (Reviewable in isolation; everything else depends on it.)
2. `agent/gradebook-data`: migration (next free number), repo methods + contract tests, `shared/service/gradebook.ts` (setup, preview, save, cells, events, undo, final override, release preview), API routes, OpenAPI, MCP read tools, seed fixture.
3. `agent/gradebook-grid`: `DataGrid`, `GradeCell`, `StateLabel`, the grid page, keyboard model, bulk actions, undo, filters, density, held toggle; Storybook states.
4. `agent/gradebook-explain-setup`: student panel with `CalculationTrace`; Setup page with `SetupCheckList`, `WeightMeter`, impact preview; syllabus prefill when a design record exists.
5. `agent/gradebook-release-student`: release dialog with preview and `notSent`; History page; student Your grade and What-if (phone first); feedback-draft queue (§7).
6. `agent/gradebook-verify`: e2e journey, a11y, performance run, docs page, QA log, screenshots against the artboards.

Each brief to a worker: the section numbers above, the approved artboard file, the acceptance tests, and the CLAUDE.md hard rules. Claude reads every diff before pushing (D-013: worker agents never push).

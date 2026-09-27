# Component inventory

This inventory drives issue #17's shared React components and the related Storybook work. It records repeated patterns in the eight `design/canvas/*.dc.html` artboards and `docs/prototype/`; it does not yet replace their markup. Names are proposed PascalCase components. Token names below refer to CSS custom properties generated from `design/tokens.json`.

## Navigation

| Component | Purpose | Variants | States needed | Screens | Tokens |
|---|---|---|---|---|---|
| `GlobalRailNav` | Move between primary areas and expose search/profile. | Learner, instructor, admin; compact desktop rail. | Current destination, hover, focus, inactive. | `Main.dc.html`, `LearningProfile.dc.html`, `InstructorCommand.dc.html`, `TutorSettings.dc.html`, `AdminConsole.dc.html`, prototype. | `--surface-alt`, `--line`, `--accent`, `--accent-soft`, `--muted`, `--size-rail-width` |
| `MobileBottomNav` | Keep primary destinations reachable on a phone. | Four-item learner bar. | Current destination, focus, inactive. | `MobileToday.dc.html`. | `--surface-alt`, `--line`, `--accent`, `--muted`, `--size-target-learner` |
| `TopBar` | Identify the current workspace and hold context actions. | Today greeting, lesson focus/breadcrumbs, author pipeline, instructor/admin toolbar. | Default, scrolled or focus mode, action focus. | `Main.dc.html`, `LessonPlayer.dc.html`, `CourseBuilder.dc.html`, `InstructorCommand.dc.html`, `TutorSettings.dc.html`, `AdminConsole.dc.html`, prototype. | `--paper`, `--surface-alt`, `--line`, `--ink`, `--muted`, `--font-serif`, `--font-sans` |
| `LessonOutline` | Show the course/module/lesson position and jump between chunks or blocks. | Learner chunk list, author outline. | Current, completed, pending, focus. | `LessonPlayer.dc.html`, `CourseBuilder.dc.html`, prototype. | `--surface-alt`, `--surface`, `--line`, `--accent`, `--accent-soft`, `--muted` |
| `PipelineStepper` | Show authoring/review progress. | Horizontal numbered steps. | Complete, current, upcoming. | `CourseBuilder.dc.html`. | `--accent`, `--success`, `--line`, `--muted`, `--surface` |

## Content

| Component | Purpose | Variants | States needed | Screens | Tokens |
|---|---|---|---|---|---|
| `Card` | Provide a reusable surface for grouped content. | Learner spacious, compact staff, inset or quiet. | Default, hover when actionable, selected, focus. | All eight artboards, prototype. | `--surface`, `--surface-alt`, `--line`, `--line-soft`, `--radius-lg`, `--paper` |
| `TaskCard` | Show a next action with context, urgency, and destination. | Resume, due check, discussion; desktop/mobile. | Pending, in progress, done, urgent, focus. | `Main.dc.html`, `MobileToday.dc.html`, prototype. | `--surface`, `--line`, `--accent`, `--accent-soft`, `--warning-soft`, `--muted`, `--radius-lg` |
| `CourseCard` | Summarize a course or path and its mastery/compliance status. | Certificate, required training, path. | Not started, active, completed, due soon. | `Main.dc.html`, prototype. | `--surface`, `--line`, `--accent`, `--track`, `--warning-text`, `--error-soft`, `--radius-lg` |
| `ProgressMeter` | Show mastery, lesson completion, or weekly time against a target. | Horizontal bar, thin lesson bar, time ring. | Empty, partial, complete. | `Main.dc.html`, `MobileToday.dc.html`, `LessonPlayer.dc.html`, prototype. | `--accent`, `--track`, `--ring-track`, `--muted`, `--font-mono` |
| `PresenceCard` | Show an instructor's message with a face, time, and next actions (Community of Inquiry teaching presence). | Today sidebar card; prototype presence strip. | Default, unread, action focus. | `Main.dc.html`, prototype. | `--surface`, `--line`, `--ink`, `--muted`, `--accent`, `--radius-lg` |
| `ReviewCard` | Present a short retrieval-practice prompt. | Queue preview, mobile card, revealed answer. | Due, answer hidden, answer shown, skipped. | `Main.dc.html`, `MobileToday.dc.html`, prototype. | `--surface`, `--line`, `--accent`, `--muted`, `--radius-lg` |
| `KnowledgeCheck` | Present a question and feedback within a lesson. | Multiple choice, short response/result. | Unanswered, selected, submitted, correct, incorrect, retry. | `LessonPlayer.dc.html`, `MobileToday.dc.html`, prototype. | `--surface`, `--line`, `--accent`, `--success-text`, `--success-soft`, `--error-text`, `--error-soft` |
| `StatusChip` | Label urgency, mode, stage, or status in a compact line. | Neutral, accent, AI, success, warning, error; pill or small chip. | Default, selected when interactive, disabled, focus. | All eight artboards, prototype. | `--surface-sunk`, `--accent-soft`, `--ai-soft`, `--success-soft`, `--warning-soft`, `--error-soft`, `--radius-pill` |

## AI

| Component | Purpose | Variants | States needed | Screens | Tokens |
|---|---|---|---|---|---|
| `AiContent` | Render the required `.ai` markup contract with named source, body, citations, and actions. | `.ai--chat`, `.ai--note`, `.ai--block`; glyphs for tutor/co-author, draft block, summary. | Draft or kept for blocks, citation available, action focus. | `CourseBuilder.dc.html`, `InstructorCommand.dc.html`, `LearningProfile.dc.html`, `LessonPlayer.dc.html`, `TutorSettings.dc.html`, prototype. | `--ai`, `--ai-strong`, `--ai-soft`, `--ai-softer`, `--ai-line`, `--font-serif`, `--font-mono` |
| `TutorPanel` | Keep mode, source policy, conversation, hints, and input together. | Learner side panel, instructor preview, author co-author panel. | Open, closed, loading/answering, last hint, policy-limited; return focus on close. | `LessonPlayer.dc.html`, `TutorSettings.dc.html`, `CourseBuilder.dc.html`, prototype. | `--surface`, `--surface-alt`, `--line`, `--ai`, `--ai-soft`, `--ai-line`, `--radius-lg` |
| `DraftActions` | Let a person inspect and govern AI-proposed content. | Accept/revert/regenerate, preset use/undo, suggested nudge approval. | Draft, kept, reverted, pending approval, action focus. | `CourseBuilder.dc.html`, `InstructorCommand.dc.html`, `LearningProfile.dc.html`, prototype. | `--accent`, `--control-line`, `--surface`, `--success-soft`, `--radius-md` |

## Forms

| Component | Purpose | Variants | States needed | Screens | Tokens |
|---|---|---|---|---|---|
| `Button` | Trigger primary, secondary, text, or icon actions. | Filled, outline, text/link, icon-only, compact staff, learner touch size. | Default, hover, focus, pressed, disabled, loading. | All eight artboards, prototype. | `--accent`, `--accent-hover`, `--surface`, `--control-line`, `--ink`, `--focus`, `--radius-md`, `--size-target-learner`, `--size-target-compact` |
| `FormField` | Pair a label/help/error with a text, number, select, or message input. | Single-line, select, textarea/chat, numeric stepper. | Empty, filled, focus, disabled, invalid, read-only. | `LearningProfile.dc.html`, `TutorSettings.dc.html`, `CourseBuilder.dc.html`, `InstructorCommand.dc.html`, `LessonPlayer.dc.html`, prototype. | `--surface`, `--control-line`, `--ink`, `--muted`, `--error-text`, `--focus`, `--radius-md` |
| `ChoiceControl` | Offer one or more explicit settings or answers. | Radio, checkbox, labeled choice card. | Unselected, selected, focus, disabled, invalid. | `LearningProfile.dc.html`, `TutorSettings.dc.html`, `AdminConsole.dc.html`, `LessonPlayer.dc.html`, prototype. | `--accent`, `--accent-soft`, `--control-line`, `--disabled-text`, `--focus`, `--radius-md` |
| `SegmentedControl` | Switch between mutually exclusive modes or views. | Tutor Off/Hints/Explain/Open, reading format, density/view selection. | Selected, unselected, locked with reason, focus. | `TutorSettings.dc.html`, `LessonPlayer.dc.html`, `AdminConsole.dc.html`, prototype. | `--surface-sunk`, `--surface`, `--accent`, `--disabled-text`, `--radius-sm`, `--radius-md` |

## Data display

| Component | Purpose | Variants | States needed | Screens | Tokens |
|---|---|---|---|---|---|
| `DataTable` | Compare records, policies, and status in rows and columns. | Policy matrix, tutor activity matrix, compact queue. | Selected row, hover, focused cell, locked/disabled value, empty. | `AdminConsole.dc.html`, `TutorSettings.dc.html`, `InstructorCommand.dc.html`. | `--surface`, `--surface-alt`, `--line`, `--line-soft`, `--accent-soft`, `--muted`, `--size-text-compact` |
| `ChangeSetTable` | Preview proposed bulk or agentic edits (was / will be, affected count, conflicts) before a person applies them (D-003, principle #11). | Multi-row table (⌘K palette result: "Apply 12 changes", 46 learners affected, conflict warning, 30-day undo); single proposed-change card (co-author "Insert as draft"). | Pending, conflict surfaced, applied, undone, error. | `InstructorCommand.dc.html` (⌘K change-set dialog), `CourseBuilder.dc.html` (single proposed change); related simulate-before-apply in `AdminConsole.dc.html`. | `--surface`, `--line`, `--accent-soft`, `--warning-soft`, `--warning-text`, `--success-soft`, `--error-soft`, `--size-text-compact` |
| `StatTile` | Show one headline metric with context. | KPI strip tile (value, label, delta or context line); outcome mastery row. | Default, trend up/down, warning. | `AdminConsole.dc.html` (KPI strip), `InstructorCommand.dc.html` (outcome mastery). | `--surface`, `--line`, `--ink`, `--muted`, `--success-text`, `--warning-text`, `--font-serif` |
| `SourceList` | List the sources an AI feature is grounded in, with status and usage. | Author sources panel; tutor allowed-sources checklist. | Ready, extracting, outdated, excluded (answer key never allowed). | `CourseBuilder.dc.html`, `TutorSettings.dc.html`. | `--surface`, `--line`, `--muted`, `--warning-text`, `--disabled-text` |
| `RubricPanel` | Keep a submission next to assessment criteria and feedback. | Criterion row, score summary, feedback draft. | Unscored, scored, draft feedback, reviewed. | `InstructorCommand.dc.html`. | `--surface`, `--line`, `--line-soft`, `--accent`, `--muted`, `--radius-lg` |

## Feedback

| Component | Purpose | Variants | States needed | Screens | Tokens |
|---|---|---|---|---|---|
| `StatusNotice` | Explain why a state changed or why an action is blocked. | Info/why with Undo, success, warning, error, policy lock. | Visible, dismissed, undo available, action focus. | `Main.dc.html`, `LearningProfile.dc.html`, `AdminConsole.dc.html`, `TutorSettings.dc.html`, prototype. | `--accent-soft`, `--success-soft`, `--warning-soft`, `--warning-text`, `--error-soft`, `--error-text`, `--muted` |
| `CommandPalette` | Search or jump to an action from the global shell. | Search prompt and result list. | Closed, open, query, empty results, focused result. | `InstructorCommand.dc.html`; rail search in `Main.dc.html`. | `--surface`, `--line`, `--ink`, `--muted`, `--focus`, `--radius-lg` |

## Hard-coded colors

The artboards still contain the following **inline hex-color occurrences** in `style="…"` attributes. These count repeated uses, not distinct colors, and exclude `<style>` blocks, SVG attributes, scripts, and `docs/prototype/`. No artboard color was changed in this task.

| Artboard | Inline hex occurrences |
|---|---:|
| `AdminConsole.dc.html` | 104 |
| `CourseBuilder.dc.html` | 157 |
| `InstructorCommand.dc.html` | 127 |
| `LearningProfile.dc.html` | 84 |
| `LessonPlayer.dc.html` | 83 |
| `Main.dc.html` | 89 |
| `MobileToday.dc.html` | 39 |
| `TutorSettings.dc.html` | 96 |

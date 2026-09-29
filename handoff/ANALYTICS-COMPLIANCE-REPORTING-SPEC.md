# Build spec: Actionable analytics and trustworthy compliance reporting

*Status: approved by owner for build planning (2026-09-28); proposed decisions still await owner ruling. Decisions D-070 to D-074 below are proposals; they respect D-003, D-004, D-005 and D-026 and supersede none. Research: `research/lms-best-practices-gaps-2026-09-28.md` (the gap report; §2.4, §2.7, §3 ranks 6 and 9, §6.1, §7 area 6). Depends on: `handoff/AUTHORING-AT-SCALE-SPEC.md` (quiz responses for item analysis), `handoff/GRADEBOOK-SPEC.md` (missing and late states), `handoff/AI-GOVERNANCE-SPEC.md` (the `insight-nudges` feature switch). Builds on the compliance report, completion events and certificates (Night 3, D-026, D-027). Artboard: `design/canvas/CourseInsights.dc.html` proposed (§8).*

This document is written for the implementing agent. It assumes `CLAUDE.md`, `AGENTS.md`, `handoff/PARALLEL-AGENTS.md`, `design/DECISIONS.md` and `handoff/NIGHT-3-PLAN.md` are known. Where it says "as today", the existing code is the reference and must not be rewritten.

---

## 0. What this is, in one paragraph

Two halves with one rule: every number must be explainable and every insight must lead to an action a person takes. **Course insights** for instructors: item analysis for quiz questions and knowledge checks (difficulty, discrimination, distractor choices, "may be miskeyed" flags), lesson drop-off, outcome attainment from the existing outcome links, and a "might need a check-in" list built from transparent rules (missing work, days since last activity, low check accuracy) with the reasons shown. Each insight card offers a previewable action: open the item or block to edit, draft a revised item as a bank draft, or draft a private check-in note to a learner that the instructor edits and sends (AI drafts, a person sends, D-003). **Compliance reporting** for administrators: pass and fail recorded as distinct outcomes (not just "completed"), a point-in-time "as of" report reconstructed from the append-only completion events, a definitions panel that says exactly how each status is computed, reconciled totals, and scheduled exports. Managers' view is unchanged (D-026).

Why (gap report): 46% of buyers call analytics essential and "better data and analytics" is the first reason Brandon Hall lists for switching LMS (§2.4); D2L's Lumi Insights now suggests fixes (edit the question, revise content, email the students who struggled), which is the insight-to-action pattern (§2.4); reporting that can't be trusted is pain point 6, with a Cornerstone admin saying analytics "are buggy on a good day" and xAPI results reporting only "completed" rather than pass/fail (§2.5, §3); transcripts are "an audit trail, not anything useful" (§2.7). Tessera's difference: the loop ends in a human action with AI only drafting, the at-risk list is rules you can read (no opaque score), and compliance numbers can be reproduced from the event log for any date.

## 1. Decisions (proposed, 2026-09-28)

| # | Decision | Consequence in this build |
|---|---|---|
| **D-070** | **Insight to action, a person acts.** Every insight card has at most three actions: open to edit, draft a fix (AI draft), draft a check-in note (AI draft). Notes go to the learner as a private in-app notice on Today only after the instructor edits or approves and clicks Send. Nothing is sent automatically. | New `StudentNotice` (private, one learner). The `insight-nudges` AI feature is governed by spec 5 and defaults to opt-in per course. |
| **D-071** | **Item analysis rules.** Stats show only with at least 10 scored responses. Difficulty = proportion correct. Discrimination = corrected point-biserial against the rest-of-quiz score (for checks: against the learner's other checks in the lesson). Flags: difficulty above 0.95 "very easy", below 0.20 "very hard", discrimination below 0.10 "doesn't separate", negative "may be miskeyed: check the answer key". Thresholds are institution-editable. | The thresholds are conventions, stated in the definitions panel; not claims about any cohort. |
| **D-072** | **Check-in signals are readable rules, not a risk score.** Rules: 2 or more missing graded items; no activity for 10 days while enrolled in an active course; check accuracy below 50% across the last 5 checks. Each flagged learner shows the rules that fired. Instructor-only. Learners can see their own "things to catch up on" (missing items), never a label. No machine-learned prediction. | Wording is "might need a check-in", never "at risk" or "failing". Thresholds editable per course. |
| **D-073** | **Compliance report semantics.** Status per person per requirement is computed from events only. `completed` and `tested-out` stay; `passed` and `failed` are added as result details where an assessment decides completion (test-out, packages from spec 1, quiz-gated completion). The report can be run "as of" any past date by replaying events up to it. Totals reconcile to rows (a test enforces it). Each export carries its as-of time, filters and a definitions version. | `CompletionEvent` stays append-only; new kinds are added, none changed. |
| **D-074** | **Privacy thresholds.** Aggregates by any group (program, section, department) with fewer than 5 people show "Fewer than 5 people" instead of numbers. Managers get no analytics beyond D-026. Instructors see individual data only for their own courses. | Suppression applied in the service, not the UI. |

## 2. Scope

**In (MVP, one Night):**
1. Course Insights page (instructor): item analysis (quizzes from spec 3, checks as today), lesson funnel (opened, completed per lesson), outcome attainment (share of linked items answered correctly or scored at or above 70% of points, per outcome), check-in list with reasons.
2. Actions: deep links to the item or block editor; `item-fix` AI draft into the bank as a new draft version (spec 3); `check-in-note` AI draft → edit → send as `StudentNotice`.
3. Student side: `StudentNotice` on Today (private, dismissible, "From Dr. Okafor"), "Catch up" list of their own missing items.
4. Compliance: `passed` and `failed` result details; as-of reports; definitions panel; reconciled totals; scheduled monthly exports (in-app download notice); CSV export includes result and basis columns.
5. Institution overview additions: completion by requirement with suppression; overdue counts by program.
6. Definitions versioning (`shared/analytics/definitions.ts`) rendered in the UI and docs.

**Out (explicitly):** predictive models; learner-to-learner comparisons shown to learners; engagement "scores"; manager analytics; tying training to business incident data (Workday's pitch, gap report §2.4; later and needs an HRIS data feed from spec 9).

**Later:** custom report builder; xAPI-based analytics beyond packages; section-level results (needs sections in the roster model); email delivery of exports (needs a sending provider decision).

## 3. The flow (normative)

| Stage | Who sees what | Server does | Gate |
|---|---|---|---|
| Insights | Instructor: Course → Insights. Cards: "Question 4 in Week 3 quiz may be miskeyed (18 responses)", "Lesson 2.3: 12 opened, 5 finished", "Outcome 2: 48% of linked items met", "3 learners might need a check-in" | `getCourseInsights` computes on read with a 10-minute cache | Instructor of the course |
| Open | "Open the question" / "Open the lesson section" | Deep link with focus on the item or block | None |
| Draft a fix | "Draft a revised question" → a new draft version appears in the bank with a note of what changed and why | `draftItemFix` (`item-fix` task) | `aiAuthoring` and spec 5 policy; draft until kept |
| Check-in | "Draft a note to Priya" → AI draft grounded only in the reasons that fired and the missing items' titles → instructor edits → Send | `draftCheckInNote` then `sendStudentNotice` | `insight-nudges` enabled for the course; Send is an explicit click |
| Student | Priya's Today: "A note from Dr. Okafor" with the text; "Catch up: 2 items" | `getToday` payload gains notices and catch-up | Only her own |
| Compliance | Admin → Compliance: requirement, status, result, basis; "As of" date picker; definitions link; totals row | `getComplianceReport({ asOf })` replays events | Admin |
| Export | "Export CSV" or "Send me this monthly" | `exportComplianceReport`, schedule | Admin |

## 4. Domain model (`shared/domain.ts`)

Added at the end of the file (small, added at the end of the section):

```ts
// ---- Analytics and compliance reporting (D-070 to D-074) ----
export type Suppressed = { suppressed: true; reason: 'fewer-than-5' };

export interface ItemStats {
  source: { kind: 'quiz-item'; itemId: Id; version: number; assignmentId: Id } | { kind: 'check'; blockId: Id; lessonId: Id };
  label: string; responses: number;
  difficulty: number | null; discrimination: number | null;   // null below the minimum
  options: { id: string; text: string; share: number; isKey: boolean }[] | null;
  flags: ('very-easy' | 'very-hard' | 'no-separation' | 'may-be-miskeyed')[];
}
export interface LessonFunnelRow { lessonId: Id; title: string; opened: number; completed: number; medianMinutes: number | null }
export interface OutcomeAttainment { outcomeCode: string; text: string; linkedItems: number; responses: number; metShare: number | null }
export type CheckInRule = 'missing-work' | 'inactive' | 'low-check-accuracy';
export interface CheckInCandidate {
  student: Pick<User, 'id' | 'name'>;
  rules: { rule: CheckInRule; detail: string }[];   // "2 missing: Problem set 3, Week 3 quiz"
  lastActiveAt: Timestamp | null; lastNoticeAt: Timestamp | null;
}
export interface InsightThresholds {
  minResponses: number; veryEasy: number; veryHard: number; noSeparation: number;
  missingWork: number; inactiveDays: number; checkAccuracy: number; checkWindow: number;
}
export interface CourseInsights {
  courseId: Id; generatedAt: Timestamp; definitionsVersion: string; thresholds: InsightThresholds;
  items: ItemStats[]; funnel: LessonFunnelRow[]; outcomes: OutcomeAttainment[]; checkIns: CheckInCandidate[];
}

export interface StudentNotice {
  id: Id; courseId: Id; studentId: Id; fromId: Id; text: string;
  origin: 'human' | 'ai-edited';              // "ai-edited" when it began as an AI draft
  provenance: Provenance | null;
  sentAt: Timestamp; readAt: Timestamp | null; dismissedAt: Timestamp | null;
}

export type ComplianceResult = 'passed' | 'failed' | null;   // null when no assessment decides completion
export interface ComplianceRowV2 extends ComplianceRow {
  result: ComplianceResult; basis: 'completed' | 'tested-out' | 'package' | 'quiz' | null;
  lastEventAt: Timestamp | null;
}
export interface ComplianceReport {
  asOf: Timestamp; definitionsVersion: string; filters: { requirementId?: Id; programId?: Id; status?: TrainingStatus };
  rows: ComplianceRowV2[];
  totals: Record<TrainingStatus, number> & { people: number };
  groups: { key: string; label: string; totals: (Record<TrainingStatus, number> & { people: number }) | Suppressed }[];
}
```

Also:
- `CompletionEventKind` gains `'passed' | 'failed'` (added at the end of the union). Notices are not compliance events and are not logged there.
- `Today` gains optional `notices?: StudentNotice[]` and `catchUp?: { kind: 'assignment'; id: Id; title: string; dueAt: Timestamp | null }[]`.
- `AiTask` gains `'item-fix' | 'check-in-note'`, registered under spec 5's `question-drafts` and `insight-nudges` features.

## 5. API (`shared/api.ts`)

| Operation | Method · path | Access · scope | Notes |
|---|---|---|---|
| `getCourseInsights` | `GET /courses/:courseId/insights` | INSTRUCTOR · `grades:read` | |
| `updateInsightThresholds` | `PUT /courses/:courseId/insights/thresholds` | INSTRUCTOR · `courses:write` | institution defaults via `PUT /institution/insight-thresholds` (ADMIN) |
| `draftItemFix` | `POST /items/:itemId/fix-draft` | INSTRUCTOR · `ai:run` | creates a draft version (spec 3) |
| `draftCheckInNote` | `POST /courses/:courseId/check-ins/:studentId/draft` | INSTRUCTOR · `ai:run` | returns text + provenance; nothing stored until send |
| `sendStudentNotice` | `POST /courses/:courseId/notices` | INSTRUCTOR · `courses:write` | `{ studentId, text, fromDraft?: { provenance } }` |
| `listMyNotices` / `dismissNotice` | `GET /me/notices`, `POST /me/notices/:noticeId/dismiss` | STUDENT | |
| `getComplianceReport` | as today, `GET /compliance?asOf=&requirementId=&programId=` | ADMIN · `people:read` | returns `ComplianceReport` (additive fields) |
| `exportComplianceReport` | `GET /compliance/export?asOf=…` | ADMIN · `people:read` | CSV with header lines for as-of, filters, definitions version |
| `setComplianceSchedule` | `PUT /compliance/schedule` | ADMIN · `people:write` | monthly in-app delivery |
| `getDefinitions` | `GET /analytics/definitions` | signed-in | versioned text |

## 6. Service logic (`shared/service/insights.ts`, `shared/service/compliance-report.ts`, over `Repo`)

### 6.1 Item analysis
- Inputs: `quiz_responses` joined to attempts (spec 3) with item version; check answers from the existing check-answer records. Use each learner's first attempt for checks and the scored attempt for quizzes.
- Discrimination: corrected point-biserial (item excluded from the total). Below `minResponses`, return nulls and no flags.
- Options share only for choice items; `isKey` is shown to instructors only.

### 6.2 Funnel and attainment
- Opened = has a progress row; completed = `completed` state (as today). Median minutes from progress timestamps where available, else null.
- Attainment per outcome over `OutcomeLink`s: for checks and quiz items, correct share; for assignments, share of scores at or above 70% of points (institution-editable). Null when no responses.

### 6.3 Check-in rules
- Missing work from the gradebook's missing state (`GRADEBOOK-SPEC.md`); until that lands, a published assignment past `dueAt` with no submission.
- Inactive from last progress, submission or tutor activity.
- Candidates exclude learners who got a notice in the last 7 days unless a new rule fired.

### 6.4 Notices
- Draft grounding: the reasons and item titles only; never grades beyond "missing", never tutor content (D-005), never other learners.
- Send stores the final text; `origin: 'ai-edited'` if it began as a draft (provenance kept). The learner sees the instructor as the author and the same line kept content carries, "Drafted with AI · edited by Dr. Okafor", so the AI markup rule holds (D-006). **Owner check:** whether a private note should carry that line; dropping it would need an explicit exception to D-006.

### 6.5 Compliance as-of
- Replay `completion_events` for each (user, requirement) up to `asOf`: assigned/unassigned, started, completed, tested-out, passed, failed, due-date-changed; overdue = assigned, not completed, due before `asOf`.
- `result`: last passed or failed event before completion, else null. `basis` from the completing event.
- Reconciliation: sum of status totals = people count; any mismatch throws in tests and logs in production.
- Suppression applies to `groups`, not to rows (admins see individuals, as today).

## 7. AI tasks (`shared/ai.ts`, prompts in `worker/ai/palmyra.ts`, fixtures)

Small additions at the end of the hotspot tables.

| Task | Input | Output | Fixture behaviour |
|---|---|---|---|
| `item-fix` | `{ item (with key), stats, flags, lessonText }` | `{ stem, options, key, why }` | For `may-be-miskeyed`, swap the key to the most chosen option and explain; otherwise rewrite the least chosen distractor |
| `check-in-note` | `{ courseTitle, instructorName, studentFirstName, reasons, missingTitles, tone: 'warm' }` | `{ text }` (under 90 words) | Template: greeting, one line naming the missing items, an offer of help, no judgement words |

Prompt rules: no judgement or diagnosis ("struggling", "failing", "at risk"); offer help and a concrete next step; never mention other students; never mention AI; never the phrase "learning styles".

## 8. Worker, data, app

- **Migration:** new migration, next free at build time (>=0009). Additive: `student_notices`, `insight_thresholds`, `compliance_schedules`; completion event kinds are values in an existing column (if a `CHECK` list exists on `completion_events.kind`, stop and ask the owner). Apply to preview D1 first; production with the owner's OK and a restore point.
- **Worker:** monthly Cron for scheduled exports; insights cached in KV or memory for 10 minutes (no new binding without owner OK; in-request compute is acceptable for the MVP).
- **App:** `app/src/features/insights/` (`CourseInsights`, `ItemCard`, `FunnelTable`, `OutcomeTable`, `CheckInList`, `NoteComposer`), student `NoticeCard` on Today, "Catch up" list, compliance page additions (as-of picker, definitions dialog, totals row). Charts always have a table alternative; colour never carries meaning alone.
- **Artboard:** `design/canvas/CourseInsights.dc.html` (instructor row, y = 1240); owner review recommended because the check-in list is a privacy-sensitive surface (precedent D-025).
- **Mock mode:** seed 24 fictional STAT 110 learners with responses so one item shows "may be miskeyed" and three learners fire rules; a compliance requirement with test-out passes and one failure.
- **Docs:** `mintlify/product/insights.mdx`, compliance page updates with definitions.

## 9. Governance and policy (must-haves)
- D-003: AI drafts fixes and notes; people keep and send.
- D-004: no learning-style or personality inference; signals are behaviour only.
- D-005: tutor transcripts never feed insights beyond counts already in tutor summaries.
- D-026: managers unchanged; no analytics for managers.
- D-074 suppression in the service.
- Accessibility: tables with headers and captions; flags as text; charts have `aria-describedby` tables; the note composer is a labelled textarea; focus returns after dialogs (D-010); no stripes (D-017); tokens only.

## 10. Tests and definition of done
1. **Unit:** difficulty and discrimination on a fixed dataset with hand-computed values; minimum responses; each flag; funnel counts; attainment with and without responses; each check-in rule and the 7-day notice suppression; notice send requires explicit text; as-of replay on a scripted event log (assigned, due change, completed after due, test-out passed, failed then passed); reconciliation; group suppression under 5.
2. **Repo contract:** new methods; both repos pass.
3. **AI validation:** notes over length or with banned words rejected; item fixes validated as spec 3 items.
4. **e2e** (mock): Journey 21+ (claimed at build time): (a) Dr. Okafor opens Insights, sees the miskeyed flag, drafts a fix, keeps it; (b) drafts a note to Priya, edits, sends; Priya sees it on Today and dismisses it; (c) admin runs the compliance report as of last month and the totals match rows.
5. **a11y:** zero violations with new routes and stories.
6. **Definition of done:** CLAUDE.md full lane; preview D1 migrated first; owner reviews the insights artboard before build and the app against it before merge.

## 11. Milestones (suggested worktrees; Sol implements, Astra reviews, Claude verifies and commits)
1. `analytics/compliance` in `../tessera-analytics-compliance`: result details, as-of replay, reconciliation, definitions, exports, schedule (can start before spec 3).
2. `analytics/insights-core`: item analysis on checks, funnel, attainment, check-in rules, thresholds.
3. `analytics/actions`: notices, AI drafts, student Today changes (after spec 5's feature switch exists, or behind `aiAuthoring` until then).
4. `analytics/quiz-items`: item analysis on quiz responses (after spec 3).
5. Docs, e2e, a11y.

Each brief: the sections above, the acceptance tests, the hotspot rule (small, added at the end of the section) and the CLAUDE.md hard rules. Read every diff before pushing.

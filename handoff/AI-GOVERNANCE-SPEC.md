# Build spec: AI governance and disclosure (feature registry, disclosure cards, policy console, retention, usage log)

*Status: approved by owner for build planning (2026-09-28); proposed decisions still await owner ruling. Decisions D-065 to D-069 below are proposals; they extend D-003, D-005, D-006, D-015 and D-019 and supersede none. Research: `research/lms-best-practices-gaps-2026-09-28.md` (the gap report; §2.3, §3 rank 7, §6.1, §6.2 item 1, §7 area 5). Related: Night 4's `InstructorProfile.disclosureText` and `AiPolicy.designPartner` (D-033, `handoff/SYLLABUS-DESIGN-PARTNER-SPEC.md` §4, §9). Artboard: `design/canvas/AiPolicyConsole.dc.html` proposed (§8).*

This document is written for the implementing agent. It assumes `CLAUDE.md`, `AGENTS.md`, `handoff/PARALLEL-AGENTS.md`, `design/DECISIONS.md`, `design/DESIGN-NOTES.md` (the AI markup contract) and `handoff/NIGHT-3-PLAN.md` are known. Where it says "as today", the existing code is the reference and must not be rewritten. `worker/ai/palmyra.ts` and `shared/ai.ts` are shared hotspots and partly owned by Night 4 until it merges; this spec only adds a registry beside them.

---

## 0. What this is, in one paragraph

Tessera already keeps AI honest at the level of each output: drafts need a person (D-003), every AI element names itself and its source (D-006), the tutor gives hints first and never sees the answer key (D-005). What an institution can't yet do is see and govern AI **as a set of features**. This spec adds a single **AI feature registry** in code that names every AI feature, the tasks it runs, the model, what data it sends, what it can and can't see, who reviews its output and how long anything is kept; a **disclosure card** generated from that registry and reachable from every AI element ("About this feature") and from a public AI features page; an **AI policy console** for administrators with per-feature on and off at institution, program and course level (most restrictive wins), a pause-all switch, and retention settings; a content-free **AI usage log** with export; and a course **AI-use statement** learners see on the course home. Nothing here adds a new AI capability.

Why (gap report): EDUCAUSE found 39% of institutions have AI acceptable-use policies and only 9% feel their cybersecurity and privacy policies are adequate for AI risks (§2.3); an AAUP survey found 69% of faculty say AI hurts student success (§1); Canvas IgniteAI tools are disabled by default, opted into per course, and ship with "AI Nutrition Facts", which set the market bar (§2.3); Instructure will ask partners to disclose AI features too (§2.3). Tessera's difference, per §6.2 item 1, is "trust you can inspect": the cards are generated from the same registry the server enforces, so the disclosure can't drift from the behaviour, and the governance sits on top of review rules that are already server-enforced rather than advisory.

## 1. Decisions (proposed, 2026-09-28)

| # | Decision | Consequence in this build |
|---|---|---|
| **D-065** | **One AI feature registry drives enforcement and disclosure.** `shared/ai-features.ts` lists every feature, its `AiTask`s, audience, data sent, data never sent, output handling, model ids, retention class and known limits. The server refuses to run an `AiTask` that isn't mapped to a registered, enabled feature. Disclosure cards render from the registry. In-app cards name the model and provider; the public page describes the model generically unless the owner approves naming the vendor (Mintlify rule: no model-vendor internals). | A test fails if any `AiTask` in the union is unmapped. Other specs register their new tasks here (spec 3 `question-items`, spec 4 math and captions, spec 6 nudges, spec 10 study tools). |
| **D-066** | **Policy console: per-feature switches, most restrictive wins, plus pause-all.** Levels: institution → program → course. Institution can set a feature Off, On, or "On, courses opt in". Program can only restrict. Instructors can turn a feature off for their course and, where allowed, opt in. Learner-facing features default to "On, courses opt in" for new institutions. A pause-all switch stops every AI call within one request cycle and shows a plain notice where AI would appear. | Existing `AiPolicy.aiAuthoring` and `tutorModes` stay and are read as the institution level of the authoring and tutor features (compatibility, no data rewrite). |
| **D-067** | **Retention is explicit and short by default.** AI call metadata (no content) is kept 365 days; AI-generated drafts are content and follow content lifetime; tutor transcripts are kept for the course term plus a configurable window (default 180 days after course end) and then deleted; administrators can shorten, not remove, the metadata window below 90 days. The statement about model training use is filled in by the owner from the vendor terms; until then the card shows "Being confirmed" and the public page isn't published. | Deletion is a scheduled job with an append-only record of what was deleted (counts, not content). |
| **D-068** | **Model choice only among approved models.** Each feature lists allowed model ids from decisions already approved (D-015 Palmyra-X6, D-019 Palmyra-X5 for alt text and Workers AI for audio, OCR and vision fallback). An administrator can pick where a feature has more than one approved model. Adding a provider or model family needs a new owner decision. | The console shows a choice only where one exists; everywhere else it shows the model as information. |
| **D-069** | **Content-free AI usage log** for administrators: feature, task, role (not name, for students), course, model, tokens in and out, latency, result (ok, invalid output rejected, provider error, blocked by policy), time. Exportable as CSV. Instructors see their course's counts. Students see their own tutor and study-tool history (as today for the tutor) and can delete their own tutor transcripts, which also removes them from summaries not yet generated. | Supports audit and cost questions without storing prompts; complements `TutorSummary` (instructors never see transcripts, D-005). |

## 2. Scope

**In (MVP, half a Night to one Night):**
1. `shared/ai-features.ts` registry with every current `AiTask` mapped (brief, outline, lesson-draft, block-regenerate, announcement, feedback, alt-text, rewrite, link-text, element, tutor, tutor-summary, agent, readiness-item, variant, and Night 4's syllabus tasks once merged).
2. Server enforcement: task → feature → effective policy (institution, program, course) → allowed model → run or refuse with a typed `policy` error.
3. Disclosure card component and route; "About this feature" link in every `AiContent` source line; public AI features page generated at build.
4. Policy console page for administrators; course AI settings panel for instructors; pause-all.
5. Retention settings and the deletion job; student "delete my tutor history".
6. AI usage log (write on every call), admin view with filters, CSV export; course counts for instructors.
7. Course AI-use statement on the course home for learners (from Night 4's `InstructorProfile.disclosureText` when present, else an institution default), always a human-edited text.

**Out (explicitly):** new AI features; AI detection of student writing (the report frames integrity around authorship, not detection, §2.3); third-party tool AI disclosure (needs spec 1 LTI platform mode, out there); per-student AI opt-out of instructor-side drafting (not a learner data use).

**Later:** partner or LTI tool disclosure cards; bring-your-own-model; per-feature evaluation dashboards (quality metrics); email notifications of policy changes.

## 3. The flow (normative)

| Stage | Who sees what | Server does | Gate |
|---|---|---|---|
| See | Anyone viewing an AI element clicks "About this feature" in its source line → card: what it does, who can use it, what it sends, what it never sees, how output is reviewed, model, retention, limits, and where it's turned on | `getAiFeature` | None (cards are readable by any signed-in user; the public page is a subset) |
| Govern (institution) | Admin → Policy → AI: a table of features with state (Off · On · On, courses opt in), model, retention class; "Pause all AI" at the top with a confirmation | `updateAiFeaturePolicy`, `setAiPause` | Admin only; every change audited with before and after |
| Govern (program) | Admin selects a program: can only make features stricter; shows inherited state with its source | same, scoped | Validation refuses loosening |
| Govern (course) | Instructor → Course settings → AI: features available to the course, each with a switch where allowed; learner-facing features show "Off until you turn it on" when opt-in | `updateCourseAiSettings` | Only within the institution and program state |
| Run | Any AI call | `resolveAiPolicy(task, courseId)` → allowed? model? → call → log | Refusal returns a typed error; UI shows "Your institution has turned this off" or "Paused by your institution" |
| Retain | Nightly | deletion job per D-067; writes a deletion record | None |
| Review usage | Admin → AI usage: filters, totals, CSV | `listAiUsage`, `exportAiUsage` | Admin; instructors see counts for their courses |
| Disclose to learners | Student on course home: "How AI is used in this course" with the statement and links to the relevant cards | `getCourseAiStatement` | Statement is human text; AI can draft it (as a draft) but it shows only once kept |

Voice: cards are plain, specific and short. No "magic", no "smart", no sparkle imagery (D-006). "Can't see" lists are concrete ("your grades", "other students' work", "the answer key").

## 4. Domain model (`shared/domain.ts` and `shared/ai-features.ts`)

Added at the end of `shared/domain.ts` (small, added at the end of the section):

```ts
// ---- AI governance (D-065 to D-069) ----
export type AiFeatureId =
  | 'course-builder' | 'block-assist' | 'alt-text' | 'announcement-draft' | 'feedback-draft'
  | 'tutor' | 'tutor-summary' | 'agent' | 'readiness-review' | 'variants' | 'design-partner'
  | 'question-drafts' | 'math-assist' | 'captions' | 'insight-nudges' | 'study-tools';

export type AiAudience = 'instructor' | 'administrator' | 'student';
export type RetentionClass = 'content' | 'tutor-transcript' | 'metadata-only';

export interface AiFeature {
  id: AiFeatureId; name: string; summary: string;
  audience: AiAudience[]; tasks: AiTask[];
  sends: string[];                             // "the blocks you selected", "the lesson's published text"
  neverSees: string[];                         // "grades", "other students' work", "answer keys"
  output: 'draft-kept-by-person' | 'tutor-reply-by-mode' | 'summary-labelled' | 'caption-draft';
  models: { id: string; label: string; approvedBy: string }[];   // approvedBy: "D-015"
  retention: RetentionClass;
  limits: string[];                            // known limits, in plain words
  learnerFacing: boolean;
}

export type FeatureState = 'off' | 'on' | 'opt-in';
export interface AiFeatureRule { state: FeatureState; modelId: string | null }
export interface AiGovernance {
  paused: { at: Timestamp; by: Id; reason: string } | null;
  features: Partial<Record<AiFeatureId, AiFeatureRule>>;
  retention: { metadataDays: number; tutorDaysAfterCourseEnd: number };
  trainingUseStatement: string | null;         // owner-supplied from vendor terms (D-067)
  defaultCourseStatement: string;
}
export interface ProgramAiRestrictions { programId: Id; features: Partial<Record<AiFeatureId, 'off' | 'opt-in'>> }
export interface CourseAiSettings { courseId: Id; enabled: Partial<Record<AiFeatureId, boolean>>; statement: string | null; statementKeptBy: Id | null }

export interface EffectiveAiPolicy {
  feature: AiFeatureId; allowed: boolean;
  reason: 'ok' | 'paused' | 'institution-off' | 'program-off' | 'course-off' | 'not-opted-in';
  modelId: string | null; decidedBy: 'institution' | 'program' | 'course';
}

export interface AiUsageRecord {
  id: Id; at: Timestamp; feature: AiFeatureId; task: AiTask;
  actorRole: Role; actorId: Id | null;         // null for students in exports (role only)
  courseId: Id | null; modelId: string;
  tokensIn: number; tokensOut: number; latencyMs: number;
  result: 'ok' | 'invalid-output' | 'provider-error' | 'blocked-policy';
}
export interface AiDeletionRecord { id: Id; at: Timestamp; kind: 'usage' | 'tutor-transcript'; count: number; olderThan: Timestamp; requestedBy: Id | null }
```

Also:
- `Institution.aiGovernance?: AiGovernance` (nullable; absent means today's behaviour mapped by D-066 compatibility: `aiAuthoring` → course-builder, block-assist, alt-text, announcement-draft, feedback-draft, readiness-review, variants on or off; tutor governed by `tutorModes`).
- `shared/ai-features.ts` exports `AI_FEATURES: AiFeature[]` and `featureForTask(task): AiFeatureId`.
- `AiContent` gains an optional `featureId` prop that renders the "About this feature" link inside `.ai-src` (markup contract unchanged otherwise).

## 5. API (`shared/api.ts`)

| Operation | Method · path | Access · scope | Notes |
|---|---|---|---|
| `listAiFeatures` | `GET /ai/features` | signed-in · `courses:read` | registry plus effective state for the viewer's context (`?courseId=`) |
| `getAiFeature` | `GET /ai/features/:featureId` | signed-in · `courses:read` | card data |
| `getAiGovernance` / `updateAiGovernance` | `GET`/`PUT /institution/ai-governance` | ADMIN · `people:read` / `people:write` | features, retention, statements |
| `setAiPause` | `PUT /institution/ai-pause` | ADMIN · `people:write` | `{ paused: boolean, reason }` |
| `getProgramAiRestrictions` / `updateProgramAiRestrictions` | `GET`/`PUT /programs/:programId/ai` | ADMIN · `courses:write` | stricter only |
| `getCourseAiSettings` / `updateCourseAiSettings` | `GET`/`PUT /courses/:courseId/ai` | STAFF · `courses:read` / INSTRUCTOR · `courses:write` | |
| `getCourseAiStatement` | `GET /courses/:courseId/ai/statement` | signed-in · `courses:read` | learners see kept text only |
| `listAiUsage` / `exportAiUsage` | `GET /ai/usage`, `GET /ai/usage/export` | ADMIN · `people:read` | filters: feature, course, result, date |
| `getCourseAiUsage` | `GET /courses/:courseId/ai/usage` | INSTRUCTOR · `courses:read` | counts only |
| `deleteMyTutorHistory` | `DELETE /me/tutor/history` | STUDENT | confirmation in UI |

Public (build-time, not an API): `mintlify/ai/features.mdx` generated by `tools/build_ai_features.mjs` from the registry with generic model wording (D-065).

## 6. Service logic (`shared/service/ai-governance.ts`, over `Repo`)

### 6.1 Resolution
`resolveAiPolicy(ctx, task, courseId?)`: feature = `featureForTask(task)`; if paused → `paused`; institution rule (from `aiGovernance` or the compatibility mapping) → off wins; program restriction (course's `programId`) → off or opt-in wins; course setting: opt-in features need `enabled[feature] === true`; any feature can be course-disabled by an instructor. Model = rule's `modelId` if allowed for the feature, else the feature's first model. Pure function; tested as a table.

### 6.2 Enforcement point
The single place that calls the AI provider (the Worker's AI client used by all tasks) calls `resolveAiPolicy` first and writes an `AiUsageRecord` after (including blocked calls). Night 4 tasks go through the same client once merged; do not edit Night 4 files before the merge, only the shared client wrapper.

### 6.3 Retention job
Nightly Cron: delete `ai_usage` older than `metadataDays`; delete tutor sessions whose course ended more than `tutorDaysAfterCourseEnd` days ago (course end = `Course.status` archived date, or the term end once spec 7 or the gradebook adds term dates; until then, archived date); write `AiDeletionRecord`. Deletion code conditions the delete on the age predicate in the same statement (compare-and-set discipline) and gets an Astra review.

### 6.4 Statement
Course statement = the course's kept statement, else Night 4's `InstructorProfile.disclosureText` for the first instructor (kept by definition, it's their text), else `defaultCourseStatement`. An AI-drafted statement is a draft until kept (D-003).

### 6.5 Registry test
A unit test iterates the `AiTask` union (via a const array exported next to it) and fails on any unmapped task, any feature without `neverSees`, and any learner-facing feature whose default for new institutions isn't `opt-in`.

## 7. AI tasks

None new. Optionally the course statement can be drafted by the existing `rewrite` task from the institution default; that reuse is registered under `block-assist`.

## 8. Worker, data, app

- **Migration:** new migration, next free at build time (>=0009). Additive: `ai_usage` (index on `(at)`, `(course_id, at)`), `ai_deletions`, `program_ai_restrictions`, `course_ai_settings`; nullable `institution.ai_governance` JSON. Apply to preview D1 first; production with the owner's OK and a restore point.
- **Worker:** wrap the AI client with resolution and logging; nightly Cron for retention.
- **App:** `app/src/features/admin/AiPolicyPage.tsx` (new page beside `PolicyPage.tsx`; the existing page keeps its current fields), `AiUsagePage.tsx`, `app/src/features/instructor/CourseAiSettings.tsx`, `AiFeatureCard` component (tokens only; no sparkles or gradients, D-006; violet AI colour only through the Marginalia tokens), course-home statement section for students, "delete my tutor history" in the student profile. Admin nav gets "AI" under Policy (small addition in `app/src/shell/nav.ts`).
- **Artboard:** `design/canvas/AiPolicyConsole.dc.html` (admin row, y = 2480) and a disclosure-card state; owner review recommended before build because the card is the product's public trust statement.
- **Mock mode:** seeded governance with tutor "opt-in", STAT 110 opted in, alt text on, one program restricting `agent` to off, 40 fictional usage rows.
- **Docs:** `mintlify/ai/features.mdx` (generated), `mintlify/product/ai-governance.mdx`.

## 9. Governance and policy (must-haves)
- The registry is the single source; a card that disagrees with enforcement is a P1 bug.
- D-003, D-005, D-006 unchanged: this spec adds visibility and switches, never a path that publishes AI output without a person.
- Students' identities are not exported in the usage CSV (role only); instructors never see tutor transcripts (D-005); managers see nothing (D-026).
- The training-use statement is never guessed; owner fills it from vendor terms (D-067).
- Public page: no vendor internals, no agents or internal tooling, no decision codes (PARALLEL-AGENTS §7).
- Accessibility: the console table is a real table with row headers; switches are `<input type="checkbox" role="switch">` with labels; state is text plus marker, never colour alone; the card is a dialog with focus return to the "About" link (D-010); no stripes.

## 10. Tests and definition of done
1. **Unit:** resolution table (paused, institution off, program restrict, course off, opt-in not enabled, allowed with model override); program can't loosen; compatibility mapping from `aiAuthoring` and `tutorModes`; registry completeness; retention job deletes only past-window rows and records counts; usage record written for ok, invalid and blocked calls; statement precedence; student deletion removes transcripts.
2. **Repo contract:** new methods; both repos pass.
3. **Worker:** the AI client refuses a disabled feature before any provider call (assert no fetch).
4. **e2e** (mock): Journey 21+ (claimed at build time): (a) admin turns tutor to opt-in; Dr. Okafor opts STAT 110 in; Priya sees the tutor and the course AI statement; admin pauses all AI; Priya sees the paused notice; (b) "About this feature" from a kept AI block opens the card and focus returns on close; (c) usage CSV has no student names.
5. **a11y:** zero violations with new routes and stories.
6. **Definition of done:** CLAUDE.md full lane; preview D1 migrated first; owner approves the card copy and the training-use statement; the owner merges.

## 11. Milestones (suggested worktrees; Sol implements, Astra reviews, Claude verifies and commits)
1. `governance/registry` in `../tessera-governance-registry`: registry, completeness test, resolution function, compatibility mapping (Claude writes the registry content: it's a product statement, not mechanical).
2. `governance/enforce`: AI client wrapper, usage log, migration, repo methods.
3. `governance/console`: admin AI page, program restrictions, course settings, pause-all, usage page and export.
4. `governance/disclosure`: card component, `AiContent` link, public page generator, course statement.
5. `governance/retention`: Cron job, deletion records, student deletion (Astra review: deletion code).

Each brief: the sections above, the acceptance tests, the hotspot rule (small, added at the end of the section) and the CLAUDE.md hard rules. Read every diff before pushing.

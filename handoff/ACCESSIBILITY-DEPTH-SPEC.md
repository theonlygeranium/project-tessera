# Build spec: Accessibility depth (math, captions and description, bulk remediation, legal reporting, Tessera's own ACR)

*Status: approved by owner for build planning (2026-09-28); proposed decisions still await owner ruling. Decisions D-060 to D-064 below are proposals and extend D-010 and D-022; none supersedes them. Research: `research/lms-best-practices-gaps-2026-09-28.md` (the gap report; §1, §2.2, §3 rank 4, §5.4 item 5, §6.1, §6.2 item 3, §7 area 4). Backlog: #29 (screen-reader walkthrough, VoiceOver and NVDA). Builds on Tessera Access (`shared/service/access.ts`, `worker/access/`, `app/src/features/access/`), which is built. Artboards: optional (§8).*

This document is written for the implementing agent. It assumes `CLAUDE.md`, `AGENTS.md`, `handoff/PARALLEL-AGENTS.md`, `design/DECISIONS.md`, `handoff/NIGHT-2-PLAN.md` §3 (Tessera Access) and `handoff/NIGHT-3-PLAN.md` are known. Where it says "as today", the existing code is the reference and must not be rewritten. Night 4 owns `worker/access/office.ts` and `worker/access/pdf.ts` until it merges: don't edit them before then.

---

## 0. What this is, in one paragraph

Tessera Access already scores lessons and documents against WCAG 2.2, drafts fixes a person keeps, offers accessible formats, and enforces a publishing policy. This spec closes the four gaps the research names and makes Tessera's own accessibility claim credible. **Math:** a `math` block that stores LaTeX and renders MathML with a spoken description, plus AI conversion of an equation image or pasted math into LaTeX as a draft. **Media:** drafted captions for uploaded video and audio through the existing Workers AI speech path, a caption editor to correct them, and a text description track for visual content, all drafts until kept. **Scale:** a course-wide and institution-wide **fix queue** that groups the same issue across lessons and files, applies deterministic fixes as a previewable change set, and batches AI drafts for review without a blind "keep all". **Reporting and proof:** a legal view of the reports against WCAG 2.1 AA (what Title II requires) next to the 2.2 view, program rollups and scheduled exports; and Tessera's own **Accessibility Conformance Report** (VPAT 2.5 format), published only after an evidence-backed audit that includes the screen-reader walkthrough in backlog #29.

Why (gap report): the DOJ moved the Title II compliance dates to April 26, 2027 and April 26, 2028, and the standard is still WCAG 2.1 AA (§1); course content is in scope (§2.2); a UF math lecturer spent 20 to 30 hours remediating one LaTeX file (§2.2); untagged PDFs and missing audio description are the two biggest gaps in Phil Hill's reading (§2.2); Blackboard Ally's human-reviewed auto-tagging had early demand of 70+ institutions against a target of 20 (§2.2); a VPAT/ACR is procurement table stakes and a screen-reader walkthrough is needed to claim Tessera's own accessibility (§6.1). Tessera's difference is that remediation is inside authoring with a person approving every AI fix, and the report tells an institution where it stands against the legal standard, not only a score. The report also notes Ally runs in about 1,000 institutions, so depth and workflow, not the existence of a checker, is the point (§6.2 item 3).

## 1. Decisions (proposed, 2026-09-28)

| # | Decision | Consequence in this build |
|---|---|---|
| **D-060** | **Math is a block.** `math` stores LaTeX (source of truth), server-rendered MathML, and a spoken-text alternative; display or inline-in-text is out for the MVP (display equations only). AI can draft LaTeX from an equation image or a pasted expression; the draft is kept like any AI block (D-003). | Renderer runs in the Worker (a small LaTeX-to-MathML library bundled; choose at build time and record licence). Browsers render MathML Core natively; the spoken text comes from the renderer's speech rules and is editable. New Access checks: `math-image` (an image whose alt looks like an equation), `math-no-speech`. |
| **D-061** | **Captions and descriptions are drafted, reviewed, then kept.** Uploaded video and audio get a WebVTT caption draft from the Workers AI speech model (D-019); the instructor corrects it in a caption editor and keeps it. A text description track (WebVTT `kind="descriptions"`) is drafted from the transcript plus instructor notes for visual-only content and shown as synchronized text under the player. YouTube and Vimeo embeds can't be transcribed by Tessera; the instructor uploads or pastes captions. | Publishing rule unchanged (captions or transcript required, as today). Extended audio description (pausing video to speak) is later. |
| **D-062** | **Fix queue with batch review, no blind keep-all.** Deterministic fixes (table header row, heading order, document metadata) apply as a change set with preview and undo. AI fixes (alt text, link text, rewrite, math, captions) are batched for review: each draft must be shown and ticked individually; "Keep selected" keeps only ticked drafts. | Reuses `suggestFix` and the existing fix kinds; adds grouping and batch endpoints. Institution admins see the queue across courses but only instructors of a course can keep content there. |
| **D-063** | **Tessera publishes its own ACR** in VPAT 2.5 format (WCAG edition, reporting WCAG 2.2 A and AA, with 2.1 AA called out) as an accessible HTML page on the docs site, only after: automated audit at zero violations, a manual keyboard and zoom audit, and the #29 screen-reader walkthrough on VoiceOver (macOS and iOS) and NVDA (Windows). Every row's claim is written by a person from recorded evidence; AI does not write conformance claims. | Owner signs off before publishing. Whether an external auditor reviews it is an owner decision (cost). Wording on the public page follows Mintlify rules (no internal tooling or agent names; see §9). |
| **D-064** | **Legal view in reports.** Course and institution reports gain a WCAG 2.1 AA filter (the Title II standard) beside the 2.2 view, a program rollup, a scheduled monthly CSV export to administrators, and the public-entity dates shown as information with a "not legal advice" line. | Each `AccessIssue.wcag.sc` is mapped to the WCAG version that introduced it, so the filter is a lookup, not a second scan. |

## 2. Scope

**In (MVP, one Night):**
1. `math` block: editor with LaTeX input and live preview, MathML render, spoken text (editable), AI draft from image or paste; student render with MathML plus visually hidden spoken text fallback; Access checks.
2. Caption drafting for uploaded video and audio; caption editor (timestamped cues, play from cue, merge and split, find and replace); keep flow; transcript generated from kept captions.
3. Description track drafting and editing; synchronized display under the player; toggle for learners (remembered in their learning profile accessibility settings).
4. Fix queue at course and institution levels: grouping by issue code, counts, deterministic batch fixes with preview and undo, AI batch review.
5. Legal view filter, program rollup, scheduled export, deadline information panel.
6. #29 walkthrough: protocol, execution on the app's core journeys (not only the prototype), issue log, fixes of anything found at severity serious or critical.
7. ACR: evidence collection, VPAT 2.5 draft in the repo, owner review, publication on the docs site.

**Out (explicitly):** patching PDFs (D-022 stands: the accessible version is offered instead); automatic PDF tagging; extended audio description; sign language; remediation of third-party packages (spec 1 reports only); a Section 508 or EN 301 549 edition of the ACR.

**Later:** inline math inside `text` blocks; LaTeX source upload that produces tagged PDF (the tagged LaTeX workflow in gap report §2.2); a reading ruler and dark reading view (Blackboard's enhanced reader, gap report §2.2); ACR in 508 and EN 301 549 editions; external audit.

## 3. The flow (normative)

| Stage | Who sees what | Server does | Gate |
|---|---|---|---|
| Add math | Instructor inserts Math block, types `\bar{x} = \frac{1}{n}\sum x_i`, sees the rendered equation and "Read aloud as: x bar equals one over n times the sum of x sub i" | `renderMath` on save; stores LaTeX, MathML, speech | Invalid LaTeX shows the parser error inline; can't save an empty block |
| Convert math | On an image flagged `math-image`: "Convert to an equation" → AI draft math block beside the image | `math-from-image` task → draft block with provenance | Keep or revert (D-003); the image is removed only if the instructor chooses "Replace the image" |
| Draft captions | Instructor uploads a lecture video: "Captions: drafting…" then "Draft ready: review" | Workers AI speech → WebVTT → draft attached to the block | Lesson can't publish on a draft caption file (captions must be kept, as with blocks) |
| Edit captions | Caption editor: cue list beside the player; play from a cue; edit text and times; flag cues with low confidence | `saveCaptions` versions the file | Keep marks the caption file kept |
| Describe | "Add descriptions" on a video: AI draft of description cues for moments the transcript doesn't explain, from instructor notes | `describe-video` task (text only; no frame vision in the MVP) | Keep or revert |
| Fix queue | Course → Access → "Fix queue": "14 images need alt text · 3 tables need a header row · 2 equations are images" | `getFixQueue` groups issues | None |
| Batch fix | "Add header rows to 3 tables" → preview → apply → undo available | `previewAccessBatch`, `applyAccessBatch(hash)` | Hash; compare-and-set |
| Batch review | "Draft alt text for 14 images" → drafts appear one per row with the image; tick each reviewed one; "Keep selected (9)" | `suggestFix` in a batch job; `keepBlocks` for ticked ids | No select-all; each tick is explicit |
| Legal view | Admin: Institution Access report → "Standard: WCAG 2.1 AA (Title II) · WCAG 2.2 AA" toggle; program filter; "Email me this report monthly" | Filtered report; scheduled export | None |
| ACR | Owner: reviews `design/accessibility/ACR-draft.md` and evidence; approves; page published | Docs build | Owner sign-off |

## 4. Domain model (`shared/domain.ts`)

Added at the end of the file (small, added at the end of the section):

```ts
// ---- Accessibility depth (D-060 to D-064) ----
export interface MathContent {
  type: 'math'; latex: string; mathml: string; speech: string;
  speechEdited: boolean;                       // true once a person edits the spoken text
  display: 'block';
}

export type CaptionState = 'drafting' | 'draft' | 'kept' | 'failed';
export interface CaptionTrack {
  fileId: Id;                                  // WebVTT in R2 (FileRecord kind 'captions', as today)
  blockId: Id; kind: 'captions' | 'descriptions'; language: string;
  state: CaptionState; origin: 'human' | 'ai'; provenance: Provenance | null;
  cues: number; lowConfidenceCues: number[];   // cue indexes to review first
  keptBy: Id | null; keptAt: Timestamp | null; updatedAt: Timestamp;
}

export type WcagVersion = '2.0' | '2.1' | '2.2';
export type AccessStandardView = 'wcag21aa' | 'wcag22aa';

export interface FixQueueGroup {
  code: string; title: string; wcag: AccessIssue['wcag']; introducedIn: WcagVersion;
  fix: AccessIssue['fix']; mode: 'deterministic' | 'ai-draft' | 'manual';
  count: number;
  targets: { kind: 'block' | 'file'; id: Id; lessonId: Id | null; label: string }[];
}
export interface FixQueue { scope: { courseId: Id } | { institution: true }; groups: FixQueueGroup[]; generatedAt: Timestamp }

export interface AccessBatchChangeSet {
  courseId: Id; code: string;
  rows: { targetId: Id; label: string; was: string; willBe: string }[];
  summary: string; hash: string;
}

export interface AccessReportSchedule { institutionId: Id; recipients: Id[]; view: AccessStandardView; programId: Id | null; dayOfMonth: number; lastSentAt: Timestamp | null }

/** Evidence behind Tessera's own ACR (D-063); lives in the repo, not in D1. */
export interface AcrRow {
  criterion: string;                           // "1.4.3 Contrast (Minimum)"
  level: 'A' | 'AA'; introducedIn: WcagVersion;
  conformance: 'Supports' | 'Partially Supports' | 'Does Not Support' | 'Not Applicable';
  remarks: string; evidence: string[];         // links to audit notes, walkthrough entries, test names
  reviewedBy: string; reviewedAt: string;
}
```

Also:
- `BlockContent` gains `| MathContent` (added at the end of the union). **Check first** for a `CHECK` list on `blocks.type` (see `0003_block_types.sql`); if present, stop and ask the owner.
- `AiTask` gains `'math-from-image' | 'math-from-text' | 'captions' | 'describe-video'`.
- `AccessIssue` gets no new fields; the `introducedIn` mapping lives in `shared/access/wcag-versions.ts` keyed by `sc`.
- `CourseAccessReport` and `InstitutionAccessReport` gain optional `view?: AccessStandardView` and `programId?: Id | null`.

## 5. API (`shared/api.ts`)

| Operation | Method · path | Access · scope | Notes |
|---|---|---|---|
| `renderMath` | `POST /access/math/render` | INSTRUCTOR · `content:write` | `{ latex }` → `{ mathml, speech } \| { error, position }` |
| `draftMath` | `POST /blocks/:blockId/math-draft` | INSTRUCTOR · `ai:run` | from an image block or `{ text }`; inserts a draft math block after it |
| `draftCaptions` | `POST /blocks/:blockId/captions/draft` | INSTRUCTOR · `ai:run` | uploaded video or audio only; background job |
| `getCaptions` / `saveCaptions` | `GET`/`PUT /blocks/:blockId/captions?kind=` | STAFF · `content:read` / INSTRUCTOR · `content:write` | cues JSON in, WebVTT stored |
| `keepCaptions` | `POST /blocks/:blockId/captions/keep` | INSTRUCTOR · `content:write` | |
| `draftDescriptions` | `POST /blocks/:blockId/descriptions/draft` | INSTRUCTOR · `ai:run` | `{ notes }` |
| `getFixQueue` | `GET /courses/:courseId/access/queue` and `GET /access/institution/queue` | STAFF · `access:read` / ADMIN · `access:read` | |
| `previewAccessBatch` / `applyAccessBatch` / `undoAccessBatch` | `POST /courses/:courseId/access/batch/preview`, `/apply`, `/:batchId/undo` | INSTRUCTOR · `access:write` | deterministic fixes only |
| `draftAccessBatch` | `POST /courses/:courseId/access/batch/draft` | INSTRUCTOR · `ai:run` | `{ code }` → job creating drafts |
| `keepBlocks` | `POST /lessons/blocks/keep` | INSTRUCTOR · `content:write` | `{ blockIds }` each must be a draft the caller may edit |
| `getCourseAccess` / `getInstitutionAccess` | as today, plus `?view=&programId=` | as today | |
| `setAccessReportSchedule` | `PUT /access/institution/schedule` | ADMIN · `access:write` | |

## 6. Service logic

### 6.1 Math (`shared/service/math.ts`, renderer in the Worker)
- Render on save; store all three fields; re-render when the renderer version changes (store `rendererVersion` in the block's JSON).
- Speech defaults to the renderer's clear-speak style output; if a person edits it, `speechEdited: true` and re-render never overwrites it.
- Access checks: `math-image` fires for an image whose alt or caption contains math tokens (`=`, `^`, `\frac`, Greek letter names, `sqrt`) or whose OCR text does; `math-no-speech` when speech is empty.

### 6.2 Captions and descriptions (`shared/service/captions.ts`)
- Drafting runs as a background job (reuse the generation job runner): extract audio from the upload (R2), send to Workers AI speech, build cues (max 2 lines, 42 characters per line, 1 to 7 seconds per cue, split on sentence boundaries), mark cues with low model confidence.
- Saved captions are versioned `FileRecord` versions (as today). Keeping sets the video block's `captionsFileId` and generates the transcript from cues if the transcript is empty.
- Descriptions: the task gets the transcript and the instructor's notes ("at 02:10 the chart shows…") and proposes cues only where the notes name a visual; it never invents visual content it wasn't told about.

### 6.3 Fix queue (`shared/service/access-queue.ts`)
- Build from the latest scans (as today); group by `code`; order groups by severity then count. Mode per `fix`: `table-header`, `metadata`, heading-order fixes are deterministic; `alt-text`, `link-text`, `rewrite`, `captions`, math are AI drafts; everything else is manual with the existing fix hint.
- Batch apply: compare-and-set per block (content hash in the write condition) in both repos; Astra review before merge (overwrite code).
- Batch drafts: one job; each result is a normal draft block (or caption draft) with provenance; `keepBlocks` refuses ids that aren't drafts or that the caller can't edit.

### 6.4 Reports
- `introducedIn` table covers every `sc` Tessera emits; unknown `sc` defaults to `2.0` and logs a warning in tests.
- Scheduled export: a monthly Cron creates the CSV (existing `exportInstitutionAccess` shape plus the view column) and delivers it as an in-app download notice to the recipients (no email in the MVP; email needs an owner decision on a sending provider).

### 6.5 Screen-reader walkthrough (#29) and ACR evidence
- Protocol in `design/accessibility/SR-WALKTHROUGH.md`: journeys (student: Today → lesson → check → tutor → assignment submit → grades; instructor: builder → lesson editor → keep drafts → gradebook; admin: people → policy → Access report), per screen reader and browser pair (VoiceOver with Safari on macOS and iOS, NVDA with Firefox or Chrome on Windows), with pass criteria per step (name, role, state announced; focus order; focus return; live regions).
- Log findings in `design/accessibility/SR-WALKTHROUGH-LOG.md` with severity; fix serious and critical before the ACR.
- ACR draft in `design/accessibility/ACR-draft.md` (one `AcrRow` per criterion as a table); evidence links to test names, audit report sections and log entries.

## 7. AI tasks (`shared/ai.ts`, prompts in `worker/ai/palmyra.ts`, fixtures)

Small additions at the end of the hotspot tables.

| Task | Input | Output | Fixture behaviour |
|---|---|---|---|
| `math-from-text` | `{ text }` | `{ latex }` | Wrap in `\text{}` if no math tokens; otherwise pass through normalized |
| `math-from-image` | `{ fileId }` (vision fallback per D-019) | `{ latex, confidence }` | Returns a fixed equation for the seeded image |
| `captions` | audio (Workers AI speech, not Palmyra) | cues | Fixture WebVTT for the seeded video |
| `describe-video` | `{ transcript, notes }` | `{ cues: { start, end, text }[] }` | One cue per note line with a timestamp |

Validation: LaTeX must render without error or the draft is rejected; cues must be ordered, non-overlapping, and inside the media duration.

## 8. Worker, data, app

- **Migration:** new migration, next free at build time (>=0009). Additive: `caption_tracks`, `access_batches`, `access_report_schedules`. Math lives in block JSON (subject to the `CHECK` question). Apply to preview D1 first; production with the owner's OK and a restore point.
- **Worker:** math renderer module; caption job using Workers AI (binding as today); monthly Cron.
- **App:** `MathBlockEditor`, `MathView`, `CaptionEditor`, `DescriptionTrack` (player), `FixQueue`, `BatchReview`, legal-view toggle on existing report pages. Paths at the end of `app/src/paths.ts`.
- **Artboards:** optional; a `CaptionEditor` state on the lesson editor artboard is useful but not a privacy surface. If drawn, instructor row (y = 1240), placed after `night4`'s canvas changes merge.
- **Repo files for #29 and the ACR:** `design/accessibility/` (new folder; nothing confidential; no real participant names).
- **Mock mode:** a seeded STAT 110 lesson with an equation image, a short uploaded video with a fixture caption draft, and a table without a header row.
- **Docs:** `mintlify/product/access.mdx` additions (math, captions, fix queue, legal view); `mintlify/accessibility-conformance.mdx` (the ACR) after sign-off.

## 9. Governance and policy (must-haves)
- Every AI fix is a draft a person keeps (D-003, D-022); batch review has no select-all.
- The ACR is honest: "Partially Supports" wherever evidence shows gaps; no AI-written claims; owner signs off; the page carries the evaluation date and the version of Tessera evaluated.
- Public page wording: describes methods generically ("automated testing against WCAG 2.2, manual keyboard testing, and screen-reader testing with VoiceOver and NVDA"); never names internal scripts, agents or harnesses (PARALLEL-AGENTS §7). Whether naming the automated engine is acceptable is an owner call.
- The legal view is informational; it says Tessera reports against the standard and does not give legal advice.
- No student data in captions work beyond the instructor's own media; walkthrough logs contain no real people.
- Accessibility of the new UI: caption editor fully keyboard operable (cue list is a real list with buttons; playback controls labelled); math preview announced politely; batch review checkboxes with labels that include the image's context; no stripes (D-017); tokens only; 320px reflow.

## 10. Tests and definition of done
1. **Unit:** LaTeX render success and error positions; speech preserved when edited; `math-image` heuristics; cue building rules (line length, duration); caption keep sets `captionsFileId` and transcript; fix-queue grouping and ordering; batch apply compare-and-set keeps changed blocks; `keepBlocks` refuses non-drafts; `introducedIn` coverage for every emitted `sc`; legal-view filter counts.
2. **Repo contract:** new methods; both repos pass.
3. **AI validation:** bad LaTeX and overlapping cues rejected.
4. **e2e** (mock): Journey 21+ (claimed at build time): (a) Dr. Okafor converts the equation image to a math block, keeps it, publishes; Priya's lesson shows MathML with the spoken text available to a screen reader; (b) caption draft reviewed, one cue edited, kept, lesson publishes; (c) fix queue adds header rows to tables, then undo.
5. **a11y:** zero violations including new routes and stories; math output checked with axe and a VoiceOver spot check.
6. **#29 walkthrough** completed and logged; serious and critical findings fixed or listed as known issues in the ACR.
7. **Definition of done:** CLAUDE.md full lane; preview D1 migrated first; the owner merges and signs off the ACR separately.

## 11. Milestones (suggested worktrees; Sol implements, Astra reviews, Claude verifies and commits)
1. `a11y/math` in `../tessera-a11y-math`: renderer, block, editor, checks, AI drafts.
2. `a11y/media`: caption drafting job, caption editor, description track, player changes.
3. `a11y/fix-queue`: grouping, batch preview and apply (Astra review), batch drafts and review UI.
4. `a11y/reports`: legal view, program rollup, schedule.
5. `a11y/walkthrough-acr` (Claude-led, not delegated: subjective and evidence-bearing): #29 protocol and runs (the owner or a tester with real screen readers; agents can prepare scripts but can't substitute for a human run), log, fixes, ACR draft for owner review.

Each brief: the sections above, the acceptance tests, the hotspot rule (small, added at the end of the section) and the CLAUDE.md hard rules. Read every diff before pushing.

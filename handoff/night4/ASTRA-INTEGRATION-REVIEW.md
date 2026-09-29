# Integration review of night4 (Codex Astra, 2026-09-28, at 8c06fb3)

Release blockers found before the owner's visual review. Fixes are in progress on branch `agent/design-integration` (see ORCHESTRATOR-HANDOFF.md). Probe data is fictional.

**Release is blocked.** I reproduced seven P1 findings and three P2 defects in `night4` at `8c06fb3`, plus one pre-existing publication-rule violation. No files were changed.

1. **P1 — Uploading a design source immediately exposes it to enrolled students.**  
   [Start.tsx:58](/Users/jeffgeronimo/Projects/tessera-night4/app/src/features/design-partner/Start.tsx:58) uses ordinary course-file uploads. [files.ts:17](/Users/jeffgeronimo/Projects/tessera-night4/shared/service/files.ts:17) permits students to read staff uploads.
   
   **Probe:** Uploaded a fictional draft syllabus through the upload handler, then called file listing and content download as `u-priya`, before creating a design session. The source appeared in the listing; download returned **200** with `PRIVATE-SYLLABUS-CONTENT-PROBE`.
   
   **Fix:** Give design-source uploads staff-only visibility from the initial upload, enforced on listing, downloads, and derived formats. Explicit sharing should be separate.

2. **P1 — MCP can make assistant-written outcomes student-visible without human acceptance.**  
   [design-partner.ts:398](/Users/jeffgeronimo/Projects/tessera-night4/shared/service/design-partner.ts:398), [design-plan.ts:236](/Users/jeffgeronimo/Projects/tessera-night4/shared/service/design-plan.ts:236).
   
   **Probe:** Using only MCP create/get/confirm/select/preview/apply calls, supplied an assistant-written outcome with `source: "instructor"`. The enrolled student’s course outline contained that outcome while the session was still `provisioning`, with **zero newly published lessons**.
   
   **Fix:** Preserve agent provenance and require human acceptance before outcomes enter the student-visible course record. MCP confirmation must not count as that acceptance. This violates **D-003**.

3. **P1 — Concurrent confirmations produce a Workflow that continues indefinitely.**  
   [design-partner.ts:219](/Users/jeffgeronimo/Projects/tessera-night4/shared/service/design-partner.ts:219), [design-partner.ts:259](/Users/jeffgeronimo/Projects/tessera-night4/shared/service/design-partner.ts:259), [generation-workflow.ts:34](/Users/jeffgeronimo/Projects/tessera-night4/worker/generation-workflow.ts:34).
   
   **Probe:** Against D1’s SQLite shim, ran two simultaneous `confirmOutcomes` calls. After one job saved options, the other repeatedly returned unchanged `running, done: 0`. Two actual Workflow executions consumed **240 steps and scheduled two continuations**, still without progress.
   
   **Fix:** Atomically claim options generation, verify session/job ownership before AI calls, terminate superseded jobs, and refuse continuation when progress has stopped.

4. **P1 — A `content:read` token executes AI work through session GET.**  
   [api.ts:394](/Users/jeffgeronimo/Projects/tessera-night4/shared/api.ts:394), [design-partner.ts:305](/Users/jeffgeronimo/Projects/tessera-night4/shared/service/design-partner.ts:305).
   
   **Probe:** Created a pending session, then called MCP `design_session_get` with a token containing only `content:read`. Authentication succeeded, `syllabus-extract` ran, and persisted progress advanced from **0 to 1**.
   
   **Fix:** Keep session reads free of generation and cleanup effects. Use an `ai:run` operation for poll-driven advancement; keep undo execution behind its write scope.

5. **P1 — The approaches error logger can expose syllabus content.**  
   [design-partner.ts:271](/Users/jeffgeronimo/Projects/tessera-night4/shared/service/design-partner.ts:271), [palmyra.ts:412](/Users/jeffgeronimo/Projects/tessera-night4/worker/ai/palmyra.ts:412).
   
   **Probe:** Used the real Palmyra client with a mocked HTTP 400 response containing a fictional instructor name and private-syllabus marker. Captured `console.error` included both verbatim through `ApiError.details.detail`.
   
   **Fix:** Log only allowlisted metadata such as task, status, and safe error category. Never log the full upstream error object or response body.

6. **P1 — Recognizable small rosters pass into AI prompts unchanged.**  
   [design-partner.ts:67](/Users/jeffgeronimo/Projects/tessera-night4/shared/service/design-partner.ts:67).
   
   **Probe:** Pasted `Student Name | Student ID` followed by two fictional name/ID rows. Both rows remained in the saved source and the captured `syllabus-extract` input. Filtering requires at least three matching rows.
   
   **Fix:** Strip or reject explicitly identified roster sections regardless of row count; handle ambiguous roster content before model submission. The current behavior contradicts the consent panel and spec §9.

7. **P1 — Substantial AI output bypasses Marginalia.**  
   [Session.tsx:82](/Users/jeffgeronimo/Projects/tessera-night4/app/src/features/design-partner/Session.tsx:82), [Session.tsx:87](/Users/jeffgeronimo/Projects/tessera-night4/app/src/features/design-partner/Session.tsx:87), [Preview.tsx:27](/Users/jeffgeronimo/Projects/tessera-night4/app/src/features/design-partner/Preview.tsx:27).
   
   **Probe:** Server-rendered the actual components with sentinel content. The summary had an `.ai--*` ancestor; AI deficiencies, Palmer judgments, and generated preview titles did **not**.
   
   **Fix:** Wrap the generated read sections and proposal content in `AiContent`, with role/source attribution and appropriate draft labeling. This violates the project’s AI-markup hard rule.

8. **P2 — Planning silently drops weeks and their readings.**  
   [plan.ts:84](/Users/jeffgeronimo/Projects/tessera-night4/shared/design/plan.ts:84).
   
   **Probe:** Followed the sample syllabus through confirmation and selected its project approach. Options promised weeks `[[1,2,3],[4,5,6],[7,9,10],[11,12,13],[14]]`; the plan produced lesson weeks `[[1,2],[4,5],[7,9],[11,12],[14,14]]`. Weeks **3, 6, 10, and 13**, including their readings, disappeared.
   
   **Fix:** Preserve coverage of every selected week/topic. Allocate lessons accordingly or represent multiple covered weeks per lesson instead of truncating by lesson count.

9. **P2 — Saved profile corrections do not update deterministic planning inputs.**  
   [design-partner.ts:245](/Users/jeffgeronimo/Projects/tessera-night4/shared/service/design-partner.ts:245), [design-partner.ts:360](/Users/jeffgeronimo/Projects/tessera-night4/shared/service/design-partner.ts:360).
   
   **Probe:** Corrected credits from **3 to 6** and saved the answer. The record contained `"6"`, but the displayed budget stayed **9 hours**, and the options task still received `credits: 3` and `weeklyHoursBudget: 9`.
   
   **Fix:** Resolve accepted corrections into a typed effective profile, then recompute workload and candidate selection from it while retaining the original extraction.

10. **P2 — The planner ignores the UI’s break/exam choices.**  
    [plan.ts:107](/Users/jeffgeronimo/Projects/tessera-night4/shared/design/plan.ts:107).
    
    **Probe:** Answered the actual week-8 question with `optionId: "break"`. For a project spanning weeks 7–9, the plan assigned a graded deadline on **2026-10-16**, inside that break week. The planner reads only `answer.value`; the UI saves the choice in `optionId`.
    
    **Fix:** Associate questions with structured week identifiers and consume the selected option when calculating excluded weeks. This violates spec §6.5.

11. **P2 — Pre-existing Mintlify content violates the release publication rule.**  
    [night-1.mdx:6](/Users/jeffgeronimo/Projects/tessera-night4/mintlify/releases/night-1.mdx:6) names AI coding agents and Claude orchestration. [principles.mdx:47](/Users/jeffgeronimo/Projects/tessera-night4/mintlify/principles.mdx:47) and [decisions.mdx:37](/Users/jeffgeronimo/Projects/tessera-night4/mintlify/build/decisions.mdx:37) mention answer keys.
    
    **Probe:** Repository text scan found these passages; comparison with `origin/main` confirmed they are **unchanged baseline content**, not Night 4 regressions.
    
    **Fix:** Remove the prohibited wording before publication under the rule in this brief.

Confirmed clean within the tested boundaries:

- **Authorization:** 32 student/cross-course denial probes passed across 16 course/session operations. All 18 new operations rejected a token missing their declared scope. The read-operation side effect above remains the exception.
- **Migration 0008:** Applied successfully over populated migrations 0001–0007. Existing published lessons and running/done/failed jobs survived; old jobs received `kind='generate'`, nullable additions remained null, integrity checks passed, and invalid kinds failed the CHECK constraint.
- **Ordinary job coexistence:** Generate, extraction, and scaffold jobs completed together in both MemoryRepo and D1Repo.
- **Block publication:** Scaffold and plain-language variant blocks remained AI drafts; publishing before keeping returned `not-ready`.
- **Recovery:** Missing-schedule and missing-outcomes fixtures reached Review and undid cleanly, restoring the original two modules.
- **UI/public diff:** The stripe guard passed. I found no new private-repository links or real-syllabus content in the reviewed public-documentation diff.

Changed: None; the worktree remained clean.

Why: Integration probes exposed gaps between upload visibility, session permissions, MCP acceptance, background-job ownership, and downstream planning.

Verified: `npm run typecheck` passed. `node node_modules/vitest/vitest.mjs run --configLoader runner --no-cache --no-fsModuleCache --pool threads --maxWorkers 2` produced **632 passing tests**, with one OpenAPI-generation test blocked by filesystem `EPERM`. Additional `node -e` probes used in-memory repositories, SQLite, mocked upstream responses, and React server rendering.

Uncertain: Production migration status, hosted Workflow behavior, real Palmyra responses, and browser focus/contrast were not verified live. No fresh build, e2e, or accessibility audit was run because those workflows write artifacts. The review used the supplied local `origin/main` reference at `293acfc`.


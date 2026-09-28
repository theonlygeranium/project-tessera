# Night 3 plan: consistency, quality, and the industry learner

**Status: approved 2026-09-27 (scope and D1–D6, recorded as D-024 to D-029); Wave 0 in progress on branch `night3`.** Builds on Night 2 (tag `night-2`, D-019 to D-023).

## 1. Goals

1. **Every course in an institution looks and works the same where it should.** Institution and program templates set the required structure and the brand; the builder applies them and the readiness check enforces them (#24, principle #3; report §2: only 48% of students perceive consistency across courses).
2. **"Ready to publish" means something an institution can defend.** A readiness report grouped by standard, with automatic checks, AI-assisted checks as drafts, reviewer attestations, and fix links to the exact block (#25, principle #12; report §1 quality standards, §7(b), signature interaction 6).
3. **One master course, several audiences.** Plain-language and micro-path variants derived from a master, with a visible diff and a resolve action when they drift (#23; report §7(b) persona targeting).
4. **A first real industry learner.** Required training with due dates, test-out, certificates, and an audit trail; an opt-in manager view that shows completion only (#22; report §5 persona table, §7(c) reporting).
5. **Close Night 2's carry-overs** (§5).

Non-goals: LTI, SIS/HRIS, xAPI, SCORM/cmi5 (Night 4, #26); dark and compact modes (#27); the mobile lesson player (#30).

## 2. Personas and what they get

| Persona | New in Night 3 |
|---|---|
| Administrator | Templates and brand per institution and program; the readiness rubric (built-in Tessera standard, OSCQR, or their own); required-training assignments with due dates; manager relationships; the compliance report and audit trail |
| Instructor / author | New courses start from a template; a readiness report with fix links and AI fix drafts; variants with diffs and resync |
| Student / employee | Required training on Today with due dates, test-out, and certificates; control over whether a manager sees their completion |
| Manager (a relationship, not a role) | Their people's completion, due dates, and certificates, only for people who opted in; never scores or tutor chats |

## 3. The package

### 3.1 Templates and brand (lane A, #24)

- A **template** belongs to the institution or to a program and defines: required modules and lessons (for example "Start here" → "Course overview", "How to get help"), required blocks inside them (outcomes, syllabus file, instructor contact), default tutor mode per activity kind within the AI policy, the accessibility policy floor, and the brand (accent from `accent-options`, program name, and an optional logo image with required alt text).
- **Applying a template** to a new course creates the skeleton. Applying it to an existing course is a **previewable change set** (principle #11, D-003): "adds 2 lessons and 3 blocks; renames nothing; removes nothing", then Apply.
- **Deviations** (a required lesson deleted, a required block emptied) appear in the readiness report (3.2) as issues with fix links. Templates never delete content.
- Programs group courses (a new `programs` table); a course belongs to at most one program and inherits the program's template, else the institution's.

### 3.2 Readiness report and rubric (lane B, #25)

- A **rubric** is a list of standards, each with items. Every item has a **check kind**:
  - **automatic**: computed from data (outcomes present; every module has an objective; every assessment is aligned to an outcome; accessibility score at or above the policy; reading level; navigation instructions present; template followed; time estimates present);
  - **AI-assisted**: Palmyra judges against the item's criteria and returns a finding with evidence and a suggested fix, shown as a draft (D-003);
  - **attestation**: a named reviewer confirms, with a note and a date.
- **Built-in rubrics:** a Tessera standard written in plain words and organized in areas that parallel common course-quality frameworks (overview, objectives, assessment, materials, engagement, technology, learner support, accessibility), and **OSCQR** (SUNY's open rubric, CC BY 4.0, with attribution). **QM's rubric text is licensed and is not reproduced**; institutions that subscribe to QM can load their own items as a custom rubric (decision D1).
- The **report** opens from the lesson editor's readiness panel and a course-level page: score by standard, each item's status (met, not met, needs review, attested), evidence, and a fix link to the block or setting. The publishing policy (D-022) can require a minimum rubric result.
- Alignment gets real data: outcomes become entities with ids; checks, scenarios, and assignments can be tagged with the outcomes they assess (a small editor control), which the automatic alignment items read.

### 3.3 Persona variants (lane C, #23)

- A **variant** is a lesson derived from a master lesson for a named audience: *plain language* or *micro-path* (at most 15 minutes, essentials only). Variants are created by AI from the master, as drafts (D-003).
- Each variant block records the master block it came from and the master's version at sync. When the master changes, affected variant blocks show as **diverged**; the author sees a side-by-side diff and chooses **Resync** (AI rewrites from the new master, as a draft) or **Keep variant**.
- Students get the variant that matches their profile or preset (plain-language reading level → plain variant; a preset with sessions ≤ 15 minutes → micro-path) with a "why" and a way back to the full lesson (principle #7).

### 3.4 Required training, certificates, and managers (lane D, #22)

- **Required training:** an administrator assigns a course or program to people or groups (by role or CSV) with a due date and optional recurrence (annual). It appears first on Today with the due date and status.
- **Test-out:** a course can have a placement check; passing it at or above the threshold completes the course with "tested out" recorded.
- **Certificates:** on completion Tessera issues a certificate (name, course, date, certificate id) as an accessible HTML page and a tagged PDF (pdf-lib), with a public verification URL that shows only validity, course, and date, not the learner's name (decision D4).
- **Audit trail:** append-only completion events (assigned, started, completed, tested out, certificate issued, due date changed) with who and when, exportable as CSV.
- **Managers:** an administrator records who reports to whom. A learner **opts in** per manager from the profile's "Who sees this" panel; a manager's view lists opted-in people's required training, due dates, completion, and certificates. **Never** scores, attempts, tutor chats, or adaptations (principle #9, report §5). Opt-out removes visibility immediately.

## 4. Architecture changes

- New tables: `programs`, `templates`, `template_items`, `rubrics`, `rubric_items`, `readiness_results`, `outcomes` (+ `outcome_links`), `variants` (+ block lineage columns), `requirements`, `completion_events`, `certificates`, `reporting_lines`, `manager_consents`. One migration per lane.
- Contract additions follow Night 2's pattern: `shared/domain.ts`, `shared/api.ts`, zod schemas, OpenAPI, MCP tools where safe (templates and readiness reads; no assignment of required training or certificate issuance through MCP).
- AI tasks: `readiness-item` (judge one AI-assisted item), `variant` (derive or resync a lesson for an audience), both drafts with provenance.
- Background work: variant generation and readiness scans on large courses move to **Cloudflare Workflows** (carry-over), with the poll-driven path kept for demo mode.

## 5. Carry-overs from Night 2

1. **Invitation race:** serialize Access group writes through a Durable Object (one instance per group), so simultaneous invitations can't overwrite each other.
2. **Alt text for images inside PDFs:** extract page images with `pdfimages` in the OCR container, then reuse the Palmyra-X5 suggestion flow; alt text lands in the reading version and e-book (the PDF itself stays unchanged).
3. **OCR second pass:** pages where Tesseract's confidence is low are re-read by Palmyra-X5 and merged into the reading version as an AI draft, labeled as such.
4. **Generation on Workflows:** generation jobs run in the background instead of advancing on polls (keeps the demo path).
5. **#21:** the course home exists in the app (Night 1 + Night 2 assignments list); close it after a check against its criteria, or add the missing template-enforced structure from 3.1.

## 6. Decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| D1 | Built-in rubrics | Tessera standard + OSCQR (CC BY) built in; QM only as a custom rubric an institution loads under its own license. Don't reproduce QM text. |
| D2 | Build in the app or artboards first | App directly, as in Night 2; screenshots reach the docs through docs-sync. Artboards only for the manager view, where privacy boundaries need your review before build. |
| D3 | Manager model | A reporting relationship on any user, not a fourth role; learner opt-in per manager; completion-only visibility. |
| D4 | Certificate verification | Public URL shows validity, course, and date only; the learner's name appears only on their own copy. |
| D5 | Variants shipped first | Plain language and micro-path; the compliance variant is covered by 3.4's test-out and required training. |
| D6 | Readiness and publishing | The rubric result is advisory by default; administrators can make a minimum result block publishing, like the accessibility policy. |

## 7. Orchestration

### Waves
- **Wave 0 (Claude):** contract and migrations for all lanes; the rubric engine core (item kinds, scoring, automatic checks); the template model; the manager privacy rules as code with tests (like the tutor policy in Night 2).
- **Wave 1 (parallel):** lanes A, B UI, C, D service and learner UI.
- **Wave 2:** D manager view, carry-overs, integration, journeys, docs; Codex reviews on the Night 3 PR; release.

### Lanes and agents

| Lane | Area | Agent |
|---|---|---|
| A | Templates, programs, brand, change-set preview | Codex Sol |
| B | Readiness report and rubric UI, outcome tagging | Claude (engine), Codex Sol (UI) |
| C | Persona variants (derive, diff, resync, student delivery) | Codex Sol |
| D | Required training, test-out, certificates, audit trail | Codex Sol |
| D2 | Manager view and consent UI | Grok (parallel to D) |
| E | Carry-overs 1–4 | Claude (1, 4), Codex Sol (2, 3) |
| F | Journeys, docs, release notes | Claude + Sonnet subagent |

Rules from Night 2 stand, plus: briefs name the exact files a lane may edit (shared files are prepared by Claude in Wave 0); every lane's AI output is a draft; Codex reviews the integration PR before release.

### Acceptance journeys
12. **Templates:** an administrator creates a program template; an instructor creates a course in that program and gets the skeleton; deleting a required lesson shows up in the readiness report.
13. **Readiness:** an instructor opens the report, follows a fix link to a block, accepts an AI fix draft, a reviewer attests an item, and the standard's status updates.
14. **Variants:** an author creates a plain-language variant, edits the master, sees the variant diverge, and resyncs; a student with plain reading level gets the variant with a why and a way back.
15. **Required training:** an administrator assigns a course with a due date; the employee sees it first on Today, tests out, and downloads a certificate; the audit CSV shows the events.
16. **Managers:** an employee opts in; the manager sees completion and certificate but no scores or chats; the employee opts out and the manager's view empties.
17. **Carry-overs:** two simultaneous invitations both land in the Access group; a scanned PDF's images get AI alt-text drafts.

## 8. Risks

- **Rubric credibility:** automatic checks must be conservative; AI-assisted findings are drafts with evidence, never auto-passes.
- **Manager privacy:** the most sensitive surface so far; the rules live in one tested module, and the manager view is reviewed by the owner before build (D2).
- **Variant drift noise:** block-level lineage can over-report divergence after small master edits; resync must be cheap and batchable.
- **Certificates as records:** once issued they're evidence; they're immutable, and corrections issue a new certificate with the old one marked replaced.
- **Scope:** five lanes plus carry-overs is Night 2-sized; if time runs short, variants (C) move to Night 4 first.

## 9. Status

**Wave 0 done (2026-09-27, branch `night3`).** Built by Claude except the storage lane (Codex Sol):
- Contract: Night 3 types, zod schemas with type-equality checks, 57 operations with routes and scopes, OpenAPI regenerated.
- Migration `0006_night3.sql` (applied locally and to the preview database, not production): every Night 3 table, the new columns, an outcomes backfill, and triggers that make the audit trail append-only, certificates immutable, and a removed reporting line clear its consent.
- Rules modules with tests: `shared/quality/` (Tessera standard, OSCQR 4.0 verbatim under CC BY 4.0, 13 automatic checks, scoring where AI findings never pass an item on their own), `shared/templates/model.ts` (deviations, change set with hash, apply plan), `shared/managers/policy.ts` (opt-in per manager, completion-only projection, forbidden-field guard).
- AI tasks `readiness-item` and `variant` (fixture and Palmyra prompts).
- App scaffolding: every Night 3 path and an empty route module per lane, mounted.
- Storage (Codex Sol): MemoryRepo and D1Repo for every new method, with contract tests on both.
- Seed: Dana Whitfield (employee, required OPS 101 due 15 Oct), Sam Ortiz (Dana's manager, no sharing yet), and OPS 101 with a test-out.
- Manager view artboard (`design/canvas/ManagerView.dc.html`, screen `manager-view`) **waiting for the owner's privacy review** before lane D2 builds it. Canvas mirror synced.
- Checks: typecheck clean, 307 unit tests, 177/177 accessibility, all journeys pass.

Changes from §4: one migration for all lanes instead of one per lane (lanes never touch migrations); a template's structure is one JSON document instead of a `template_items` table (it's always read and written whole; deviations are found by template keys); program logos are deferred (brand is the accent in Night 3).

**Wave 1 running:** lanes A, B, C, D (Codex Sol, parallel worktrees). D2 waits for the artboard review; E (carry-overs) follows.

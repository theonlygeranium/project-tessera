# Night 2: accessibility, the API, AI authoring at any scope, grading, tutor, accounts

**Status: approved 2026-09-27 (all of §7); Part 1 in progress.** Decisions recorded as D-019 to D-022. Written 2026-09-27 by Claude after reviewing `theonlygeranium/canvas-luma-ops` (Luma Access), the Night 1 codebase, and Cloudflare's current platform docs. Night 1 shipped on 2026-09-27 (tag `night-1`); this plan builds on it (D-011, D-014 to D-018).

Night 2 is deliberately large: about three times Night 1. It runs as three working sessions ("Night 2, parts 1–3"), one integration branch `night2`, continuous merges, and one production deployment at the end of each part, so the owner can test live between parts.

## 1. Goals

1. **Tessera Access:** accessibility becomes a native, always-on part of authoring and learning, adapted from Luma Access and upgraded to current tooling (§3).
2. **A real API:** versioned, token-authenticated, documented from a single contract, with a generated SDK and an MCP server, so administrators and designers can create courses and perform actions from outside the app (§4).
3. **AI authoring at any scope:** an instructor generates a whole course, a module, a lesson, a single element, or any combination, including new element types (documents, scenarios) (§5).
4. **Grading and submissions** at MVP quality; **the hint-first tutor**; **persona presets with why and undo**; **real accounts** (§5).

## 2. Personas and what they get

| Persona | Night 2 |
|---|---|
| **Administrator** | Institution accessibility dashboard and compliance export; API tokens; real accounts by invitation (and Access single sign-on when the institution has it); "View as" for support; accessibility policy (minimum score to publish). |
| **Instructor** | Accessibility score and issues on every lesson, document, and course, with AI-assisted fixes; "Generate" at any scope; documents, scenarios, videos, tables, and files as content; assignments with rubrics, a grading view with AI-drafted feedback, a gradebook; tutor settings per activity. |
| **Student** | Accessible formats for every document (reading view, audio, ePub, OCR text); the hint-first tutor inside lessons; assignments and grades; a persona preset suggested from the profile, with every adaptation explained and undoable. |

## 3. Tessera Access: adapting and upgrading Luma Access

### 3.1 What Luma Access is, and what changes when it's native

Luma Access is a Canvas add-on: a Python (FastAPI) service that pulls a course's files through the Canvas API, scores each file (PDF, DOCX, PPTX, HTML) 0–100 from a weighted issue list, scans Canvas rich content (alt text, heading order, table headers, vague links), generates AI guidance and alt text with Writer, generates alternative formats for students (audio MP3 with gTTS, mobile HTML, ePub, OCR text with Tesseract), and, in V2, previews documents in the browser, highlights issues on the preview, lets the instructor fix alt text and table headers with AI suggestions, patches the file, and writes it back to Canvas. Its specs also planned WCAG mapping, CSV compliance reports, an institution dashboard, contrast and reading-order checks, video captioning, and LTI 1.3 registration.

Inside Tessera, three things get simpler and better:

- **Content is structured.** Tessera lessons are typed blocks, not HTML. Checks run on the model itself (no parsing), at the moment of authoring, and in the publish gate that already exists. Fixes are edits to blocks, made as AI drafts a person keeps (D-003). Luma's "Edit in Canvas" deep link becomes unnecessary: the fix is inline.
- **No integration layer.** No Canvas API, no nginx script injection, no LTI, no separate login. The scanner is part of the Worker; results live in D1; files live in R2.
- **Students get formats where the content is.** Luma injected a button into Canvas file lists. In Tessera, every document block has an "Accessible formats" menu in the lesson player.

### 3.2 Upgrade audit: each Luma component, its current state, and the Tessera-native replacement

Evidence column: what was verified on 2026-09-27, or the source.

| Luma component | State in Luma | Tessera Night 2 | Why, and evidence |
|---|---|---|---|
| Scoring (0–100, severity penalties, grades) | Good idea, opaque formula | Keep the score and grade; publish the formula; add **WCAG 2.2 success criterion, level, and title** on every issue (from Luma's Tier 3 table, extended to 2.2) | Institutions need dated, mapped evidence; Luma's specs cite DOJ Title II. |
| Rich-content checks (alt, heading order, tables, vague links, empty headings) | BeautifulSoup over HTML | Native **block checks** in `shared/access/`: alt text and decorative flags, heading order, empty headings, link text, table headers, color-only wording ("in red"), reading level (plain-language estimate), check-block completeness, video captions/transcript present, document score rolled up | Runs in the editor instantly (shared code runs in the browser too) and in the server-side publish gate. |
| PDF checks (pdfminer heuristics: no text, no title, no language, images, "no headings" guess) | Heuristic; Luma's Tier 7 wanted a real tag-tree walk | **pdfjs-dist** in the Worker: real structure tree (`getStructTree`), text layer, image operators, metadata; issues: untagged, no text (scanned), no title/language, images without alt in the tag tree, reading order from the tree | Same library that renders the preview; no Python. |
| DOCX / PPTX checks (python-docx, python-pptx) | Good coverage; PPTX alt bug fixed in Tier 0 | **JSZip + XML** parsing in the Worker: language, headings styles, images without `descr`, table header rows, tiny text, slide titles, notes, small fonts; add Luma Tier 4's **contrast** checks (font color vs fill) | DOCX/PPTX are zip + XML; parsing in TypeScript is direct. |
| Alt text AI (Writer `palmyra-x-004` vision, with text fallback) | Model retired from Writer's current list | **Palmyra-X5** (vision) through AI Gateway, with **Workers AI `moondream3.1`** as fallback; alt text is produced as an AI draft on the block or file fix | Tested: X6 returns "does not support multimodal"; X5 returned a good alt text for a Tessera screenshot. |
| Guidance, rewrites (plain language) | Palmyra text | **Palmyra-X6** (already wired): issue guidance, plain-language rewrite, link-text suggestions, all as labeled drafts | Same client as Night 1. |
| Audio format (gTTS) | Unofficial Google TTS, robotic | **Workers AI Deepgram Aura-2** text-to-speech, cached in R2 per document version | Cloudflare-hosted partner model; no key, no scraping. |
| OCR (Tesseract) | Server dependency | **Workers AI `moondream3.1`** (OCR-capable vision) page by page, or Mistral Small 3.1 vision; result stored as the document's text layer | No binary dependencies. |
| Mobile HTML and ePub (ebooklib) | Fine | Reading view rendered from the extracted structure; **ePub 3** built with JSZip (WCAG-aligned EPUB accessibility metadata) | Pure JavaScript. |
| Preview (pdf2image, LibreOffice, mammoth) | LibreOffice never installed (Tier 1 deviation) | **PDF.js** in the browser for PDFs; **mammoth.js** for DOCX (it's originally a JavaScript library); Tessera's own PPTX-to-HTML renderer (Luma had one in Python) | No server rendering. |
| Issue positions and overlays (pdfplumber boxes, canvas overlay) | Built for PDF and PPTX | Same idea: PDF.js gives image and text positions; overlays drawn in React; DOCX/PPTX previews mark elements by id | |
| Fix and patch (pikepdf, python-docx, python-pptx; write back to Canvas) | Works for DOCX/PPTX; PDF alt text is hard | **DOCX/PPTX patching** (edit `descr`, header rows, language, title in the XML) and **PDF metadata** (title, language via pdf-lib). PDF alt text in the tag tree stays out of scope; the fix is offered as a new accessible version (reading view, ePub) plus the alt text stored in Tessera. Patched files are new **versions** in R2, never overwrites; the original stays. | Honest about PDFs, as Luma's own doc was. |
| Job state (JSON on disk, Redis planned) | Fragile | D1 tables (`scans`, `scan_issues`, `document_versions`, `format_jobs`) | |
| Background scanning (FastAPI background tasks) | OK | Scans run **inline on upload** with the Worker's CPU limit raised (needs Workers Paid; §7 D1). Queues can't run in branch previews, so no queue for Night 2; a Workflow for large files is a Night 3 option. | Cloudflare: previews can produce to Queues but not consume; CPU limit is configurable to 5 min on Paid. |
| Video captions (Tier 5: Whisper) | Planned | Video blocks require captions or a transcript to publish; **Workers AI Deepgram Nova-3** transcribes uploaded media into a transcript draft (stretch) | Cloudflare-hosted; no GPU to manage. |
| Compliance reporting (Tier 3) | Planned | Course and institution dashboards, trend history, **CSV export** with WCAG columns, per-course "nudge instructor" draft | |
| Institution dashboard (Phase 6) | Planned | Administrator overview: score distribution, worst courses, most common issues, trend | |
| Auth (X-Luma-Token, nginx injection, LTI planned) | Canvas-specific | Not needed: Tessera's own roles and the API framework (§4) | |
| Student injector (`student_inject.js`) | Canvas-specific | The "Accessible formats" menu on document blocks in the player | |
| Dark theme, Canvas admin tools, MCP for Canvas | Canvas-specific | Out of scope (the Tessera MCP server in §4 is the analogue) | |

### 3.3 What ships

**Engine (`shared/access/` and `worker/access/`)**
- `checkBlocks(lesson)` → report (issues with WCAG mapping, severity, block id, score); replaces `lessonReadiness` internally and keeps its shape.
- `checkDocument(file)` → report for PDF, DOCX, PPTX, plus text extraction, image list, and positions.
- `scoreCourse`, `scoreInstitution`, trend history.
- Fix actions: AI alt text (X5 vision), plain-language rewrite (X6), link-text suggestion (X6), table header marking, metadata autofix; every AI output is a draft.
- Format generation: reading view (HTML), audio (Aura-2), ePub 3, OCR text; cached per document version in R2.

**Instructor UI**
- Every lesson shows its accessibility score and issues next to publish readiness (the Night 1 panel grows into this); every issue links to its block with a fix control.
- **Document remediation editor:** preview (PDF.js, mammoth, PPTX renderer) with highlights; issue panel with AI suggestions, Use / Edit / Decorative, Save & next; progress "3 of 7 fixed"; Save as new version.
- Course accessibility page: all lessons and documents ranked, common issues, trend.

**Administrator UI**
- Institution accessibility dashboard, CSV export, policy: minimum accessibility score and blocking severities for publishing (enforced by the server), nudge drafts.

**Student UI**
- "Accessible formats" on every document: reading view, audio, ePub, OCR text; formats generate on first request and are cached.

**Naming:** the product area is called **Access** in navigation ("Tessera Access" in docs). The public docs never mention Luma or Canvas (D-012); the lineage is recorded here.

## 4. The API framework

### 4.1 What exists

Night 1's API is a single typed contract (`shared/api.ts`): 51 operations, each with an HTTP route and a role rule, implemented once in `shared/service/` and served by the Worker. That's a strong base: one source of truth, enforced roles, shared by the app's mock mode and the server. What it lacks for external use:

| Gap | Effect today |
|---|---|
| Only browser sessions can call it (Access JWT plus a persona cookie) | No script, CLI, agent, or partner system can create a course |
| No version prefix | Any change is a breaking change |
| Types only at compile time | Bodies are validated by hand per handler; no machine-readable spec |
| No pagination, idempotency, or rate limits | Fine for one institution's demo data, not for imports or automation |
| No reference docs or client | Every caller reads TypeScript |

### 4.2 Recommendation (lane A)

1. **`/api/v1/`** with the contract as the single source: `/api/` keeps working for the app during Night 2 and is removed in Night 3.
2. **Runtime schemas.** Each operation's input and output becomes a Zod schema next to its type (Zod 4). The Worker validates every request against it (uniform 400s with field paths), and the build emits **OpenAPI 3.1** (`docs/api/openapi.json`) from the same schemas. Hand-written validators in `shared/service/validate.ts` are replaced.
3. **API tokens.** Administrators (and instructors, for their own courses) create scoped tokens (`courses:read`, `courses:write`, `content:write`, `people:write`, `access:read`, `grades:write`, …) on an API tokens page. Tokens are shown once, stored hashed in D1 with scopes, owner, last use, and expiry, and sent as `Authorization: Bearer tsk_…`. The Worker accepts **either** a valid Access JWT (browser) **or** a valid token, and the role rules and resource checks apply to the token's owner and scopes.
4. **Cloudflare Access change:** `/api/*` leaves the Access application (the browser still sends the Access cookie, which the Worker verifies as today); `/app/*` stays behind Access. Without this, external callers can't reach the API at all.
5. **Conventions:** cursor pagination on every list; `Idempotency-Key` on creates; a `Retry-After`-honoring rate limit per token (Worker-side counters); the existing error envelope; `X-Request-Id` on every response.
6. **Documentation:** the OpenAPI spec is published on the docs site as a generated API reference (Mintlify renders OpenAPI), with a quickstart ("create a course from a script").
7. **Import:** `POST /api/v1/courses/import` accepts a course as JSON (modules, lessons, blocks, documents by URL) so a designer can build a course from a file; Common Cartridge is a Night 3 candidate.
8. **SDK and MCP server (lane I):** a generated TypeScript client (`sdk/`, from the spec) and a **Tessera MCP server** exposing the same operations as tools (create course, add module and lesson, import content, run an accessibility scan, list issues, publish) authenticated by a token. This lets Claude, Codex, Grok, and Writer agents operate Tessera directly, which is how the owner already works.
9. **Webhooks** (stretch): an events table and outbound delivery for `lesson.published`, `submission.created`, `scan.completed`; delivery runs in production only (previews can't consume queues).

## 5. The rest of the package

### 5.1 Content model expansion (lane C)
New block types, each with an editor, a player, an accessibility check, and an AI generator:
- **Document**: a long-form handout rendered in the reading view and exportable as accessible HTML, ePub, and DOCX.
- **File**: an uploaded PDF/DOCX/PPTX (R2), scanned by Access, with the formats menu for students.
- **Video**: a URL embed (YouTube, Vimeo) or upload, with required captions or transcript.
- **Table**: rows and columns with header cells.
- **Scenario** ("simulation"): a branching decision practice, with a situation, choices, consequences, and feedback per path; playable in the lesson; generated by AI from the lesson's objective and sources.
- **Link** and **embed** (allow-listed).
Plus **assignment** as a module item alongside lessons (§5.3).

### 5.2 AI authoring at any scope (lane D)
- A **Generate** control on the course, each module, each lesson, and each block, and a **scope picker** in the builder: "everything", selected modules, selected lessons, selected element types (for example "documents and scenarios for Module 2, checks for every lesson").
- Generation runs per element with the Night 1 pipeline (brief → outline → drafts), parallelized, with progress; every output is a draft (D-003).
- Element generators: document, scenario, video script and transcript, table, knowledge check, and "regenerate this module in a different tone".
- Prompts and schemas in `worker/ai/`, on Palmyra-X6 (structured JSON, the Night 1 hardening applies).

### 5.3 Assignments, submissions, grading, gradebook (lane E)
The MVP level of "good":
- **Assignment** item: instructions (blocks), submission type (text, file upload, or link), due date, points, an optional rubric (criteria × levels with points).
- **Student:** submit, resubmit once before the due date, see status, grade, rubric result, and feedback.
- **Instructor:** a grading view with the submission and the rubric side by side (D-002); score per criterion; **AI-drafted feedback** from the rubric result and the submission (a labeled draft the instructor edits or keeps, D-003); release grades per assignment; a simple **gradebook** per course with CSV export.
- Out: late policies, groups, peer review, weighted categories, integrations.

### 5.4 The hint-first tutor (lane F, #19, D-005)
- A **TutorPanel** in the lesson player: chat, hints counted, worked parallel examples, never the answer on graded work; sources are the lesson's published blocks and the course's sources; the answer key is never a source.
- **Tutor settings per activity** (instructor) within the administrator's limits, with locked options explained.
- Learners always see the mode, who set it, and what the instructor can see; instructors get per-learner summaries (not transcripts).
- Palmyra-X6 with server-side system prompts; every exchange logged for the summary.

### 5.5 Persona presets, why, and undo (lane H, #18)
- From the profile, the server suggests a preset (for example "Working learner: 15-minute sessions, evening reminders") as an AI note; the student applies or ignores it.
- Adaptations become data: session length, task ordering, reminder timing, reading level. Each shows a "why this changed" line and **Undo** on Today (principle #7).

### 5.6 Real accounts (lane G)
- Cloudflare Access is the identity provider: the Worker maps the Access email to a Tessera user. No passwords in Tessera.
- **Invitations:** an administrator adds a person (name, email, role); Tessera adds the email to an Access **group** that the app policy allows (the Worker calls the Cloudflare API with a scoped token). The person signs in with a one-time PIN, or with the institution's single sign-on once it's configured in Access.
- The persona picker stays in mock mode and, for administrators, as **"View as"** for support and QA.
- Sessions, sign-out, and "who am I" come from Access, not a cookie.

### 5.7 Quality (lane J)
- Journeys for every new flow; the accessibility audit covers every new page; the stripe guard stays on.
- Docs: Access, API reference, release notes; screenshots auto-sync.
- The evaluation plan (#28) runs against Night 2 once it's live.

## 6. Architecture changes

- **Workers Paid plan** (§7 D1): raises CPU per request to minutes, enables Queues, Workflows, and Containers.
- **R2 bucket** `tessera-files` (and `tessera-files-preview`) for uploads, versions, and generated formats, bound in `wrangler.jsonc` and `previews`.
- **Workers AI binding** (`AI`) for Aura-2, moondream, Nova-3, with AI Gateway in front for logs.
- **Cloudflare API token** (scoped: Access groups write) as a Worker secret for invitations.
- **D1 migrations** `0002_night2.sql`: api_tokens, idempotency_keys, files, document_versions, scans, scan_issues, format_jobs, assignments, submissions, rubrics, grades, tutor_sessions, tutor_messages, adaptations, invitations, events.
- **Zod** added as the one new runtime dependency in `shared/`; pdfjs-dist, jszip, mammoth, pdf-lib in the Worker; `openapi-typescript` for the SDK.

## 7. Decisions for the owner

| # | Decision | Recommendation | Alternatives |
|---|---|---|---|
| **D1** | Cloudflare plan | **Upgrade the account to Workers Paid ($5/month)**. Required for document scanning, format generation, and Containers; the free plan's 10 ms CPU limit can't parse a PDF. | Keep free and run the document engine on Schubert as a service the Worker calls (adds a second host and the Canvas-era operational burden). |
| **D2** | Name | **"Access"** in the product and "Tessera Access" in docs; Luma is credited only in private handoff notes. | Keep "Luma Access" as the feature name. |
| **D3** | API exposure | **Remove `/api/*` from the Cloudflare Access app**; the Worker enforces Access JWT or API token. | Keep `/api` behind Access and require an Access service token for every external caller (each caller needs two secrets). |
| **D4** | Identity | **Access as the identity provider**, with Tessera managing an Access group through the Cloudflare API for invitations. | Email magic links issued by Tessera (more code, weaker than Access). |
| **D5** | Alt-text model | **Palmyra-X5 vision** primary, Workers AI moondream fallback. | Workers AI only. |
| **D6** | Grading scope | The MVP in §5.3. | Add late policies or groups now. |
| **D7** | Video | URL embeds with required captions or transcript; auto-transcription of uploads as a stretch. | Uploads with auto-captions in scope from the start. |
| **D8** | Cloudflare resources to create (need your go-ahead) | R2 buckets, Workers AI binding, an Access group and policy change, a scoped Cloudflare API token, the plan upgrade. | Approve one at a time. |

## 8. Orchestration

### Waves and parts

| Part | Waves | Delivers to production |
|---|---|---|
| **Part 1** | Wave 0 (contract v2, API framework, R2, migrations, new block types' data model) → Wave 1 (lanes A, B-engine, C, G) → regroup | API v1 with tokens, OpenAPI, SDK; new block types; real accounts; Access engine on lessons |
| **Part 2** | Lanes B-UI, D, E, I → regroup | Document remediation editor and student formats; AI authoring at any scope; assignments and grading; MCP server |
| **Part 3** | Lanes F, H, dashboards, J → regroup | Tutor; presets with why/undo; accessibility dashboards and exports; docs; journeys; release notes |

### Lanes and agents

| Lane | Area | Owns | Agent |
|---|---|---|---|
| A | Contract v2, API framework, tokens, OpenAPI, import, Access change | `shared/`, `worker/api/`, `wrangler.jsonc` | Claude |
| B | Access engine (checks, parsers, fixes, formats), remediation editor, formats menu, dashboards | `shared/access/`, `worker/access/`, `app/src/features/access/` | Claude (architecture, checks, WCAG map); Codex Sol (parsers, fixes); Grok (remediation UI); Astra + Grok review |
| C | Block types, uploads, players and editors | `app/src/features/content/`, `worker/files/` | Codex Sol ×2 (editors; players) |
| D | AI authoring at any scope, scenario and document generators | `worker/ai/`, `app/src/features/builder/` | Claude (prompts); Codex Sol (UI) |
| E | Assignments, submissions, grading, gradebook | `app/src/features/grading/`, service modules | Codex Sol; Grok (gradebook) |
| F | Tutor | `worker/ai/tutor/`, `app/src/features/tutor/` | Claude (policy, prompts); Codex Sol (panel) |
| G | Accounts, invitations, view-as | `worker/identity/`, `app/src/features/admin/people` | Claude (Access group); Grok (UI) |
| H | Presets, why, undo | `app/src/features/student/` | Codex Sol |
| I | SDK and MCP server | `sdk/`, `mcp/` | Claude subagent (Sonnet) |
| J | Quality, docs, release notes | `tests/e2e/`, `mintlify/` | Claude subagent (Sonnet); Astra reviews |

Rules from Night 1 stand: one owner per directory, contract first, small merges, Claude reads every diff, workers never push, the stripe guard and a11y audit run on every merge, Grok writes its report to a file, and preview secrets are re-applied after each push.

### Acceptance journeys (in addition to Night 1's five)
6. **API:** an administrator creates a token → a script creates a course with two modules and imports a lesson → the course appears in the app → the token is revoked and the script gets 401.
7. **Access:** an instructor uploads a PDF and a PPTX → scores appear → they fix two alt texts with AI suggestions and mark one image decorative → the score rises → a student opens the file's audio and reading view.
8. **Authoring at scope:** an instructor selects Module 2 and "documents and scenarios" → drafts appear → they play the scenario as a student.
9. **Grading:** a student submits a file → the instructor grades with the rubric and keeps an AI-drafted feedback → the student sees the grade.
10. **Tutor:** a student asks for the answer on a graded check → the tutor gives a hint; on a practice item in Open mode it answers; the instructor sees a summary, not the transcript.
11. **Accounts:** an administrator invites a person → they sign in through Access → they land in the right persona; "View as" works for the administrator.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Document parsing hits CPU or memory limits on big files | Paid plan's 5-minute CPU; size limit 50 MB; a Workflow or Container in Night 3 for outliers |
| Palmyra-X5 vision quality or availability | Workers AI moondream fallback; every alt text is a draft a person keeps |
| The Access change exposes the API | Token auth is enforced before any handler; rate limits; the app path stays behind Access; Astra and Grok review the auth code |
| Scope is large | Three parts, each shippable; the cut list is everything not in §3 to §5 |
| Invitations depend on a Cloudflare API token | Scoped to Access groups only; stored as a secret; failures fall back to "ask your administrator" |

## 10. Status

Branch `night2`. Workers Paid verified 2026-09-27.

- **Wave 0 done (2026-09-27):** contract v2 (`shared/domain.ts`, `shared/api.ts`), `/api/v1` with scoped tokens, identity mapping, rate limit, idempotency, runtime zod validation (`shared/schema/`), OpenAPI at `docs/api/openapi.json`, Tessera Access core (`shared/access/`, services, repo storage), document engine (`worker/access/`), grading (service + pages). 145 tests.
- **In progress:** lane C block editors and players (Grok); `worker/access/engine.ts` (DocumentEngine over the parsers, Palmyra-X5 alt text, accessible formats); upload and content routes.
- **Not started:** lanes B (Access UI), D (AI authoring at scope), F (tutor), G (invitations; needs the owner's scoped Cloudflare token), H (presets), I (SDK + MCP), J (journeys, docs, release notes). `0002_night2.sql` is applied to preview and local, not to `tessera-prod`.

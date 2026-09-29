# Decision log

Settled decisions for Project Tessera, with the reason for each. Agents should treat **Accepted** decisions as constraints. To change one, open an issue that argues for it, get the owner's approval, then add a new entry that supersedes the old one. Don't edit an old entry to reverse it.

| ID | Decision | Status | Date |
|---|---|---|---|
| D-001 | "Tessera" is a working codename, not the product name | Accepted | 2026-09-26 |
| D-002 | Borrow Canvas's backbone: modules are the spine | Accepted | 2026-09-25 |
| D-003 | AI is a governed co-author and a hint-first tutor; drafts never auto-publish | Accepted | 2026-09-25 |
| D-004 | Personalize on evidence-based variables; no "learning styles" | Accepted | 2026-09-25 |
| D-005 | Tutor modes and who controls them | Accepted | 2026-09-26 |
| D-006 | AI visual language: Marginalia; no stripes, sparkles, or gradients | Accepted | 2026-09-26 |
| D-007 | Visual system: paper, ink, one teal accent, violet for AI; Fraunces + Plex | Accepted | 2026-09-25 |
| D-008 | Hosting: private repo, public Pages from `main:/docs`, build output committed | Superseded by D-012 | 2026-09-26 |
| D-009 | The repo is the source of truth; the design canvas is a mirror | Accepted | 2026-09-26 |
| D-010 | Accessibility bar: WCAG 2.2 AA, zero automated violations, 320px reflow | Accepted; audit timing superseded by D-013 | 2026-09-26 |
| D-011 | Phase-2 build approach: B, a Vite + React component app built by Cloudflare | Accepted | 2026-09-26 |
| D-012 | Hosting: Cloudflare Workers static assets, deploy on push, per-branch previews | Accepted | 2026-09-26 |
| D-013 | Deploy lanes: minor changes go straight to production; big features get the full check and a preview | Accepted | 2026-09-26 |
| D-014 | Night 1 backend and access: one Worker + D1, demo persona sign-in, `/app` and `/api` behind Cloudflare Access | Accepted | 2026-09-27 |
| D-015 | Platform LLM: WRITER Palmyra-X6 through Cloudflare AI Gateway, with a deterministic fixture provider | Accepted | 2026-09-27 |
| D-016 | Night 1 scope and milestone model: "Night N" coordinated releases for administrator, instructor, and student | Accepted | 2026-09-27 |
| D-017 | No colored edge stripes on any element, for any purpose | Accepted | 2026-09-27 |
| D-018 | Marginalia gutter marks become a drawn proofreader's family: balloon, pilcrow, caret | Accepted | 2026-09-27 |
| D-019 | Night 2 platform: Workers Paid, R2 for files, Workers AI for audio/OCR/vision fallback, Palmyra-X5 for alt text | Accepted | 2026-09-27 |
| D-020 | The API: `/api/v1`, runtime schemas that generate OpenAPI, scoped tokens, `/api` outside Cloudflare Access | Accepted | 2026-09-27 |
| D-021 | Identity: Cloudflare Access is the identity provider; Tessera invites by managing an Access group | Accepted | 2026-09-27 |
| D-022 | Tessera Access: accessibility is native, adapted from Luma Access; "Access" in the product | Accepted | 2026-09-27 |

---

### D-001 · "Tessera" is a working codename
The owner hasn't chosen a product name. "Tessera" means a mosaic tile: modular blocks that compose into a course. The repo is `theonlygeranium/project-tessera`. In the mockups, "Meridian State" is a fictional institution and every person, course, and number is illustrative.
**Consequence:** don't design a logo or brand around "Tessera." A final name gets its own decision.

### D-002 · Borrow Canvas's backbone
Canvas has about 50% of North American higher-ed enrollment, but it wins on structure (modules, fast grading, reliability, LTI), not on measured usability (faculty SUS of 68.9). Report §3.
**Decision:** use one course → module → lesson → block hierarchy everywhere. Grading is SpeedGrader-style: submission and rubric side by side. A unified "Today" list is the entry point.
**Consequence:** AI features edit this structure and never create a parallel one (principle #1).

### D-003 · AI is a governed co-author and a hint-first tutor
Unguarded GPT-4 raised practice scores but lowered exam scores; a guarded, hint-giving tutor avoided that harm (Bastani et al., PNAS 2025). A scaffolded tutor beat active learning (Kestin et al., 2025). Report §4.
**Decision:**
- Every AI output is a labeled draft with its source, a diff, and Accept / Revert / Regenerate. A person must mark it kept before learners see it.
- Agentic bulk actions appear as previewable change sets.
- The tutor gives hints and worked parallel examples, not answers, unless policy allows.

### D-004 · Personalize on evidence, not learning styles
Style-matching lacks the crossover evidence it needs (Pashler 2008; a 2024 meta-analysis found only 26% of outcomes showed the required crossover). Report §5.
**Decision:**
- Personalize on goals, role, time, prior knowledge, language and reading level, accessibility, device and bandwidth.
- Offer every format to everyone.
- Show every adaptation with a "why" line and an Undo.

### D-005 · Tutor modes and control
**Decision:**
- There are four modes: **Off / Hints / Explain / Open**.
- Admins set limits per program. For example, Graduate certificates don't allow Open on graded work.
- Instructors choose a mode per activity within those limits. Locked options show why they're locked.
- The answer key is never a tutor source.
- Learners always see which mode is on, who set it, and what the instructor can see.
- Instructors see per-learner summaries. Full transcripts open only from a submission.

Screens: `TutorSettings.dc.html`, `AdminConsole.dc.html`.

### D-006 · AI visual language: Marginalia
The owner rejected the colored left-stripe card as "AI slop." Four alternatives were explored (`docs/explorations/ai-voice.html`) and the owner chose **Marginalia**:
- a gutter glyph: ※ for the tutor and co-author, ¶ for drafted blocks, † for summaries *(superseded by D-018: drawn balloon, pilcrow, and caret marks)*
- a small-caps serif attribution naming the source
- serif body text
- numbered footnotes for sources

The other three styles (`tabs`, `perforated`, `tiles`) are kept and can be switched in.
**Rules:**
- All AI content uses the markup contract in `design/DESIGN-NOTES.md` (`.ai`, `.ai-who`, `.ai-body`, `.ai-cites`, `.ai-actions`).
- Never use colored left stripes, sparkle icons, or gradients to signal AI.
- Change the site-wide style only through `DEFAULT` in `docs/assets/ai-voice.js`.

### D-007 · Visual system
The palette is a warm paper ground (`#F4F1EB`), ink (`#1C1B19`), one accent (teal `#0E6B63`), and violet (`#5B4BAF`) reserved for AI. The typefaces are Fraunces for titles, reading text, and AI voice, IBM Plex Sans for UI, and IBM Plex Mono for shortcuts. Learner screens use comfortable density; instructor and admin screens use compact density.
**Rules:**
- Warning **text** is `#7A5310`. `#9A6A12` is for non-text marks only.
- Tokens live in `design/tokens.json`.

### D-008 · Hosting · SUPERSEDED by D-012
**Decision (historical):**
- The repository is **private**; the GitHub Pages site is **public**.
- Pages serves `main` / `/docs` directly. There's no Actions workflow; it was removed. The build output (`docs/screens/`, `docs/research.html`, `docs/screens.json`) must be committed.
- Nothing on the site may link into the repository, and nothing under `docs/` may be confidential.

### D-009 · The repo is the source of truth; the design canvas mirrors it
The owner's private Claude design canvas ("AI-Native LMS UI Concepts") holds the same artboards for visual review.
**Decision:** edit `design/canvas/*.dc.html` in the repo, then sync to the canvas. The sync procedure is in `CLAUDE.md`. If the canvas has edits that aren't in the repo, merge them into the repo first.

### D-010 · Accessibility bar
**Decision:**
- Meet WCAG 2.2 AA.
- `npm run a11y` (axe-core plus a 320px reflow check) must report zero violations before merging. The current result is 43/43. *(When the audit runs is superseded by D-013: minor changes are checked by the `a11y` workflow after they're live. The zero-violation bar itself still stands.)*
- Keyboard paths must work with visible focus, and focus returns to the control that opened a panel.
- Screen-reader testing is a human task (#29).

### D-011 · Phase-2 build approach · ACCEPTED (option B, React)
Chosen by the owner on 2026-09-26 in #16.
**Decision:**
- **Option B:** a component prototype app in `app/`, built with Vite + React + TypeScript, with Storybook added alongside the first shared components (#17). The build output goes to `docs/app/` and is served at `/app/`.
- **Cloudflare builds it on every push.** Build output is not committed (`docs/app/` is gitignored). The build command lives in the repo, in `wrangler.jsonc` → `build.command` (`npm run build`), which `wrangler deploy` and preview builds run before uploading `docs/`. Nothing needs changing in the Cloudflare dashboard.
- Deploy speed matters less than cleanliness: the owner accepts a longer build as long as a push is previewable within a few minutes.
- The `design/canvas/` artboards and the existing `docs/` site stay as they are. The artboards remain the visual spec; components become the source of truth for UI as they're built.
- Design tokens come from `design/tokens.json` only; app code doesn't hard-code colors.
- Verified 2026-09-26: Workers Builds ran `npm run build` for the `phase2/app-skeleton` preview (41 s from push to built preview) without any dashboard change.

**Destination: a full-stack app (owner, 2026-09-26).** Option B is the starting point, not the end state. Tessera should grow into option C (backend, authentication, database, real AI calls) without a rewrite, so Phase 2 work must keep these foundations:
- **One Cloudflare Worker.** The Worker that serves `docs/` today can gain a Worker script (`main` in `wrangler.jsonc`) for `/api/*` routes plus bindings: D1 (database), KV (sessions and cache), R2 (uploaded course files), and Workers AI or AI Gateway (tutor and co-author calls). The static site and the app keep being served as assets from the same deploy.
- **A data layer between UI and data.** Components get data through a small typed interface (for example `app/src/data/`), backed by mock data now and by `fetch('/api/...')` later. Components never import fixtures directly.
- **Shared TypeScript types** for the domain (course → module → lesson → block, D-002; tutor modes, D-005; AI draft states, D-003), reusable by the future API.
- **Routing and state that survive real data:** client-side routing inside `/app/`, no assumptions that data is static or local.
- **Policies built in from the start:** AI output as drafts with provenance, tutor modes, and "who sees what" modeled as data now, so they become server-enforced rules later rather than UI-only behavior.
- Revisit *when* to add the backend after the #28 usability tests.

The options as they were weighed:

| | A. Stay static | B. Component prototype app (recommended) | C. Full-stack app |
|---|---|---|---|
| Stack | Hand-written HTML/CSS/JS, `.dc.html` artboards | Vite + React or Svelte + Storybook; tokens from `tokens.json`; static build into `docs/` | B plus backend, auth, database, real LLM calls |
| Speed to more screens | Fastest | Slower at first, faster after about 5 components | Slowest |
| Reuse and consistency | Low; inline styles are duplicated | High; one component per pattern, with states in Storybook | High |
| Prototype fidelity | Scripted flows only | Realistic state and routing; mock data layer | Real data and AI |
| Design canvas mirror | Works as today | Artboards stay as design specs; components become the source of truth for UI | Same as B |
| Hosting | Cloudflare as today (D-012) | Cloudflare Workers Builds runs the build; set a build command (D-012) | Worker script + bindings on the same Worker; D-012 extends |
| Main risk | Drift and rework as scope grows | Setup cost; the canvas and components can diverge | Premature before user testing (#28) |
| Good fit if | More exploration, few flows | Phase 2 as described: more design **and** building, then user tests | Pilot with a real institution |

Recommendation: **B**, keeping `design/canvas` artboards as the visual spec, with components in a new `app/` folder built into `docs/app/`. Revisit C after the #28 usability tests.

### D-012 · Hosting: Cloudflare Workers static assets
Supersedes D-008. The owner is the sole developer and wants every push testable live without review stages, with everything recorded in GitHub. Cloudflare recommends Workers static assets over Pages for new projects, and Workers Builds gives a stable preview URL per branch.
**Decision:**
- The site is served by the Worker **`project-tessera`** on the owner's personal Cloudflare account, configured by `wrangler.jsonc` (assets directory `./docs`, no Worker script, `404.html` for not-found, and the empty `previews` block that `wrangler preview` requires). Production: https://tessera.edstratumlabs.ai/ (custom domain on the `edstratumlabs.ai` zone, declared in `wrangler.jsonc` `routes`; the `workers.dev` URL also works).
- Workers Builds is connected to the GitHub repo. A push to `main` deploys production (`npx wrangler deploy`). A push to any other branch runs `npx wrangler preview`, which creates a Preview with its own stable URL (`<branch>-project-tessera.jeff-f69.workers.dev`, sent with `X-Robots-Tag: noindex`). Cloudflare posts build status back to the commit.
- For now there is no build command: `docs/` build output stays committed, because Cloudflare serves `docs/` as-is. GitHub Pages was unpublished on 2026-09-26. When D-011 lands, set the build command in the Worker's build settings (and record it in `CLAUDE.md`). *(D-011 landed: the build command is set in `wrangler.jsonc` rather than the dashboard.)*
- `.github/workflows/a11y.yml` runs the accessibility audit on every push and PR. It is informational and does not block deploys; the Definition of Done still requires a clean audit.
- Unchanged from D-008: the repository is private, the site and every preview URL are public, nothing under `docs/` may link into the repository or be confidential. If something must be private, put Cloudflare Access in front of it.

### D-013 · Deploy lanes
Partly supersedes D-010 (when the audit runs) and extends D-012. The owner is the sole developer and tests changes live, so review stages before production slow the work down without catching much that the owner won't see immediately. Approved by the owner on 2026-09-26.
**Decision:**
- **Fast lane, for any normal minor change** (copy, styling tweaks, a fix in one screen or the prototype, small doc updates): edit the source, rebuild `docs/` if artboards or the report changed, commit, and push straight to `main`, which deploys production in about 30 seconds. No local audit, walkthrough, or approval step.
- **Full lane, for big features or separate, self-contained work** (a new flow or screen, the D-011 migration, anything touching many files): follow the full Definition of done in `CLAUDE.md`, push a branch, check its preview URL, then merge to `main`.
- The zero-violation accessibility bar (D-010) still stands in both lanes. In the fast lane the `a11y` workflow checks each push after it's live; a failure is fixed in a follow-up push. The current result is 45/45.
- Worker agents (`AGENTS.md`) never push; Claude pushes after reading their diff.
- Unchanged: destructive actions (force pushes, deleting branches or data, Cloudflare or DNS changes) need the owner's confirmation, and nothing confidential goes under `docs/` (D-012).

### D-014 · Night 1 backend and access
Extends D-011 (the full-stack foundations) and D-012. Night 1 is a working MVP with stored data, so it needs a backend, but the public site must not expose a writable app. Approved by the owner on 2026-09-27 (`handoff/NIGHT-1-PLAN.md` §6).
**Decision:**
- The Worker `project-tessera` gains a script (`worker/`) that serves `/api/*`; everything else is still served from the static assets.
- Data lives in **D1**: `tessera-prod` (production) and `tessera-preview` (every branch preview, set under `previews` in `wrangler.jsonc`). Schema changes are migrations in `migrations/`.
- **Sign-in is a demo persona picker** with seeded, fictional accounts. Real accounts (passwords, SSO, magic links) are a later Night.
- **Cloudflare Access** app "Tessera app and API" guards `/app` and `/api` on `tessera.edstratumlabs.ai`, `project-tessera.jeff-f69.workers.dev`, and every `*-project-tessera.jeff-f69.workers.dev` preview. Only the owner (one-time PIN to `jeff@jgeronimo.com`) is allowed for now; testers are added as extra `include` rules. The rest of the site (gallery, screens, prototype, Storybook) stays public.
- The Worker also verifies the Access JWT (`Cf-Access-Jwt-Assertion`, audience tag of the Access app) on every `/api` request, so the API is safe even if Access is misconfigured. Local development skips the check.

### D-015 · Platform LLM: Palmyra-X6
Supersedes the Claude API recommendation in the Night 1 plan draft. The owner uses WRITER's Palmyra-X6 extensively for R&D and wants Tessera's AI built on it. Verified on 2026-09-27: `palmyra-x6` answers through WRITER's OpenAI-compatible API (`https://api.writer.com/v1/chat/completions`) and returns valid JSON for a strict `json_schema` response format (a 3-module outline in about 3.5 s). Approved by the owner on 2026-09-27.
**Decision:**
- In-product AI (the course builder, the announcement assist, and the stretch tutor) calls **Palmyra-X6** through **Cloudflare AI Gateway** `tessera`, custom provider `writer` (`https://gateway.ai.cloudflare.com/v1/<account>/tessera/custom-writer/v1/chat/completions`). The gateway adds logs, rate limits (120 requests a minute), and a place to add fallbacks.
- The WRITER key is a Worker secret (`WRITER_API_KEY`), never in the repo or the app bundle. The owner's key record is in the EL Wiki (Schubert Server Bible, "Cursor IDE — LiteLLM BYOK Integration", production key).
- All prompts, schemas, and the draft-with-provenance rules live on the server (`worker/ai/`). The model's output is always stored as a **draft** (D-003); nothing it writes reaches students until a person keeps it.
- Reasoning tokens count toward `max_tokens`, so structured calls use a generous limit (at least 4,000).
- A **deterministic fixture provider** answers when no key is configured (tests, CI, the a11y audit, docs screenshots, local development), so nothing depends on the live model to build or test.
- This is independent of the agent ecosystem, where Palmyra-X6 remains benched as a coding agent.

### D-016 · Night milestones and Night 1 scope
Approved by the owner on 2026-09-27.
**Decision:**
- Phase 2 and later work ships as coordinated **"Night N"** milestones: Claude plans the release, splits it into lanes that different agents build in parallel, integrates continuously on a `nightN` branch, and deploys to production once, at the end.
- Planning uses three personas: **administrator** (IT and LMS administrators), **instructor** (instructors, teaching faculty, faculty), and **student**.
- Night 1's scope, cut list, acceptance journeys, and lanes are in `handoff/NIGHT-1-PLAN.md`. The hint-first tutor is a stretch goal.

### D-017 · No colored edge stripes, anywhere
Extends D-006 from AI content to the whole product. The owner rejected the colored left stripe as the signature of generic AI-generated interfaces ("AI slop") in Phase 1, and restated on 2026-09-27 that it's forbidden everywhere after it appeared on the Night 1 navigation rail and module map as a "current" marker.
**Decision:**
- No element gets a colored bar along an edge: no `border-left`/`border-inline-start` accents, no `box-shadow: inset Npx 0 …` stripes, no pseudo-element bars. This covers cards, callouts, list rows, navigation, tables, notices, and AI content.
- 1 px neutral borders (`--line` family) that separate panels or outline a whole box are layout, not stripes, and stay allowed.
- State (current, selected, warning, pinned, AI) is shown with fills, type weight, text, and shape. The current item in navigation and outlines is a **lifted tile**: white surface, full 1px outline, bold text (owner's choice, option B in `design/explorations/current-marker.md`).
- `npm test` enforces it: `tools/no-stripes.test.ts` scans every stylesheet and artboard and fails on an edge stripe.

### D-018 · Marginalia marks: a proofreader's family
Supersedes the gutter glyphs listed in D-006 (※, ¶, †); the rest of D-006 stands. The owner found that the footnote dagger (†) on AI notes reads as a religious cross. After two rounds of options (`design/explorations/current-marker.md` records the process for the current-item marker; the glyph rounds were shown as rendered images in the session), the owner chose the proofreader's caret for notes and asked for matching chat and block marks.
**Decision:**
- The Marginalia gutter marks are drawn SVG marks, one hand-inked stroke with round ends, each resting on a faint baseline, in the AI violet (`--ai`):
  - **Balloon** (a marginal comment balloon): tutor and co-author messages, `.ai--chat`.
  - **Pilcrow** (redrawn "new paragraph"): drafted content blocks, `.ai--block`.
  - **Caret** (the proofreader's "text inserted here"): notes, summaries, and announcement drafts, `.ai--note`.
- They're CSS masks in `docs/assets/ai-voice.css` (`--mg-chat`, `--mg-block`, `--mg-note`), so the app, Storybook, the Phase 1 screens, and the prototype all change together. In forced-colors mode they render in `CanvasText`.
- Never use a cross- or dagger-like shape, a sparkle or star, or a gradient as an AI mark (D-006, D-017).
- `docs/explorations/ai-voice.html` stays as the historical record of D-006 and still shows the old glyphs.

### D-019 · Night 2 platform
Approved by the owner on 2026-09-27 (`handoff/NIGHT-2-PLAN.md` §7).
**Decision:**
- The account is on **Workers Paid** (verified 2026-09-27): CPU per request is raised in `wrangler.jsonc` (`limits.cpu_ms`) so document parsing and format generation run inline.
- Uploaded files, their remediated versions, and generated formats live in **R2** (`tessera-files`; previews use `tessera-files-preview`). Originals are never overwritten; fixes create versions.
- **Workers AI** (binding `AI`, through AI Gateway) provides audio (Deepgram Aura-2), OCR and vision fallback (moondream), and transcription (Nova-3, stretch).
- **Alt text** uses **Palmyra-X5** (vision) through the gateway, because Palmyra-X6 rejects image input (tested 2026-09-27); moondream is the fallback. Text tasks stay on Palmyra-X6 (D-015).
- Background queues aren't used in Night 2 because branch previews can't consume them; large-file work is a Night 3 Workflow candidate.

### D-020 · The API
Extends D-011 and D-014. Administrators and designers must be able to create courses and perform actions from outside the app. Approved 2026-09-27.
**Decision:**
- Versioned routes under **`/api/v1/`**; `/api/` stays as an alias for the app during Night 2 and is removed in Night 3.
- Every operation's input and output is a **Zod schema** next to its type; the Worker validates requests against it, and the build generates **OpenAPI 3.1** (`docs/api/openapi.json`) that the docs site renders as the API reference.
- **Scoped API tokens** (`tsk_…`), created by administrators (and by instructors for their own courses), stored hashed with scopes, owner, expiry, and last use. The Worker accepts an Access JWT (browser) or a token; role rules and resource checks apply to the token's owner and scopes.
- **`/api/*` is not behind Cloudflare Access**; `/app/*` stays behind it. Cursor pagination on lists, `Idempotency-Key` on creates, per-token rate limits, `X-Request-Id` on every response.
- A generated TypeScript SDK (`sdk/`) and a **Tessera MCP server** (`mcp/`) expose the same operations.

### D-021 · Identity
Supersedes D-014's demo persona sign-in for real use. Approved 2026-09-27.
**Decision:**
- **Cloudflare Access is the identity provider.** The Worker maps the Access JWT's email to a Tessera user. Tessera stores no passwords.
- **Invitations:** adding a person adds their email to an Access group that the app policy allows, through the Cloudflare API with a scoped token stored as a Worker secret. Sign-in is a one-time PIN or the institution's single sign-on once configured in Access.
- The persona picker remains in mock mode and as **"View as"** for administrators.

### D-022 · Tessera Access
Approved 2026-09-27. Accessibility is a native capability adapted from the owner's Luma Access (a Canvas add-on) and upgraded per the audit in `handoff/NIGHT-2-PLAN.md` §3.2.
**Decision:**
- Product name **"Access"** ("Tessera Access" in docs). Public docs never mention Luma or Canvas (D-012).
- Checks run on Tessera's block model in the editor and in the server-side publish gate; documents (PDF, DOCX, PPTX) are checked in the Worker; every issue carries its WCAG 2.2 success criterion, level, and severity; scores are 0–100 with a published formula.
- Every AI-assisted fix is a draft a person keeps (D-003). PDF alt text is not patched into the PDF; the accessible version is offered instead.
- Students get accessible formats (reading view, audio, ePub, OCR text) on every document.
- Administrators set a minimum accessibility score and blocking severities for publishing; the server enforces them.


### D-023 · OCR for scanned PDFs
Approved 2026-09-27 (the owner chose option B of four: Browser Rendering + a vision model, a Cloudflare Container with OCRmyPDF, a managed OCR service, or author guidance only).
**Decision:**
- **OCRmyPDF + Tesseract in a Cloudflare Container** (`containers/ocr/`, Worker class `OcrContainer`, binding `OCR`). Workers can't render PDF pages, so OCR runs in a container; it stays on Cloudflare, sends course files to no other vendor, and gives the same output every time.
- OCR is both a **fix** (`fixFileIssue { kind: 'ocr' }` saves a searchable PDF as a new version; the original stays, like every other fix) and an **accessible format** (`?format=ocr`). The reading version, e-book, and audio of a scan use its OCR text.
- Languages installed: English, Spanish, French. Up to 3 instances in production and 1 per preview, each 1 vCPU / 3 GiB (Cloudflare requires at least 3 GiB per vCPU), OCR one page at a time, sleeping after 3 idle minutes; the Workers Paid allowance (25 GiB-hours of memory a month) covers about 8 running hours at this size.
- Limits: Tesseract is weak on handwriting and complex layouts; a vision-model second pass (option A) can be added later for pages it reads poorly.

### D-024 · Built-in quality rubrics
Approved 2026-09-27 (Night 3, #50 D1). Tessera ships its own plain-language course-quality standard and SUNY's OSCQR (CC BY 4.0, with attribution) as built-in rubrics. The Quality Matters rubric is licensed and is never reproduced; an institution that subscribes to QM may load its items as a custom rubric.

### D-025 · Night 3 builds in the app
Approved 2026-09-27 (#50 D2). Night 3 features are built directly in the app, as in Night 2; screenshots reach the docs through docs-sync. Exception: the manager view gets a design artboard the owner reviews for privacy before it is built.

### D-026 · Managers are a relationship, not a role
Approved 2026-09-27 (#50 D3). An administrator records reporting lines between users of any role. A learner opts in per manager; a manager sees opted-in people's required training, due dates, completion, and certificates only, never scores, attempts, tutor chats, or adaptations. Opting out removes access immediately.

Owner review of the manager-view artboard (`design/canvas/ManagerView.dc.html`), 2026-09-27: approved as drawn. A manager sees how many reports haven't chosen to share (a count, no names), and "Tested out" is an allowed status (no score is shown).

### D-027 · Certificate verification
Approved 2026-09-27 (#50 D4). Certificates are immutable (corrections issue a replacement). The public verification URL shows validity, course, and date only; the learner's name appears only on their own copy.

### D-028 · Persona variants first
Approved 2026-09-27 (#50 D5). Plain-language and micro-path (at most 15 minutes) variants ship first, derived from a master lesson as AI drafts and kept in sync by block lineage.

### D-029 · Readiness and publishing
Approved 2026-09-27 (#50 D6). The rubric result is advisory by default; an administrator can require a minimum result to publish, enforced by the server like the accessibility policy (D-022).

### D-045 · Identity v2: one Tessera user, several linked identities
Supersedes in part D-021 ("Cloudflare Access is the identity provider") and D-014's sign-in line; the rest of D-021 (invitations through an Access group, the persona picker and "View as") stands, and D-014's remaining points stand. Tessera must be usable inside an institution's existing LMS through LTI 1.3 (`handoff/INTEROP-LTI-SPEC.md` §1), where the LMS, not Access, vouches for the person. Approved by owner 2026-09-28.
**Decision:**
- A Tessera user can have **several linked identities**: an Access identity (the email in the Access JWT, as today) and one LTI identity per platform (`iss` and `sub`, stored as `platformId|sub`). Identities live in a new `user_identities` table.
- The Worker resolves a request to a user from either an **Access JWT** (as today) or a **Tessera tool session** (D-046), in `worker/identity/`.
- Tessera still stores **no passwords**. The persona picker in mock mode and "View as" for administrators stay as in D-021.

### D-046 · LTI routes outside Access; the tool session as a third credential
Supersedes in part D-014 (Cloudflare Access guards `/app` and the rest of the app) and D-020 (the API accepts an Access JWT or a token). An LTI launch arrives from the institution's LMS inside a frame, where Access sign-in can't run. Approved by owner 2026-09-28; the Cloudflare Access change it needs is approved separately, when it is made.
**Decision:**
- **`/lti/*` and `/embed/*` sit outside Cloudflare Access.** They are protected by LTI message verification instead: the platform's JWKS, `nonce`, `state`, `aud`, and the deployment id. `/app/*` stays behind Access.
- A verified launch mints a **Tessera tool session**: a short-lived bearer token held in page memory (never in a URL or local storage), with a `Partitioned; SameSite=None; Secure; HttpOnly` cookie as a fallback. It is stored hashed.
- The API accepts a **third credential**, the tool session, alongside the Access JWT and scoped tokens (D-020). A tool session is limited to the one launched course and the role the launch established.
- The Access bypass rule for `/lti/*` and `/embed/*` on production and previews is a Cloudflare Access change and needs the owner's explicit OK before anyone makes it (PARALLEL-AGENTS §6).

### D-048 · LTI provisioning and linking rules
New. A platform can assert any email, so email alone must never decide who a launch signs in as. Approved by owner 2026-09-28.
**Decision:**
- A first launch provisions a user keyed by **(`platformId`, `sub`)**, never by email alone.
- An email that matches an existing Tessera user only **suggests a link**; an administrator confirms it. Until then, the launch uses its own LTI-keyed user.
- **LIS role mapping:** `Instructor`, `TeachingAssistant` and `ContentDeveloper` → instructor for the linked course only; `Learner` → student; the institution role `Administrator` → no automatic Tessera admin. There is no TA role; the role union is unchanged.

### D-052 · Institutional SSO through Access, with just-in-time provisioning
Supersedes in part D-021 (invitation is the only way in) for allow-listed domains; D-021's use of Access for SSO stands. Institutions that run Tessera directly need their people to sign in with the institution's own identity provider without an invitation per person. Approved by owner 2026-09-28.
**Decision:**
- Institutional SSO for direct use **stays in Cloudflare Access** (a SAML or OIDC identity provider configured per institution in Access). Tessera doesn't implement SAML itself in the MVP.
- **Just-in-time provisioning** for allow-listed email domains: the first Access sign-in from an allow-listed domain creates the user with the default role **student**. Institution setting `sso: { domains: string[]; defaultRole: 'student' }`.
- Instructors and administrators are still invited or promoted by an administrator. SCIM is later.

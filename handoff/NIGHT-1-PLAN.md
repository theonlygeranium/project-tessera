# Night 1: the first MVP release

**Status: proposed, waiting on the owner's decisions in §6.** Written 2026-09-26 by Claude (orchestrator). When the owner approves, the decisions go into `design/DECISIONS.md`, the milestone and issues are created on GitHub, and this file becomes the working plan.

Night 1 is the first of the "Night N" milestones: coordinated efforts where several agents build separate parts of the LMS at the same time, then regroup for one integration and one production deployment. Phase 2 and later builds run this way.

## 1. Goal

A working MVP of Tessera at `/app/` where the three personas can do the core jobs of a first release, end to end, with real stored data:

- An **administrator** sets up the institution and its courses.
- An **instructor** builds course content (by hand and with AI), and posts announcements.
- A **student** sets up a profile, sees what to do next, reads announcements, and works through lessons.

The Phase 1 screens and the clickable prototype stay online as the design reference. Night 1 turns them into a working product.

## 2. Personas

| Label | Includes | Night 1 job |
|---|---|---|
| **Administrator** | IT administrators, LMS administrators | Set up the institution, people, courses, and AI policy |
| **Instructor** | Instructors, teaching faculty, faculty | Build and publish content, post announcements |
| **Student** | Learners in higher-ed and industry courses | Onboard, follow Today, read announcements, complete lessons |

## 3. What's in the Night 1 package

### Shared (every persona)
- **Sign-in as a persona.** Seeded demo accounts (fictional: Meridian State, Dr. Okafor, Priya, an administrator), with the site gated as decided in §6.
- **App shell:** rail navigation per persona, a top bar, and a persona switcher for demos.
- **Communication center, first version:** course announcements with read and unread state, an unread count in the shell, and a cross-course feed.
- **The course structure:** course → module → lesson → block (D-002), used by every screen and enforced by the API.

### Administrator
- **First-run setup:** institution name, logo, and accent color, limited to contrast-safe token choices.
- **AI policy defaults:** whether AI authoring is on, and which tutor modes are allowed on graded and practice work (D-005). Stored as data and enforced by the server.
- **People:** add users one at a time or by CSV paste, and assign a role.
- **Courses:** create a course, assign instructors, enroll students.
- **Overview:** counts of people, courses, and published lessons. The full governance console stays a design reference.

### Instructor
- **My courses** and a **course workspace:** course home (welcome, outcomes), and a module and lesson outline with add, rename, and reorder.
- **Block editor:** text, heading, callout, image with required alt text, and knowledge check (multiple choice with feedback).
- **AI course builder** (the core differentiator; issue #20): prompt plus sources (pasted text, `.txt` or `.md` upload) → editable brief → outline → drafted blocks.
  - Drafts use the AI markup contract in the draft state, with Accept / Revert / Regenerate.
  - A review meter tracks kept blocks.
  - **Publish readiness:** the lesson can't publish while any block is still a draft, alt text is missing, or the heading order is broken. The server enforces this, not only the interface (D-003).
- **Announcements:** write, preview, publish, and pin. An AI assist can draft one; the draft is labeled and needs the instructor's edit or keep.
- **Roster:** enrolled students and lesson completion.

### Student
- **Onboarding:** a short learning profile (goals, weekly time, language, accessibility preferences), from issue #18, editable later. No learning styles (D-004).
- **Today:** a cross-course "Do next" list, new announcements, and progress.
- **Course home:** the instructor's welcome, outcomes, a module map with time estimates, and Start or Resume (issue #21).
- **Lesson player:** reads published blocks only, runs the knowledge checks, marks the lesson complete, and saves progress.
- **Announcements:** the course feed and the cross-course feed, with read state.

### Stretch (only if the lanes finish early)
- **Hint-first tutor** in the lesson player that follows the instructor's per-activity mode within the administrator's limits (issue #19; D-005). The answer key is never a source.
- Instructor tutor settings per activity.

### Not in Night 1 (candidates for Night 2 and later)
Assignments, submissions, grading and rubrics (the instructor command center); gradebook; discussions and direct messages; email notifications; real accounts with passwords or SSO; LTI, SIS, xAPI and SCORM integrations (#26); persona variants (#23); templates beyond basic branding (#24); the full rubric report (#25); dark mode (#27); a dedicated mobile layout (#30). The app is responsive; it isn't phone-optimized yet.

## 4. Definition of done: acceptance journeys

Night 1 is done when these run end to end on the integration preview, as automated Playwright tests and in the owner's own walkthrough:

1. **Administrator:** sign in → finish setup (name, accent, AI policy) → create "Data Literacy 101" → assign Dr. Okafor → enroll Priya.
2. **Instructor, AI:** sign in → open the course → AI builder: prompt plus a pasted source → edit the brief → accept the outline → keep, revert, or regenerate drafts → publish readiness blocks publish until every block is kept → publish Module 1.
3. **Instructor, manual and communication:** add a lesson by hand with an image and a knowledge check → post a pinned announcement.
4. **Student:** sign in → onboarding → Today shows the announcement and "Start Module 1" → course home → lesson → knowledge check → lesson complete → Today updates.
5. **Rules the server enforces:**
   - A student can't read unpublished or draft content through the API.
   - Nothing AI-drafted publishes without being kept.
   - Each role can only call its own endpoints.
6. **Quality:**
   - `npm run a11y` reports zero violations across every new route.
   - The Playwright journeys pass in CI.
   - The docs-sync Action has refreshed the docs site's screenshots.
   - A Night 1 release notes page is live on the docs site.

## 5. Architecture for Night 1

This builds on the full-stack foundations already recorded in D-011, and adds a backend without a rewrite.

- **One Worker.** `project-tessera` keeps serving the static site and adds `/api/*` routes: `worker/index.ts` handles the API, and everything else goes to the static assets.
- **D1** holds institutions, users, courses, modules, lessons, blocks (with AI provenance and draft or kept state), enrollments, announcements and read receipts, progress, and policies.
  - Migrations live in `migrations/`.
  - Production and branch previews get separate databases, set through `previews` in `wrangler.jsonc`.
- **Shared types** (`shared/`) for the domain and the API contract, used by both the app and the Worker.
- **A data client** in the app with two adapters:
  - `mock`: in-memory, seeded, used by Storybook, the a11y audit, docs screenshots, and UI lanes before the API exists.
  - `api`: the real Worker.

  Components never know which adapter is behind them.
- **An AI provider interface** in the Worker, with two implementations:
  - The real model chosen in §6.
  - A deterministic fixture used in tests, CI, and previews without a key.

  Prompts and the draft-with-provenance rules live on the server.
- **Routing:** React Router in the app, with one route module per persona area, so lanes don't edit the same files.

## 6. Decisions the owner needs to make

| # | Decision | Recommendation | Alternatives |
|---|---|---|---|
| **D1** | Backend and access | **Real backend (Worker + D1), demo persona sign-in, with `/app/` and `/api/` behind Cloudflare Access (owner plus invited testers).** Real data, and nobody can vandalize the public URL. | (b) Browser-only demo: no backend, data in each browser; fastest, but not a real LMS. (c) Real accounts (email magic link): more time; better as Night 2. |
| **D2** | AI provider for authoring (and the stretch tutor) | **The Claude API through Cloudflare AI Gateway**, Sonnet 5 for drafting: best draft quality, with logging and rate limits in the gateway. Needs an Anthropic API key; Claude checks the EL Wiki before asking. | (b) Workers AI: no key needed, weaker drafts. (c) Scripted drafts only for Night 1; real AI in Night 2. |
| **D3** | Scope | **Confirm §3 as written**, with the tutor as a stretch goal. | Move the tutor into the core scope (adds about one lane), or cut the AI announcement assist. |
| **D4** | Cloudflare changes (destructive or config actions need your go-ahead) | **Approve:** create D1 `tessera-prod` and `tessera-preview`, an AI Gateway, and a Cloudflare Access application for `/app/*` and `/api/*`. | Approve them one at a time as each lane needs them. |

## 7. Orchestration

### Waves

| Wave | What happens | Who |
|---|---|---|
| **0: Contract** | Record the decisions; create branch `night1`. Build the shared contract: domain types, D1 schema and seed, API route table, data client with the mock adapter, app shell, routing, persona sign-in, and the AI provider interface with its fixture. Merge into `night1`. | Claude (architectural and cross-cutting, so not delegated). Lane B starts at the same time. |
| **1: Parallel build** | Lanes B–H each work in their own worktree off `night1`, own separate directories, and build against the mock adapter. Each lane merges into `night1` as soon as its checks pass. | Codex Sol, Grok, and Claude subagents (below) |
| **2: Regroup** | Switch the app to the API adapter. Run the acceptance journeys against the preview. Fix integration bugs. Astra and Grok review the authorization and publish gates. The owner walks the preview. Merge `night1` to `main` and tag `night-1`. | Claude integrates; the owner approves the merge |

Integration happens continuously on `night1`, whose preview URL is `https://night1-project-tessera.jeff-f69.workers.dev/`. Production gets **one deployment at the end**, which is the regroup.

### Lanes

| Lane | Area | Owns (only this lane edits these) | Agent | Depends on |
|---|---|---|---|---|
| **A** | Contract, shell, integration | `shared/`, `app/src/data/`, `app/src/shell/`, `app/src/routes.tsx`, `wrangler.jsonc` | **Claude** | none |
| **B** | Components (the rest of #17 that Night 1 needs): FormField, ChoiceControl, SegmentedControl, TaskCard, CourseCard, ProgressMeter, PresenceCard, StatusNotice, LessonOutline, PipelineStepper, GlobalRailNav, TopBar, DataTable, KnowledgeCheck | `app/src/components/` | **Codex Sol** (Luna for stories and boilerplate) | tokens only |
| **C** | API and data: Worker routes, D1 queries, role checks, the publish gate, Worker tests | `worker/`, `migrations/` | **Codex Sol** | A (types, schema) |
| **D** | Administrator: setup, people, courses, policy | `app/src/features/admin/` | **Grok 4.7** (form-heavy, lower risk; spreads load off Codex) | A, B |
| **E** | Instructor: course workspace, outline, block editor, announcements, roster | `app/src/features/instructor/` | **Codex Sol** | A, B |
| **F** | AI builder: brief → outline → drafts → publish readiness; server prompts | `app/src/features/builder/`, `worker/ai/` | **Claude leads** (prompts, governance, UX calls); **Sol** implements the screens | A, B, C |
| **G** | Student: onboarding, Today, course home, lesson player, announcements feed | `app/src/features/student/` | **Codex Sol** (second concurrent run; Grok if Codex is rate-limited) | A, B |
| **H** | Quality: Playwright acceptance journeys, a11y audit routes, CI job, docs release notes | `tests/e2e/`, `tools/a11y_audit.mjs`, `mintlify/releases/` | **Claude subagent** (Sonnet) writes the tests; **Codex Astra** reviews every lane; **Grok** second-reviews the authorization and publish gates | A (journeys can be written against the mock adapter first) |

### Coordination rules
- **One owner per directory.** A lane that needs a change outside its directories (a new type, a route, a component prop) asks for it in its report, and Claude makes the change in lane A. This is what prevents merge conflicts.
- **Contract first.** No lane starts before wave 0's contract is merged, except B, which depends only on tokens.
- **Small merges, often.** Each lane lands in slices: a screen or endpoint per merge, each checked by Claude (diff read, build, a11y), not one large merge at the end.
- **Workers never commit or push** (`AGENTS.md`). Claude merges into `night1`, and only the owner approves `night1` → `main`.
- **Rate limits.** At most three Codex runs at once. Grok takes overflow and lane D. Moving up a tier follows `handoff/AGENT-ECOSYSTEM.md`.
- **Status lives in one place:** GitHub milestone "Night 1", one issue per lane (with slices as checklists), plus a status table at the bottom of this file that Claude updates at each merge.

### Existing backlog, mapped
- #17 → lane B.
- #18 → lane G (onboarding).
- #19 → stretch.
- #20 → lane F.
- #21 → lane G (course home).
- #28 and #29 stay open for after Night 1 (they need a working MVP to test).
- #22–#27 and #30 → Night 2 and later.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Lanes collide in shared files | Directory ownership, plus requests to lane A |
| The public preview exposes a writable app | Cloudflare Access on `/app/` and `/api/` (decision D1); fictional data only |
| AI cost or outages block the builder | A deterministic fixture provider; the gateway sets rate limits and caching |
| Codex usage limits mid-night | Grok overflow; Claude subagents for tests and docs |
| Scope creep | §3 "Not in Night 1" is the cut list; anything new becomes a Night 2 candidate |
| Accessibility regressions in a dynamic app | The audit runs against the mock-adapter build on every merge, and every new route is added to the audit |
| Workers' claims don't match their work | Claude reads every diff and re-runs the checks (as in earlier trials) |

## 9. Status

| Lane | State |
|---|---|
| All | Waiting on the owner's decisions (§6) |

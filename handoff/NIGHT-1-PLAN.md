# Night 1: the first MVP release

**Status: shipped to production 2026-09-27 (tag `night-1`).** Written by Claude (orchestrator). The owner approved every recommendation in §6, with one change: the platform LLM is WRITER **Palmyra-X6** instead of the Claude API. The decisions are recorded as D-014, D-015, and D-016 in `design/DECISIONS.md`.

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
  - Palmyra-X6 through AI Gateway (D-015).
  - A deterministic fixture used in tests, CI, and previews without a key.

  Prompts and the draft-with-provenance rules live on the server.
- **Routing:** React Router in the app, with one route module per persona area, so lanes don't edit the same files.

## 6. Decisions (approved 2026-09-27)

| # | Decision | Recommendation | Alternatives |
|---|---|---|---|
| **D1** | Backend and access | **Real backend (Worker + D1), demo persona sign-in, with `/app/` and `/api/` behind Cloudflare Access (owner plus invited testers).** Real data, and nobody can vandalize the public URL. | (b) Browser-only demo: no backend, data in each browser; fastest, but not a real LMS. (c) Real accounts (email magic link): more time; better as Night 2. |
| **D2** | AI provider for authoring (and the stretch tutor) | **Owner's choice: WRITER Palmyra-X6** through Cloudflare AI Gateway (custom provider `writer`), with a deterministic fixture provider for tests. See D-015. | Claude API (the original recommendation), Workers AI, scripted drafts. |
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

| Lane | Agent (time, usage) | State |
|---|---|---|
| A (#31) contract, shell, integration | Claude | Merged. Shell, data adapters (http, mock), routes, persona sign-in |
| B (#32) components | Codex Sol ×2 (302 s / 64,876 tokens; 306 s / 79,673) | Merged. 14 components, 58 stories |
| C1 (#33) service layer | Codex Sol, high (550 s / 109,988) | Merged. Every operation, MemoryRepo, validators, repo contract suite |
| C2 (#33) Worker, D1Repo, Access | Grok 4.7 (1,881 s; $1.42 reported) | Merged. Verified with wrangler dev + local D1 |
| D (#34) administrator | Grok 4.7 (1,736 s; $1.66 reported) | Merged. Journey 1 walked in the browser |
| E (#35) instructor | Codex Sol (341 s / 110,519) | Merged. Publish gate walked in the browser |
| F (#36) AI builder | Claude (Palmyra client) + Codex Sol screens (642 s / 71,981) | Merged. Live Palmyra: brief 4 s, outline 7 s, 6 lessons in 32 s |
| G (#37) student | Codex Sol (313 s / 100,831) | Merged. Journey 4 walked in the browser |
| H (#38) quality | Claude subagent (Sonnet) | In progress: Playwright journeys + CI |

Checks on `night1` (07b604e): 66 unit tests pass; a11y 157/157; preview built and verified: public pages public, `/app` and `/api` behind Access.

GitHub milestone: "Night 1". Branch: `night1` (preview `https://night1-project-tessera.jeff-f69.workers.dev/`).

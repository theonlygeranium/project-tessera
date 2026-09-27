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
- a gutter glyph: ※ for the tutor and co-author, ¶ for drafted blocks, † for summaries
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
- Revisit option C (backend, real AI) after the #28 usability tests.

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

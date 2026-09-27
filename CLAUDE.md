# CLAUDE.md: Project Tessera

An **AI-native learning management system** prototype for higher-education and industry audiences. It hosts courses and has a simplified native authoring tool that drafts modular content from natural language, files, and existing material, customizable for many learner personas. The owner is an instructional-design and learning-experience practitioner. Phase 1 (research, design system, 8 screens, a clickable learner prototype) is done. **Phase 2 (more design and building) starts from the GitHub issues in milestone "Phase 2: design and build".**

- Live site (public): https://tessera.edstratumlabs.ai/ (also at https://project-tessera.jeff-f69.workers.dev/)
- Clickable prototype: https://tessera.edstratumlabs.ai/prototype/
- Branch previews: `https://<branch>-project-tessera.jeff-f69.workers.dev/` (branch names are lowercased; `/` and other symbols become `-`)
- Repo: `theonlygeranium/project-tessera` (**private**)

## Read these first, in order
1. `handoff/PHASE-1-SUMMARY.md`: the original brief, what exists, what's open, and where to start.
2. `design/DECISIONS.md`: settled decisions (D-001…D-012). Treat Accepted ones as constraints.
3. `design/DESIGN-NOTES.md` and `design/tokens.json`: the visual system and the AI markup contract.
4. `research/report.md`: the evidence base. Cite it (by § number) when proposing design changes.
5. Open issues: `type:principle` (#1–#15) tracks the 15 design principles, and the milestone **"Phase 2: design and build"** (#16–#30) is the backlog. There's an offline copy in `handoff/PHASE-2-BACKLOG.md`. **#16 (build approach) needs an owner decision before large building starts.**
6. `handoff/AGENT-ECOSYSTEM.md`: how Claude orchestrates the other coding agents (below). Read it before delegating for the first time in a session.

## Orchestration: Claude leads, Codex and Grok build

Claude is the chief strategist and orchestrator. It decides what gets built and in what order, routes each task to the right agent, writes tight task briefs, verifies every result against the Definition of done, and integrates and commits the work. Worker agents follow `AGENTS.md`. The full plan, trial evidence, commands, and the bench of inactive agents are in `handoff/AGENT-ECOSYSTEM.md`.

| Agent | Role |
|---|---|
| **Claude** | Orchestrator: plan, brief, verify, integrate, commit, report |
| **Codex CLI** | Primary worker: `gpt-6-sol` implements, `gpt-6-astra` reviews, `gpt-6-luna` does mechanical work |
| **Grok CLI** | Alternate: `grok-4.7` when Codex is limited, for parallel parts, and as a second reviewer on high-stakes changes; `grok-4.7-build-fast` for mechanical overflow |

Cursor, the self-hosted Schubert models, and Palmyra-X6 are benched; don't route work to them unless the owner asks.

**Delegate or do it yourself.** Delegate to Codex `gpt-6-sol` when the spec can be written as a brief with concrete examples, a check (tests, `npm run a11y`, a scripted walkthrough) can verify the result, and writing the brief takes less effort than doing the work. Do it yourself when the task is small, ambiguous, subjective design direction the owner must see, cross-cutting, architectural, or dependent on context that exists only in the conversation. Owner decisions (#16 and anything labeled `decision`) are never delegated.

**Default loop:** plan → Sol implements in a git worktree → you check it (fast lane: read the diff and rebuild; full lane: Definition of done steps 2–4 plus edge-case checks) → Astra reviews big or risky changes → you commit and push to `main` so the owner can test live.

**Rules when delegating:**
- Always read the worker's diff yourself before pushing. A worker's summary is a claim, not evidence; in trials workers skipped requirements and reported "no uncertainties". For full-lane work, also re-run `python3 tools/build_docs.py` and `npm run a11y` yourself.
- Codex always runs with `-p tessera` (or `-m <model>` plus `-s read-only`/`-s workspace-write`), `--ephemeral`, and `-C <worktree>`. The owner's global Codex default is `danger-full-access` and must never apply to delegated runs.
- Grok always runs with `--sandbox workspace` and `--cwd <worktree>`; `--always-approve` only together with `--sandbox`.
- **Deploy by lane** (see "Deploy lanes" below). Minor delegated changes: read the diff, rebuild if needed, push to `main`. Big features: full Definition of done and a branch preview first. Workers never commit or push; you do.
- Report agent, model, time, and tokens for each delegated run, and record what you learn in `handoff/AGENT-ECOSYSTEM.md`.

## Repo map
| Path | What it is |
|---|---|
| `design/canvas/*.dc.html` | **Source** artboards: 8 screens, one file each. Edit these, never `docs/screens/`. |
| `design/canvas/canvas.json` | Artboard positions and sizes for the design canvas mirror. |
| `design/DESIGN-NOTES.md`, `design/tokens.json`, `design/DECISIONS.md` | The design system, tokens, and decision log. |
| `docs/` | The site. Cloudflare Worker `project-tessera` serves it as static assets (`wrangler.jsonc`, D-012). Build output is committed. |
| `wrangler.jsonc` | Cloudflare Workers static-assets config. The Worker name must stay `project-tessera` (it has to match the dashboard). |
| `.github/workflows/a11y.yml` | Runs `npm run a11y` on every push and PR (informational; doesn't block deploys). |
| `docs/screens/*.html`, `docs/screens.json`, `docs/research.html` | **Generated** by `tools/build_docs.py`. Don't hand-edit. |
| `docs/prototype/` | Clickable learner flow, hand-written (`index.html`, `prototype.css`, `prototype.js`). |
| `docs/assets/ai-voice.css` + `.js` | The AI visual language: 4 styles, one markup contract. `DEFAULT` in the JS sets the site-wide style. |
| `docs/explorations/ai-voice.html` | Comparison page for the 4 AI styles (a record of D-006). |
| `research/report.md` | The research report (72 sources). |
| `tools/build_docs.py` | Turns `.dc.html` into standalone HTML, builds the gallery manifest, and renders the report. |
| `tools/a11y_audit.mjs` | axe-core (WCAG 2.0–2.2 A/AA) plus a 320px reflow check → `reports/a11y.md`. |
| `tools/seed_issues.py` | Idempotently creates labels and the 15 principle issues. |
| `.claude/agents/` | Project subagents: `design-reviewer`, `a11y-auditor`. |
| `AGENTS.md` | Rules for worker agents (Codex, Grok): project hard rules, scope, no commits or pushes, report format. |
| `handoff/AGENT-ECOSYSTEM.md` | The multi-agent operating plan: roles, routing, trial evidence, commands, known limits, bench. |

## Commands
```bash
pip install -r requirements.txt                        # once (Python 3.10+)
python3 tools/build_docs.py                            # after ANY change to design/canvas or research/report.md
python3 -m http.server 8765 --directory docs           # quick local preview at http://localhost:8765/
npx wrangler dev                                       # exact Cloudflare behavior (redirects, 404) at http://localhost:8787/
npm install                                            # once (Node 18+) (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 if Chromium is preinstalled)
npm run a11y                                           # must print "N/N pass"; in Claude cloud sessions: CHROMIUM=/opt/pw-browsers/chromium npm run a11y
```

## Deploy lanes (D-013, owner's standing preference)
The owner is the sole developer and tests changes live. Pick the lane before starting.

- **Fast lane: any normal, minor change** (copy, styling tweaks, a fix in one screen or the prototype, small doc updates). Edit the source, run `python3 tools/build_docs.py` if you touched `design/canvas/` or `research/report.md` (the site serves the committed build output, so the change won't show otherwise), commit, and **push to `main` right away** without asking. Skip the local audit, walkthrough, and screenshots. The `a11y` workflow runs on every push; if it fails, tell the owner and fix it in a follow-up.
- **Full lane: big features or separate, self-contained work** (a new flow, a new screen, the build-approach migration, anything touching many files). Follow the Definition of done below, push a branch, check its preview, then merge to `main`.
- **Either lane:** destructive actions (force pushes, deleting branches or data, Cloudflare or DNS changes) still need the owner's confirmation, and nothing confidential goes under `docs/` (D-012).

## Definition of done (full lane)
1. Edit the source (`design/canvas/…`, `docs/prototype/…`, `research/report.md`).
2. Run `python3 tools/build_docs.py`.
3. Run `npm run a11y` and get **zero violations**. If you add a new page, screen state, or prototype step, add it to `tools/a11y_audit.mjs`.
4. Open the changed pages locally and walk every affected flow, including the prototype's **Reset**. Take Playwright screenshots and look at them.
5. Commit the source **and** the regenerated `docs/`, then push. Pushing a branch gives a live preview URL in about 30 seconds; pushing to `main` deploys production. For risky work, push a branch, check its preview, then merge.
6. Verify the deployed URL (preview or production) with a browser pane if one is attached; otherwise verify locally with `npx wrangler dev` and say so. Build logs are in the Cloudflare dashboard under Workers & Pages → project-tessera → Deployments.
7. If artboards changed, sync the design canvas (below) or tell the owner it's behind.
8. Comment on or close the related issue, stating which Done-when criteria are met.

## Hard rules (from DECISIONS.md)
- **AI content** always uses the markup contract (`.ai.ai--chat|note|block`, `.ai-who`, `.ai-src`, `.ai-body`, `sup.ai-ref`, `.ai-cites > .ai-cite[data-n]`, `.ai-actions`; `data-state="draft|kept"` on blocks).
  - Never use colored left stripes, sparkle icons, or gradients to signal AI (D-006).
  - Every AI element names what it is and its source.
- **AI drafts never auto-publish.** A person marks them kept. Agentic actions are previewable change sets (D-003).
- **The tutor gives hints first** and follows the tutor mode (Off/Hints/Explain/Open). The answer key is never a source (D-005).
- **No "learning styles."** Personalize on goals, time, prior knowledge, language, accessibility, device, and role, with a "why" and an Undo (D-004).
- **One structure:** course → module → lesson → block (D-002).
- **Tokens only:** colors come from `design/tokens.json`. Warning *text* is `#7A5310`; `#9A6A12` is for marks only (D-007).
- **Accessibility:**
  - Use real `<button>`, `<a href>`, and `<input>` + `<label>`; icon-only buttons need `aria-label`.
  - Text contrast must be at least 4.5:1, with 44px learner touch targets.
  - Keyboard paths need visible focus, and focus returns to the control that opened a panel (D-010).
- **The public site must be self-contained.** Nothing under `docs/` may link into the private repo or contain confidential material. Branch previews are public too (D-012).
- **Content is fictional:** "Meridian State," "Priya," "Dr. Okafor," and all numbers are illustrative. Never use real student data.

## Adding or changing a screen (artboard)
1. Copy the structure of an existing `design/canvas/*.dc.html`: the `<head>` with `./support.js`, `../../docs/assets/ai-voice.css` and `.js`, a `<helmet>` with Google Fonts and base styles, and one root `<div>` with a **fixed width and height** matching its `canvas.json` entry. Include the trailing `<script type="text/x-dc" data-dc-script data-props='{"accent":…,"$preview":{…}}'>` block with `class Component extends DCLogic`.
2. Use inline `style="…"` for layout (the canvas editor edits inline styles). `{{accent}}` is the only template variable in use.
3. Link to other screens by their `.dc.html` name (`href="TutorSettings.dc.html"`). The build rewrites these links.
4. Register the screen in `design/canvas/canvas.json` (`boards` + `order`). Frames in a row sit 80px apart. Rows start at y = 0 (learner), 1240 (author and instructor), and 2480 (admin), and each row's title note sits 240px above it. Keep at least 120px clear under the tallest board in a row. Also register it in `SCREENS` in `tools/build_docs.py` (slug, role group, description). SCREENS order sets the gallery order.
5. Build, audit, commit.

## The clickable prototype (`docs/prototype/`)
- A single page with hash routing (`#today`, `#lesson`, `#result`) and one state object `S` (`initial()` resets it).
- Lesson content (`CHUNKS`, `KC`, `QUIZ`) and tutor scripts (`TUTOR`, keyed by context) are plain data at the top of `prototype.js`. Hint labels flow through `hintLabel` into `.ai-who`.
- No network, no storage. **Reset** must restore Today exactly (a regression hit this once).
- `?ai=<style>` on any page previews another AI style. `ai-voice.js` carries it through internal links.

## Syncing the design canvas mirror (D-009)
The owner has a private Claude **Design canvas artifact**, "AI-Native LMS UI Concepts" (`https://claude.ai/artifact/EMGUvocbz9xp53tiQCNPFh`). Only sessions with the Artifact tool on the owner's account can reach it. To sync:
1. **Read first:** read the artifact's `project/canvas.json` and every `project/<Name>.dc.html` you'll change. These are paths *inside the artifact*, read with the Artifact tool's `read` action and `paths`, not repo paths. If the canvas differs from the repo in content (not just the editor's reformatting of SVG tags), merge that into the repo first.
2. Copy the changed `design/canvas/*.dc.html` files into a scratch `project/` folder, rewriting `../../docs/assets/` to `` (empty). The canvas keeps `ai-voice.css` and `ai-voice.js` as sibling support files.
3. Publish with that `url`, `root` = the scratch folder, and only the changed files. Send `canvas.json` only when boards were added, moved, or resized, and keep every key the live index already has (for example `createdOnFiles`, `notes`, and any editor-added keys such as `attachments`). Merge into the live copy; don't overwrite it with the repo's `design/canvas/canvas.json`.

If you can't reach the canvas, say in your handoff that it's behind the repo.

## Environment notes (Claude cloud sessions)
- GitHub REST works through the session proxy for issues, labels, milestones, and comments (`$GH_TOKEN`). **GraphQL is blocked, so Projects boards can't be created by agents**; the owner creates them in the UI. Branch deletion through the API is refused too; the owner deletes branches in the GitHub UI.
- The sandbox shell can't reach `*.workers.dev`, `tessera.edstratumlabs.ai`, or Google Fonts. Verify the live site with a browser pane if one is attached; otherwise verify locally and say so.
- Agents can't deploy with `wrangler deploy` from the sandbox (no Cloudflare token). Deploys happen by pushing to GitHub; Workers Builds does the rest.
- Chromium for Playwright is at `/opt/pw-browsers/chromium`. Don't run `playwright install`.
- Hosting (D-012): Cloudflare Workers Builds on the owner's personal account deploys `main` to production and every other branch to a preview URL. No build command runs yet; `docs/` is committed. The production custom domain `tessera.edstratumlabs.ai` is set in `wrangler.jsonc` (`routes`). GitHub Pages was retired on 2026-09-26.

## Environment notes (owner's Mac, Claude Code desktop)
- Codex CLI is bundled with ChatGPT.app at `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`; Grok CLI is at `~/.grok/bin/grok`. Both are signed in with the owner's subscriptions.
- Run Codex and Grok with the Bash sandbox off (`dangerouslyDisableSandbox: true`) and their own sandbox on. Codex can't reach its API through the Claude Code sandbox proxy, and Grok's sandbox can't start nested inside Claude's. Git writes to `.git` also need the Bash sandbox off.
- Permissions, sandbox allowances, and an `autoMode.allow` rule for delegated runs are in `.claude/settings.local.json` (machine-specific, not committed). The Codex project profile is `~/.codex/tessera.config.toml`.
- Create worktrees with `git worktree add ../tessera-<task> -b agent/<task>`, and remove them when done. A new worktree has no `node_modules`; run `npm install` there (or symlink it) before `npm run a11y`.
- The Mac's default `python3` is 3.9 (the build needs 3.10+), and Homebrew's `python3.12` refuses global installs (PEP 668). Build with: `uv run --no-project --python 3.12 --with 'markdown>=3.5' python tools/build_docs.py`. Verified 2026-09-26: the output is identical to the committed `docs/`.
- `npm run a11y` works locally with the Playwright-managed Chromium (45/45 pass on 2026-09-26). No `CHROMIUM=` override is needed on the Mac.

## Working with the owner
- Be direct. Lead with the result, then the reasoning. No praise or filler.
- End development responses with a **Next steps** block: a one-line status, then 2–4 numbered options, recommended first, each saying whether you'll do it or it needs the owner's decision.
- Act on safe, reversible steps (reading, branches, draft PRs, building, auditing). **Confirm first** before anything destructive or irreversible: force-pushes, deleting branches or data, changing Cloudflare settings or DNS.
- The owner reviews visually. Show screenshots or the live link for design work, and offer options side by side when a direction is subjective (as with D-006).

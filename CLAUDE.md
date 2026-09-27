# CLAUDE.md: Project Tessera

An **AI-native learning management system** prototype for higher-education and industry audiences. It hosts courses and has a simplified native authoring tool that drafts modular content from natural language, files, and existing material, customizable for many learner personas. The owner is an instructional-design and learning-experience practitioner. Phase 1 (research, design system, 8 screens, a clickable learner prototype) is done. **Phase 2 (more design and building) starts from the GitHub issues in milestone "Phase 2: design and build".**

- Live site (public): https://project-tessera.jeff-f69.workers.dev/
- Clickable prototype: https://project-tessera.jeff-f69.workers.dev/prototype/
- Branch previews: `https://<branch>-project-tessera.jeff-f69.workers.dev/` (branch names are lowercased; `/` and other symbols become `-`)
- Legacy mirror (GitHub Pages, retiring): https://theonlygeranium.github.io/project-tessera/
- Repo: `theonlygeranium/project-tessera` (**private**)

## Read these first, in order
1. `handoff/PHASE-1-SUMMARY.md`: the original brief, what exists, what's open, and where to start.
2. `design/DECISIONS.md`: settled decisions (D-001…D-012). Treat Accepted ones as constraints.
3. `design/DESIGN-NOTES.md` and `design/tokens.json`: the visual system and the AI markup contract.
4. `research/report.md`: the evidence base. Cite it (by § number) when proposing design changes.
5. Open issues: `type:principle` (#1–#15) tracks the 15 design principles, and the milestone **"Phase 2: design and build"** (#16–#30) is the backlog. There's an offline copy in `handoff/PHASE-2-BACKLOG.md`. **#16 (build approach) needs an owner decision before large building starts.**

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

## Commands
```bash
pip install -r requirements.txt                        # once (Python 3.10+)
python3 tools/build_docs.py                            # after ANY change to design/canvas or research/report.md
python3 -m http.server 8765 --directory docs           # quick local preview at http://localhost:8765/
npx wrangler dev                                       # exact Cloudflare behavior (redirects, 404) at http://localhost:8787/
npm install                                            # once (Node 18+) (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 if Chromium is preinstalled)
npm run a11y                                           # must print "N/N pass"; in Claude cloud sessions: CHROMIUM=/opt/pw-browsers/chromium npm run a11y
```

## Definition of done for any change
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
- GitHub REST works through the session proxy for issues, labels, milestones, and comments (`$GH_TOKEN`). **GraphQL is blocked, so Projects boards can't be created by agents**; the owner creates them in the UI. The Pages API is blocked too.
- The sandbox shell can't reach `*.workers.dev`, `*.github.io`, or Google Fonts. Verify the live site with a browser pane if one is attached; otherwise verify locally and say so.
- Agents can't deploy with `wrangler deploy` from the sandbox (no Cloudflare token). Deploys happen by pushing to GitHub; Workers Builds does the rest.
- Chromium for Playwright is at `/opt/pw-browsers/chromium`. Don't run `playwright install`.
- Hosting (D-012): Cloudflare Workers Builds on the owner's personal account deploys `main` to production and every other branch to a preview URL. No build command runs yet; `docs/` is committed. GitHub Pages (`main` → `/docs`) still mirrors the site until the owner retires it.

## Working with the owner
- Be direct. Lead with the result, then the reasoning. No praise or filler.
- End development responses with a **Next steps** block: a one-line status, then 2–4 numbered options, recommended first, each saying whether you'll do it or it needs the owner's decision.
- Act on safe, reversible steps (reading, branches, draft PRs, building, auditing). **Confirm first** before anything destructive or irreversible: force-pushes, deleting branches or data, changing Cloudflare or Pages settings.
- The owner reviews visually. Show screenshots or the live link for design work, and offer options side by side when a direction is subjective (as with D-006).

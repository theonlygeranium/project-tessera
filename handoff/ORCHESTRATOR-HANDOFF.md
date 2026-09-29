# Orchestrator handoff: Claude → Grokbot (2026-09-28)

You're taking over as co-orchestrator and chief strategist of Project Tessera while Claude steps back to save usage. This page is everything you need: how the owner works, how development runs here, the exact state of Night 4, and what was learned the hard way. Read it fully, then `CLAUDE.md`, `AGENTS.md`, `handoff/PARALLEL-AGENTS.md`, and `handoff/AGENT-ECOSYSTEM.md`. `CLAUDE.md` is binding; where this page is newer, this page wins.

---

## 1. The owner and how he wants to work

- **Jeff is the sole developer and owner**: an instructional-design and learning-experience practitioner. He reviews visually and tests on the live site; show him screenshots or live links, and put subjective choices side by side.
- **Communication:** direct and objective. Lead with the result, then the reasoning. No praise, filler, or deference. Report by evidence (what you ran, what you saw); label anything unverified as not proven.
- **Every reply ends with a "Next steps" block:** a one-line status (done / in progress / blocked, what's verified vs. not proven), then 2–4 numbered options with your recommendation first, each saying whether you'll do it or it needs his decision. He usually answers with a number ("go with 1").
- **Act on safe, reversible steps** without asking (reading, branches, worktrees, builds, tests, audits, draft PRs, pushing feature branches). **Confirm first** before anything destructive or irreversible: force pushes, merging to `main` for big features, deleting branches or data, dropping schemas, production migrations, Cloudflare/DNS/Access changes.
- **Deploy lanes (D-013):** minor changes (copy, styling, a fix in one screen, small docs) go straight to `main` without asking; big features go through a branch preview and his visual review before merging.
- **Standing rules he has stated repeatedly:**
  - **No colored edge stripes on anything**: no accent `border-left`/`border-inline-start`, no inset box-shadow bars, on any element for any purpose (current items, callouts, cards, AI). He considers it the signature of generic AI-made UI. Show state with fills, weight, text, or markers.
  - **Fictional content only in the repo.** Never commit real people's data or real syllabi.
  - **Public docs (`mintlify/`) never mention internal agents or tooling** (Claude, Codex, Grok, orchestration, evaluation harnesses, answer keys, real syllabi) or other EdStratum products, and never link into the private repo.
- **Cloudflare credentials (his standing order):** for every Cloudflare operation that needs an API token, use his master token at `~/.config/tessera/cloudflare-api-token` on his Mac. Read it at runtime; never print, log, commit, or copy it. Don't ask him for narrower tokens and don't raise rotation; he assumes the risk. Destructive, DNS, and production changes still need his OK.
- **Before asking him for credentials, endpoints, or infrastructure details**, search his Outline wiki (EL Wiki) across all collections. The "Master Credentials" document is high sensitivity; never quote it.
- **Tessera's in-product AI is WRITER Palmyra-X6** (through Cloudflare AI Gateway), because he uses it heavily for R&D. That's separate from which models write the code.
- Night milestones: Phase 2+ builds run as coordinated multi-agent "Night N" milestones around three personas (administrator, instructor, student), each with `handoff/NIGHT-N-PLAN.md`, `NIGHT-N-QA.md`, one integration branch `nightN`, and one production deploy at the end.

## 2. How development runs

- **Orchestrator loop:** plan → write a tight brief (goal, files to read, exact rules, tests, how to verify) → a worker implements in its own git worktree → the orchestrator reads the whole diff and runs the checks the worker can't → an independent reviewer probes risky changes → fix rounds until clean → the orchestrator commits, merges, pushes, and reports. **A worker's summary is a claim, not evidence.**
- **Worktrees:** `git worktree add ../tessera-<task> -b <prefix>/<task> <base>`; symlink or install `node_modules`. Workers never commit or push; the orchestrator does. Remove worktrees when done (the owner deletes branches).
- **Checks (full lane):** `npm run typecheck`, `npm test` (vitest; includes the stripe guard and repository contract), `npm run build` (`CACHE_DIR=/private/tmp/tessera-storybook-cache npm run build` when Storybook can't write its cache through a symlinked `node_modules`), `npm run a11y` (axe WCAG 2.2 AA plus 320 px reflow; must be N/N with zero violations; add every new page, state, and story to `tools/a11y_audit.mjs`), `npm run e2e` (Playwright journeys on the mock; `ONLY="Journey 19"` runs one). Sandboxed workers usually can't run `a11y`/`e2e` (they listen on a port); the orchestrator runs them.
- **Gate commits and pushes on the checks' exit status**, e.g. `npx vitest run; st=$?; [ $st -eq 0 ] && git commit …`. Never gate on `grep` output (it succeeds when it prints a failure line; this caused one bad local commit).
- **Stage explicit paths** in any worktree where another process might be writing. Never `git add -A` there.
- **Before every push, scan the diff for private content**: `git diff origin/<branch>..<branch> | grep '^+' | grep -i -E '<real names/emails you know of>'`, and `git ls-files | grep -E 'private/|syllabus-eval-|syllabus-review-'` must print nothing.
- **Branch previews:** pushing a branch deploys `https://<branch>-project-tessera.jeff-f69.workers.dev/` in about a minute (Workers Builds runs `npm run build`). **Each push drops the preview's secrets**; re-apply with `tools/preview-secrets.sh <branch>` (sets `WRITER_API_KEY` and `CF_ACCESS_API_TOKEN`). Without `WRITER_API_KEY` the preview silently uses the fixture AI.
- **D1:** `tessera-prod` for production; `tessera-preview` is shared by every preview. Migrations are additive; apply to preview (`npm run db:migrate:preview`) before pushing code that needs them; production only with the owner's OK and after taking a D1 time-travel bookmark.
- **The docs site** deploys from `main`'s `mintlify/`; the `docs-sync` GitHub Action regenerates screenshots on push to `main` (don't commit local screenshots).
- **Other agents in parallel:** `handoff/PARALLEL-AGENTS.md` is the brief for agents working on other areas at the same time (ownership, hotspots, numbering, the shared preview database). Check any agent directive the owner gives you against it for collisions.

### Workers and reviewers (what's worked)

- **Codex CLI** (`/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`), on the owner's subscription:
  - `gpt-6-sol` implements: `codex exec -p tessera -c model_reasoning_effort=high --ephemeral -c 'mcp_servers={}' -C <worktree> -o <report.txt> "<brief>" </dev/null`.
  - `gpt-6-astra` reviews read-only: `codex exec -m gpt-6-astra -s read-only -c model_reasoning_effort=high --ephemeral -C <worktree> -o <report.txt> "<brief>"`.
  - Never let the owner's global `danger-full-access` default apply.
  - Typical cost: Sol 9–33 min and 137k–404k tokens per milestone; Astra 7–13 min and 125k–250k tokens per review.
- **Grok CLI** (`~/.grok/bin/grok`, `--sandbox workspace --cwd <worktree>`) is the alternate worker. In Night 3 one lane cost 13.45M tokens (mostly cached), and a hook-order bug slipped past its tests. Name the rules of React hooks in briefs for app-shell work.
- On the owner's Mac, run Codex and Grok with the Claude Code Bash sandbox off and their own sandbox on. Git writes to `.git` and network calls need the sandbox off too.
- **Astra is the best reviewer found.** It reproduces every finding with a concrete probe (deterministic interleavings against MemoryRepo and the SQLite-backed D1Repo, React server rendering, mocked upstreams) and has never reported a false positive. Always run an Astra integration review before a Night release. For code that deletes or overwrites content, budget three to four review rounds.
- If you use your own team of agents instead, keep the same discipline: explicit sandbox and model flags, a worktree per task, briefs with rules and tests, and your own verification of every diff.

## 3. The product and code layout (short)

Tessera is an AI-native LMS prototype: course → module → lesson → block (D-002). Contract-first: `shared/domain.ts` (types), `shared/api.ts` (`ApiSpec`, `ROUTES` with access and scopes), `shared/schema/*` (zod with `Expect<Equal<>>` checks), business logic once in `shared/service/*` over the `Repo` interface (`MemoryRepo` for mock mode and tests, `worker/d1-repo.ts` for production; both must pass `shared/service/repo-contract.ts`). App: `app/src/` (Vite, React, TypeScript), feature folders per persona, `?data=mock&as=<user>` runs everything in the browser on the real service logic. Worker: `worker/` (Cloudflare Workers, D1, R2, an OCR Container, Durable Objects, Workflows `GenerationWorkflow`). AI: `worker/ai/palmyra.ts` (prompts, JSON schemas, mappers, budgets) with a deterministic fixture in `shared/ai.ts` for mock mode. MCP server under `worker/mcp/`. Everything else is in `CLAUDE.md`.

Hard rules (reviews reject violations): AI drafts never auto-publish, a person keeps them (D-003); AI content only through the Marginalia markup (`AiContent`; `.ai`, `.ai-who`, `.ai-src`, `data-state`), no sparkles or gradients (D-006, D-018); tutor hints first, answer key never a source (D-005); no "learning styles" (D-004); tokens only (D-007); WCAG 2.2 AA, real controls, visible focus, focus return, 24 px targets (44 px for learner touch), reflow at 320 px; nothing confidential under `docs/`; no colored edge stripes (D-017).

## 4. Night 4: "Start from a syllabus" (the design partner): status

An instructor uploads a syllabus (PDF/DOCX) or pastes a brief; the **Design partner** reads it with citations (Read), asks what the document can't answer, the instructor confirms outcomes (Confirm), picks among three course architectures with overlays and a rationale (Approaches), sees an exact hashed change set (Preview), and applies it to get a full draft course: outcomes, modules, lessons with objectives, assignments with TILT text and rubrics, alignment links, starter content with `[Your …]` slots, all drafts, with one-action undo (Review). Spec: `handoff/SYLLABUS-DESIGN-PARTNER-SPEC.md`. Plan and log: `handoff/NIGHT-4-PLAN.md`, `handoff/NIGHT-4-QA.md`. Decisions: D-030 to D-038 in `design/DECISIONS.md` (D-037: suggested outcomes when a syllabus has none; D-038: `.doc`/`.ppt`/`.rtf` refused with how to save as DOCX/PDF).

**Branches (all on GitHub):**

| Branch | State |
|---|---|
| `night4` @ `8c06fb3` | Integration branch: milestones M1–M6 merged, the syllabus evaluation harness, docs page `mintlify/product/design-partner.mdx`. Preview deployed with secrets: https://night4-project-tessera.jeff-f69.workers.dev/app/ |
| `agent/design-placement` @ `417e8c2` | On top of `night4`: graded work placed where the syllabus puts it (occurrences from the schedule's due column, dated work in its week, recurring work split with shared points, participation on Start here), architecture-specific demo approach cards, outcome codes (O1) in text. Verified: 636 tests; P7 passes on the fixtures and on 3 of 4 real syllabi. **Not yet merged into `night4`.** |
| `agent/design-integration` | Built on `agent/design-placement`: fixes for the release blockers from Astra's integration review (`handoff/night4/ASTRA-INTEGRATION-REVIEW.md`; the brief Sol is working from is `handoff/night4/SOL-INTEGRATION-BRIEF.md`). Sol was still running at handoff; Claude pushes this branch when the run ends and its tests pass. If it isn't on GitHub, the work is still in the owner's local worktree `../tessera-n4-integ`. |
| `course-help` | Earlier work (in-app contextual help for course setup), waiting for the owner's review. Its Journey 19 collides with `night4`'s Journey 19: renumber one at merge. |

**Checks at `night4` `cb598f5`–`8c06fb3`:** 633/633 unit tests, a11y 243/243 with zero violations, every e2e journey passes (Journey 19 is the design-partner journey end to end, including selective undo).

**Migrations:** `0008_design_partner.sql` is applied to production and preview D1. The integration fixes may add `0009` (staff-only design-source uploads). Apply to preview before pushing code that needs it, and to production only at release with the owner's OK and a bookmark.

### Remaining work, in order

1. **Verify the integration fixes** on `agent/design-integration`: read the diff, `npm test`, `npm run typecheck`, `npm run build`, `npm run a11y`, `npm run e2e`. Then an **Astra re-check** of the seven P1s specifically (staff-only uploads; MCP outcome confirmation not counting as acceptance; atomic options claim and no endless Workflow; side-effect-free session reads; logs with no syllabus text; small rosters stripped; all AI output via `AiContent`) plus the three P2s.
2. **One more placement rule:** a count written as "N @ X points" ("Projects – 500 points (5 @ 100 points each)") in a component's title or cited span should make it a recurring component split into N instances. Today that one real syllabus (no calendar, no term start) puts all its projects in the last module. It's in `shared/design/plan.ts`; P7 in the harness checks it.
3. **Merge** `agent/design-integration` (which contains placement) into `night4`; resolve conflicts; rerun all checks; push; re-apply preview secrets.
4. **Real-syllabus regression:** run the evaluation harness (section 5) through stage 4 on all 15 syllabi. Targets: extraction passes on nearly every run, P1–P7 pass on all 15, latency median ~95 s.
5. **The owner's visual review:** screenshots of every stage at 1440 px (Start, Read and confirm, Approaches, Preview, Draft ready, Lesson review panel, Alternative openings, the admin Policy page) against the artboards `design/canvas/Syllabus*.dc.html`, plus the review pack (section 5). Send files to him; don't commit screenshots or packs.
6. **Release (needs his go-ahead):** D1 time-travel bookmark for `tessera-prod`, apply any new migration to production, merge `night4` → `main`, tag `night-4`, verify production, close or comment on the related GitHub issues, update `NIGHT-4-QA.md` and `AGENT-ECOSYSTEM.md`.
7. **Later (from `handoff/NIGHT-4-NOTES.md`):** the guided New-course flow (auto wizard / manual / template) and its four open questions for the owner; the `course-help` review.

## 5. The syllabus evaluation harness

- `node tools/syllabus_eval.mjs --ai palmyra|fixture [--runs N] [--stages 2|3|4] [--only a,b] [--concurrency N] [--keep] [--out reports/x.json]` runs syllabi through the **real service** (MemoryRepo, the Worker's parsers, real Palmyra when `WRITER_API_KEY` is set) and scores them against answer keys with the rubric in `handoff/SYLLABUS-EVAL-RUBRIC.md`: E1–E11 extraction, R1–R6 read, P1–P2 approaches, P3–P7 plan, apply, drafts, undo, and placement.
- `node tools/syllabus-eval/report.mjs <run.json> <out.html>` turns a `--keep` run into a review pack: each syllabus's extraction next to its answer key, with checks, questions, the read, and the proposed approaches. The owner asked for this evidence.
- **Test set:** 2 committed fictional STAT 110 fixtures, 6 fictional syllabi the owner supplied, and 7 real syllabi from different authors. The 13 non-committed ones and their answer keys (built by subagents, checked by hand) live **only on the owner's Mac** in the gitignored `tests/fixtures/syllabus/private/` of `../tessera-night4`. Real syllabi contain real names and contact details. Never commit them or anything derived from them. Evaluation outputs (`reports/syllabus-eval*.json`, `reports/syllabus-review*.html`) are gitignored for that reason. Once they were committed by mistake and had to be purged from unpushed history before any push; scan before every push.
- Latest results: extraction 13–15 of 15 per run depending on variance; the full pipeline (stages 3–4) passed on 15 of 15; latency median 95 s, p90 176 s, 9% over 3 minutes (all from retries).

## 6. What was learned (don't relearn these)

**Palmyra-X6 through AI Gateway:**
- **WRITER caches identical requests upstream** (AI Gateway's skip-cache header can't reach it). Without a fresh `seed` per request, retries and the user's "Try again" replay the same failed response. Every request sends a random `seed`.
- **Reasoning tokens count against `max_tokens`.** At 8,000 a 9-page syllabus ran out before the JSON ended in 7 of 8 calls. Budgets are now 12k–24k with `reasoning_effort: 'low'` (not in WRITER's docs, but honored).
- **Runaways:** Palmyra sometimes degenerates into blank lines until `max_tokens`. The client sends `stop: ['\n\n\n']` (compact JSON never contains raw newlines) so a runaway ends fast and retries.
- **Split big requests into parallel parts** with their own schemas and retries: extraction = course / schedule / policies; read = audit / review. Each part has an "accept" predicate that retries lazy output (weights that add up to almost nothing, a near-empty schedule when the source has a calendar, an audit that links nothing). A failed policies part degrades instead of failing the job. A run deadline of 270 s fits inside a 5-minute Workflow step.
- **Constrain ids in the request schema** (for example the approach ids as an enum of the candidates) instead of hoping the model uses them.
- **Model output is untrusted input: repair, then validate.** Validators that threw on anything imperfect (an invented rubric number, a duplicate audit, an inexact quote) discarded good extractions on 13 of 15 syllabi. Repair what's safe (drop unknown ids, dedupe, clamp, fill from a rule-based fallback, ground quotes) and reject only bad shapes, with one retry.
- **Ground citations** (`shared/service/ground-spans.ts`): find each quote in the source (ignoring case, whitespace, curly quotes, line-break hyphens, and ellipsis fragments), set the page or DOCX section, and drop a page the document doesn't have.

**Parsing real documents:**
- DOCX: group by heading styles, with pseudo-headings (bold, all caps, numbered titles) when a document has fewer than four styled headings. Table cells use ` | ` and paragraphs inside a cell use ` / `. "Label: value" lines aren't headings.
- PDF: small caps arrive as "C ATALOG D ESCRIPTION", sometimes with a real space inside one text item, so they're fixed in text (`joinSmallCaps`). Running headers and footers repeat on half or more of the pages and get dropped.
- A roster filter once deleted schedule rows because a topic mentioned "student". Roster detection needs a real roster header plus name-and-ID rows.
- Merge schedule rows that share a week; blank out junk values like `":null,"`; keep the primary code of a cross-listed course; a week-count question fires only when every week has its own row.
- `.doc` via macOS `textutil` flattens tables, so it isn't representative; the product refuses `.doc` (D-038).

**Concurrency and data safety:** code that deletes or overwrites course content must make the condition part of the write (compare-and-set in both repositories, D1 batches whose statements carry the guard, `changes()` chaining), use an apply revision so in-flight work after an undo writes nothing, and use immutable plan keys, not titles or positions. Astra's four rounds on M5 found every class of this.

**Front end:**
- E2E steps must wait for a heading or an element state, never a fixed time. Counting before render gave a false "0 modules" once.
- Admin nav clicked before the post-setup redirect settles is a recurring flake.
- A CSS grid's implicit column sizes to its widest child's minimum width, and a `<select>` sizes to its longest option, which broke 320 px reflow. Use `grid-template-columns: minmax(0, 1fr)` and `max-width: 100%` on selects.

**Evaluation discipline:**
- Build answer keys independently of the model and verify them against the document; keys need normalization for multi-week rows, holiday weeks, and alternative weight bases.
- A strict harness catches real bugs and also its own. Check whether a failure is the model, the product, or the key before fixing anything.

## 7. First moves for you

1. Read this page, `CLAUDE.md`, `AGENTS.md`, `handoff/PARALLEL-AGENTS.md`, `handoff/night4/ASTRA-INTEGRATION-REVIEW.md`.
2. Check out `agent/design-integration` (or `agent/design-placement` if the integration branch isn't pushed yet) and verify it as in section 4, step 1.
3. Report to the owner with the result and a Next steps block, then continue down the list in section 4.

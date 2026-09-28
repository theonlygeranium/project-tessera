# Agent ecosystem

How project-tessera uses several AI coding agents together. Claude is the chief strategist and orchestrator; the other agents are workers that Claude plans for, delegates to, and verifies. The goal is to get more done per unit of subscription capacity by sending each piece of work to the cheapest agent that can do it well, and by reserving Claude's own capacity for strategy, architecture, review, and integration.

Last verified: 2026-09-26.

## Active ecosystem

Three agents are active. Everything else is on the [bench](#bench) and isn't used unless the user brings it back.

| Agent | Status | Role | Models in use |
|---|---|---|---|
| **Claude Code** | Active | Chief strategist and orchestrator | Opus; Sonnet and Haiku for Claude's own subagents |
| **Codex CLI** | Active, primary worker | Default implementer, default reviewer, mechanical work | `gpt-6-sol`, `gpt-6-astra`, `gpt-6-luna` |
| **Grok CLI** | Active, **alternate** | Takes implementation load when Codex is limited, handles parallel parts, second reviewer for high-stakes changes | `grok-4.7`, `grok-4.7-build-fast` (mechanical) |

## Project Tessera specifics

- **Verification follows the deploy lanes in `CLAUDE.md`.** Fast lane (minor changes): Claude reads the worker's diff, rebuilds if sources changed, and pushes to `main`; the `a11y` workflow runs after the push. Full lane (big features, separate work): the whole Definition of done — build, `npm run a11y` with zero violations, a walkthrough of every affected flow including the prototype's Reset, screenshots — then a branch preview before merging.
- **Owner decisions stay with the owner.** Issues labeled `decision` (starting with #16, the build approach) are never delegated; Claude prepares the options and the owner picks.
- **Subjective design direction stays with Claude and the owner.** The owner reviews visually. Workers can implement a chosen direction, but alternatives go to the owner side by side (as with D-006).
- **Rapid production deploys.** The owner is the sole developer and tests live. Minor changes go straight to `main` (production) without extensive QA or asking first; branch previews (public URLs) are for big or separate features. Workers never push; Claude reads every diff before pushing.
- **Nothing confidential under `docs/`** (D-012). This file lives in `handoff/` because it isn't meant for the public site.

## Principles

1. **Claude orchestrates; workers execute.** Claude owns the plan, breaks work into tasks, picks the agent and model for each task, writes the task brief, and integrates the results. Workers own nothing beyond the task they were given.
2. **Nothing is done until Claude has verified it.** Every delegated result gets a diff review, a test run, and targeted edge-case checks by Claude before it is reported as done or committed. A worker's own summary is a claim, not evidence. In trials, two of four workers shipped the same spec gap, and one of them reported "no uncertainties".
3. **Route by task, not by habit.** Mechanical work goes to a fast, cheap model. Everyday coding goes to a workhorse model. Reviews go to a frontier model from a different model family than the one that wrote the code.
4. **Use capacity you already pay for.** Spread load across the Claude, ChatGPT (Codex), and Grok subscriptions so that no single plan runs out first.
5. **Explicit flags, every time.** Every delegated run names its model (or a project profile that fixes the model) and its sandbox mode. No run relies on a tool's global defaults.
6. **Isolation for writes.** Any worker task that edits files runs in a git worktree or scratch branch, never directly in the main checkout.

## Operating model

Agreed with the user on 2026-09-26, based on the trials below.

**Order of agents**

| # | Agent | Job |
|---|---|---|
| 0 | **Claude** | Takes in requests, plans, writes task briefs, verifies everything, commits, reports to the user |
| 1 | **Codex `gpt-6-sol`** | Default implementer for anything with a clear spec |
| 2 | **Codex `gpt-6-astra`** | Default reviewer for any non-trivial change, including Claude's own |
| 3 | **Grok `grok-4.7`** (alternate) | Takes work when Codex is limited, handles parallel parts, second reviewer for high-stakes changes |
| 4 | **Codex `gpt-6-luna`** | Mechanical work |

**Delegate or do it directly.** Claude delegates to Sol when all three are true: the spec can be written as a brief with concrete examples, tests can check the result, and writing the brief takes less effort than doing the work. Claude does the work directly when it's small (roughly a single-file fix where the brief would be as long as the change), ambiguous, likely to need a conversation with the user, cross-cutting, architectural, or dependent on context that exists only in the conversation.

**Default loop.** Claude plans → Sol implements in a worktree → Claude verifies (tests plus edge-case probes) → Astra reviews anything non-trivial → Claude sorts the findings and commits.

**When Grok steps in.** Codex returns a rate-limit or usage error; the work splits into independent parts that should run in parallel; or a high-stakes change deserves a review from a third model family after Astra's.

**Caveats.** The rankings come from three small trials. Claude checked the workers but wasn't compared against them. Review the routing after about ten real tasks. For auto mode, `.claude/settings.local.json` has an `autoMode.allow` rule permitting Codex and Grok runs with the Bash sandbox off, but only when the agent's own sandbox flags are present. It hasn't been tested in auto mode yet; if a delegated run is blocked there, switch to accept-edits or bypass-permissions mode.

## Routing

Pick the first row that matches the task.

| Task | Agent and model | Effort / mode | Why |
|---|---|---|---|
| Strategy, architecture, ambiguous requirements, cross-cutting design, subjective design direction | Claude (with the owner for `decision` issues) | — | Needs the whole picture and the owner's intent |
| Review of a plan or diff | Codex `gpt-6-astra`; add Grok `grok-4.7` for high-stakes changes | `high`, `read-only` | Different model families catch different mistakes |
| Hard bug, subtle concurrency or performance problem | Claude leads; Codex `gpt-6-astra` in parallel as a second investigator | `high`, `read-only` | Two independent diagnoses beat one |
| Self-contained feature, bug fix, refactor, or new tests with a clear spec | Codex `gpt-6-sol` (profile `tessera`) | `medium`, `workspace-write` in a worktree | Best quality per token in trials |
| Same as above, but Codex is limited or the work fans out in parallel | Grok `grok-4.7` | `--sandbox workspace` in a worktree | Solid quality, reports its assumptions |
| Mechanical change: rename, boilerplate, scaffolding, docstrings, config churn | Codex `gpt-6-luna`; Grok `grok-4.7-build-fast` when Codex is limited or for parallel parts | `low`, `workspace-write` in a worktree | Easy to verify, so the cheapest capable model wins. In the mechanical trial Luna missed one item and didn't report it; Grok-fast was complete but used about 7× the tokens. |
| Codebase search and exploration for Claude's own planning | Claude subagents (Explore, Sonnet or Haiku) | — | Keeps the orchestrator's context and capacity free |
| Anything destructive or irreversible (deletes, force pushes, merges, deploys, schema drops) | Claude, with the user's explicit approval | — | Never delegated |

**Moving up:** if a worker fails the same task twice, Claude moves it one tier up (Luna → Sol or Grok → Astra → Claude) instead of retrying the same model a third time.

## Usage optimization

- **Claude's capacity is for work only Claude should do:** planning, routing, briefs, verification, integration, and conversations with the user. Implementation that can be specified clearly gets delegated.
- **Cheapest capable model first.** Luna for mechanical work, Sol for real coding, Astra for reviews and hard problems. Effort levels above `high` (`xhigh`, `max`, `ultra`) need a stated reason.
- **Codex first, Grok as overflow.** On the same task Grok used about 8× Sol's tokens (144,756 against 18,331) and its result was weaker. Use Grok when Codex is limited or for parallel capacity and model-family diversity, not by default.
- **Keep briefs small.** A tight, self-contained brief that names the relevant files costs fewer tokens than asking a worker to explore the repo.
- **Measure.** Record agent, model, time, and tokens (and cost when reported) for every delegated run. Codex prints `tokens used`; Grok's `--output-format json` includes `modelUsage` and `total_cost_usd`. Adjust this document after about ten tasks.
- **Don't store runs you don't need.** Pass `--ephemeral` to Codex for one-off runs.

## Standard workflows

### A. Delegate and verify (default)
1. Claude writes a task brief (template below) and creates a worktree: `git worktree add ../tessera-<task> -b agent/<task>`.
2. Claude runs the worker with explicit model and sandbox flags, pointed at the worktree.
3. Claude reads the full diff and checks every requirement in the brief. Fast lane: rebuild if sources changed, then go to step 5. Full lane: also run the build and `npm run a11y`, walk the affected flows, and probe the edge cases the spec implies (Reset, keyboard paths, 320px reflow, unusual inputs).
4. If there are problems: send one round of specific feedback to the same worker, or move the task up a tier.
5. Claude commits and pushes to `main` so the owner can test live (full lane: push the branch first and check its preview). Then Claude removes the worktree and reports what changed, the production URL, and the agent, model, time, and tokens.

### B. Second-opinion review
1. After Claude or a worker produces a diff, run Codex `gpt-6-astra` in `read-only` mode with a review brief. For high-stakes changes, also run Grok with the same brief.
2. Claude triages each finding (confirm, reject with a reason, or fix) and doesn't accept findings blindly.
3. Confirm the reviewer changed nothing (`git diff --stat` is the same before and after).

### C. Parallel fan-out
For work that splits into independent parts: one worktree per part, one worker per worktree (Codex Sol by default, Grok for the extra parts), running at the same time. Claude integrates the parts and runs the full test suite on the combined result.

## Task brief template

```
Goal: <one sentence, the outcome>
Context: <files and functions involved; relevant constraints and contracts; concrete failing examples>
Do: <specific changes expected>
Don't: <out-of-scope areas; don't commit; don't change public interfaces unless stated>
Verify: <exact command(s) to run and what passing looks like>
Report: <files changed, root cause, command run and result, anything uncertain>
```

## Guardrails

- Every Codex run uses the project profile (`-p tessera`) or passes `-m <model>` together with `-s read-only` or `-s workspace-write`. Never rely on the global Codex default, which is `danger-full-access` with `approval_policy = "never"`.
- Every Grok run passes `--sandbox workspace` (or a stricter profile) and `--cwd <worktree>`. `--always-approve` is only allowed together with `--sandbox`.
- Workers never commit, push, merge, delete branches, or touch files outside their worktree. Claude commits after verifying.
- Workers never see credentials beyond what their own CLI login provides.
- Destructive or irreversible actions always need the user's explicit approval (see the user's global `AGENTS.md`).
- A worker's claim ("tests pass", "no uncertainties") is not evidence until Claude has re-run the tests and probed the edge cases.

## Command reference

Codex and Grok run with Claude Code's Bash sandbox turned off for the command; their own sandbox (`-s` / profile, `--sandbox`) still applies.

```bash
CODEX=/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex
GROK=~/.grok/bin/grok

# Implement: gpt-6-sol, medium, workspace-write (profile ~/.codex/tessera.config.toml)
$CODEX exec -p tessera --ephemeral -c 'mcp_servers={}' -C <worktree> -o <report.txt> "<brief>" </dev/null

# Review: gpt-6-astra, read-only
$CODEX exec -m gpt-6-astra -s read-only -c model_reasoning_effort=high --ephemeral -C <worktree> -o <review.txt> "<review brief>" </dev/null

# Mechanical work: gpt-6-luna
$CODEX exec -m gpt-6-luna -s workspace-write -c model_reasoning_effort=low --ephemeral -C <worktree> "<brief>" </dev/null

# Grok (alternate): implement or review in a sandboxed workspace; JSON output includes usage and cost
$GROK -p "<brief>" -m grok-4.7 --sandbox workspace --always-approve --cwd <worktree> --output-format json </dev/null
```

`-c 'mcp_servers={}'` skips the user's 29 global MCP servers for that run. It saves about 2 seconds per run and isn't required.

## Known limits

- **Codex can't reach its API through Claude Code's sandbox proxy.** Requests to `chatgpt.com` fail (likely a TLS certificate check; not proven), and `sandbox.excludedCommands` didn't help. Claude runs Codex with the Bash sandbox off for that one command and relies on Codex's own sandbox.
- **Grok can't run inside Claude Code's sandbox with its own sandbox on.** macOS doesn't allow a nested sandbox ("sandbox initialization failed: Operation not permitted"), and Grok correctly refuses to start without the protection it was asked for. Without `--sandbox` it also needs `~/.grok` writable. Running Grok inside Claude's sandbox would mean giving up its worktree-scoped sandbox, so Claude runs it with the Bash sandbox off and `--sandbox workspace` on.
- **Grok's `--output-format json` can come back with an empty `result`** after long runs (both Night 1 runs). Always ask Grok to also write its report to a file in the worktree (for example `reports/lane-report.md`); that worked on the Night 1 admin patch, and the report was thorough and accurate.
- **Cloudflare Containers (OCR, D-023):** custom instance types need at least 3 GiB of memory per vCPU and at most 2 GB of disk per GiB; the image built fine each time and only these checks failed, at deploy time. Previews allow `max_instances` 1, so code must not spread work over more instance names than the environment allows (`OCR_INSTANCES`). A registry timeout on image push is transient; retry with an empty commit. Build logs aren't readable with the Wrangler OAuth token (403); read them in the dashboard (Workers & Pages → project-tessera → Deployments → build), where the log panel must be scrolled to render.
- **Cloudflare credentials (owner's order, 2026-09-27):** one master Cloudflare API token (`~/.config/tessera/cloudflare-api-token`) serves every Cloudflare operation and Worker secret. Agents don't request scoped tokens or raise rotation. Workers never see it; Claude reads it at runtime.
- **`wrangler preview <unknown>` deploys.** `wrangler preview list` isn't a command; Wrangler treats the word as an argument and starts building and deploying a preview of the current branch (it failed harmlessly on 2026-09-27). Always pass `--name <branch>` to `wrangler preview` subcommands, and check `--help` first. Deleting a GitHub branch removes its preview; the preview's container application has to be deleted separately (`wrangler containers delete <id>`).
- **Never install with `--legacy-peer-deps`.** Local installs succeed, but CI and Cloudflare run `npm ci`, which fails on the peer conflict, so every check and the branch preview break (Night 2, `openapi-typescript` vs TypeScript 7). Check a new dependency with `npm ci` on a clean copy of `package.json` and `package-lock.json`.
- **Two Grok sessions can run at once** (Night 1 ran C2 and D in parallel without interference).
- **Codex's `workspace-write` sandbox can't bind localhost ports**, so workers can't run `npm run a11y`, `wrangler dev`, or a Vite server. Briefs say so, and Claude runs those checks after the worker finishes.
- **Codex profiles must be separate files** (`~/.codex/<name>.config.toml`) in this CLI version. `[profiles.*]` tables inside `config.toml` make `-p` fail with a "legacy profile" error.
- **Codex only speaks the Responses API** (`wire_api = "chat"` is rejected), so any custom provider must offer `/v1/responses`.
- **The Codex CLI build is an alpha** bundled with ChatGPT.app and changes when the app updates.
- **Grok's `total_cost_usd`** is reported per run. It isn't confirmed whether that's billed or an estimate while signed in with a grok.com account.

## Bench

These were set up and tested but aren't part of the active ecosystem. Claude doesn't route work to them unless the user asks. Their configuration is left in place so any of them can be brought back quickly.

| Agent | Why it's benched | Test results | To bring it back |
|---|---|---|---|
| **Cursor CLI** (`cursor-agent`, Cursor subscription) | Limited to `auto` until the named-model allowance resets, and Auto doesn't report which model ran | `--model auto` worked inside Claude's sandbox; `composer-2.5` and `gpt-5.3-codex-low` refused (out of usage) | Only while Cursor usage is available: `cursor-agent -p --trust --output-format json --model auto --workspace <worktree> "<brief>"`. Allowed in `.claude/settings.local.json`. |
| **Schubert `qwen3.6`** (Ollama, `100.86.47.6:11434`, Tailscale) | Weaker than Sol on spec details, didn't report its gaps, and used 4× Sol's tokens | Trial 2: correct except Unicode, claimed "No uncertainties". `qwen2.5-coder:32b` made no changes at all. | For code that must stay on the local network: `codex exec -p tessera_local …` (`~/.codex/tessera_local.config.toml`), always followed by a review |
| **Palmyra-X6** (Writer, via Schubert LiteLLM, `http://100.86.47.6:4010/v1`) | Can't run as a Codex agent, and lost the review test to Astra | Chat works (about 0.5–3 s). Codex fails: LiteLLM forwards `/v1/responses` to Writer, which returns 404. Missed the Unicode defect Astra caught. | Needs LiteLLM to translate Responses calls to Chat Completions for this model. Codex provider `schubert_litellm` and profile `~/.codex/tessera_palmyra.config.toml` are in place for a retest. The key is documented in the EL Wiki page "CrewAI Installation & Configuration". |

## Verification log

| Date | Check | Result |
|---|---|---|
| 2026-09-26 | Cursor headless in Claude's sandbox, `--model auto` | `CURSOR_OK` |
| 2026-09-26 | Cursor named models (`composer-2.5`, `gpt-5.3-codex-low`) | Refused: out of usage |
| 2026-09-26 | Codex `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna` reachable | All `OK` |
| 2026-09-26 | Codex `gpt-5.3-codex` | Refused: not supported with a ChatGPT account |
| 2026-09-26 | Trial 1 (`merge_intervals`, 2 planted bugs plus a trap): Sol implements, Astra reviews | Sol: minimal correct fix, 6 good tests, 46 s / 16,973 tokens. Astra: no defects, one valid test-gap note, 58 s / 15,810 tokens. |
| 2026-09-26 | Codex loads the repo's `AGENTS.md` | "Claude is the orchestrator; I'm not allowed to commit." |
| 2026-09-26 | Grok signed in (grok.com), headless `-p` with `--sandbox workspace` | Works; refuses to start if the requested sandbox profile doesn't exist |
| 2026-09-26 | Trial 2 (`top_words`, 4 planted bugs plus a Unicode "letters" requirement), same brief to four models | See the next table |
| 2026-09-26 | **First real task:** #17 slice 1 (tokens.css generator, app switched to it, `design/COMPONENTS.md`) by Codex `gpt-6-sol`, profile `tessera`, worktree `../tessera-17` | 209 s, 67,128 tokens. Code correct and minimal; honestly flagged that it couldn't run the audit (its sandbox blocks local servers) and that `npm run dev` would fail on a fresh checkout. Claude fixed: one factual error in the inventory (said the change-set table wasn't on any artboard; it's in the instructor ⌘K dialog), three missing components, a `predev` step. Verified: clean build, a11y 47/47, computed-style parity with production. Commit `dd28f5e`. |
| 2026-09-26 | **Parallel split:** Button, StatusChip, Card (+21 stories) by Codex `gpt-6-sol` in worktree `../tessera-components`, while Claude built Storybook setup and `AiContent` | 201 s, 62,609 tokens. Type-safe APIs (icon-only buttons require a label; interactive cards require a link); no hard-coded colors. Again flagged honestly that its sandbox couldn't run the audit. Claude fixed one visual bug (text-button border was white, now transparent). Verified: 73/73 including 26 stories, Cloudflare preview built in about 50 s. One process slip by Claude: the first launch had no brief because the sandboxed and unsandboxed shells use different temp folders; caught and relaunched before it changed anything. Write briefs to the session scratchpad. |

| 2026-09-27 | **Night 1 lane B:** 14 components split into two parallel Codex `gpt-6-sol` runs (forms/feedback/data and navigation/content), worktrees `../tessera-n1-b1` and `../tessera-n1-b2` | 302 s / 64,876 tokens and 306 s / 79,673 tokens. Both honest that they couldn't run the a11y audit (Codex's `workspace-write` sandbox refuses to bind a localhost port); Claude merged both and ran it: 131/131 pass, tokens only. |

| 2026-09-27 | **Night 1 lane C1:** service layer (every API operation, MemoryRepo, validators, tests), Codex `gpt-6-sol` at `high` | 550 s / 109,988 tokens. Correct and close to the brief; honest about its interpretations. Claude parallelized lesson drafting afterward. |
| 2026-09-27 | **Night 1 lane C2:** Worker router, D1Repo, Access JWT, Wrangler config, Grok `grok-4.7` | 1,881 s, 26 calls, $1.42 reported (about 3.5M tokens, mostly cache reads). Sound code; its tests asserted the stub service, so 2 needed updating after merge. The JSON output's `result` was empty, so the final report was lost; Claude reviewed the diff directly. |
| 2026-09-27 | **Night 1 lanes E, G, F:** instructor, student, and builder screens, three Codex `gpt-6-sol` runs in parallel | 341 s / 110,519; 313 s / 100,831; 642 s / 71,981. All built and passed tests; Claude's browser walkthrough found a narrow-input layout bug, a duplicated feedback prefix, and a 320 px overflow in a shared component. |
| 2026-09-27 | **Night 1 lane D:** administrator screens, Grok `grok-4.7` (second concurrent session) | 1,736 s, 51 calls, $1.66 reported. Journey 1 worked on the first walkthrough. Empty `result` again. |
| 2026-09-27 | **Night 2 lane A (schemas):** zod schema per operation, OpenAPI 3.1 generator, Codex `gpt-6-sol` at `high` | 342 s / 98,323 tokens. Every schema is type-checked against the domain (`Expect<Equal<…>>`), and a test asserts route coverage. Missed `Institution.accessPolicy` because it was added to the domain after the brief; honest that Worker wiring was out of scope. Claude added the field, wired `validateInput` + query coercion into the router, and added three router tests. Code is dense (no spaces); acceptable, but brief the next lane on repo style. |
| 2026-09-27 | **Night 2 lane A2 (document engine):** PDF/DOCX/PPTX checks, fixes, image extraction under `worker/access/`, Codex `gpt-6-sol` at `high` | 548 s / 110,739 tokens. Own OOXML scanner with offset-preserving edits, pdf.js + pdf-lib, nine fixture tests including a hand-built tagged PDF for reading order. Reported accurately that the shared WCAG map was absent from its checkout (it shipped a local copy Claude replaced with `wcagFor`) and that pdf.js was not run in a Workers isolate. |
| 2026-09-27 | **Night 2 lane E (grading):** assignments, submissions, rubric grading, release, gradebook, AI feedback, three app pages, Codex `gpt-6-sol` at `high` | 568 s / 135,464 tokens. Service tests cover attempts, due dates, rubric validity, and release gating. Reported its contract workarounds (`task: 'feedback' as never`, mock-mode file links) instead of hiding them. Claude added `'feedback'` to `AiTask`, fixed the grading panel heading (showed the student id) and the file link path. |
| 2026-09-27 | **Night 2 lane C (block editors and players):** document, table, scenario, link, video, Grok `grok-4.7` | About 30 minutes, 64 turns, $2.11 reported. It spent the first ~15 minutes only reading, then wrote everything in one pass. Clean: no stripes or raw colors, titled iframe, captions track, focus moves to each scenario step. Honest report (couldn't run the audit, listed eight assumptions). JSON `result` came back fine this time. Claude merged it; audit 172/172. |
| 2026-09-27 | **First Codex GitHub review** (`chatgpt-codex-connector`, `@codex review` on draft PR #49, Wave 0) | Picked up in under a minute, finished in about 4.5 minutes, six findings, **all real**: a D1 CHECK constraint that would reject every new block type in production (tests used MemoryRepo and missed it), demo routes open to any API token, the D-022 policy never applied at publish, the document engine and upload route not wired, draft assignments unreachable. Claude, Sol, and the tests had missed the first three. Worth running on every Night branch before merge. |
| 2026-09-27 | **Second Codex GitHub review** (#49 at `1040a5b`, the document engine) | About 4 minutes, three findings, all real: an alt-text path that could send another course's file to the vision model, MemoryRepo and D1 disagreeing on file scan summaries, and a schema looser than the service. |
| 2026-09-27 | **Night 2 lane B (Access UI)**, Codex `gpt-6-sol` at `high` | 494 s / 123,373 tokens. Seven pages and components, clean markup, focus handling as briefed. Claude fixed two things at merge: every `unsupported` error was worded as "demo mode" (wrong in production), and the editor preview made knowledge checks answerable by staff. |
| 2026-09-27 | **Night 2 lane D (authoring at scope)**, Codex `gpt-6-sol` at `high` | 700 s / 164,946 tokens. Poll-driven jobs, six generators, import. Honest report (flagged the missing contract field). Claude's browser walkthrough found what tests didn't: the video-script instruction leaked into every element of a job, and polling stopped in a background tab (jobs only advance while polled). Also exposed Claude's own mistake: unreviewed AI drafts were scored as WCAG failures. |
| 2026-09-27 | **Night 2 lane F (tutor)**, Codex `gpt-6-sol` at `high`, on Claude's pre-written D-005 policy module | 729 s / 171,954 tokens. Used the policy as briefed (no re-implemented rules), stripped answer keys from sources, added a verbatim-quote guard on summaries unprompted. Claude found a false-positive in its own leak check while reviewing ("choose a question" matched when the answer was (a)) and fixed it. |
| 2026-09-27 | **Night 2 lane H (presets)**, Codex `gpt-6-sol` at `high` | 435 s / 120,469 tokens. Atomic profile + adaptation writes; honest report. Changed onboarding's button (as briefed), which broke journey 4; the journey was updated. |
| 2026-09-27 | **Night 2 docs**, Claude Sonnet subagent | 399 s / 204,405 tokens. Five pages plus the generated API reference; both Mintlify checks passed. Three overclaims (undo of fixes, alt text in the reading version, policy on documents) caught on Claude's read. Pre-writing policy code for a sensitive lane, then briefing the worker to use it, worked well. |
| 2026-09-27 | **Three Codex `gpt-6-sol` runs at once** (lanes A, A2, E, one worktree each) plus one Grok session | No rate limits or interference. Merging three lanes that touched `repo.ts`, `seed.ts`, `memory-repo.ts`, `d1-repo.ts`, and `service/index.ts` produced five conflicts, all "keep both", resolved by script in one pass. |
| 2026-09-27 | **Night 3 Wave 0 storage lane**, Codex `gpt-6-sol` at `high` (every new Repo method in MemoryRepo and D1Repo, seed arrays, contract tests) | 13 min / 158,588 tokens. Correct and well tested (274 tests). It found and updated the SQLite test shim that replays migrations, which the brief didn't mention. It flagged two real issues in its report: explicit `null` on new optional fields round-tripped differently in the two repos (fixed by Claude with a normalizer and a contract test), and a pass-mark range mismatch between a doc comment and the migration. Lesson: when a brief says "NULL column means omitted", also say what the in-memory repo does with explicit nulls. |
| 2026-09-27 | **OSCQR text fetch**, Claude Sonnet subagent | 129 s / 126,563 tokens. Verbatim 50 standards from the official OSCQR 4.0 PDF, license and attribution checked on the source site, and an honest note that one visual flag (RSI icons) wasn't pixel-verified. |
| 2026-09-27 | **Night 3 Wave 1: four Codex `gpt-6-sol` runs at once** (lanes A templates, B readiness, C variants, D required training) | A 15 min / 198,139 tokens; B 17 min / 214,978; C 13 min / 166,296; D 19 min / 215,940. All four correct and tested, no rate limits. **None could run `npm run a11y`**: Codex's sandbox refuses a local listener (`listen EPERM`), so Claude ran it after merging (one audit step from lane C was wrong, not the page; 201/201 after the fix). Each flagged a real gap honestly (A: students couldn't read a program's brand; B: reviewers shown by id; D: staff can't complete required training through the student lesson flow). Merging produced conflicts only in shared registries (`service/index.ts`, `nav.ts`, `a11y_audit.mjs`) plus two real overlaps (`content.ts` publish gate from A and B; `student.ts` progress from C and D), resolved by hand. Lesson: pre-register every lane's service in `index.ts` during Wave 0 to remove the most common conflict. |
| 2026-09-27 | **Night 3 lane E (PDF images, OCR second pass)**, Codex `gpt-6-sol` | First run stopped after 1 min / 57,709 tokens and made no edits because the review flow needed a contract change the brief forbade: the right call. Claude added the operations; the second run took 14 min / 188,665 tokens. Container code can't be exercised locally (no Docker); verification is on the preview. |
| 2026-09-27 | **Night 3 lane D2 (manager view)**, Grok `grok-4.7` | 25 min, 85 turns, 13.45M tokens (13.1M cached reads; 251k input, 97k output). Service correct and faithful to the privacy module; good tests (including a router test for the token scope). One real bug: it added two data hooks after AppShell's early returns, which broke the hook order and crashed the administrator setup page; the unit tests couldn't catch it and Grok couldn't run the browser audit (Chromium crashed in its sandbox), so Claude's audit caught it. Lesson: for app-shell edits, name the rules of hooks in the brief. |
| 2026-09-27 | **Night 3 integration review**, Codex `gpt-6-astra` at `high`, read-only | 11 min / 250,221 tokens. Excellent: 12 findings (7 P1), every one reproduced with a concrete probe, none false. It found what 375 unit tests, 17 journeys, and Claude's diff reviews missed: concurrency races (roster writes, certificate issuance and replacement, Workflow takeover overwriting a kept block), AI drafts leaking through variant copies and readiness checks (D-003), and cross-environment Access writes. It also confirmed the privacy, answer-key, and authorization areas clean with probes. Lesson: always run an Astra integration review before a Night release, and brief lanes to consider concurrent requests explicitly. |

Trial 2 results (every result verified by Claude with the tests plus edge-case probes):

| Model | Outcome | Unicode letters | Reported its assumptions | Time | Usage |
|---|---|---|---|---|---|
| Codex `gpt-6-sol` (profile `tessera`) | Correct | Handled (`[^\W_]`, `casefold`) | Yes | 72 s | 18,331 tokens |
| Grok `grok-4.7` | Correct except Unicode | ASCII only | **Yes, flagged ASCII-only** | 101 s | 144,756 tokens, $0.054 reported |
| Schubert `qwen3.6` (bench) | Correct except Unicode | ASCII only | **No** ("No uncertainties") | 62 s | 75,875 tokens, own hardware |
| Schubert `qwen2.5-coder:32b` (bench) | **No changes made**, narrated plans | — | — | 53 s | 9,146 tokens |

Mechanical trial, 2026-09-26: rename `get_usr_name` → `get_user_name` across three files, keep a deprecated alias that warns, add docstrings and type hints to two functions. The trap: a dict named `get_usr_name_cache` must keep its name (a blind find-and-replace breaks an existing test). Both ran in parallel, one worktree each.

| Model | Trap avoided | Alias + warning | Docstrings and hints | Reported accurately | Time | Usage |
|---|---|---|---|---|---|---|
| Codex `gpt-6-luna` (`low`) | Yes | Yes | **Missed `greet`'s docstring** | **No** ("Added the requested docstring… Nothing uncertain") | 29 s | 26,604 tokens |
| Grok `grok-4.7-build-fast` | Yes | Yes | Complete | Yes (flagged unspecified warning text and missing alias test) | 52 s | about 186k tokens incl. cache reads; $0.103 reported |

Reviewer test, 2026-09-26: the identical review prompt, containing qwen3.6's ASCII-only `top_words`, was given to two reviewers.

| Reviewer | Found the Unicode defect | Time | Usage |
|---|---|---|---|
| Codex `gpt-6-astra` (`high`) | **Yes**, with the exact failing input (`"café café"` → `[("caf", 2)]`) | 11 s | 9,882 tokens |
| Palmyra-X6 (bench, LiteLLM chat) | **No**, "No defects found" | 3 s | 434 completion tokens (341 reasoning) |

## Open items

1. Confirm the `autoMode.allow` rule works: run one delegated task while in auto mode.
2. After roughly ten delegated tasks, review the verification log and adjust the routing table. Watch in particular whether Luna's missed requirements recur; if they do, move mechanical work to Sol at `low`.
3. Bench, when relevant: re-test Cursor named models after the allowance resets; retest Palmyra-X6 if LiteLLM gains a Responses-to-Chat bridge; decide whether to move or retire the legacy Codex profiles (`coder`, `coder_large`, `reasoning`).

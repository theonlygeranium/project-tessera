# Night 4 plan: Start from a syllabus (the design partner)

**Status: in progress on branch `night4` (2026-09-28).** Scope and decisions approved by the owner (D-030 to D-036). The normative spec is `handoff/SYLLABUS-DESIGN-PARTNER-SPEC.md`; this plan says how it gets built, in what order, and how it's checked. Where this plan and the spec differ, the spec wins.

## 1. Goal

An instructor uploads a syllabus (or pastes a training brief) and works with the **Design partner** through six stages: **Start · Read · Confirm · Approaches · Preview · Review**. Tessera reads the syllabus with page citations, asks what the document can't answer, has the instructor confirm outcomes, proposes three course architectures with trade-offs, previews exactly what it will create (a hashed change set), and provisions modules, lessons, outcomes, alignment links, assignments, and deliberately unfinished starter content, all as drafts. One action undoes the plan.

It slots in as the second card on Build with AI and, later, as the first "How to start" option in the guided New-course flow (`NIGHT-4-NOTES.md`); nothing here blocks that flow.

## 2. Non-negotiables (checked at every milestone)

- The read cites a page for every claim; every AI output is a draft with provenance until a person keeps it (D-003).
- Rule failures become questions, never silent fixes; outcomes are confirmed before approaches render.
- Exactly three options plus overlays; a one-sentence rationale is required.
- The preview's hash gates apply; nothing existing is renamed or removed; new modules append.
- Readings only with a source span, otherwise a "[Reading to select]" placeholder; no invented URLs or citations.
- Starter content carries `[Your …]` slots; it's a scaffold, not a finished lesson.
- One action undoes the plan and keeps anything the instructor kept or edited.
- The readiness forecast on Preview matches the automatic checks after apply.
- Hard rules: one structure (D-002), Marginalia markup only with "Design partner" as the role label (D-006, D-018), no stripes (D-017), tokens only (D-007), WCAG 2.2 AA with zero audit violations (D-010), fictional content, nothing confidential under `docs/`. No QM text ever; QM numbers only under D-031.

## 3. Milestones

Sequential, because each builds on the one before; one worktree per milestone off `night4`. Codex Sol implements from a brief that cites the spec sections, the artboard, and the acceptance tests; Claude reads every diff, runs the checks Sol's sandbox can't (`npm run a11y`, `npm run e2e`), commits, and merges into `night4`. Codex Astra reviews milestones 5 and 6 (and the whole branch before release).

| # | Worktree | Spec | Delivers | Checks |
|---|---|---|---|---|
| 1 | `agent/design-domain` | §4, §5 (contract only), §8 migration | Domain types and zod schemas; every §5 operation with route, scope, and a pending stub; migration `0008_design_partner.sql`; repo methods in MemoryRepo and D1Repo with contract tests; `Lesson.objective` wired into the builder; `RICE_DEFAULTS`, `AiPolicy.workloadRates` and `designPartner`; `AiTask` additions; `validate-design.ts` skeleton | typecheck, unit, repo contract, OpenAPI regenerated; migration applied to local and **preview** D1 before the push |
| 2 | `agent/design-extract` | §6.1, §6.2, §7 `syllabus-extract` | `DesignSource` with `lines` (PDF y-grouped lines, DOCX paragraph and row lines); roster stripping; 60,000-character cap; `syllabus-extract` fixture and prompt; rules → questions; extraction as a background job; `createDesignSession`, `getDesignSession`, `listDesignSessions`, `answerDesignQuestions`; `shared/seed-syllabus.json` + generator script; Start screen | feasibility test extended with `lines`; rule tests per problem code; AI-validation test; Start screen audited |
| 3 | `agent/design-read` | §6.4, §7 `syllabus-analyze`, `objective-rewrite` | Workload estimator; outcome audit, alignment, learner-centeredness, deficiencies (D-031 refs); `ReadConfirm` screen; `Citation`, `AlignmentMatrix`, `WorkloadChart` components with stories; `confirmOutcomes` gate | estimator on STAT 110 (9 h budget, week 11 over); Read and Confirm audited; stories audited |
| 4 | `agent/design-approaches` | §6.3, §7 `structure-options` | Deterministic candidate selection; overlays; `structure-options` fixture and prompt; `selectApproach` (rationale ≥ 12 chars, combination note); `Approaches` screen; `OptionCard`; instructor profile API and UI (D-033) | candidate-selection table tests; exactly three options; Approaches audited |
| 5 | `agent/design-plan` | §6.5, §7 `module-scaffold` | `previewProvisionPlan` (pure, hashed), overlaps, template matching, readiness forecast; `applyProvisionPlan` (outcomes, modules, lessons with objectives, assignments with TILT and rubric, links) + scaffold job on the generation machinery; Start-here builder; `undoProvisionPlan`; `ChangeSetTable`; `Preview` screen | hash determinism and stale-hash refusal; forecast equals post-apply checks; no link without a span; undo keeps edited items; **Astra review** |
| 6 | `agent/design-review` | §6.6, §5 record/MCP, §8 docs, §10 | Review panel (why-notes, next steps, quick actions), "least sure" alternatives, design record export (JSON, CSV), MCP `design_session_*` tools, Policy page (toggle, architectures, rates, disclosure), Mintlify page, e2e journey, QA log | e2e mock journey (spec §10.5); full a11y; **Astra review**; D-032 check (§5) |

After milestone 6: Codex Astra reviews the whole branch, fixes land, the owner reviews screenshots of every stage against the artboards, then release (production migration `0008`, merge to `main`, tag `night-4`).

## 4. Data and deployment

- Migration `0008_design_partner.sql` is written in milestone 1 and applied to local and preview D1 **before** any pushed code needs it; production gets it at release, after a D1 restore point.
- Mock mode (`?data=mock&as=u-okafor`) runs the whole flow on the fixture AI with the seeded STAT 110 syllabus and no upload.
- Pushes to `night4` drop preview secrets; they're re-applied after every push (`tools/preview-secrets.sh night4`), which matters for the D-032 check (it needs `WRITER_API_KEY`).
- Background work reuses `GenerationWorkflow` (production) with the polling fallback (previews and mock), extended with job kinds `extract` and `scaffold`.

## 5. The D-032 Palmyra check

On the `night4` preview with `WRITER_API_KEY`, run the real `syllabus-extract` and `syllabus-analyze` on the two fixtures and on **at least five real syllabi from the owner** (different departments, one scanned). Record in `handoff/NIGHT-4-QA.md`, per syllabus: field accuracy for outcomes, weights, schedule rows, contact, and credits; whether the empty-week and weights-sum rules fire; the number of questions asked; time per stage. If schedule-row accuracy on the real set is below 90%, write up Docling in the OCR container (cost, latency, what it fixes) instead of working around it. Real syllabi are used only for this check and are not committed (fictional content only in the repo).

### 5.1 Goal: real syllabi pass (owner, 2026-09-28)

The owner supplied 14 test syllabi (7 fictional from one author, 7 real from different authors, including a legacy `.doc`, a points-graded course with no calendar, a cross-listed undergraduate/graduate course, module-based terms from 7 to 16 weeks, and a "master" template). **Goal: each one passes the rubric in `handoff/SYLLABUS-EVAL-RUBRIC.md`**, stage by stage (extraction, then the read, then approaches and the applied course) on real Palmyra, so that a similar syllabus uploaded later is read correctly and becomes a draft course the instructor only has to review. `tools/syllabus_eval.mjs` scores every change against answer keys (built by subagents, checked by Claude); real syllabi and their keys stay in the gitignored `tests/fixtures/syllabus/private/`. Refine and patch until every syllabus passes, then a final QA pass and code review. Progress is logged in `NIGHT-4-QA.md`.

## 6. Risks

- **Table reconstruction.** pdfjs flattens tables; the `lines` output and the rules are the mitigation, and D-032 measures it. Scanned syllabi go through OCR first, which may lower accuracy.
- **Prompt size and latency.** Up to 60,000 characters per extraction; runs as a background job so request limits don't apply. Measure time per stage in the D-032 check.
- **Forecast drift.** The readiness forecast must equal the real checks after apply; the plan computes it by running the same automatic checks on the would-be structure, and a test compares them.
- **Undo correctness.** Undo must never delete what the instructor kept or edited; created-item tracking plus `previous === null` and `aiState === 'draft'` checks, with tests.
- **Concurrency** (the Night 3 lesson): apply and scaffolding must be safe against double submits and stalled jobs; reuse the generation runner's ownership checks and deterministic ids.
- **Scope.** Six milestones is a large Night; if time runs short, industry mode (D-035) UI polish and the MCP tools move last, never the governance items.

## 7. Status

- 2026-09-28: plan written; D-030 to D-036 recorded in `design/DECISIONS.md`; branch `night4` created from `main` with the spec branch (PR #58) merged.
- 2026-09-28: M1 and M2 merged; M3 (read and confirm) merged. First real-syllabus runs failed on reliability (reasoning filled the token budget; WRITER's upstream cache made retries identical), so extraction now uses a fresh seed per request, low reasoning effort, a runaway stop, and three parallel parts. Real-syllabus goal added (§5.1); source-quality fixes (DOCX sections, section citations, PDF small caps, date rule) in progress as `agent/design-source`.

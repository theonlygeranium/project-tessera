# Kickoff prompt for the implementing agent

*Paste the block below into a fresh Claude Code session on the owner's Mac (or a cloud session on this repo). It assumes the agent already knows the project (CLAUDE.md, decisions, Night 1–3).*

---

Build **Start from a syllabus**, the syllabus design partner, for Project Tessera. This is the Night 4 feature; the owner has approved the scope and made the decisions.

Read, in this order, before planning:
1. `handoff/SYLLABUS-DESIGN-PARTNER-SPEC.md` — the normative spec. Decisions D-030 to D-036 in §1 are constraints. §4 (domain), §5 (API), §6 (service), §7 (AI tasks), §8 (worker/app), §9 (governance), §10 (tests and done), §11 (milestones).
2. `research/syllabus-design-partner/recommendations.md` — why the feature is shaped this way; §5 is the workflow and voice, §6 the provisioning map.
3. The five artboards `design/canvas/Syllabus{Start,Read,Approaches,Preview,Review}.dc.html` (also at `/screens/syllabus-*.html` on the branch preview). Build the app screens to match them: same regions, copy, states and Marginalia markup. The AI role label is **Design partner**.
4. `handoff/NIGHT-4-NOTES.md` — this feature must slot into the proposed guided New-course flow as the first "How to start" option; don't build that flow here, but don't block it.
5. `worker/access/syllabus-extraction.test.ts` and `tests/fixtures/syllabus/` — the parser half is proven; keep the test green and extend it with the `lines` output (spec §6.1).

Then:
- Start from branch `spec/syllabus-design-partner` (PR #58) or merge it to `main` first; work in a `night4` integration branch with one worktree per milestone in spec §11 (`agent/design-domain` … `agent/design-review`). Delegate to Codex Sol where the brief can carry concrete examples and a check; verify every diff yourself; Astra reviews milestones 5 and 6.
- Write `handoff/NIGHT-4-PLAN.md` from the spec before the first worktree (scope, milestones, risks, the D-032 Palmyra check), and keep `handoff/NIGHT-4-QA.md` as you go.
- Migration `0008` first, applied to preview D1 before any code that needs it (CLAUDE.md). Mock mode must run the whole flow on the fixture AI with the seeded syllabus, no upload.
- Hard rules still hold: one structure (D-002); every AI output is a draft with provenance until a person keeps it (D-003); Marginalia markup only, no sparkles, no stripes (D-006, D-017, D-018); tokens only (D-007); WCAG 2.2 AA with zero audit violations (D-010); nothing confidential under `docs/`; fictional content only. No QM text ever; QM numbers only under D-031.
- Non-negotiables from the spec: the read cites a page for every claim; questions replace silent fixes; outcomes are confirmed before approaches render; exactly three options plus overlays; a one-sentence rationale is required; the preview's hash gates apply; nothing existing is renamed or removed; readings only with a source span, otherwise a placeholder; starter content carries `[Your …]` slots; one action undoes the plan; the readiness forecast on Preview must match the automatic checks after apply.
- Definition of done is CLAUDE.md's full lane plus spec §10: unit, repo-contract, AI-validation, e2e (mock journey), a11y including the new routes and stories, the D-032 Palmyra check on a preview branch with `WRITER_API_KEY` (record accuracy on the fixtures and on the owner's real syllabi in the QA log; if schedule-row accuracy is under 90%, write up Docling instead of working around it), Mintlify page, screenshots of every stage for the owner's visual review, then merge.

Report at each milestone with: what shipped, what the checks showed, what needs the owner (visual review, real syllabi for the D-032 check, the Policy-page defaults), and the preview URL. End every report with a Next steps block.

# Focus areas index: build specs from the LMS gap research

*Status: approved by owner for build planning (2026-09-28); D-045, D-046, D-048 and D-052 approved by owner 2026-09-28; the other proposed decisions still await owner ruling. Drafted by the assistant chief strategist for the owner and Claude Code. Research: `research/lms-best-practices-gaps-2026-09-28.md` (the gap report). Gradebook mockups (approved by owner 2026-09-28): `design/explorations/gradebook/`. Nothing here has been built or claimed: no migration or journey numbers are taken, and every decision below is a proposal until the owner rules on it (the register in §4 marks the ones approved).*

This page is the map for the ten focus areas: the research ranking, one paragraph per spec, how the specs depend on each other, every proposed decision in one register, and a recommended build order.

---

## 1. The ranking (gap report §7)

**Scoring:** Demand (1 to 5) × Impact (1 to 5) = Score out of 25. Effort (S/M/L) breaks ties only. Scores are the analyst's judgment from the cited evidence, not measured data.

| Rank | Area | Demand | Impact | Score | Effort | Tessera status | Spec |
|---|---|---|---|---|---|---|---|
| 1 | Interoperability: LTI 1.3 Advantage, SIS/HRIS sync, grade passback, SCORM/cmi5/xAPI | 5 | 5 | 25 | L | Backlog | `INTEROP-LTI-SPEC.md` |
| 2 | Gradebook correctness and transparency | 5 | 5 | 25 | M | Partly built | `GRADEBOOK-SPEC.md` (written separately) |
| 3 | Authoring at scale: bulk ops, question banks, versioned reuse/sync, import | 4 | 5 | 20 | M-L | Partly built (editor, AI, templates); rest not planned | `AUTHORING-AT-SCALE-SPEC.md` |
| 4 | Accessibility remediation depth (math, video, bulk, reporting, own ACR) | 5 | 4 | 20 | M | Built (core); extensions not planned | `ACCESSIBILITY-DEPTH-SPEC.md` |
| 5 | AI governance and disclosure (policy console, disclosure cards) | 4 | 4 | 16 | S-M | Partly built (provenance, review) | `AI-GOVERNANCE-SPEC.md` |
| 6 | Actionable analytics and trustworthy compliance reporting | 4 | 4 | 16 | M | Partly built (compliance reports) | `ANALYTICS-COMPLIANCE-REPORTING-SPEC.md` |
| 7 | Data portability, continuity and security posture | 3 | 5 | 15 | M | Partly built (audit trail, CSV); rest not planned | `DATA-PORTABILITY-CONTINUITY-SPEC.md` |
| 8 | Mobile player with tutor (offline later) | 3 | 4 | 12 | L | Backlog | `MOBILE-PLAYER-SPEC.md` |
| 9 | Compliance training automation (HRIS-driven assignment) | 3 | 4 | 12 | M (after #1) | Built core; HRIS on backlog | `HRIS-COMPLIANCE-AUTOMATION-SPEC.md` |
| 10 | Learner-facing AI study tools | 3 | 3 | 9 | S | Built (tutor); competitors at parity | `LEARNER-AI-STUDY-TOOLS-SPEC.md` |

## 2. The specs in one paragraph each

**1. Interoperability (`INTEROP-LTI-SPEC.md`, D-045 to D-052).** Tessera becomes an LTI 1.3 tool with dynamic registration, Deep Linking, NRPS rosters and AGS grade return for released grades; administrators get OneRoster 1.2 CSV import with a dry run; instructors can add SCORM 1.2 and cmi5 packages as a block played from an isolated origin, with a minimal xAPI store; an Integrations page shows every sync error with its cause, resolution and a retry (backlog #26). It proposes superseding decisions for identity (D-045 over D-021 and D-014's sign-in line), for LTI routes outside Cloudflare Access with a tool session (D-046, amending D-014 and D-020), and for SSO with just-in-time provisioning through Access (D-052). No code before the owner approves those. *(Approved by owner 2026-09-28, with D-048; the Access bypass itself still needs the owner's OK when it is made.)*

**2. Gradebook (`GRADEBOOK-SPEC.md`, D-039 to D-044).** Written separately. The other specs assume it provides one grade engine, release and held states, missing, late and excused handling, accommodations, a student "how this was calculated" view with exact what-if, grade-by-question, and export. See that spec for its decisions and mockups.

**3. Authoring at scale (`AUTHORING-AT-SCALE-SPEC.md`, D-053 to D-059).** Adds the quiz and question-bank MVP Tessera lacks: versioned banks at course, program or institution scope, six item types, fixed and random-draw sections, time limits with accommodations, answer keys that never leave the server before release, AI-drafted items that stay drafts until kept, and QTI 2.1 import and export. A quiz is a kind of assignment, so the gradebook and passback work unchanged. Adds bulk outline operations as previewable change sets with undo, and a versioned lesson-sync prototype behind a flag. Gated on `night4` merging.

**4. Accessibility depth (`ACCESSIBILITY-DEPTH-SPEC.md`, D-060 to D-064).** A LaTeX-to-MathML math block with spoken text and AI conversion from images; drafted captions and a description track for uploaded media, kept after review; a course and institution fix queue with deterministic batch fixes and AI batch review that has no blind keep-all; a WCAG 2.1 AA legal view beside the 2.2 view in reports; and Tessera's own ACR (VPAT 2.5), published only after the #29 screen-reader walkthrough and a manual audit, with every claim written by a person from evidence.

**5. AI governance (`AI-GOVERNANCE-SPEC.md`, D-065 to D-069).** One AI feature registry in code drives both enforcement and disclosure cards ("About this feature" on every AI element, plus a public page); an administrator console with per-feature switches at institution, program and course level (most restrictive wins) and a pause-all; explicit retention with a deletion job; model choice only among already-approved models; and a content-free usage log with export. Adds no new AI capability.

**6. Analytics and compliance reporting (`ANALYTICS-COMPLIANCE-REPORTING-SPEC.md`, D-070 to D-074).** Course insights for instructors (item analysis with miskey flags, lesson funnel, outcome attainment, a "might need a check-in" list built from readable rules, not a risk score), each with a person-taken action (edit, AI-drafted fix, AI-drafted private note the instructor sends). Compliance reports gain distinct pass and fail results, "as of" reports replayed from the append-only events, a definitions panel, reconciled totals and scheduled exports. Groups under 5 are suppressed; managers get nothing new.

**7. Data portability, continuity and security (`DATA-PORTABILITY-CONTINUITY-SPEC.md`, D-075 to D-079).** Institution and course exports in open formats (Common Cartridge 1.3 with QTI, lossless Tessera JSON that round-trips through `importCourse`, gradebook CSV and JSON, OneRoster CSV, events, certificates, audit) with checksums and signed expiring links; a read-only mode (manual or automatic) and nightly continuity snapshots served without D1; a security overview, a SOC 2 control matrix and a readiness path without certification claims; backups and quarterly restore drills. SSO is decided in spec 1 (D-052).

**8. Mobile player (`MOBILE-PLAYER-SPEC.md`, D-080 to D-084).** The existing app made phone-first at 390×844 (backlog #30): lesson, checks, assignment submit, quiz slot, grades from the gradebook engine, and the tutor as an accessible bottom sheet that keeps hint-first rules visible. Data saver and short-outage queuing instead of offline mode; 44 px targets everywhere. **No build before the owner approves the four artboards** (D-082, D-025 precedent).

**9. HRIS compliance automation (`HRIS-COMPLIANCE-AUTOMATION-SPEC.md`, D-085 to D-089).** Effective-dated worker records from CSV (dry run) or API push, linked to users by spec 1's rules; plain-language assignment rules with a per-person preview and reasons; nightly sync that assigns automatically and queues removals for an administrator; transfers, leave and termination without deleting history; HR reporting lines feed managers while learner opt-in (D-026) stays unchanged. Sequenced after spec 1's identity decisions.

**10. Learner AI study tools (`LEARNER-AI-STUDY-TOOLS-SPEC.md`, D-090 to D-092).** Deliberately small, per the research: measure tutor use and helpfulness privately, and add two aids: grounded, ungraded "Practice from this lesson" with hint-first feedback, and a non-AI "Review what I missed" spacing list on Today. Off until a course opts in. D-092 states how D-003 applies to private learner-facing AI output and needs explicit owner approval.

## 3. Dependencies and sequence

```
night4 merge ──────────────┬──► 3 Authoring (hard gate)
                           ├──► 4 Accessibility (worker/access files owned by Night 4 until merge)
                           └──► artboards in design/canvas/canvas.json (4, 5, 6, 8, 9)

2 Gradebook ───────────────┬──► 1 AGS grade passback (D-051: released grades from the engine)
                           ├──► 3 quiz scores and grade-by-question
                           ├──► 6 missing-work check-in rule
                           ├──► 7 gradebook export and continuity snapshot
                           └──► 8 mobile grades and exact what-if

1 Identity (D-045, D-048, D-052) ──► 9 HRIS user linking
1 SyncRun / SyncError shapes ──────► 9 HR sync health
1 OneRoster reader ◄──────────────► 7 OneRoster writer (same mapping)

3 Quiz responses ──► 6 item analysis
3 QTI writer ──────► 7 Common Cartridge export
3 Quiz player ─────► 8 phone quiz slot

5 Feature registry and switches ──► 6 AI-drafted nudges, 10 study tools; 3 and 4 register their new AI tasks
6 Suppression rule (D-074) ───────► 10 usage aggregates
4 #29 walkthrough ────────────────► 4 ACR publication
```

Shared building blocks: Night 4's `ChangeSetTable` (used by specs 1, 3, 4, 9); the template change-set hash helper; the generation job runner (specs 4, 7); Cron Triggers (specs 1, 3, 5, 6, 7, 9: one owner decision for all).

## 4. Proposed decision register

Numbering: D-039 to D-044 are reserved for the gradebook spec. This set starts at D-045. None is written into `design/DECISIONS.md`; each goes there only after the owner approves it (PARALLEL-AGENTS §5). *(2026-09-28: D-045, D-046, D-048 and D-052 approved by owner and written into `design/DECISIONS.md`.)*

| ID | Spec | Decision (short) | Relation to existing decisions | Why the owner specifically |
|---|---|---|---|---|
| D-039 to D-044 | 2 | See `GRADEBOOK-SPEC.md` | | |
| **D-045** | 1 | *Approved by owner 2026-09-28.* Identity v2: one user, several linked identities (Access email, LTI) | **Supersedes** D-021's "Access is the identity provider" and D-014's sign-in line | Changes a settled identity decision |
| **D-046** | 1 | *Approved by owner 2026-09-28.* `/lti/*` and `/embed/*` outside Access; tool session as a third API credential | **Amends** D-014 (Access guards `/app`) and D-020 (credential list) | Cloudflare Access change; security boundary |
| D-047 | 1 | LTI tool first (Core, Deep Linking, AGS, NRPS, dynamic registration); platform mode out | New | Scope; certification cost later |
| **D-048** | 1 | *Approved by owner 2026-09-28.* Provisioning by (platform, sub); email only suggests links; LIS role mapping | New | Account-takeover risk trade-off |
| D-049 | 1 | OneRoster 1.2 CSV is the SIS MVP | New | |
| **D-050** | 1 | SCORM 1.2 and cmi5 as a `package` block on an isolated content origin | New | DNS and Worker route change; possible `blocks.type` rebuild |
| D-051 | 1 | AGS passback of released grades only | Builds on D-003-style release discipline and `GRADEBOOK-SPEC.md` | |
| **D-052** | 1 | *Approved by owner 2026-09-28.* SSO through Access plus just-in-time provisioning for allow-listed domains | **Supersedes** D-021's invite-only rule for those domains | Changes a settled identity decision |
| D-053 | 3 | A quiz is a kind of assignment | Keeps D-002 | Possible `submission_type` rebuild |
| D-054 | 3 | Versioned banks at course, program, institution scope; six item types; draw sections | New | |
| D-055 | 3 | QTI 2.1 import and export in the MVP | New | |
| D-056 | 3 | Answer keys never leave the server before release | Extends D-005 | |
| D-057 | 3 | AI-drafted items are bank drafts until kept | Applies D-003 | |
| D-058 | 3 | Bulk outline operations as change sets with undo | Extends the template change-set pattern | |
| D-059 | 3 | Versioned lesson sync as a flagged prototype | Builds on D-028 lineage | Rollout decision after prototype |
| D-060 | 4 | Math block (LaTeX source, MathML, spoken text) | Extends D-022 | Possible `blocks.type` rebuild; renderer licence |
| D-061 | 4 | Drafted captions and description tracks, kept after review | Applies D-003, uses D-019 | |
| D-062 | 4 | Fix queue with batch review and no blind keep-all | Applies D-003 and D-022 | |
| **D-063** | 4 | Publish Tessera's own ACR (VPAT 2.5) after audit and #29 | Extends D-010 | Public claim; external auditor is a cost decision; wording vs Mintlify rules |
| D-064 | 4 | WCAG 2.1 AA legal view, program rollup, scheduled export | Extends D-022 | |
| **D-065** | 5 | One AI feature registry drives enforcement and disclosure | Extends D-003, D-006 | Whether public cards may name the model vendor |
| D-066 | 5 | Per-feature switches, most restrictive wins, pause-all | Extends D-005 (tutor modes stay) | |
| **D-067** | 5 | Explicit retention; training-use statement from vendor terms | New | Owner must supply the vendor-terms statement |
| D-068 | 5 | Model choice only among approved models | Bounded by D-015 and D-019 | |
| D-069 | 5 | Content-free AI usage log; learners can delete their tutor history | Consistent with D-005 | |
| D-070 | 6 | Insight to action; a person sends every note | Applies D-003 | Labelling of sent notes (see open questions) |
| D-071 | 6 | Item analysis rules and thresholds | New | |
| D-072 | 6 | Check-in signals are readable rules, not a risk score | Consistent with D-004 | |
| D-073 | 6 | Compliance semantics: pass and fail, as-of replay, reconciliation | Extends D-026, D-027 | |
| D-074 | 6 | Suppress groups under 5; no manager analytics | Consistent with D-026 | |
| D-075 | 7 | Open-format institution and course exports | New | |
| D-076 | 7 | Read-only mode (manual or automatic) | New | Automatic mode needs a new binding |
| D-077 | 7 | Continuity snapshots served without D1 | Consistent with D-014 Access | |
| **D-078** | 7 | Security posture: document, map to SOC 2, then attest | New | Public security page; auditor engagement |
| D-079 | 7 | Backups via Time Travel plus weekly export; quarterly drills | New | Scratch D1 database |
| D-080 | 8 | Responsive web first; no native apps | New | |
| D-081 | 8 | Tutor as an accessible bottom sheet on phones | Keeps D-005, D-010 | |
| **D-082** | 8 | Artboards approved before build | D-025 precedent | Owner review is the gate |
| D-083 | 8 | Data saver and short-outage queue, not offline mode | Uses D-020 idempotency | |
| D-084 | 8 | 44 px learner targets everywhere on phones | Extends D-010 | |
| D-085 | 9 | Worker records from CSV and API push | Uses D-048 linking | |
| D-086 | 9 | Rule-based requirements with preview; removals wait for an admin | Extends Night 3 requirements | |
| D-087 | 9 | HR reporting lines feed managers; consent unchanged | Keeps D-026 | |
| D-088 | 9 | Leavers and leave without deletion | Keeps D-027 | |
| D-089 | 9 | Relative due dates; recurrence from completion | Extends Night 3 recurrence | |
| D-090 | 10 | Measure plus two aids, no more | New | Keep, change or cut after a term |
| D-091 | 10 | Private measurement with suppression | Consistent with D-005, D-074 | |
| **D-092** | 10 | Private learner-facing AI output follows tutor rules, not the content-keep rule | **Clarifies** D-003 | Interprets a hard rule |

Bold rows need the owner's attention before any related code starts.

## 5. Recommended build order (waves)

**Wave 0: decisions and preconditions (no product code).**
- The owner decides the bold rows above, starting with identity (D-045, D-046, D-048, D-052) and the gradebook decisions. *(Identity decisions D-045, D-046, D-048 and D-052 approved by owner 2026-09-28.)*
- `night4` merges to `main`.
- One read-only check of `migrations/0002_night2.sql` and `0003_block_types.sql` for `CHECK` lists on `assignments.submission_type`, `blocks.type`, `requirements.audience` and `completion_events.kind`. That decides whether specs 1, 3 and 4 can add types additively on the shared preview database.
- One owner decision covering Cron Triggers, any KV or Durable Object binding, the content-origin hostname and the Access bypass.

**Wave 1: foundations that unblock others (parallel, low hotspot overlap).**
- 2 Gradebook: the engine and release states.
- 5 AI governance: registry, enforcement and usage log.
- 7 Data: admin audit and the JSON and gradebook export.
- 6 Compliance half: as-of replay and pass/fail.
- 8 Mobile: artboards only, then stop for approval.
- 10 Study tools: non-AI review list and measurement.

**Wave 2: the table stakes.**
- 1 Interop: identity and LTI core, then Deep Linking and NRPS.
- 3 Authoring: banks, quizzes, QTI.
- 4 Accessibility: math, media and the fix queue.
- 5 AI governance: console and disclosure cards.
- 8 Mobile: player and tutor sheet, after approval.

**Wave 3: the connected layer.**
- 1 Interop: AGS passback (needs 2), OneRoster, packages, health page.
- 6 Analytics: insights and actions (needs 3 and 5).
- 9 HRIS: records, rules and sync (needs 1 identity).
- 7 Data: Common Cartridge export (needs 3's QTI), read-only mode and snapshots.
- 10 Study tools: practice (needs 5).
- 8 Mobile: grades (needs 2).
- 3 Authoring: bulk operations.

**Wave 4: proof and polish.**
- 4 Accessibility: the #29 walkthrough and ACR publication.
- 7 Data: security page, control matrix and first restore drill.
- 1 Interop: 1EdTech certification.
- 3 Authoring: lesson-sync rollout decision.
- 10 Study tools: keep, change or cut after one term.

Rationale: gradebook and interoperability tie at 25, but passback needs the engine, so the gradebook engine leads. Governance is small and unblocks three other specs' AI features. Identity changes are the riskiest decision, so they are settled in Wave 0 even though LTI code lands in Wave 2.

## 6. Cross-cutting rules every spec follows

- Migrations: new migration, next free at build time (>=0009), additive only for the shared preview D1, applied with `npm run db:migrate:preview` before pushing code; production needs the owner's OK and a recorded D1 restore point.
- E2E: Journey 21+ (claimed at build time).
- Hotspots (`shared/domain.ts`, `shared/api.ts`, `shared/schema/*`, repos, `worker/ai/palmyra.ts`, `shared/ai.ts`, shell and paths, `tools/a11y_audit.mjs`, `tests/e2e/journeys.mjs`): small, added at the end of the section; any large change goes to the owner first.
- Hard rules: D-002, D-003, D-004, D-005, D-006, D-010, D-017, D-018, D-026, D-027; tokens only; WCAG 2.2 AA; fictional content only (Meridian State, Dr. Okafor, Priya, STAT 110).
- Branches: one area prefix per spec (`interop/`, `authoring/`, `a11y/`, `governance/`, `analytics/`, `data/`, `learner/`, `compliance/`), worktrees from `origin/main`, never `night*` or `agent/design-*`.

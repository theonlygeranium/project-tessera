# Phase 2 backlog (snapshot)

This is a copy of the GitHub issues in the milestone **"Phase 2: design and build"**, taken on 2026-09-26, so the backlog can be read without GitHub access. **GitHub is the live version.** If they differ, trust the issue, and update this file when you close or rescope one.

Work order and rationale: see `PHASE-1-SUMMARY.md` §5.

| # | Title | Labels |
|---|---|---|
| #16 | [Decision] Choose the phase-2 build approach | phase:2, priority:P0, decision |
| #17 | Design-system foundation: tokens.css and a component inventory | area:design-system, phase:2, priority:P0, type:build |
| #18 | Prototype: learning-profile onboarding step feeds Today | area:learner, phase:2, priority:P1, type:build |
| #19 | Prototype: tutor behavior follows instructor tutor settings | area:learner, area:instructor, phase:2, priority:P1, type:build |
| #20 | Author clickable flow: prompt → brief → outline → draft review → publish readiness | area:author, phase:2, priority:P1, type:build |
| #21 | Course home screen (module map, instructor presence, outcomes) | type:design, area:learner, phase:2, priority:P1 |
| #22 | Corporate learner experience: compliance path and manager visibility | type:design, area:learner, phase:2, priority:P1 |
| #23 | Persona variants: manage plain-language, micro-path, and compliance versions from one master | type:design, area:author, phase:2, priority:P2 |
| #24 | Templates and brand management (institution/program) | type:design, area:admin, phase:2, priority:P2 |
| #25 | Publish-readiness report with selectable rubric (QM / OSCQR / custom) | type:design, area:author, phase:2, priority:P2 |
| #26 | Integration setup and sync-error resolution (LTI 1.3, SIS/HRIS, xAPI, SCORM/cmi5) | type:design, area:admin, phase:2, priority:P2 |
| #27 | Dark mode and compact-density variants | type:design, area:design-system, a11y, phase:2, priority:P2 |
| #28 | Evaluation plan: usability test protocol and success metrics | type:research, phase:2, priority:P2 |
| #29 | Screen-reader walkthrough of the prototype (VoiceOver + NVDA) | a11y, phase:2, priority:P1, needs-human |
| #30 | Mobile lesson player and tutor | type:design, area:learner, phase:2, priority:P2 |

## #16 · [Decision] Choose the phase-2 build approach

Labels: phase:2, priority:P0, decision

#### Context
Phase 1 produced static HTML artboards (`design/canvas/*.dc.html`, built to `docs/screens/`) and one vanilla-JS clickable prototype (`docs/prototype/`). Styles are mostly inline hex values; only the AI visual language is shared CSS (`docs/assets/ai-voice.css`). Phase 2 involves more design and building, so the stack decision comes first.

#### Options
- **A. Stay static.** Keep hand-built HTML/CSS/JS on GitHub Pages. This is the fastest way to more mockups, but the prototypes stay one-off and components get duplicated.
- **B. Component prototype app (recommended).** Use Vite + a component framework (React or Svelte) + Storybook, with tokens from `design/tokens.json`, still deployed as static files to Pages under `docs/`. Components can be reused across screens, states are testable, and it moves toward production.
- **C. Full-stack app.** Add a backend, auth, and real AI calls. This is premature until the flows are validated with users.

#### Needs from the owner
Pick A, B, or C. If B, pick React or Svelte and confirm that `docs/` stays the Pages root (the build output would go there).

#### Done when
The decision is recorded in `design/DECISIONS.md` (D-011) and this issue is closed with the choice.


## #17 · Design-system foundation: tokens.css and a component inventory

Labels: area:design-system, phase:2, priority:P0, type:build

#### Context
Colors, type, and spacing live in `design/DESIGN-NOTES.md` and `design/tokens.json`, but the screens use inline hex values. Building more screens without shared tokens will drift.

#### Scope
- Generate `docs/assets/tokens.css` (CSS custom properties) from `design/tokens.json`.
- Inventory the repeated UI pieces across the 8 screens and the prototype: rail nav, chips, cards, segmented controls, course card, task card, knowledge check, tutor panel, change-set table, and the `.ai` contract blocks. Record them in `design/COMPONENTS.md` with names, variants, and the states each needs.
- Follow the phase-2 build decision: if B, build these as components with stories; if A, as CSS classes.

#### Done when
- No screen or prototype file hardcodes a token color.
- `npm run a11y` still passes.
- `COMPONENTS.md` lists every component with the screens that use it.


## #18 · Prototype: learning-profile onboarding step feeds Today

Labels: area:learner, phase:2, priority:P1, type:build

Follow-up to #9. The static screen exists: [learning-profile](https://theonlygeranium.github.io/project-tessera/screens/learning-profile.html).

#### Scope
- Add an onboarding view to `docs/prototype/`, shown before Today on first run and reachable later from the avatar menu.
- Answers drive Today: the weekly time ring, the suggested preset (shown as an `.ai--note`), reminder copy, and whether the compliance card shows "Test out".
- "Use this preset" and "Show other presets" both work. The learner can edit everything afterward.

#### Done when
- The same learner gets a different Today with at least 2 different profiles.
- Every adaptation carries a "why" line and an Undo (principle #7).
- The prototype walkthrough and `npm run a11y` pass.


## #19 · Prototype: tutor behavior follows instructor tutor settings

Labels: area:learner, area:instructor, phase:2, priority:P1, type:build

Follow-up to #5. The static screen exists: [tutor settings](https://theonlygeranium.github.io/project-tessera/screens/tutor-settings.html).

#### Scope
- Add a small instructor-view toggle, or a second prototype page, where the mode for the lesson check and the Module 3 check can be set (Off / Hints / Explain / Open, with Open locked on graded items).
- The learner tutor in `docs/prototype/prototype.js` reads that setting:
  - Off hides the tutor.
  - Hints is the current behavior.
  - Explain adds concept explanations without item answers.
  - Open answers directly (practice only).
- Hint count per question is respected.
- The results page's "what your instructor sees" line reflects the mode.

#### Done when
Each mode is demonstrable end to end and the notice text learners see matches the setting.


## #20 · Author clickable flow: prompt → brief → outline → draft review → publish readiness

Labels: area:author, phase:2, priority:P1, type:build

The static screen is [course builder](https://theonlygeranium.github.io/project-tessera/screens/course-builder.html). Covers principles #6 and #12.

#### Scope
A clickable prototype for authors:
1. Prompt plus sources, with file upload simulated.
2. An editable brief: audience, outcomes, duration, tone, persona targets.
3. An outline that can be dragged to reorder.
4. Draft blocks as `.ai--block[data-state=draft]` with a diff and Accept / Revert / Regenerate.
5. The review-coverage meter rising as blocks are kept.
6. The publish-readiness bar blocking publish until alignment and accessibility issues are fixed.

Reuse the prototype shell patterns in `docs/prototype/`.

#### Done when
- An author can go from prompt to "ready to publish" in about 3 minutes of clicking.
- Nothing AI-drafted can be published without a person marking it kept.
- `npm run a11y` passes, with the new states added to `tools/a11y_audit.mjs`.


## #21 · Course home screen (module map, instructor presence, outcomes)

Labels: type:design, area:learner, phase:2, priority:P1

Gap noted in #1 and #3.

#### Scope
A new artboard `design/canvas/CourseHome.dc.html` containing:
- the instructor welcome, with presence
- a primary Start/Resume button
- a module map with time estimates and completion state
- visible outcomes
- the template-enforced structure

It must be the same course → module → lesson hierarchy as the lesson player and builder.

#### Done when
- The artboard is added to `canvas.json` and `tools/build_docs.py` (SCREENS), built, linked from Today and the lesson player, and passes the audit.
- The design canvas is synced (see CLAUDE.md).


## #22 · Corporate learner experience: compliance path and manager visibility

Labels: type:design, area:learner, phase:2, priority:P1

Phase-1 screens lean toward higher ed; the brief covers industry audiences equally (report §5 persona table).

#### Scope
- A compliance-first Today variant: deadline, test-out, certificate, minimal gamification.
- A role-path view tying skills to a job ladder.
- An opt-in manager view showing completion only, never tutor chats or scores unless the learner shares them.

#### Done when
- Two or more artboards are added.
- The privacy boundaries are stated on screen and match the learning-profile "Who sees this" panel.


## #23 · Persona variants: manage plain-language, micro-path, and compliance versions from one master

Labels: type:design, area:author, phase:2, priority:P2

The builder shows variant chips but has no management UI. Report §7(b).

#### Scope
- A screen or panel that shows how each variant differs from the master (blocks added, removed, or rewritten).
- A sync status for each variant, and a "diverged" state with a resolve action.

#### Done when
An author can see and resolve a divergence between the master and a variant.


## #24 · Templates and brand management (institution/program)

Labels: type:design, area:admin, phase:2, priority:P2

Principle #3: only 48% of students perceive consistency across courses.

#### Scope
- An admin screen for course templates: required sections, module structure, and brand theming limited to contrast-safe tokens.
- The builder shows which template applies, and the publish-readiness bar flags deviations.

#### Done when
Covers the Done-when criteria of #3.


## #25 · Publish-readiness report with selectable rubric (QM / OSCQR / custom)

Labels: type:design, area:author, phase:2, priority:P2

Principle #12.

#### Scope
- A full report opened from the builder's quality bar, grouped by standard, with fix-it links to specific blocks.
- Institutions choose QM-style, OSCQR, or their own rubric.
- AI can propose fixes as drafts.

#### Done when
Covers the Done-when criteria of #12.


## #26 · Integration setup and sync-error resolution (LTI 1.3, SIS/HRIS, xAPI, SCORM/cmi5)

Labels: type:design, area:admin, phase:2, priority:P2

Principle #13. The admin console shows health only.

#### Scope
- Setup flows for each integration type.
- An error detail view with a resolution path, for example the delayed xAPI queue.

#### Done when
Covers the Done-when criteria of #13.


## #27 · Dark mode and compact-density variants

Labels: type:design, area:design-system, a11y, phase:2, priority:P2

Report §2 (density modes) and the learner accessibility preferences.

#### Scope
- Dark tokens added to `design/tokens.json`.
- Dark and compact variants of the lesson player and course builder first.
- All four AI styles verified in dark mode.

#### Done when
The audit covers dark variants and passes.


## #28 · Evaluation plan: usability test protocol and success metrics

Labels: type:research, phase:2, priority:P2

Principle #15, plus the report caveats that the evidence is thin in places.

#### Scope
- A test protocol in `research/evaluation-plan.md`: personas, tasks per persona, SUS target of 80 or above (Canvas measured 68.9), and learning-outcome measures for the tutor and review queue.
- Recruiting notes.

#### Done when
The owner approves the plan.


## #29 · Screen-reader walkthrough of the prototype (VoiceOver + NVDA)

Labels: a11y, phase:2, priority:P1, needs-human

The remaining item on #10. Automated checks (axe plus 320px reflow) pass 43/43, and a keyboard-only walkthrough passes.

#### Scope
Walk the prototype flow in VoiceOver (macOS/iOS) and NVDA (Windows):
- Resume
- the knowledge check, including a wrong answer
- opening the tutor, asking for a hint and for the answer
- the reflection
- the module check
- the results
- back to Today

Record the issues found as `type:bug` + `a11y`.

#### Done when
The walkthrough notes are posted here and the found bugs are filed.


## #30 · Mobile lesson player and tutor

Labels: type:design, area:learner, phase:2, priority:P2

Only Today exists at phone size. The prototype collapses to mobile, but there's no designed mobile lesson artboard.

#### Scope
- A 390×844 lesson player with the tutor as a bottom sheet.
- Offline and low-bandwidth states.
- Touch targets of at least 44px.

#### Done when
The artboard is added, built, and audited.

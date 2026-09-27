# Phase 1 summary and handoff

**Phase 1 ran from Sept 24 to Sept 26, 2026.** It covered research, a design direction, a design system, 8 screens, a clickable learner prototype, an accessibility baseline, and repo tooling. The next phase is **more design and building**. This document is written for a fresh agent with no memory of Phase 1.

## 1. The original brief (owner's words)

> Conduct research on the latest trends and best practices in quality learning experience design. We will be designing a new UI/interface for a new AI-native and powered learning management system for hosting/authoring online courses for higher education and industry audiences. We are trying to imagine what this LMS should look and feel like. It will have a native course authoring tool that is simplified and offers instructors options to create AI-generated modularized content from natural language, files, content, etc. And will also be able to be customized for a wide variety of learner personas. Take a look at why certain LMS's like Instructure Canvas are so popular and effective. Design some unique, original, innovative prototype visual layouts for what this LMS UI could look like. Base your visual designs on detailed research into best practices in LMS/UI design.

Later direction from the owner during Phase 1:
- "Sleek and whimsical, yet professional and beautiful."
- Avoid anything that reads as "AI slop." The colored left-stripe card was rejected on these grounds (D-006).
- Keep alternatives available so the team can switch later. The four AI styles are all retained.

## 2. What exists now

| Thing | Where | Notes |
|---|---|---|
| Research report | `research/report.md`, rendered at `/research.html` | 72 sources. Covers LXD evidence, LMS UX benchmarks (SUS), why Canvas wins, AI authoring and tutor evidence (Bastani 2025, Kestin 2025), personas (no learning styles), and 5 layout briefs. §7–8 are the design synthesis. |
| Design principles | Report checklist → issues **#1–#15** (`type:principle`) | Each issue lists what the screens already show, what's missing, and when it counts as done. Progress comments are on #5, #9, and #10. |
| 8 screens | `design/canvas/` → `docs/screens/` | Today (desktop + phone), Focus lesson player, Learning profile setup, Prompt-to-course builder, Instructor command center, Tutor settings by activity, Governance console. |
| Clickable prototype | `docs/prototype/` | Today → lesson with knowledge check → hint-first tutor (refuses answers per policy) → reflection → 3-question module check → results → Today updated (mastery, review cards, time ring). Includes Reset. Responsive. |
| AI visual language | `docs/assets/ai-voice.css` / `.js` | Marginalia is the default; tabs, perforated, and tiles can be switched in with `?ai=`. The gallery has a switcher. |
| Design system | `design/DESIGN-NOTES.md`, `design/tokens.json` | Screens still use inline hex values. Issue #17 moves them to tokens. |
| Decisions | `design/DECISIONS.md` | D-001…D-010 accepted. **D-011 (build approach) is open (#16).** |
| Accessibility | `tools/a11y_audit.mjs`, `reports/a11y.md` | **43/43 pass**: axe WCAG 2.0–2.2 A/AA on every page and every prototype state. Screens with AI content are tested in all four AI styles. The site pages and prototype are also checked for 320px reflow. Keyboard walkthrough passed. The screen-reader pass is pending (#29, human). |
| Contributor setup | `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/*`, PR template | Four issue forms, blank issues disabled, PR checklist requires a clean audit. |
| Design canvas mirror | The owner's private Claude artifact "AI-Native LMS UI Concepts" | Synced with the repo as of commit `2fc9e08` plus the admin ↔ tutor-settings cross-links. See `CLAUDE.md` for the sync procedure. |

Things outside the repo, owned by the account holder: the Claude research-report artifact, the design canvas artifact, and a claude.ai Project named "Instructional Design". None of them are needed to continue; the repo holds copies of everything.

## 3. Design direction in one paragraph

Borrow Canvas's backbone (a predictable module spine, fast grading, a unified to-do list) and put an AI layer on top that the instructor governs. For authors, the AI is a plan-first co-author: brief → outline → draft → review → publish, with provenance and a diff on every AI block, and a review-coverage meter. For learners, it's a Socratic tutor that gives hints, cites course sources, and follows the tutor mode the instructor set. Personalization runs on goals, time, prior knowledge, language, accessibility, device, and role, and every adaptation comes with a "why" and an Undo. Visually: warm paper, ink, one teal accent, and violet reserved for AI. The AI speaks in "Marginalia": a scholar's gutter notes with footnoted sources. It's calm and literary, with no sparkles.

## 4. Known gaps and debt (honest list)

- **Screens are static mockups.** Only the learner flow is clickable. Author, instructor, and admin flows aren't (#20, #19).
- **The learning-profile and tutor-settings screens aren't connected to the prototype yet** (#18, #19).
- **There's no shared component layer.** Styles are inline per artboard, so a change to a common element (a chip, a card) has to be made in every file (#17). This is the main reason #16 matters.
- **The corporate/industry persona is under-served.** The screens lean toward higher ed (#22).
- **Screens not yet designed:** course home (#21), templates and brand (#24), the full publish-readiness report (#25), integration setup (#26), persona-variant management (#23), mobile lesson player (#30).
- **No dark mode or compact variants yet** (#27).
- **Nothing has been tested with real users** (#28). The research evidence is strong on principles but thin on interface-level personalization; see report §5 and the Caveats.
- **The projects board:** agents can't create GitHub Projects boards because GraphQL is blocked in these sessions. The owner can create one from the UI and add the milestone "Phase 2: design and build".

## 5. Phase 2: suggested order

| Order | Issue | Why this order |
|---|---|---|
| 1 | **#16 Decision: build approach** (owner; trade-offs in `design/DECISIONS.md` D-011) | Everything larger depends on it. The recommendation is option B: Vite + a component framework + Storybook, still static on Pages. |
| 2 | **#17 Tokens and component inventory** | The foundation for any building; removes inline hex values. |
| 3 | **#18, #19** Wire the profile and tutor settings into the prototype | Finishes the open parts of #9 and #5; small and visible. |
| 4 | **#20 Author clickable flow** | The core differentiator (plan-first authoring with provenance). |
| 5 | **#21 Course home**, **#22 Corporate learner** | Fills the structural gap and the persona gap. |
| 6 | **#28 Evaluation plan**, **#29 Screen-reader pass** | Needed before any user testing. |
| 7 | **#23–#27, #30** | Breadth: variants, templates, rubric report, integrations, dark mode, mobile lesson. |

## 6. Backlog without GitHub

`handoff/PHASE-2-BACKLOG.md` is a snapshot of issues #16–#30, including scope and done-when criteria, for agents without GitHub access.

## 7. Kickoff prompt for the next agent

Paste this into the new session:

> You're continuing Project Tessera (repo `theonlygeranium/project-tessera`). Read `CLAUDE.md`, then `handoff/PHASE-1-SUMMARY.md` and `design/DECISIONS.md`. Confirm the build approach decision (#16) with me before any large building. Then start on the Phase 2 milestone in the order listed in section 5 of the handoff. Follow the Definition of Done in `CLAUDE.md` for every change, and end each response with a Next steps block.

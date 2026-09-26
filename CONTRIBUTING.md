# Contributing to Project Tessera

Tessera is a research-grounded prototype. A change is good when it makes a screen more faithful to the evidence in [`research/report.md`](research/report.md), or when it improves that evidence. Both kinds of work are welcome.

## Where things live

| You want to change | Edit | Then |
|---|---|---|
| A mockup screen | `design/canvas/<Screen>.dc.html` | `python3 tools/build_docs.py`, commit `docs/screens/` |
| The clickable prototype | `docs/prototype/` (plain HTML, CSS, JS) | Open it locally and walk the whole flow, including Reset |
| The gallery page | `docs/index.html`, `docs/assets/site.css` | Open it locally |
| The research | `research/report.md` | `python3 tools/build_docs.py`, commit `docs/research.html` |
| Tokens and conventions | `design/DESIGN-NOTES.md` | Update any screen that no longer matches |

GitHub Pages serves `main` / `/docs` as committed; there is no build step on GitHub. If you don't commit the regenerated `docs/`, your change will not appear on the site.

The build needs Python 3.10+ and `pip install markdown`.

## Workflow

1. Open an issue with the matching form: **Design change**, **Research finding**, **Mockup or site bug**, or **Design principle**. Blank issues are turned off so every issue carries its evidence and acceptance criteria.
2. Branch from `main`: `design/<short-name>`, `research/<short-name>`, or `fix/<short-name>`.
3. Make the change, rebuild, and open the affected pages locally (`python3 -m http.server --directory docs`). Run `npm run a11y`; it must report zero violations.
4. Open a pull request. The template's checklist is the review standard.

## Design rules that reviews enforce

These come straight from the research. Break one only with a linked issue that argues why.

- **Modules are the spine.** New screens use the same course → module → lesson → block hierarchy. AI features edit that structure; they never create a parallel one.
- **AI speaks in the margin.** Mark AI output with the markup contract in `design/DESIGN-NOTES.md` (`.ai`, `.ai-who`, `.ai-body`, `.ai-cites`) and never with hand-rolled styling. The attribution says what the AI is and what it is grounded in ("AI draft · from Week3_slides.pdf p. 4–7"). No colored left stripes, sparkle icons, or gradients to signal AI.
- **Drafts, not publishes.** Anything the AI writes for learners lands as a draft with accept, revert, and regenerate. Show who can see it.
- **Tutors hint first.** Tutor UI offers hints and worked examples before answers, cites course sources, and respects the tutor mode set by the instructor.
- **Explain and undo.** Anything the system reorders or adapts on the learner's behalf says why in one line and offers Undo.
- **Agents propose change sets.** Bulk or agentic actions show a was / will-be preview, affected counts, and conflicts before Apply.
- **Personalize on evidence.** Goals, time, prior knowledge, language, accessibility, device, role. Do not add "learning style" features.
- **Accessible as drawn.** Real `<button>`, `<a href>`, `<input>` + `<label>` elements, even in static mockups. Text contrast at least 4.5:1. Colors that must be told apart also differ in lightness. Learner touch targets at least 44px.
- **One accent.** Use the tokens in `design/DESIGN-NOTES.md`. No new colors without updating that file.
- **Illustrative content only.** Names, courses, and numbers are fictional. Do not use real student or employee data.

## Research rules

- Cite a source with a date for every new factual claim. Prefer primary sources over summaries of them.
- Mark vendor claims as vendor claims.
- Fast-moving facts (market share, product status, regulation deadlines) carry an "as of" date.
- When new evidence weakens a principle, open a **Research finding** issue before changing screens, so the design change can link to it.

## The public site

The repository is private and the Pages site is public. Nothing on the site may link into the repository, and nothing committed under `docs/` should be confidential.

## Labels

| Label | Meaning |
|---|---|
| `type:design` | Change to a screen, flow, or the design system |
| `type:research` | New or corrected evidence |
| `type:bug` | The published site renders or behaves incorrectly |
| `type:principle` | Tracks one design principle across all screens |
| `area:learner`, `area:author`, `area:instructor`, `area:admin`, `area:design-system` | Which surface is affected |
| `a11y` | Accessibility |
| `needs-evidence` | Proposal that is waiting for a source or a test |

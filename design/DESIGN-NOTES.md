# Design notes

Tokens, conventions, and the reasoning behind the six prototype screens. The research these rest on is in [`../research/report.md`](../research/report.md).

## Tokens

| Token | Value | Use |
|---|---|---|
| `paper` | `#F4F1EB` | Page ground |
| `surface` | `#FFFFFF` | Cards, panels |
| `surface-alt` | `#FAF8F4` | Rails, headers, footers |
| `line` | `#E3DED4` | Borders |
| `ink` | `#1C1B19` | Text |
| `muted` | `#5F5B54` | Secondary text (6.3:1 on white) |
| `accent` | `#0E6B63` | The single brand accent: primary buttons, progress, current-item markers |
| `accent-soft` | `#E3F0EE` | Selected nav, accent tints |
| `ai` | `#5B4BAF` | AI-produced content: tinted left edge, label chip, tutor bubbles |
| `ai-soft` | `#EEEBF8` / `#F7F5FC` | AI chip and bubble fills |
| `success` | `#2E7D4F` / `#E4F2E8` | Correct, reviewed, healthy |
| `warning` | `#9A6A12` / `#FBF1DC` | Due soon, needs review, delayed |
| `error` | `#B3382C` / `#FBE7E4` | Overdue, blocking, compliance risk |

Semantic states differ in lightness as well as hue. Text contrast is at least 4.5:1; muted grey on white and white on accent both pass.

## Type

- **Fraunces** (variable serif): page titles at 26–34px; lesson reading at 19px with ~68 characters per line and 1.6 line-height.
- **IBM Plex Sans**: all UI. 15px base for learner screens (comfortable), 13.5px for instructor and admin screens (compact).
- **IBM Plex Mono**: keyboard shortcuts, slash commands.

## Density

Two modes. Learner surfaces use comfortable density (larger type, 14–16px card padding, 44px primary buttons). Instructor and admin surfaces use compact density (13.5px, 28–36px controls, denser tables).

## AI labeling rule

Every element the AI produced carries **both** a tinted `ai` edge and a text label ("AI draft", "AI · hint mode", "AI agent · nothing applied yet"). Never a sparkle icon alone (NN/G: users do not read ✨ as "AI"). Labels also say what the AI is grounded in ("from Week3_slides.pdf p. 4–7", "Answers only from this course's materials") and who can see the output ("Your instructor can see this conversation").

## Interaction conventions

- **Draft-first.** AI output lands as a draft with Accept / Revert / Regenerate. A review-coverage meter shows the share of AI blocks a person has checked.
- **Explain and undo.** Adaptive choices show a one-line reason and an Undo ("Moved up because it is due in 26 hours…").
- **Change sets.** Natural-language commands in the ⌘K palette produce a preview table (was / will be), a count of affected learners, surfaced conflicts, and an Apply button. Undo stays available for 30 days.
- **Policy-bound tutor.** The tutor mode (hint-first / explain / open / off in assessments) is set per program by admins and per activity by instructors. The tutor cites course sources and offers "Give me a hint" and "Show a worked example" instead of answers.
- **Simulate before apply** for admin policy changes ("would delete 61,300 transcripts and affect 3 accreditation reviews").

## Accessibility

Real `<button>`, `<a href>`, `<input>` + `<label>` elements throughout, including in static mockups. Icon-only buttons carry `aria-label`. Targets are at least 44px on learner screens and 28px+ on compact instructor screens (the WCAG 2.2 minimum is 24px). Progress rings and bars carry text equivalents.

## Layout

Desktop artboards are 1440×900; the phone artboard is 390×844. Global navigation is a 76px left rail (Today · Learn · Calendar · Inbox · ⌘K). Course-level structure is Modules → lessons → chunks/blocks, the same hierarchy on every screen.

## Editing the sources

`design/canvas/*.dc.html` are the originals. Each has one tweak prop, `accent`, so the palette can be retinted for an institution. Run `python3 tools/build_docs.py` after editing to regenerate the microsite.

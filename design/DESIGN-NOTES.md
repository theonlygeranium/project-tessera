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
| `ai` | `#5B4BAF` | AI-produced content: gutter glyph, attribution, footnote numbers (never a stripe or a fill that carries meaning alone) |
| `ai-soft` | `#EEEBF8` / `#F7F5FC` | AI chip and bubble fills |
| `success` | `#2E7D4F` / `#E4F2E8` | Correct, reviewed, healthy |
| `warning` | `#9A6A12` / `#FBF1DC`; text `#7A5310` | Due soon, needs review, delayed. `#9A6A12` is for dots, bars and icons only; warning **text** uses `#7A5310` (4.2:1 vs 6.4:1 on the tint) |
| `error` | `#B3382C` / `#FBE7E4` | Overdue, blocking, compliance risk |

Semantic states differ in lightness as well as hue. Text contrast is at least 4.5:1; muted grey on white and white on accent both pass.

## Type

- **Fraunces** (variable serif): page titles at 26–34px; lesson reading at 19px with ~68 characters per line and 1.6 line-height.
- **IBM Plex Sans**: all UI. 15px base for learner screens (comfortable), 13.5px for instructor and admin screens (compact).
- **IBM Plex Mono**: keyboard shortcuts, slash commands.

## Density

Two modes. Learner surfaces use comfortable density (larger type, 14–16px card padding, 44px primary buttons). Instructor and admin surfaces use compact density (13.5px, 28–36px controls, denser tables).

## AI labeling rule

AI content uses one markup contract and a switchable visual style. The current style is **Marginalia**, chosen on Sept 26, 2026 over three alternatives (see `docs/explorations/ai-voice.html`).

**Markup contract** (style-agnostic, in every screen and the prototype):

```html
<div class="ai ai--chat">                       <!-- tutor or co-author message -->
<div class="ai ai--note">                       <!-- summary, AI feedback, insight card -->
<div class="ai ai--block" data-state="draft">   <!-- authored content block; "kept" once reviewed -->
  <div class="ai-who">Course tutor <span class="ai-src">· hint 1 of 2</span></div>
  <div class="ai-body">Text…<sup class="ai-ref">1</sup></div>
  <div class="ai-cites"><span class="ai-cite" data-n="1">Week 3 slides, p. 4</span></div>
  <div class="ai-actions">…</div>
</div>
```

**Marginalia rules.** The AI writes the way a scholar annotates a book. There's no box and no stripe.
- A gutter glyph in `ai` violet marks who is speaking: ※ for the tutor and co-author, ¶ for drafted content blocks, † for summaries and insights.
- The attribution (`.ai-who`) is set in Fraunces small caps and says what the AI is and what it is working from ("course tutor · hint 1 of 2", "AI draft · from Week3_slides.pdf p. 4–7").
- The body is set in the reading serif, so AI text reads differently from human UI text (Plex Sans) even in grayscale.
- Sources are numbered footnotes, with superscript markers in the text and a dotted rule above the note list.
- Review state is spelled out in words ("not yet reviewed", "· kept"). It never relies on color alone.
- Never use a sparkle icon, a colored left stripe, or a gradient to signal AI.

**Switching styles.** `docs/assets/ai-voice.css` holds four styles: `marginalia`, `tabs`, `perforated` and `tiles`.
- To preview a style on any page, add `?ai=tabs` (or `perforated`, `tiles`) to its URL. The gallery also has a switcher.
- To change the site-wide style, edit `DEFAULT` in `docs/assets/ai-voice.js`. That one line is the only change needed.

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

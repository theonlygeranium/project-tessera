# Project Tessera

An AI-native learning management system prototype for higher-education and industry audiences: course hosting plus a native, simplified authoring tool that drafts modular content from natural language, files, and existing material, customizable for a wide range of learner personas.

**Live site:** https://theonlygeranium.github.io/project-tessera/ · **Clickable prototype:** https://theonlygeranium.github.io/project-tessera/prototype/

*Tessera* is a working codename. It refers to the tiles of a mosaic: modular blocks that compose into a course.

## What is here

| Path | Contents |
|---|---|
| `docs/` | Static microsite published with GitHub Pages (branch `main`, folder `/docs`). `index.html` is the gallery, `screens/` holds one standalone page per mockup, and `research.html` is the rendered report. |
| `docs/prototype/` | Clickable learner flow: Today → lesson → hint-first tutor → module check → result → updated Today. Plain HTML, CSS, and JS. |
| `design/canvas/` | Source artboards (`*.dc.html`) and `canvas.json` from the design canvas. These are the editable originals. |
| `design/DESIGN-NOTES.md` | Design system tokens, the decisions the screens encode, and their research grounding. |
| `research/report.md` | The research report the design is based on: LXD evidence, LMS UX benchmarks, why Canvas wins, AI-authoring patterns, persona research, and the five layout briefs. |
| `tools/build_docs.py` | Regenerates `docs/screens/`, `docs/screens.json`, and `docs/research.html` from `design/canvas/` and `research/report.md`. Requires `pip install markdown`. |

## The six screens

| Screen | Role | What it demonstrates |
|---|---|---|
| Today dashboard | Learner | One cross-course "Do next" list, weekly time budget, spaced-review queue, persona preset, "why this moved · Undo" |
| Focus lesson player | Learner | Single reading column, chunk rail, format switcher, inline knowledge check, hint-mode tutor with source citations |
| Today on phone | Learner | 15-minute session launcher, offline and low-bandwidth mode |
| Prompt-to-course canvas | Author | Brief → Outline → Draft → Review → Publish, sources panel, provenance chips, tracked-changes diff, persona variants, publish-readiness bar |
| Instructor command center | Instructor | Keyboard triage, submission + rubric, labeled AI-drafted feedback, misconceptions from tutor chats, ⌘K change-set preview |
| Governance console | Admin | KPI strip, AI policy matrix, integration health, accessibility audit, simulate-before-apply |

## Design thesis (short form)

1. Borrow Canvas's backbone, not its surface: modules as the single spine, fast grading, predictable navigation.
2. AI is a governed co-author for instructors and a hint-first Socratic tutor for learners. Everything AI produces is a labeled draft with provenance, a diff, and revert. A person approves it before learners see it.
3. Personalize on goals, time, language, accessibility, device, and role. Not "learning styles."
4. Agentic actions are previewable change sets, never silent writes.
5. Quality (QM-style alignment) and accessibility (WCAG 2.2 AA) are linted before publish, including generated content.

The full argument, with citations, is in [`research/report.md`](research/report.md).

## Working with the mockups

Regenerate the site after editing an artboard source:

```bash
python3 tools/build_docs.py
```

Open `docs/index.html` locally, or commit the regenerated `docs/` and push to `main` to publish. GitHub Pages serves `main` / `/docs` directly, so the build output must be committed.

The repository is private but the Pages site is public. Anything the site links to must live inside `docs/`; the build renders `research/report.md` to `docs/research.html` for that reason.

Each artboard is a self-contained HTML file. The `*.dc.html` sources carry a small runtime header for the design canvas they were drawn in; the build script strips it and emits plain HTML. Links between screens (`href="LessonPlayer.dc.html"`) are rewritten to the `docs/screens/` names.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Issues use forms (design change, research finding, site bug, design principle); pull requests follow the checklist in `.github/pull_request_template.md`.

## Status

Prototype. Names, courses, learners, and numbers in the screens are illustrative. No backend exists.

## License

MIT. See [`LICENSE`](LICENSE).

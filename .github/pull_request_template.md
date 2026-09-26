## What changed

<!-- One or two sentences. Link the issue: Closes #123 -->

## Screens or pages affected

- [ ] Gallery (`docs/index.html`)
- [ ] Clickable prototype (`docs/prototype/`)
- [ ] Artboards (`design/canvas/*.dc.html`) and the regenerated `docs/screens/`
- [ ] Research report (`research/report.md`) and the regenerated `docs/research.html`
- [ ] Design notes or tokens

## Checklist

- [ ] Ran `python3 tools/build_docs.py` and committed the regenerated `docs/`
- [ ] Ran `npm run a11y`: zero violations (paste the summary line)
- [ ] Opened every changed page locally; links between screens still resolve
- [ ] AI-produced elements use the `.ai` markup contract (attribution + sources), with no left stripes, sparkles, or gradients
- [ ] Text contrast ≥ 4.5:1; controls are real `<button>` / `<a>` / `<input>` with labels
- [ ] New factual claims in the report cite a source with a date; vendor claims are marked
- [ ] Nothing on the public site links into the private repository

## Screenshots

<!-- Before / after for visual changes -->

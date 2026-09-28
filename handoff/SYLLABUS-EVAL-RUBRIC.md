# Syllabus evaluation rubric

How Tessera's "Start from a syllabus" is scored against real and fictional syllabi. `tools/syllabus_eval.mjs` applies it automatically; this page is the definition. The goal (Night 4): **an instructor can upload a syllabus like the test set and get a correct read, sensible questions, three fitting approaches, and a draft course they only have to review.**

## Test set

| Where | What |
|---|---|
| `tests/fixtures/syllabus/` (committed) | The fictional STAT 110 fixtures and their answer keys. |
| `tests/fixtures/syllabus/private/` (gitignored, never committed) | Other syllabi and their answer keys (`<name>.expected.json`). Real syllabi contain real names and contact details, so they stay on the owner's machine. Previews are public: test data created from them on the preview is deleted after each run. |

An answer key records what the document actually says: code, title, credits, term weeks and dates, modality (with acceptable alternatives), instructor name and email, the course outcomes verbatim, each graded component and its weight, one schedule row per week (label, dates, topic keywords, empty, holiday), stated workload, other structures, and the traps a reader could fall into.

## Stage 1 · Extraction (M2)

| # | Check | Pass |
|---|---|---|
| E1 | Code, title, credits | exact (code ignoring spaces and case) |
| E2 | Term weeks; start and end dates when stated | exact |
| E3 | Instructor name and email | email exact; name contains the surname |
| E4 | Modality | in the key's acceptable set |
| E5 | Course outcomes | same count; each key outcome matched (normalized similarity ≥ 0.9); no institutional or program outcomes |
| E6 | Graded components | every key component matched with its weight; total equals the key's |
| E7 | Schedule | one row per key week; ≥ 90% of topics contain the key's keywords; no row marked empty unless the key says so |
| E8 | Citations | ≥ 95% of quoted spans are found in the source (whitespace and line-break hyphens ignored); PDF spans are on the right page; DOCX spans name their section |
| E9 | Questions | no false question (weights-not-100 when the total is 100, empty-week for a week with content, due-outside-term for a date inside the term); at most six |
| E10 | Reliability | the job finishes in every run (3 runs per syllabus) in under 3 minutes |
| E11 | Hygiene | output validates; no "learning style" anywhere |

A syllabus **passes extraction** when E1–E3, E5–E7, E9 and E10 pass and E4, E8, E11 have no more than one miss between them.

## Stage 2 · Instructional read (M3)

| # | Check | Pass |
|---|---|---|
| R1 | Read validates; every outcome has an audit | yes |
| R2 | Summary opens "Here is what I understood", cites ≥ 3 passages, all found in the source | yes |
| R3 | Alignment: every key outcome that the syllabus says is assessed maps to at least one component, ids valid | ≥ 90% |
| R4 | Workload: budget = credits × 3 (or the stated hours); one estimate per term week; stated weekly hours within ±25% of the estimate's average or explained | yes |
| R5 | Questions: unassessed-outcome and single-high-stakes questions only when true | no false ones |
| R6 | No QM references unless the institution's rubric is QM (D-031); no "learning styles" | yes |

## Stage 3 · Approaches, plan, course (M4–M5)

| # | Check | Pass |
|---|---|---|
| P1 | Exactly three options, each with a one-sentence rationale citing the syllabus | yes |
| P2 | The weekly option has one module per non-holiday week (or per stated unit) | yes |
| P3 | Plan preview: every confirmed outcome, every graded component as an assignment with its weight, readings only with a source span | yes |
| P4 | Apply creates exactly what the preview listed (hash matches); readiness forecast equals the checks after apply | yes |
| P5 | Undo removes everything the plan added, nothing else | yes |
| P6 | Starter content has `[Your …]` slots; nothing is published | yes |

## Recording results

Each run of `tools/syllabus_eval.mjs` prints a scorecard per syllabus and writes `reports/syllabus-eval.json` (gitignored). Summaries (never the syllabi or their contents) go in `handoff/NIGHT-4-QA.md`, naming real syllabi generically (for example "real syllabus A, DOCX, 4 credits").

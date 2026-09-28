# Night 4 QA log

Branch `night4`. Preview: https://night4-project-tessera.jeff-f69.workers.dev/

## Baseline (2026-09-28)

- `worker/access/syllabus-extraction.test.ts`: 3 passed (pdfjs and JSZip recover the STAT 110 fixture's outcomes, weights, schedule, contact, and credits with page anchors).

## Milestones

### M1 · Domain, contract, storage (Codex Sol, 11 min, 268,250 tokens)
Types and schemas for spec §4, the §5 operations as stubs, migration 0008 (applied locally and to preview D1 before the push), repo methods with contract tests, RICE workload defaults, design-partner policy, lesson objectives kept by the builder. Checks: typecheck, unit tests, build; feasibility test still green. Claude reviewed the migration and routes against the spec.

### M2 · Extraction, rules, Start screen (Codex Sol, 22 min, 259,429 tokens)
Row-preserving `lines` in the PDF and DOCX parsers; file, paste, and sample sources; `syllabus-extract` (fixture and Palmyra prompt) with validation; rules to questions; extraction as a background job; Start screen, temporary session page, builder card. Checks: 445 unit tests; audit found 6 radio and checkbox targets under 24 px on the questions (WCAG 2.2 target size), fixed by Claude; 222/222 after. On the sample syllabus (fixture AI) every profile field, all six outcomes, five weights (sum 100), 14 schedule rows with week 8 empty, and the policies came back with their pages; the empty-week question fired with the spec's wording. Open for later: the Start screen's layout is looser than the artboard (polish pass in M6); the temporary session page rendered structured values as JSON (replaced in M3).

## D-032 Palmyra check

Run on the `night4` preview with real Palmyra-X6 (`tools`: scratchpad `d032_check.py`; uploads, sessions, jobs, and the temporary token deleted after each run).

**Extraction, fixtures (2026-09-28, after M2):**

| Syllabus | Code, credits, term | Outcomes | Weights | Schedule rows | Contact | Empty week found | Time |
|---|---|---|---|---|---|---|---|
| STAT110 PDF | correct | 6/6, all with page | 5/5, sum 100 | 14/14 (100%) | correct | yes | 34 s |
| STAT110 DOCX | correct | 6/6 (DOCX has no pages) | 5/5, sum 100 | 14/14 (100%) | **missed** | yes | 27 s |

Findings:
- **Rule bug (real model only):** `due-outside-term` compared due dates as text, so Palmyra's "Weekly" and "Oct 15" read as outside an ISO term and produced four false questions on the PDF, crowding out useful ones. The fixture AI returns ISO dates, so unit tests missed it. Fix after M3: compare real dates only (resolve month-day with the term year), ignore recurring or unparseable values, and merge date problems into one question.
- **DOCX contact:** Palmyra didn't return the instructor's email from the DOCX. To look at with the real syllabi.
- Real syllabi (at least five, different departments, one scanned) are still needed from the owner; analysis accuracy is measured after M3.

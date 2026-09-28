# Night 3 QA log

Branch `night3`, 2026-09-27. Preview: https://night3-project-tessera.jeff-f69.workers.dev/

## Automated checks (on the merged branch)

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 375 passed |
| `npm run a11y` | 208/208 pages, zero violations (includes every Night 3 page and 320px reflow) |
| `npm run e2e` | all journeys pass: 1–11 and H (Nights 1–2), 12–16 (Night 3) |

## Journeys 12–16 (in-browser demo mode, `tests/e2e/journeys.mjs`)

- **12 · Templates:** an administrator creates a template and a program that uses it; an instructor creates a course in the program and gets the skeleton; deleting the required lesson appears in the readiness report.
- **13 · Readiness:** a fix link opens the exact AI draft block; keeping it updates standard 6; an AI finding is a draft until accepted (reviewer named); attesting 4.1 with a note moves standard 4 from 2 to 3 of 4.
- **14 · Variants:** a plain-language variant is created, its drafts kept and published; editing the master shows "1 changed in the master"; resync clears it; a student who sets plain reading gets the variant with the why and "Read the full lesson".
- **15 · Required training:** assigned with a due date, shown first on Today, tested out, certificate opened with the PDF and verification links; the audit CSV has assigned, tested-out, and certificate-issued events.
- **16 · Managers:** before opting in the manager sees only a count; after opting in, Dana's required training with no scores, percentages, attempts, email, or tutor data; after opting out the view empties.

## Journey 17 · Carry-overs (live on the preview; they need real Cloudflare Access and the OCR container)

- **Simultaneous invitations** (`scratchpad race_test.py`, run with the owner's approval): two invitations sent at the same moment both returned `accessGranted: true`, and both emails were in the Access group. The group was then restored exactly (same include list) and the test users, invitations, and temporary token deleted.
- **Scanned PDF** (a generated two-page scan: one clear page with a figure, one deliberately blurry page): the scan found the image without alt text; the alt-text suggestion came from Palmyra-X5 describing the extracted image (6 s); the reading version was ready in 16 s; the blurry page (Tesseract confidence 25) produced a pending AI transcription that was **not** in the reading version; after an instructor kept it, the reading version included it labeled "transcribed with AI and reviewed by Dr. Amara Okafor". Test file and token deleted.
- **Certificate verification page** (public, `/verify/<code>`): answers without sign-in and never shows the learner's name.

## Fixed during integration

- AppShell hooks were placed after early returns (lane D2), which crashed the administrator's first-run setup page. Moved above the returns.
- Students couldn't read a program's brand (lane A gap): course summaries now carry the program name and accent.
- Reviewed AI findings showed the reviewer's id (lane B gap): findings now store the reviewer's name.
- Three accessibility-audit steps from the lanes were wrong (not the pages); fixed.

## Integration review (Codex `gpt-6-astra`)

12 findings, all reproduced and all fixed (by Codex Sol, verified by Claude): variants copying unkept AI blocks as human content; readiness checks counting unkept AI blocks; a Workflow takeover race that could overwrite a kept block; a roster race that could drop an enrollment; non-atomic certificate issuance and replacement; cross-environment Access writes; hard-coded colors on the verification page; partial resync hiding new master blocks; deleted assessments counting toward coverage; `updateModule` ignoring objectives; non-Latin-1 names breaking the PDF (now Noto Sans; scripts it can't draw get a clear message and Print or save as PDF); malformed verification codes crashing the Worker. After the fixes: typecheck clean, 388 tests, 208/208 accessibility, all journeys pass, preview deployed.

Residual risk: Cloudflare's Access API has no compare-and-set, so two environments writing the group in the same instant can still, rarely, drop one email; the grant now verifies and retries, and an invitation that ends without access shows "Access pending" with Try again.

## Known limits

- Required training assigned to staff appears in their list but can't be completed through the student lesson flow.
- Background generation on Workflows runs only in production (previews can't run their own Workflow code); previews and demo mode use the poll-driven path. Verify after release.

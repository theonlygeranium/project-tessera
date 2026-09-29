# Design integration: source redaction limits

Before redaction or model work, a possible-roster gate pauses and asks the instructor to remove roster lines or confirm that the source has no student roster. Section headings and body lines are scanned in document order (DOCX bold/heading text included). A roster header, an explicit roster section label, a person-shaped name beside an email or ID, and ambiguous name/number rows trigger the gate. A rejected create stores no session or job and sends nothing to the model. The sample syllabus passes without this confirmation.

After confirmation, the existing roster filter remains best-effort defense-in-depth. It removes tables with person and identifier headers, plus standalone lines with a person-shaped name and a student email or ID pattern. Names without identifiers, unusual layouts, and IDs outside these patterns may remain. An unlabelled two-word pipe row followed by a number is ambiguous with an assessment and is retained outside a recognized roster block. A faculty contact name beside a non-student email address is retained unless the line has another student-like identifier. Instructors should still review the source before upload and before confirming.

After a roster header, rows are removed until a blank line or a generic table-vocabulary boundary. Vocabulary words inside a name-shaped cell do not end the block when the row still matches the roster column count and the cell’s first token is not itself vocabulary (for example `Avery Week | 1234`, `Avery Topic | abc`, `Avery Score | XYZ` stay in the roster and are removed; a label-first cell like `Assignment Name | POINTS` still ends the block and is kept). This intentionally removes ordinary assessment lines directly after a roster without a separator, including `Participation | 10`, `Essay | 20`, and `Final Exam | 200`. Those lines survive when separated by a blank line or placed outside a roster block.

## Remaining limits after instructor confirmation

A blank line ends a roster block. After that boundary, the standalone rule is meant to catch leftover identity lines, but two deliberate exemptions leave some name+identifier rows in the saved source and model input:

- A name beside a non-student email (for example `Avery Example | avery@example.edu` after a blank line following a `Name | Email` roster) is treated like ordinary faculty contact text and is retained.
- An unlabelled two-word pipe row with a number (for example `Avery Example | 7654321` after a blank line following a `Name | ID` roster) is treated as ambiguous with an assessment title and is retained.

The gate blocks these examples before any model call unless the instructor confirms no student roster. After confirmation, those rows may remain in the saved source and model input because the redactor intentionally keeps its existing exemptions. Names without identifiers and unusual layouts may also evade both checks. Instructor confirmation is the primary gate; the redactor is defense-in-depth.

An unseparated one-word faculty surname followed by another name and identifier (for example `Instructor: Dr. Rivera Casey Sample casey@example.edu`) may evade the faculty-line gate.

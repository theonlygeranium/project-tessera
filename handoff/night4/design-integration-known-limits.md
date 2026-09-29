# Design integration: source redaction limits

The roster filter is best-effort redaction before the model reads a syllabus. It removes tables with person and identifier headers, plus standalone lines with a person-shaped name and a student email or ID pattern. Names without identifiers, unusual layouts, and IDs outside these patterns may remain. An unlabelled two-word pipe row followed by a number is ambiguous with an assessment and is retained outside a recognized roster block. A faculty contact name beside a non-student email address is retained unless the line has another student-like identifier. Instructors should review the source before upload.

After a roster header, rows are removed until a blank line or a generic table-vocabulary boundary. Vocabulary words inside a name-shaped cell do not end the block when the row still matches the roster column count and the cell’s first token is not itself vocabulary (for example `Avery Week | 1234`, `Avery Topic | abc`, `Avery Score | XYZ` stay in the roster and are removed; a label-first cell like `Assignment Name | POINTS` still ends the block and is kept). This intentionally removes ordinary assessment lines directly after a roster without a separator, including `Participation | 10`, `Essay | 20`, and `Final Exam | 200`. Those lines survive when separated by a blank line or placed outside a roster block.

## Known limit: blank-line name + email/ID (deferred to round 8)

A blank line ends a roster block. After that boundary, the standalone rule is meant to catch leftover identity lines, but two deliberate exemptions leave some name+identifier rows in the saved source and model input:

- A name beside a non-student email (for example `Avery Example | avery@example.edu` after a blank line following a `Name | Email` roster) is treated like ordinary faculty contact text and is retained.
- An unlabelled two-word pipe row with a number (for example `Avery Example | 7654321` after a blank line following a `Name | ID` roster) is treated as ambiguous with an assessment title and is retained.

These are accepted best-effort limits for this release. Round 8 (block-and-ask) is the planned next step before shipping a stronger treatment; do not expand the filter further here without that product decision.

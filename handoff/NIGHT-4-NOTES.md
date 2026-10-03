# Night 4 working notes

Collected before the Night 4 plan is written. The owner has more ideas to add; these notes become sections of `handoff/NIGHT-4-PLAN.md` once the scope is agreed.

## Backlog carried in

- #26 Integrations: LTI 1.3, SIS/HRIS rosters, xAPI, SCORM/cmi5.
- #27 Dark and compact modes.
- #30 Mobile lesson player.
- #21 Course home artboard (the app's course home exists; the design artboard doesn't).

## Guided course setup (proposal)

**Problem.** Setting up a course today spans several screens that were built separately: create the course (administrator or instructor), assign people (administrator only), then choose, on a different page, between the AI builder, the template page, or adding modules by hand. The contextual help on the `course-help` branch explains that path; it doesn't shorten it. The owner wants one simple setup with three ways to start: an AI wizard, manual, or a template.

**Proposal: one "New course" flow**, the same for administrators and instructors, in three short steps:

1. **Basics:** code, title, term, and program. Choosing a program shows which template applies and what it adds (the existing change set), before anything is created.
2. **How to start** (one choice, with a one-line "why" for each):
   - **Build with AI:** describe the course and add sources right here; the course is created and the builder's brief is drafted in one step, then the builder continues (brief → outline → lessons, all drafts).
   - **Start from the template:** create the course with the template's modules, lessons, and required blocks.
   - **Start empty:** create the course with nothing but the template's required pieces, if any, and go to the outline.
   - **Import** (later, with #26): a Common Cartridge or SCORM package, or Tessera's JSON import, previewed as a change set.
3. **People:** administrators assign instructors and enroll students here; instructors see who's enrolled and how to ask for enrollment.

It ends on the course workspace with the setup checklist from `course-help`, already on the right step.

**What it reuses:** `createCourse` (including `skipTemplate`), `previewTemplate` and the template plan, `createBuilderSession`, `importCourse`, `setCourseInstructors`, `setCourseEnrollments`, and the help components. Mostly new UI, with little new service code.

**Open questions for the owner:**
- Should administrators be able to build content too (today only instructors can edit a course), or does the flow hand over to the instructor after step 3?
- Can instructors enroll students in courses they create, or does that stay with administrators?
- For the AI wizard, how much of the builder belongs inside the flow (just the prompt and sources, or also the brief and outline review)?
- Which import formats matter first, if import is in Night 4?

**Evidence to cite when planning:** principle #3 (consistency; report §2), principle #11 (previewable change sets; D-003), and the builder's plan-first design (principle #1).

## Start from a syllabus: the design partner (owner-approved, 2026-09-28)

A second entry mode of Build with AI, and the first "How to start" option in the guided New-course flow above once that exists. The instructor uploads a syllabus (PDF/DOCX) or pastes a training brief; the AI, labelled **Design partner**, produces an instructional read with page citations, asks what the document can't answer, has the instructor confirm outcomes, proposes three architectures with trade-offs, previews a change set, and provisions drafts only.

- **Spec (normative, with decisions D-030 to D-036):** `handoff/SYLLABUS-DESIGN-PARTNER-SPEC.md`
- **Artboards:** `design/canvas/Syllabus{Start,Read,Approaches,Preview,Review}.dc.html` (row G; gallery slugs `syllabus-*`)
- **Research and recommendations:** `research/syllabus-design-partner/`
- **Fixtures and feasibility test:** `tests/fixtures/syllabus/`, `worker/access/syllabus-extraction.test.ts`

# Syllabus-to-Course Design Partner: research findings and recommendations for Tessera

*Prepared 2026-09-28 for Project Tessera (Phase 2). Grounded in the current codebase at `theonlygeranium/project-tessera` (main @ 0ec8291, "Night 3" released 2026-09-28), the public docs at docs.tessera.edstratumlabs.ai, three research passes (learning science, competitors, human-AI collaboration and pipeline), and the existing evidence base in `research/report.md`. This is the recommendations document; a separate build/design spec for an implementing agent follows once you have chosen among the decisions in §10.*

---

## 1. Summary

**Recommendation:** add a second entry mode to *Build with AI* called **Start from a syllabus**, in which Tessera's AI acts as a **design partner** (the existing Co-author role, extended) rather than a generator. The partner reads an uploaded PDF or DOCX syllabus, produces an *instructional read* (course profile, objective audit, alignment matrix, workload estimate, gaps), asks the instructor a small number of questions it cannot answer from the document, proposes **three named course architectures with rationale, evidence and trade-offs** that can be combined with overlays, shows a **preview of exactly what will be created** before writing anything, and then provisions modules, lessons, outcomes, alignment links, and deliberately unfinished starter content, all as drafts the instructor reviews module by module.

Five things make this different from every competitor surveyed (§4), and they map directly onto Tessera's existing principles and code:

| Differentiator | Nobody else does it | Tessera already has |
|---|---|---|
| Analysis before generation (an "instructional read" of the syllabus) | Empty row across 12 competitors | `worker/access/` PDF and DOCX parsers, OCR container (D-023), `Outcome` entities and `OutcomeLink` (#25) |
| Multiple structural alternatives with trade-offs, pick or combine | Empty row | Report §4 pattern library ("show the plan before the product"); D-003 |
| Workload and time-on-task estimate against the credit-hour budget | Empty row | `Lesson.minutes`, `time-estimates` readiness check |
| Staged review gates by design layer, with a change-set preview and undo | Only Absorb has one gate | `TemplateChangeSet` + hash pattern (D-024), principle #11 |
| Provenance to the syllabus passage behind every claim, plus consent | Absent exactly where faculty anger has been loudest (ASU "Atomic", Apr 2026) | Marginalia `.ai-src` and `.ai-cites` contract (D-006), `Provenance` on every block |

The rest of this document gives the evidence (§2–§4), the workflow and interaction design (§5), what gets provisioned and how it maps to the data model (§6), the pipeline (§7), governance (§8), the UI mockup walkthrough (§9), and the open decisions and phasing (§10–§11).

---

## 2. What the current build already gives us (and where the gaps are)

The feature should extend the Night 1–3 builder, not sit beside it. Findings from the codebase:

**Existing pieces to reuse**
- **Builder session** (`shared/domain.ts` `BuilderSession`, `shared/service/builder.ts`): `prompt + sources → brief → outline → draft → review`, with `PipelineStepper` in `app/src/features/builder/Session.tsx`. The stage vocabulary and the "AI drafts; you decide" intro copy are right; the input and the analysis depth are not.
- **AI task contract** (`shared/ai.ts`, `worker/ai/palmyra.ts`): every task is strict JSON against a schema, validated again server-side, stored as a draft (D-015). New tasks slot in the same way, with a deterministic fixture for mock mode and tests.
- **Document parsing** (`worker/access/pdf.ts` with pdfjs, `worker/access/office.ts` with JSZip; `worker/ocr.ts` container for scans; Palmyra-X5 second pass for low-confidence pages): `checkDocument()` already yields `text.sections[{heading, level, text, page}]`. The text is thrown away after the accessibility scan today; it needs to be persisted with page anchors.
- **Outcomes and alignment** (#25): `Outcome` entities with codes (O1…), `OutcomeLink` for checks, scenarios and assignments, and automatic readiness checks `outcomes-present`, `module-objectives`, `assessments-aligned`, `outcomes-assessed`, `time-estimates`, `navigation-instructions`, `instructor-contact`.
- **Quality rubrics** (D-024, `shared/quality/rubrics.ts`): the Tessera standard (8 standards, 28 items) and OSCQR 4.0 verbatim with attribution. **QM text is never reproduced** (licensed); an institution may load QM as a custom rubric.
- **Templates and change sets** (D-024): `TemplateChangeSet` with `summary` ("Adds 2 lessons and 3 blocks. Renames nothing. Removes nothing.") and a `hash` so what's applied is what was previewed. This is the exact pattern the provisioning step should copy.
- **Background generation** (`worker/generation-workflow.ts`, `shared/service/generation.ts`): Cloudflare Workflows in production with a polling fallback; the syllabus pipeline should run on it rather than as one long request.
- **Marginalia** AI visual language (D-006, D-017, D-018): `.ai--chat` balloon for partner messages, `.ai--block` pilcrow for drafted blocks, `.ai--note` caret for summaries; `.ai-who` always names the role and `.ai-src` the source; no stripes, no sparkles.

**Gaps the feature must close (all confirmed in code)**
1. The builder accepts only pasted text and `.txt`/`.md` (5 sources, 20,000 characters each). PDF/DOCX uploads go to R2 and get scanned, but no API returns their text.
2. `generateDrafts` writes no `Outcome` entities, no `Module.objective`, no `OutcomeLink`s, and drops each lesson's `objective` (the `Lesson` type has no field). Every builder-made course currently fails four readiness checks.
3. The builder ignores the course template and shows no change set before writing.
4. Source references carry `{id, name}` only, with no page or section anchors, so provenance can't say "from your syllabus, p. 3".
5. `CourseBrief` has no situational factors (credits, term length, modality, class size, level) and no persona targets, so there is nothing to compute workload against.
6. `MAX_SOURCE_CHARS` is 12,000 in the Palmyra prompt builder; a typical syllabus is 10,000–35,000 characters, so the analysis task needs section-level chunking or a larger budget.
7. No shared `ChangeSetTable` or `SourceList` component exists yet (both are proposed in `design/COMPONENTS.md`).

---

## 3. What the learning science requires

Full findings with citations: `research/syllabus-design-partner/learning-science.md` (attached to the session). The requirements that bind the design:

**3.1 Alignment is the data model, not a report.** Backward design (Wiggins & McTighe), constructive alignment (Biggs), Fink's integrated course design, and both quality rubrics converge: objectives, assessments, activities and materials must be explicitly linked, and "if a teacher breaks one of the connections in a course, inevitably another is broken" (Fink). The course map / alignment matrix is the standard deliverable a human instructional designer produces. **Implication:** the analysis produces an alignment matrix from the syllabus (course outcomes × assessments × weekly topics), the structure options are presented as different ways to resolve its gaps, and provisioning writes `Outcome`, `Module.objective` and `OutcomeLink` rows so the existing readiness checks pass or show visible gaps.

**3.2 Situational factors come first (Fink step 1).** Credits and term length set the workload budget (34 CFR 600.2: one in-class plus two out-of-class hours per credit per week over ~15 weeks, so a 3-credit course budgets about 9 hours a week and 135 hours in total); modality decides whether Community of Inquiry and regular-and-substantive-interaction elements are required; assessment weights reveal which cognitive levels are actually rewarded; course level and prerequisites set the novice/expert assumption (worked examples first, faded later, per cognitive load theory's expertise-reversal effect). **Implication:** extract a *course profile* and have the instructor confirm it before anything is generated.

**3.3 Score the syllabus with validated instruments, then show the evidence.** Palmer, Bach & Streifer (2014) "Measuring the Promise" (four components, 0–46) and Cullen & Harris (2009) (community, power and control, evaluation) are published, reliable rubrics; a 2024 PLOS One study linked higher learner-centeredness to smaller STEM grade gaps. **Implication:** report scores in the rubric's own language, quote the syllabus passage behind each score, and let the instructor contest it. Never "fix" silently.

**3.4 Common deficiencies to detect:** unmeasurable objectives ("understand", "appreciate"); objectives with no assessment and assessments with no objective; verb mismatches (objective says *design*, only assessment is a multiple-choice exam); midterm-plus-final with no formative retrieval; topic-only schedules; workload over the credit-hour budget; punitive policy framing with no rationale; single-mode assessment; no instructor-interaction plan for online courses.

**3.5 Structure options must be evidence-qualified.** Problem-based learning favors long-term retention and skills but weaker short-term recall; flipped shows g ≈ 0.73 but is highly context-dependent and stronger in health and language than STEM; project-based d = 0.71; HyFlex has mixed grades and asynchronous students underperform; 70-20-10 lacks empirical support and must not be presented as evidence. Bookends, spaced review, UDL choice points and teaching-presence plans are *overlays* that apply to any structure.

**3.6 Every module gets a retrieval check with feedback** (classroom quizzing g ≈ 0.5, rising with repetition and corrective feedback; post-class beats pre-class), and every generated assignment uses TILT's purpose / task / criteria template, which directly counters generic output.

**3.7 Lesson skeletons come from Gagné and Merrill,** not from prose generation: hook, objective, recall prompt, content slot, worked example, practice, feedback, check, transfer. This gives faculty a predictable, editable scaffold instead of a wall of generated text.

**3.8 Industry audiences** need the same feature to accept a training brief or competency list as the "syllabus", apply Mager/ABCD performance objectives, and offer performance-first (action-mapping) and mastery/competency structures with a Kirkpatrick-style evaluation plan.

**3.9 Documented GenAI failure modes in course design** (2023–2026 literature): generic, decontextualized content; unrealistic pacing; fabricated readings and citations; teacher-centred defaults. Guardrails: ground only in the instructor's own artifacts; zero fabricated readings (placeholders instead); alignment and Bloom-level fidelity checks before provisioning; workload feasibility check; propose-then-approve at every stage with framework-cited rationale.

---

## 4. Competitive landscape (September 2026) and the white space

Full profiles and a capability × competitor matrix: `research/syllabus-design-partner/competitors.md`. Highlights:

- **Canvas IgniteAI Agent** (launched Mar 12, 2026; Claude via Bedrock): action-oriented, creates and organizes modules, rubrics and quizzes from prompts against existing course content. Confirms *actions*, not *design*; no revision history; overwrite warnings "still in development". No syllabus-driven flow.
- **Blackboard AI Design Assistant** (Anthology emerged from Chapter 11 as a standalone Blackboard on Feb 27, 2026): generates module *titles and descriptions* plus item-level generators with a Context Picker and ten complexity levels. Campus teams frame it as "a brainstorming partner, not a content creator."
- **D2L Lumi**: point features (quiz, ideas, summaries, Remix from a deck); under 2% of ARR; AI "not yet showing up consistently in RFPs."
- **Moodle core**: no course generation at all; plugins (Edwiser, Datacurso) do one-shot document-to-course.
- **Coursera Course Builder, Articulate Rise, Absorb Aura Create, Sana, 360Learning, Docebo, Coursebox**: true one-shot "document to full course" generators. Only Absorb has a single approval gate (outline). Rise "doesn't use Bloom's Taxonomy or other learning models"; content "lacks depth".
- **Microsoft Copilot "Teach"** is the only vendor generating a sequenced multi-week plan with essential questions, K-12 only, single variant.
- **ASU "Atomic"** (Apr 2026) is the cautionary case: faculty lectures reused without notice, misnamed scholars, "Frankensteinian" edits; the president called it "not really ready for prime time." It failed on consent, provenance and accuracy before pedagogy was even evaluated.

**Rows empty across all twelve competitors:** multiple structural alternatives with trade-offs; workload / time-on-task analysis. **Nearly empty:** pre-generation instructional analysis; pedagogical rationale per decision; staged review gates by design layer; provenance to the source passage; instructor teaching-philosophy profile; institutional policy ingestion; explicit consent controls on ingested materials.

**Practitioner critique to design against:** "structurally fine and instructionally hollow: no real scenario, no real practice, no point of view" (Devlin Peck, Jul 2026); a "strategic monoculture" that omits content silently and invents metrics (Philippa Hardman); framework-free output; accessibility debt. Quality Matters and iDesign (EDUCAUSE Review, Feb 2026): AI should "support, not supplant" and embed quality checks *during* design. Faculty confidence in institutional AI policy is 22% (Tyton, Time for Class 2026).

---

## 5. The workflow: how the design partner behaves

### 5.1 Positioning and voice

The research on faculty–instructional-designer relationships is unusually consistent (Halupa 2019; Richardson et al. 2019; Mueller et al. 2022; Carliner & Chen 2024): faculty see themselves as the primary creators and keep final approval; they value targeted process expertise and resent anyone who steps into content or pedagogy uninvited; "content is the primary combat zone." The role split to build into the product:

> **You are the subject-matter expert and the instructor of record. I handle sequencing, alignment, scaffolding and quality checks, and I show you my evidence.**

Voice rules for UI copy and the partner's messages:
- Open with "Here is what I understood, and here is what I need from you." Never "Here is your course."
- Say what was done and why, in the instructor's terms: "I mapped your seven outcomes against the eight graded assessments in your syllabus. Outcomes 5 and 6 are not assessed anywhere; here are three ways to close that gap."
- Phrase content suggestions as questions or optional drafts, never as corrections. Never grade the instructor's pedagogy.
- Label drafts as drafts, persistently: "Starter content, not reviewed" as a state, not a toast.
- Never claim completeness or autonomy: no "your course is ready", "auto-generated course", "AI-built". Use "draft structure for your review", "provisioned from your choices".
- No hype words (magic, instantly, perfect). No sparkle icons or gradients (D-006).
- The AI role label in `.ai-who` is **Design partner** (a Co-author variant); learners never see the syllabus analysis, only the eventual kept content with the existing "Drafted with AI · edited by Dr. Okafor" line (NQ-03).

### 5.2 The stages (extends the existing Brief → Outline → Draft → Review stepper)

| Stage | Instructor sees | Partner does | Checkpoint |
|---|---|---|---|
| **0 · Start** | Upload PDF/DOCX (or paste; or pick an existing course file), scope and consent panel, "how we work together" | Parses with `checkDocument()`; OCR fallback for scans; extraction with page anchors | Consent to syllabus-only processing; AI policy gate (`Institution.policy.aiAuthoring`) |
| **1 · Read** | The *instructional read*: course profile with extracted / inferred / missing states, objective audit, alignment matrix, assessment map, workload estimate, learner-centeredness signals, deficiency list | Extraction → rule validation → analysis; every field cites a syllabus span | None yet (read-only), but every claim is contestable inline |
| **2 · Confirm** | 3–6 questions anchored to syllabus spans ("Your schedule lists 13 topics for a 14-week term; is week 8 an exam or a break?"), one open question about teaching philosophy and what they want from the redesign, and the extracted outcomes to confirm, edit or reorder | Turns validation failures into questions instead of silent fixes (Horvitz; HAX G10) | **Cognitive forcing function:** outcomes are confirmed *before* any structure is shown (Buçinca et al. 2021) |
| **3 · Approaches** | Three named architectures side by side, each with fit rationale citing the syllabus, trade-offs, evidence caveats, a mini course map and the workload curve; four overlays (bookends, spaced review, UDL choice points, teaching-presence plan) as toggles; combine by checking more than one | Selects the three from the catalogue by course-profile rules (§5.3); computes per-module hours | Pick or combine; one required sentence: "Why does this fit your students?" (stored in the design record; Lee et al. 2025 on self-confidence and critical thinking) |
| **4 · Preview** | A change set: "Will add 7 modules, 21 lessons, 7 checks, 3 assignments, 6 outcomes and 19 alignment links. Renames nothing. Removes nothing." Per-module rows with objectives and mapped outcomes; template compliance; conflicts with existing content | Builds a `ProvisionPlan` with a hash (same pattern as `TemplateChangeSet`) | Approve the plan (`hash` must match) |
| **5 · Provision** | Progress per module; everything lands as drafts | Runs on Workflows in batches; validates every output before writing; failures leave no partial module | None (reversible: one action removes everything the plan created) |
| **6 · Review and enrich** | The course workspace with each module's starter content as `.ai--block[data-state=draft]`, "Why this module" notes with framework citations, marked slots for the instructor's own examples, "Add with AI" workflows per slot, readiness bar | Offers per-item accept / edit / revert / regenerate; readiness and Access checks run as suggestions | Keep per block (D-003); publish gate unchanged |

Stage names in the stepper: **Read · Confirm · Approaches · Preview · Review**. The existing *Brief → Outline → Draft → Review* path stays for prompt-first builds; both write the same session type.

### 5.3 The structure catalogue and selection rules

The partner always shows three options plus overlays, chosen from this catalogue by the course profile. It never shows all ten.

| Architecture | Propose when the profile shows | Say in the trade-offs |
|---|---|---|
| Weekly cadence with retrieval checks | Lecture/textbook-sequenced schedule, large enrolment, async online | Predictable and QM/OSCQR-friendly; risk of becoming chapter coverage, so module objectives and a cumulative element are added |
| Unit / theme (essential questions) | Humanities, social sciences, survey courses; syllabus has "big ideas" | Organizes around transfer; uneven unit lengths, so workload is leveled |
| Problem / case-based | Professional or clinical disciplines; objectives weighted to apply/analyze/evaluate; small sections | Better long-term retention and skills; weaker short-term recall, so paired with retrieval checks |
| Project-based with milestones | A single assessment worth ≥ 30%; studio, capstone, writing-intensive | d ≈ 0.71; late-term overload and free-riding, so milestones are placed against the workload budget with feedback at each |
| Competency / mastery | Industry brief; certification prep; competencies listed | Progress by demonstrated ability; needs multiple attempts and thresholds; isolation risk if self-paced |
| Flipped / blended | Reliable contact hours; procedural content; moderate class size | g ≈ 0.73 but context-dependent and weaker in STEM; pre-class quizzes have small effects, so accountability comes from in-class application |
| Scaffolded skill progression | Skills course; novice audience; prerequisites absent | Worked examples faded to full problems; over-scaffolds experts |
| Performance-first (action mapping) | Industry brief with a business goal and named behaviours | Prevents content creep; asks whether training is the answer |
| Microlearning path | Industry; discrete procedures; refreshers | 5–10 minute units with one practice item and spaced re-exposure; unsuited to complex conceptual change |
| HyFlex equivalency | Institution requires attendance-mode choice | Mixed evidence; asynchronous students underperform; every module gets mode-equivalent triplets and self-regulation scaffolds |

Overlays (any structure): **Bookends** (a "Start here" module with purpose, community and a baseline check; a closing module that integrates and transfers), **Spaced review** (module N resurfaces in N+2 and N+5), **UDL choice points** (alternative ways to demonstrate learning), **Teaching-presence plan** (module overview drafts, facilitation prompts, one social-presence touchpoint; required for online/hybrid).

Each option card carries: fit rationale with syllabus citations; what changes versus the syllabus's own order (a diff of the topic sequence); evidence caveat in one sentence; the mini course map (modules × outcomes); the workload curve against the budget; and the frameworks it draws on, so the instructor can accept or reject on pedagogical grounds.

### 5.4 Countermeasures to over-reliance (built into the flow)

1. Outcomes confirmed before structures are shown (update-style forcing function).
2. One sentence of rationale required when accepting an architecture; optional per module.
3. A reflective prompt at provisioning: "Which module are you least sure about? I'll flag it for extra review."
4. Every starter item shows its origin: syllabus span, instructor answer, or "AI draft, unverified".
5. No silent pedagogical defaults: active learning, formative checks and alignment are visible settings with explanations.
6. Deliberately unfinished starter content: scaffolds with marked slots for the instructor's examples, disciplinary nuance and voice, not polished prose that invites passive acceptance.
7. A **critique mode**: instead of proposing, the partner reviews the instructor's own structure against the alignment matrix. This serves the faculty who want targeted help, not redesign.

---

## 6. What gets provisioned, and how it maps to Tessera's model

Everything below uses the one structure (D-002) and lands as drafts (D-003).

| Provisioned object | Tessera entity | Notes |
|---|---|---|
| Course outcomes (confirmed in stage 2) | `Outcome` rows (codes O1…) via `saveCourseOutcomes`; mirrored to `Course.outcomes` | Original syllabus text kept verbatim; rewrites shown as labelled alternatives, never substituted |
| Modules | `Module` with `objective` set (3–5 module objectives are stored in the objective field and the module's "Why this module" note) | `templateKey` set when a template module is matched, so `template-followed` passes |
| "Start here" module (bookend overlay, default on) | Module + lesson containing navigation instructions, instructor contact from the syllabus, outcomes, and the AI-use disclosure | Satisfies `navigation-instructions` and `instructor-contact` readiness checks and SUNY-style disclosure norms |
| Lessons | `Lesson` with `minutes` from the workload estimate, `status: 'draft'` | Lesson-level objective proposed as a `Lesson.objective` field (new; today it is dropped) |
| Starter blocks per lesson | `heading`, `text` (rationale + slot markers), `callout` (activate prior knowledge / try it), `check` (one retrieval item with feedback), optional `scenario` for case/PBL | Gagné/Merrill skeleton; `origin: 'ai'`, `aiState: 'draft'`, provenance summary "Drafted from your syllabus (p. 3, Week 5) and your answers" |
| Assignments | `Assignment` with TILT-structured `instructions` blocks (Purpose / Task / Criteria), `points` and `dueAt` from the syllabus schedule, a draft `rubric` | Milestones for project-based options are assignments placed against the workload budget |
| Alignment | `OutcomeLink` for every check, scenario and assignment | `assessments-aligned` and `outcomes-assessed` pass or show gaps visibly |
| Materials | `link` or `file` blocks only for readings present in the syllabus with a source span; otherwise a `callout` placeholder "[Reading to select]" | Zero fabricated readings or citations |
| Persona variants | Offered after review, not at provisioning (D-028) | Plain-language and micro-path derive from the kept master |
| Design record | New `DesignRecord` on the session: extracted profile, answers, options shown, option chosen with rationale, plan hash, per-item decisions | Exportable (CSV/PDF) for CTL or rubric reviewers and for the instructor's own files |

Provisioning respects the course template (D-024) and refuses to rename or remove anything that exists. If the course already has modules, the plan appends and says so.

---

## 7. Pipeline and data model (for the build spec)

**7.1 Extraction.** Reuse `checkDocument()` (pdfjs for PDF, JSZip for DOCX) and persist the section text with `{page, heading, level, text}` as a new `SyllabusExtraction` on the file version. Route scans through the OCR container and lower the confidence. Tables (weekly schedule, grading weights) carry the highest-value data; keep rows structured. Then run a new AI task `syllabus-extract` with a strict JSON schema based on the Open Syllabus field taxonomy (course code, title, credits, term dates, meeting pattern, modality, instructor and contact, description, learning outcomes, topic outline by week, assignment schedule, grading weights, assessment strategy, required readings with `doc_span`, policies) plus per-field `{value, spans[{page, text}], confidence, origin: extracted | inferred | user_supplied | missing}`.

**7.2 Rule validation before analysis.** Weights sum to 100; week count matches term dates; every assessment has a date inside the term; every objective has a verb; holidays are never inferred. Each failure becomes a stage-2 question.

**7.3 Analysis.** A `syllabus-analyze` task returns the course profile, objective audit (measurable? Bloom process and knowledge dimension; Fink category; course-level fit), alignment matrix, workload estimate (Rice CTE rate tables with editable assumptions against the 34 CFR 600.2 budget), learner-centeredness scores (Palmer et al.; Cullen & Harris) with quoted evidence, and a deficiency list mapped to Tessera-standard and OSCQR item numbers (never QM text, per D-024; QM numbers may be referenced if the owner decides so, §10).

**7.4 Options.** A `structure-options` task takes the confirmed profile and outcomes and returns exactly three options from the catalogue with rationale, citations, diff versus syllabus order, mini course map and per-module minutes. Deterministic selection rules pick the candidates; the model writes the rationale.

**7.5 Plan and provision.** `ProvisionPlan` (change set with hash) → `applyProvisionPlan` runs per module on `GenerationWorkflow` with the existing polling fallback; a `module-scaffold` task drafts each module's starter blocks and one TILT assignment; every output is validated (`validateBlockContent`, check needs 3–4 options, no URLs not present in the syllabus) before a write; a `structure-undo` removes everything the plan created.

**7.6 New AI tasks** in `shared/ai.ts` with fixtures: `syllabus-extract`, `syllabus-analyze`, `structure-options`, `module-scaffold`, `objective-rewrite`. Palmyra-X6 through AI Gateway as today (D-015); raise the source budget for these tasks or chunk by section.

**7.7 Evaluation.** Build a labelled set of 100–300 real syllabi across disciplines and formats; measure field-level precision/recall and span-grounding accuracy; track question burden per syllabus and the instructor edit rate on provisioned items as product metrics; log every correction as an evaluation example.

**7.8 Components.** Build `SourceList` (Ready / extracting / outdated / excluded, with page anchors) and `ChangeSetTable` (was / will be, counts, conflicts, applied, undone) as shared components; add an `OptionCard` and an `AlignmentMatrix`. All reuse `AiContent`, `PipelineStepper`, `StatusChip`, `ProgressMeter`, `DataTable`.

---

## 8. Governance

- **Scope:** syllabus-only; no rosters, grades or student work; strip any student names found in the document.
- **Consent and IP:** the instructor owns uploads and outputs; nothing is used for training; nothing outside the course is ingested without an explicit opt-in (the ASU lesson; AAUP 2026 guidance).
- **Policy gate:** `Institution.policy.aiAuthoring` already gates the builder; add an admin-configurable policy banner and defaults (allowed structures, workload rate tables, disclosure text).
- **Disclosure:** the "Start here" module carries a draft AI-use statement the instructor edits (SUNY requires instructors not to represent AI output as human-made).
- **Accessibility:** everything provisioned is born accessible (heading order, alt-text prompts never auto-filled, caption slots, accessible tables); Tessera Access runs on the result. WCAG 2.1 AA is the Title II legal floor (DOJ extended deadlines to April 2027/2028 on April 20, 2026); Tessera's bar stays WCAG 2.2 AA (D-010).
- **Exportable design record** for institutional review (§6).

---

## 9. The UI mockup

Five artboards in the Tessera design system (paper, ink, teal accent, violet for AI only; Fraunces and IBM Plex; Marginalia marks; no stripes), published as the design canvas *Tessera Syllabus-to-Course Design Partner*, one screen per stage:

1. **Start from a syllabus** — upload, scope and consent, the "how we work together" statement, extraction progress.
2. **Instructional read** — course profile with extracted / inferred / missing states and page citations; objective audit; alignment matrix; workload versus budget; the partner's questions.
3. **Three approaches** — option cards with rationale, trade-offs, evidence caveat, mini course map and workload curve; overlays; combine; the required "why this fits" sentence.
4. **Preview what will be created** — the change set with counts, per-module rows, template compliance, nothing renamed or removed, Apply as drafts.
5. **Review module by module** — the course workspace with starter content as drafts, "Why this module" notes with framework citations, slots for the instructor's own material, "Add with AI" per slot, readiness bar.

All content is fictional (Meridian State, Dr. Okafor, STAT 110 "Reasoning with Data"). The artboards use the same `.dc.html` format as `design/canvas/` and can be copied into the repo (and synced to the "AI-Native LMS UI Concepts" canvas) once the direction is approved.

---

## 10. Decisions for the owner before the build spec

1. **Name and framing.** "Start from a syllabus" as an entry mode of *Build with AI*, with the AI role labelled *Design partner*. Alternatives: "Design from a syllabus"; keep the label *Co-author*.
2. **QM references.** D-024 forbids reproducing QM text. Should the analysis cite QM standard *numbers* (e.g., "2.4") alongside Tessera-standard and OSCQR items, or only the two built-in rubrics? Recommendation: reference numbers only when the institution has loaded QM as a custom rubric.
3. **Extraction model.** Palmyra-X6 for extraction and analysis (consistent with D-015), or a layout-aware parser (Docling, MIT) in the OCR container for tables and reading order, with Palmyra for the semantic pass. Recommendation: pdfjs/JSZip plus Palmyra for the MVP; Docling as a Night 5 candidate if table accuracy on real syllabi is below target.
4. **Lesson objective field.** Add `Lesson.objective` (migration) so lesson-level objectives survive provisioning and the readiness engine can check them.
5. **Instructor profile.** Persist teaching philosophy, voice and assessment preferences across sessions (a new `InstructorProfile`), or ask each time. Recommendation: persist, editable, visible.
6. **Workload rate tables.** Ship Rice CTE defaults as institution-editable policy.
7. **Industry mode.** Accept a training brief / competency list as an alternative to a syllabus in the MVP, or in a follow-up.

## 11. Phasing

- **MVP (Night 4 candidate):** PDF/DOCX ingestion with page anchors; instructional read (profile, objective audit, alignment matrix, workload); stage-2 questions; three options with overlays; change-set preview and provisioning of modules, lessons, outcomes, links, starter blocks, one assignment per module; undo; design record; fixtures and tests; the five screens.
- **Follow-up:** critique mode on an existing course; instructor profile; institutional policy banner; industry brief input; export of the course map; extraction evaluation set; Docling if needed.
- **Measure:** time from upload to "ready for review"; question burden per syllabus; instructor edit rate on starter items; alignment-check pass rate at first readiness run; SUS ≥ 80 (#28).

---

## Sources

Research documents produced for this recommendation (each with inline citations): `research/syllabus-design-partner/learning-science.md`, `research/syllabus-design-partner/competitors.md`, `research/syllabus-design-partner/human-ai-collaboration-and-pipeline.md`. Key primary sources:

- [QM Higher Education Rubric, Seventh Edition (standards list)](https://www.qualitymatters.org/sites/default/files/PDFs/StandardsfromtheQMHigherEducationRubric.pdf) · [OSCQR](https://oscqr.suny.edu/about/about-oscqr/)
- [Fink, A Self-Directed Guide to Designing Courses for Significant Learning](https://www.bu.edu/sph/files/2011/06/selfdirected1.pdf) · [Sweller, van Merriënboer & Paas 2019](https://leadinglearner.me/wp-content/uploads/2019/02/sweller2019_article_cognitivearchitectureandinstru.pdf) · [CAST, UDL Guidelines 3.0](https://udlguidelines.cast.org/more/about-guidelines-3-0/) · [TILT (Winkelmes)](https://citl.indiana.edu/teaching-resources/evidence-based/transparency.html)
- [Palmer, Bach & Streifer 2014, Measuring the Promise](https://onlinelibrary.wiley.com/doi/abs/10.1002/tia2.20004) · [Cullen & Harris 2009](https://www.researchgate.net/publication/233056548_Assessing_Learner-Centredness_Through_Course_Syllabi) · [PLOS One 2024, How syllabi relate to outcomes](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0301331)
- [Yang et al. 2021, Testing (quizzing) boosts classroom learning](https://gwern.net/doc/psychology/spaced-repetition/2021-yang.pdf) · [Dunlosky et al. 2013](https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html) · [Strobel & van Barneveld 2009, PBL](https://scholarworks.iu.edu/journals/index.php/ijpbl/article/view/28220) · [Chen & Yang 2019, PjBL](https://www.sciencedirect.com/science/article/abs/pii/S1747938X19300211) · [Flipped classroom second-order meta-analysis 2025](https://www.sciencedirect.com/science/article/abs/pii/S0883035525003283) · [HyFlex review 2025](https://link.springer.com/article/10.1007/s12528-025-09452-6) · [ATD on 70-20-10](https://www.td.org/content/atd-blog/70-20-10-where-is-the-evidence)
- [34 CFR 600.2 credit hour](https://www.ecfr.gov/current/title-34/subtitle-B/chapter-VI/part-600/subpart-A/section-600.2) · [Rice CTE Course Workload Estimator](https://cte.rice.edu/resources/workload-estimator)
- [Instructure, IgniteAI Agent launch](https://www.instructure.com/press-release/instructure-delivers-its-agentic-ai-promise-launch-igniteai-agent) · [Canvas Community feature overview](https://community.instructure.com/en/discussion/664514/feature-overview-igniteai-agent-for-canvas) · [Anthology AI Design Assistant admin help](https://help.anthology.com/blackboard/administrator/en/tools-management/blackboard-ai-design-assistant.html) · [Phil Hill, The New Blackboard](https://onedtech.philhillaa.com/p/the-new-blackboard-emerges-from-bankruptcy) · [Phil Hill, D2L Fusion 2026](https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026) · [Articulate AI Course Drafts](https://www.articulatesupport.com/article/AI-Assistant-in-Rise-360-AI-Course-Drafts) · [Absorb Aura Create](https://support.absorblms.com/hc/en-us/articles/52047105413395-Introducing-Aura-Create-The-AI-Powered-Course-Authoring-Agent) · [Inside Higher Ed on ASU's AI course builder, Apr 29 2026](https://www.insidehighered.com/news/tech-innovation/artificial-intelligence/2026/04/29/faculty-concerned-about-asus-new-ai-course)
- [Devlin Peck, AI in ID 2026](https://www.devlinpeck.com/content/ai-in-instructional-design) · [Hardman, AI can build your course, but can it design the learning?](https://drphilippahardman.substack.com/p/ai-can-build-your-course-but-can) · [Adair & Kilgore, EDUCAUSE Review Feb 2026](https://er.educause.edu/articles/2026/2/ai-and-course-design-machines-can-help-but-only-humans-can-teach) · [Tyton Partners, Time for Class 2026](https://tytonpartners.com/time-for-class-2026-the-ai-tipping-point-from-monitoring-students-to-engaging-them/) · [EDUCAUSE, The Impact of AI on Work in Higher Education, Jan 2026](https://www.educause.edu/research/2026/the-impact-of-ai-on-work-in-higher-education)
- [Carliner & Chen 2024, Collaboration or Consultation?](https://edtecharchives.org/journal/723/13045) · [Halupa 2019](https://files.eric.ed.gov/fulltext/EJ1203205.pdf) · [Mueller et al. 2022](https://link.springer.com/article/10.1007/s11528-022-00694-0) · [Texas A&M System, Instructional Design Consultation Guide](https://www.tamus.edu/academic/wp-content/uploads/sites/24/2017/07/Instructional-Design-Consultation-Guide-v1.2.pdf)
- [Amershi et al. 2019, Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/wp-content/uploads/2019/01/Guidelines-for-Human-AI-Interaction-camera-ready.pdf) · [Horvitz 1999, Mixed-initiative](https://erichorvitz.com/chi99horvitz.pdf) · [Google PAIR, Explainability + Trust](https://pair.withgoogle.com/guidebook-v2/chapter/explainability-trust/) · [Buçinca, Malaya & Gajos 2021, cognitive forcing functions](https://arxiv.org/abs/2102.09692) · [Lee et al. 2025, GenAI and critical thinking](https://www.microsoft.com/en-us/research/publication/the-impact-of-generative-ai-on-critical-thinking-self-reported-reductions-in-cognitive-effort-and-confidence-effects-from-a-survey-of-knowledge-workers/) · [Cursor Plan Mode](https://cursor.com/blog/plan-mode)
- [Open Syllabus field taxonomy](https://docs.opensyllabus.org/syllabi.html) · [Docling technical report](https://arxiv.org/abs/2408.09869) · [AAUP, AI and EdTech policy resources 2026](https://www.aaup.org/sites/default/files/2026-03/AAUP-AI-Committee-Policy-Resources-for-AI-and-EdTech.pdf) · [DOJ Title II deadline extension, Apr 2026](https://www.reedsmith.com/articles/doj-extends-digital-accessibility-compliance-dates-under-title-ii-of-the-ada/)

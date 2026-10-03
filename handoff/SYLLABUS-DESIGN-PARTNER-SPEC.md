# Build spec: Start from a syllabus (the design partner)

*Status: owner-approved scope, 2026-09-28. Decisions D-030 to D-036 below are the owner's answers to the questions in `research/syllabus-design-partner/recommendations.md` §10 and are constraints for this build. Artboards: `design/canvas/Syllabus*.dc.html` (row G, gallery slugs `syllabus-*`). Research: `research/syllabus-design-partner/`. Fixtures: `tests/fixtures/syllabus/`. Feasibility test: `worker/access/syllabus-extraction.test.ts`.*

This document is written for the implementing agent. It assumes `CLAUDE.md`, `design/DECISIONS.md`, `handoff/NIGHT-3-PLAN.md` and `handoff/NIGHT-4-NOTES.md` are known. Where it says "as today", the existing code is the reference and must not be rewritten.

---

## 0. What this is, in one paragraph

A second entry mode of *Build with AI* called **Start from a syllabus**. The instructor uploads a PDF or DOCX syllabus (or pastes a training brief). Tessera's AI, labelled **Design partner**, produces an *instructional read* (course profile, outcome audit, alignment matrix, workload against the credit-hour budget, gaps), asks the instructor the few questions the document can't answer, has them confirm the outcomes, proposes **three named course architectures** with rationale, syllabus citations, trade-offs and an evidence caveat (combinable, plus overlays), shows a **preview of exactly what will be created** (a change set with a hash, like templates), and only then provisions modules, lessons, outcomes, alignment links, assignments and deliberately unfinished starter content, all as drafts the instructor reviews module by module. Every AI claim cites a syllabus page. Nothing reaches learners without a person keeping it (D-003). One action undoes everything a plan added.

Why it's not "just another course builder" (the competitive white space, `research/syllabus-design-partner/competitors.md` §5): analysis before generation; more than one structure; workload estimation; layered review gates with a change set; provenance to the source passage and consent up front. No LMS surveyed does any of the five.

## 1. Decisions (owner, 2026-09-28)

| # | Decision | Consequence in this build |
|---|---|---|
| **D-030** | *Start from a syllabus* is an entry mode of Build with AI; the AI role label is **Design partner**. | Second card on `BuilderStart`; also the first option under "How to start" in the guided New-course flow proposed in `NIGHT-4-NOTES.md` when that flow is built. `.ai-who` reads "Design partner". Learners never see this label; kept content shows the existing "Drafted with AI · edited by …" line (NQ-03). |
| **D-031** | QM standard numbers may be cited **only when the institution has loaded QM as a custom rubric**; QM text is never reproduced (D-024 stands). | The deficiency list maps to Tessera-standard and OSCQR item numbers by default; a `rubricRefs` field carries QM numbers only when `institution.readinessPolicy.rubricId` points at a custom rubric whose `name` matches /quality matters|QM/i. |
| **D-032** | Extraction = **pdfjs / JSZip (as today) + Palmyra-X6** for the MVP. Test it; if real syllabi defeat it, propose Docling in the OCR container. | §7.1. The parser half is verified by `worker/access/syllabus-extraction.test.ts` (passes). The Palmyra half needs `WRITER_API_KEY` on a preview branch; §11 says what to measure. |
| **D-033** | Add **`Lesson.objective`**; persist an **`InstructorProfile`** (teaching approach, voice, assessment preferences), editable and visible. | Migration `0008`. Profile lives on the user, is shown on the Start screen ("Remember my teaching preferences"), and is an input to the options and scaffold tasks. |
| **D-034** | Workload rate tables ship with **Rice CTE defaults**, institution-editable. | `AiPolicy.workloadRates` with defaults in `shared/policy.ts`; admin edits them on the Policy page. |
| **D-035** | **Industry mode** is in scope: a training brief or competency list is accepted in place of a syllabus. | Source kind `brief`; Mager/ABCD objective audit; performance-first, competency and microlearning architectures become eligible; Kirkpatrick levels replace the credit-hour budget as the workload frame. |
| **D-036** | Everything else follows the recommendations doc §5–§8 (workflow, voice, provisioning, governance). | Sections below are the normative version. |

## 2. Scope

**In (MVP, one Night):**
1. Syllabus ingestion from an uploaded PDF/DOCX (reusing Files + Access parsers + OCR fallback), from a file already in the course, or from pasted text (syllabus or industry brief).
2. The instructional read with page anchors; rule validation; the Confirm step (questions + outcome confirmation + teaching-approach note).
3. Three architectures + four overlays; combination; required rationale sentence.
4. Provision plan (change set + hash) → background provisioning of modules, lessons, outcomes, links, assignments and starter blocks, all drafts; undo.
5. Review integration: "Why this module" notes, slots, "Add with AI" quick actions, flagged-module alternatives, next-steps panel.
6. Design record (exportable JSON + CSV course map).
7. Instructor profile; workload rates policy; consent and scope panel; policy gate.
8. Fixtures, deterministic AI fixtures, unit + repo-contract + e2e (mock) + a11y coverage; Mintlify page; five artboards already registered.

**Out (later):** critique mode on an existing course (design the API to allow it, don't build the UI); Common Cartridge import; Docling; persona variants at provisioning (offered after review, as today); the guided New-course flow itself (`NIGHT-4-NOTES.md`; this feature must slot into it).

## 3. The flow (normative)

Stepper labels: **Start · Read · Confirm · Approaches · Preview · Review**. The existing Brief → Outline → Draft → Review path is untouched; a session carries `mode: 'prompt' | 'syllabus'`.

| Stage | Instructor sees (artboard) | Server does | Gate |
|---|---|---|---|
| Start (`SyllabusStart`) | Upload/choose/paste; scope and consent panel; role statement; policy note; "remember my preferences" | `createDesignSession` stores the source, starts `syllabus-extract` in the background | Consent checkbox required; `aiEnabled` (as today) |
| Read (`SyllabusRead`, left) | Course profile with `extracted / inferred / user_supplied / missing` states; outcome audit; alignment matrix; workload vs budget; learner-centeredness signals with quoted passages; deficiency list | `syllabus-analyze` after extraction + rules | None; every claim contestable (the instructor can mark a field wrong, which becomes a question) |
| Confirm (`SyllabusRead`, right) | 3–6 questions anchored to spans; one open question (teaching approach + goals); outcomes to confirm/edit/reorder; labelled rewrite suggestions | Rule failures → questions; answers stored | **Cognitive forcing:** outcomes must be confirmed before Approaches renders |
| Approaches (`SyllabusApproaches`) | Three option cards; overlays; combine note; required "why this fits your students" | `structure-options` with deterministic candidate selection (§6.3) | One or more options + rationale sentence |
| Preview (`SyllabusPreview`) | Change-set summary ("Will add … Renames nothing. Removes nothing."), per-module rows, overlaps with existing modules, template compliance, readiness forecast, "least sure" pick | `previewProvisionPlan` → `ProvisionPlan` with `hash` | `applyProvisionPlan` requires the hash |
| Provision | Progress per module | Workflow batches; validate-before-write; failure leaves no partial module | None; `undoProvisionPlan` at any time |
| Review (`SyllabusReview`) | Course workspace with drafts, why-notes, slots, quick actions, next steps, readiness bar | As today (keep/edit/revert/regenerate) + new quick actions | Publish gate unchanged |

Voice rules (UI copy and prompts), from `recommendations.md` §5.1: open with what was understood and what is needed, never "here is your course"; suggestions as questions or optional drafts, never corrections; drafts labelled as a state; no "auto-generated", "AI-built", "ready", "magic", "instantly"; the boundary statement appears on Start and in the Review panel. No decision codes in UI copy (NQ-18).

## 4. Domain model (`shared/domain.ts`)

Add, next to the builder types (all serialisable, all validated in `shared/service/validate.ts` or a new `validate-design.ts`):

```ts
// ---- Syllabus design partner (D-030 to D-036) ----
export type FieldOrigin = 'extracted' | 'inferred' | 'user_supplied' | 'missing';
export interface SourceSpan { page: number | null; text: string }            // page null for pasted text
export interface Extracted<T> { value: T | null; origin: FieldOrigin; confidence: number; spans: SourceSpan[] }

export type DesignSourceKind = 'syllabus' | 'brief';                           // D-035
export interface DesignSource {
  kind: DesignSourceKind;
  fileId: Id | null;                      // FileRecord when uploaded or chosen; null when pasted
  version: number | null;
  name: string;
  /** Section text with anchors; from checkDocument() for files, one section for a paste. */
  sections: { page: number | null; heading: string; level: number; text: string; lines: string[] }[];
  chars: number;
  ocr: boolean;
}

export interface CourseProfile {
  code: Extracted<string>; title: Extracted<string>; credits: Extracted<number>;
  termWeeks: Extracted<number>; termStart: Extracted<string>; termEnd: Extracted<string>;   // ISO dates
  meeting: Extracted<{ days: string[]; minutes: number }>;
  modality: Extracted<'in-person' | 'online-async' | 'online-sync' | 'hybrid' | 'hyflex'>;
  level: Extracted<string>; prerequisites: Extracted<string[]>; enrolment: Extracted<number>;
  instructor: Extracted<{ name: string; email: string; officeHours: string }>;
  description: Extracted<string>; materials: Extracted<{ title: string; kind: 'textbook' | 'reading' | 'tool'; span: SourceSpan }[]>;
  /** Industry brief only (D-035). */
  business: Extracted<{ goal: string; metric: string; audienceRole: string }>;
  weeklyHoursBudget: number;              // computed: credits × 3 (34 CFR 600.2), or the brief's seat time
}

export interface ExtractedOutcome { id: string; text: string; span: SourceSpan | null; origin: FieldOrigin }
export interface ExtractedAssessment { id: string; title: string; weightPercent: number | null; dueAt: string | null; format: string; span: SourceSpan | null }
export interface ScheduleRow { week: number; dates: string; topic: string; reading: string; due: string; span: SourceSpan | null; empty: boolean }
export interface PolicyItem { kind: 'attendance' | 'late-work' | 'integrity' | 'ai-use' | 'accommodations' | 'other'; text: string; span: SourceSpan }

export interface SyllabusExtraction {
  profile: CourseProfile; outcomes: ExtractedOutcome[]; assessments: ExtractedAssessment[];
  schedule: ScheduleRow[]; policies: PolicyItem[];
  /** Rule failures, each becoming a question (§6.2). */
  problems: { code: ExtractionProblemCode; message: string; spans: SourceSpan[] }[];
  provenance: Provenance;
}
export type ExtractionProblemCode = 'weights-not-100' | 'week-count-mismatch' | 'empty-week' | 'due-outside-term' | 'objective-no-verb' | 'missing-field';

export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
export type FinkCategory = 'foundational' | 'application' | 'integration' | 'human' | 'caring' | 'learning-how';
export interface OutcomeAudit {
  outcomeId: string; measurable: boolean; verb: string | null; bloom: BloomLevel | null; fink: FinkCategory | null;
  /** Industry: Mager parts present (D-035). */
  mager: { performance: boolean; condition: boolean; criterion: boolean } | null;
  assessedBy: { assessmentId: string; fit: 'assessed' | 'verb-mismatch' }[];
  suggestion: { text: string; why: string } | null;   // labelled alternative; original text is never replaced
}
export interface WorkloadEstimate {
  weeklyBudgetHours: number; averageHours: number;
  weeks: { week: number; hours: number; overBudget: boolean; drivers: string[] }[];
  rates: WorkloadRates; assumptions: string[];
}
export interface WorkloadRates { readingPagesPerHour: number; problemSetHours: number; writingHoursPerPage: number; projectHours: number; quizMinutes: number; discussionMinutes: number }
export interface LearnerCenteredness {
  palmer: { score: number; max: 46; band: 'content-focused' | 'transitional' | 'learning-focused'; components: { name: string; score: number; max: number; evidence: SourceSpan | null }[] };
  cullenHarris: { community: number; powerAndControl: number; evaluation: number; evidence: { factor: string; quote: SourceSpan }[] };
}
export interface Deficiency { code: string; message: string; rubricRefs: { rubric: 'tessera' | 'oscqr' | 'qm'; item: string }[]; spans: SourceSpan[] }

export interface InstructionalRead {
  summary: string;                          // the .ai--note paragraph; must cite spans via `cites`
  cites: SourceSpan[];
  outcomeAudits: OutcomeAudit[];
  alignment: { outcomeId: string; assessmentId: string; state: 'assessed' | 'verb-mismatch' | 'none' }[];
  workload: WorkloadEstimate;
  learnerCenteredness: LearnerCenteredness | null;   // null for industry briefs
  deficiencies: Deficiency[];
  provenance: Provenance;
}

export interface DesignQuestion {
  id: string; text: string; spans: SourceSpan[]; kind: 'choice' | 'number' | 'text';
  options: { id: string; text: string }[]; required: false;                   // every question is skippable
  answer: { optionId: string | null; value: string | null; skipped: boolean } | null;
  fromProblem: ExtractionProblemCode | null;
}

export type ArchitectureId = 'weekly' | 'thematic' | 'case' | 'project' | 'competency' | 'flipped' | 'scaffolded' | 'performance' | 'micro' | 'hyflex';
export type OverlayId = 'bookends' | 'spaced-review' | 'udl-choice' | 'teaching-presence';
export interface StructureOption {
  id: ArchitectureId; label: string; tag: string;                             // "Closest to your syllabus"
  description: string; fits: { text: string; span: SourceSpan | null }[]; changes: string; tradeoffs: string; evidence: string;
  frameworks: string[];                                                       // "Tessera standard 2.2", "OSCQR 44", "backward design"
  modules: { title: string; objective: string; outcomeIds: string[]; weeks: number[]; lessons: number; lessonMinutes: number; assessment: string; hours: number }[];
  workload: { averageHours: number; peakHours: number; peakModule: number };
}
export interface ApproachSelection { optionIds: ArchitectureId[]; overlays: OverlayId[]; rationale: string; combinationNote: string | null }

/** The change set (D-003, principle #11). Same discipline as TemplateChangeSet. */
export interface ProvisionPlan {
  sessionId: Id; courseId: Id;
  outcomes: { code: string; text: string; source: 'confirmed' | 'rewritten' }[];
  modules: { key: string; title: string; objective: string; position: number; outcomeCodes: string[]; templateKey: string | null;
    overlaps: { moduleId: Id; title: string } | null;
    lessons: { key: string; title: string; objective: string; minutes: number; week: number | null; skeleton: LessonSkeleton }[];
    assignment: { key: string; title: string; points: number; dueAt: string | null; outcomeCodes: string[]; replaces: string | null } | null;
    hours: number; leastSure: boolean }[];
  readings: { title: string; span: SourceSpan; moduleKey: string }[];       // only readings with a span
  placeholders: number;                                                     // "[Reading to select]" count
  counts: { modules: number; lessons: number; checks: number; assignments: number; outcomes: number; links: number };
  summary: string;                                                          // "Adds … Renames nothing. Removes nothing."
  template: { name: string; satisfied: string[]; missing: string[] } | null;
  readinessForecast: { check: AutomaticCheck; expected: 'met' | 'not-met' }[];
  hash: string;
}
export type LessonSkeleton = 'gagne' | 'merrill' | 'case' | 'milestone' | 'start-here' | 'wrap-up';

export interface DesignRecord {
  sessionId: Id; source: Pick<DesignSource, 'name' | 'kind' | 'chars'>;
  extraction: SyllabusExtraction | null; read: InstructionalRead | null; questions: DesignQuestion[];
  confirmedOutcomes: { code: string; text: string; originalText: string }[];
  optionsShown: StructureOption[]; selection: ApproachSelection | null;
  plan: ProvisionPlan | null; appliedAt: Timestamp | null; undoneAt: Timestamp | null;
  decisions: { at: Timestamp; who: Id; what: string }[];                     // per-item keep/revert etc. summarised
}

export type DesignStage = 'start' | 'read' | 'confirm' | 'approaches' | 'preview' | 'provisioning' | 'review';
export interface DesignSession {
  id: Id; courseId: Id; mode: 'syllabus'; stage: DesignStage; createdBy: Id; createdAt: Timestamp; updatedAt: Timestamp;
  source: DesignSource; consent: { syllabusOnly: true; at: Timestamp; rememberProfile: boolean };
  extraction: SyllabusExtraction | null; read: InstructionalRead | null; questions: DesignQuestion[];
  confirmedOutcomes: { code: string; text: string; originalText: string }[] | null; teachingNote: string;
  options: StructureOption[] | null; selection: ApproachSelection | null;
  plan: ProvisionPlan | null; provisioning: { jobId: Id | null; done: number; total: number; error: string | null } | null;
  /** Everything the plan created, for undo. */
  created: { outcomeIds: Id[]; moduleIds: Id[]; lessonIds: Id[]; blockIds: Id[]; assignmentIds: Id[]; linkKeys: string[] };
  record: DesignRecord;
}

/** D-033: persisted on the instructor, editable, visible. */
export interface InstructorProfile {
  userId: Id; teachingApproach: string; voice: string;
  assessmentPreferences: { formativeEveryModule: boolean; prefers: ('project' | 'exam' | 'case' | 'discussion' | 'quiz')[] };
  disclosureText: string;                   // the AI-use statement drafted into "Start here"
  updatedAt: Timestamp;
}
```

Also:
- `Lesson.objective?: string | null` (D-033). The builder's `OutlineDraft.lessons[].objective` is written into it from now on (fixes gap 2 in `recommendations.md` §2).
- `AiPolicy.workloadRates?: WorkloadRates` (D-034) with defaults in `shared/policy.ts` (`RICE_DEFAULTS`: 34 pages/h textbook reading, 2 h per problem set, 1 h/page writing, 30 h project, 20 min quiz, 45 min discussion) and `AiPolicy.designPartner?: { enabled: boolean; allowedArchitectures: ArchitectureId[] | null }`.
- `AiTask` union gains `'syllabus-extract' | 'syllabus-analyze' | 'structure-options' | 'module-scaffold' | 'objective-rewrite'`.
- `Provenance.sources[]` entries for this feature use `name` like `"STAT110_Syllabus_Fall2026.pdf p. 3"` and gain an optional `span?: SourceSpan` so `AiContent`'s cites can show the passage on hover.

## 5. API (`shared/api.ts`)

All `INSTRUCTOR` access, scope `content:read` / `content:write` / `ai:run` as marked. Routes under `/api/v1`.

| Operation | Method · path | Scope | Notes |
|---|---|---|---|
| `createDesignSession` | `POST /courses/:courseId/design` | `ai:run` | input `{ sourceKind, fileId? , text?, name?, consent: { syllabusOnly: true, rememberProfile } }`; extracts in the background; returns the session at stage `read` (or `start` with `provisioning`-style progress while extracting) |
| `listDesignSessions` | `GET /courses/:courseId/design` | `content:read` | |
| `getDesignSession` | `GET /design/:sessionId` | `content:read` | poll target |
| `answerDesignQuestions` | `PATCH /design/:sessionId/answers` | `content:write` | `{ answers: { questionId, optionId?, value?, skipped }[]; teachingNote }` |
| `confirmOutcomes` | `POST /design/:sessionId/outcomes` | `ai:run` | `{ outcomes: { code, text, originalText }[] }` → runs `structure-options`; stage `approaches` |
| `selectApproach` | `POST /design/:sessionId/approach` | `content:write` | `{ optionIds, overlays, rationale }`; rationale ≥ 12 chars required; returns `combinationNote` |
| `previewProvisionPlan` | `POST /design/:sessionId/plan` | `content:read` | deterministic from selection + course state; returns `ProvisionPlan` with `hash` |
| `applyProvisionPlan` | `POST /design/:sessionId/apply` | `ai:run` | `{ hash, leastSureModuleKey? }`; `conflict` when the hash differs (same message as templates) |
| `undoProvisionPlan` | `POST /design/:sessionId/undo` | `content:write` | removes everything in `created` that is still a draft or unchanged; reports what it kept (a block the instructor edited or kept is never deleted; it is left with a notice) |
| `exportDesignRecord` | `GET /design/:sessionId/record?format=json\|csv` | `content:read` | CSV = course map rows (module, objective, outcomes, lessons, assessment, hours, source page) |
| `getInstructorProfile` / `updateInstructorProfile` | `GET`/`PUT /me/instructor-profile` | `content:read`/`content:write` | D-033 |
| `flagLessonAlternatives` | `POST /design/:sessionId/alternatives` | `ai:run` | `{ lessonId }` → two alternative openings as draft blocks in a side lesson variant? No: as two `document` draft blocks appended to the lesson, labelled "Alternative opening A/B"; the instructor keeps one and reverts the rest |

Extend the existing `getCourseOutline` staff payload with `designSession?: { id, stage }` so the course workspace can show the Review panel. The MCP server gets `design_session_*` tools mirroring create/get/answer/confirm/select/preview/apply/undo (same shapes), so an external agent can drive the flow.

## 6. Service logic (`shared/service/design-partner.ts`, over `Repo`)

Follow `builder.ts` and `templates.ts` for shape. Business logic lives once here; both `MemoryRepo` and `d1-repo` implement the new repo methods (`getDesignSession`, `putDesignSession`, `listDesignSessions`, `getInstructorProfile`, `putInstructorProfile`) and pass `repo-contract.ts`.

### 6.1 Source and extraction
- File sources: load the `FileRecord`'s current version from R2, run `checkDocument(kind, bytes)`; if `document.hasText === false` run OCR (`runOcr`) and re-check; build `DesignSource.sections` from `text.sections`. **Add `lines: string[]` to each section**: for PDFs, emit the y-grouped lines that `pdf.ts` already computes (`byLine`) instead of only the space-joined page text; for DOCX, one line per paragraph and one per table row (cells joined with ` | `). The feasibility test shows why: pdfjs flattens the schedule table so the empty week-8 row reads `8 Oct 13–17 9 Oct 20–24 …`; line output keeps rows separable. Keep the existing `text.sections` API unchanged for Access.
- Pasted text: one section, `page: null`, `lines` split on newlines.
- Cap: 60,000 characters of source; beyond that, keep the first 60,000 and add a `missing-field` problem "The document is longer than I can read in one pass; I read pages 1–N".
- Strip anything that looks like a student roster (a table whose header has "student" or "ID" and many name-like rows) before analysis; record `problems[]` note. Syllabus-only scope is a governance promise (§9).
- Run `syllabus-extract`, then **rules** (6.2), then `syllabus-analyze`. Persist each result on the session as it lands so the UI can show progress (`stage: 'read'` once the read exists).

### 6.2 Rules → questions (never silent fixes)
| Rule | Problem code | Question generated |
|---|---|---|
| Σ weights ≠ 100 (± 1) | `weights-not-100` | "Your grading components add to N%. Which is right: the weights, or is something missing?" (options: weights as written / a component is missing / other) |
| schedule rows ≠ termWeeks, or a row has an empty topic | `week-count-mismatch`, `empty-week` | the week-8 question on the artboard (options: exam week / break / something else) |
| an assessment due date outside term | `due-outside-term` | confirm date |
| an outcome with no verb, or an unobservable verb (understand, know, appreciate, be familiar with, learn about) | `objective-no-verb` | no question; the audit marks it and offers a labelled rewrite (`objective-rewrite`) |
| a required profile field is `missing` (credits, term length, modality, enrolment) | `missing-field` | one question per field, `kind: 'number' | 'choice'` |
| an outcome assessed by nothing | (audit) | "Outcome N isn't assessed by anything I can find. Assess it / it's inside X / drop it" |
| a single assessment ≥ 30% with one due date | (audit) | "Milestones with feedback, or is the single deadline deliberate?" |

Cap questions at six, ordered by consequence for structure (week count and weights first). Always append the open question: "In a sentence or two: how do you like to teach this course, and what do you want from this redesign?" (prefilled from `InstructorProfile.teachingApproach` when present).

### 6.3 Candidate architectures (deterministic; the model writes the rationale)
Score each `ArchitectureId` from the profile and answers; take the top three, always including exactly one "closest to your syllabus" option (`weekly` for a weekly schedule, `thematic` when the schedule groups by theme, `competency` when the source is a competency list). Rules, in priority order:
- `project` if any assessment weight ≥ 30% or the teaching note mentions project/portfolio/capstone.
- `case` if ≥ 1 outcome is evaluate/analyze and (enrolment ≤ 60 or modality online-async) or the note mentions cases/claims/real data.
- `flipped` if modality in-person/hybrid and meeting minutes ≥ 50 and the discipline is procedural (STEM/health/language keywords in title/description).
- `scaffolded` if level is 100/intro and prerequisites empty and the title/description names a skill (writing, coding, lab, statistics, language).
- `thematic` if description/schedule contain "unit", "theme", "question", or topics repeat.
- Industry (`sourceKind === 'brief'`): `performance` always, `competency` if competencies are listed, `micro` if seat time ≤ 3 h or the brief says refresher/procedure.
- `hyflex` only when the profile says hyflex. Never show more than three; never show `weekly` and `micro` together.
- `AiPolicy.designPartner.allowedArchitectures` filters the candidates.
Overlays: `bookends` and `spaced-review` default on; `teaching-presence` default on for online/hybrid, off otherwise; `udl-choice` default off. Every option's `modules[].hours` comes from the estimator (6.4), and `workload.peakHours` must be ≤ budget × 1.1 or the option says so in `tradeoffs`.

### 6.4 Workload estimator
`estimateWorkload(profile, schedule, assessments, rates)`: per week, reading pages ÷ `readingPagesPerHour` (pages from `Ch. N` → 30 pages per chapter unless the materials list gives page counts), + `problemSetHours` per homework due, + `quizMinutes`/60 per quiz, + project hours spread across the weeks between assignment and due date (front-weighted 40/30/30 when milestones exist), + meeting minutes/60 × meetings per week. Budget = credits × 3 h/week (34 CFR 600.2) for higher ed; for a brief, budget = stated seat time and `weeks` become sessions. Assumptions are strings on the estimate and the instructor can edit rates per session (`rates` on the session override the policy).

### 6.5 Plan and provisioning
`previewProvisionPlan` is pure: it derives modules from the selected options (and the combination rule: the first selected option's modules are the spine; a second option contributes its per-module pattern, e.g. `case` adds a "claim to test" callout + a critique assignment slot per module; `spaced-review` marks check blocks to resurface; `bookends` adds Start-here and Wrap-up), computes `overlaps` by title similarity against existing modules (Jaccard on stemmed words ≥ 0.5), sets `templateKey` where a template module title matches, produces `readinessForecast` by running the automatic checks against the would-be structure, and hashes the JSON (same helper as `templateChangeSet`). It **never** renames or removes anything; existing modules stay; new modules append after them (`position` continues).

`applyProvisionPlan(hash)`:
1. Verify the hash; verify `aiEnabled`; verify the plan's course still matches.
2. `saveCourseOutcomes` with the confirmed outcomes (append to existing outcomes, never replace existing ones; codes continue).
3. Create modules (with `objective`, `templateKey`), lessons (`status: 'draft'`, `minutes`, `objective`, `templateKey`), the assignment per module (draft; TILT instructions as three `text` blocks with `Purpose / Task / Criteria` headings; `points` from the mapped syllabus weight × share; `dueAt` on the course's meeting day nearest the week's end, never within 3 days of another graded item, never in an "exam/break" week from the answers; rubric = 3 criteria drafted from the module objective + outcome text), and `OutcomeLink`s (each check/scenario/assignment → the module's `outcomeCodes`).
4. Hand a `GenerationJob` to `ctx.background.startGeneration` (reuse `generation.ts` machinery: one item per lesson, type `module-scaffold`) with polling fallback. Each item runs `module-scaffold`, validates every block with `validateBlockContent` + the element rules, rejects any URL not present in the source (`link` blocks only for readings with a span; otherwise a `callout` placeholder "[Reading to select]"), and writes blocks with `origin: 'ai'`, `aiState: 'draft'`, provenance summary `"Drafted from your syllabus (p. N, Week W) and your answers"`, `sources` = the spans used. Failure on an item leaves the lesson with no blocks and a `provisioning.error` line; it never half-writes a lesson.
5. "Start here" lesson (bookend) is built without the model: navigation text, instructor contact from the profile spans, the outcomes list, the AI-use disclosure from `InstructorProfile.disclosureText` (default text in `shared/policy.ts`), and a 5-item baseline `check` drafted by `module-scaffold` with `skeleton: 'start-here'`. This makes `navigation-instructions` and `instructor-contact` pass.
6. Record everything created in `session.created`; stage `review`; `record.appliedAt`.
7. `leastSureModuleKey`: after provisioning, run `flagLessonAlternatives` on that module's first lesson (two extra `document` drafts labelled "Alternative opening A/B").

`undoProvisionPlan`: delete created blocks that are still `aiState: 'draft'` and unedited (`previous === null`), lessons/modules/assignments that then hold nothing the instructor wrote, links, and outcomes that no remaining item links to; keep and list anything the instructor kept or edited. Record `undoneAt`.

### 6.6 Review integration
- `getLessonDetail` staff payload gains `design?: { moduleWhy: { text: string; cites: SourceSpan[]; frameworks: string[] }; nextSteps: { text: string; action: 'choose-reading' | 'add-example' | 'move-lesson' | 'confirm-weight' | 'set-tutor' | null; target?: FixTarget }[] }` computed from the plan and the lesson's blocks (a placeholder callout → "choose the reading"; a `[Your …]` slot still present in a text block → "add your example"; an overlap → "move it in"; an assignment that `replaces` a syllabus assessment → "confirm the weight").
- "Move it in" = `moveLesson` (exists) from the overlapping module into the new module; the instructor's lesson is never modified.
- Quick actions reuse `generateAtScope` (scenario, worked example = `document`, video script) and `createVariant` (micro, plain).
- Review coverage, readiness bar: as today; the forecast on Preview must match the real readiness after apply for the automatic checks (test this).

## 7. AI tasks (`shared/ai.ts`, prompts in `worker/ai/palmyra.ts`, fixtures for mock mode)

All strict JSON via `response_format json_schema` (D-015). Raise `max_tokens` to 8,000 for `syllabus-extract` and `syllabus-analyze`. Source budget: pass `DesignSource.sections` as `[p. N] <lines joined by \n>` up to 60,000 characters (a per-task `MAX_SOURCE_CHARS` override; today's 12,000 stays for the other tasks). The system prompt for all five adds: *"You are Tessera's design partner. The instructor is the subject-matter expert and the instructor of record; you handle sequencing, alignment, scaffolding and quality checks. Cite the syllabus page for every claim. Never invent readings, citations, URLs, statistics, or names. Keep the instructor's own outcome wording verbatim; a rewrite is a labelled suggestion. Phrase content suggestions as questions or optional drafts, never corrections. Never use the phrase 'learning styles'."*

| Task | Input | Output | Fixture behaviour (deterministic) |
|---|---|---|---|
| `syllabus-extract` | `{ sourceKind, name, sections, institutionTerm?: { start, end, holidays[] } }` | `SyllabusExtraction` minus `problems`/`provenance` (rules run in the service) | Parses the fixture syllabus by regex (outcomes = numbered lines after "Learning outcomes"; weights = `(\w[\w ]+) (\d+)%`; schedule rows = lines starting with a week number); returns `origin: 'extracted'` with the page from the section |
| `syllabus-analyze` | `{ extraction, profileAnswers, rates, rubricRefsAllowed: ('tessera'\|'oscqr'\|'qm')[] }` | `InstructionalRead` minus `workload` (computed) and `provenance` | Verb table for Bloom/measurable; alignment from assessment `format` keywords (multiple choice → remember/understand only); Palmer score = 4 per present component; deficiencies from fixed rules |
| `objective-rewrite` | `{ outcome, nearbyTopics, industry: boolean }` | `{ text, why }` | "Explain … using …" template |
| `structure-options` | `{ profile, confirmedOutcomes, answers, teachingNote, instructorProfile, candidates: ArchitectureId[], overlaysDefault, rates }` | `StructureOption[]` (exactly `candidates.length`, ids as given; the service recomputes `hours`/`workload` and overwrites) | Template text per architecture with the course title and outcome codes filled in; modules from the schedule rows grouped per architecture rule |
| `module-scaffold` | `{ courseTitle, module: ProvisionPlan['modules'][n], lesson, skeleton, outcomes, spans: SourceSpan[], teachingNote, instructorProfile, priorLessonTitles }` | `{ blocks: BlockContent[]; assignment?: { purpose, task, criteria[], rubric: RubricCriterion[] } }` (3–6 blocks: heading, callout activate/claim, text with ≥ 1 `[Your …]` slot, check with 3–4 options and feedback; `scenario` only for `case` skeleton) | Same shape from templates; the check's correct option is the lesson objective paraphrase |

Prompt rules specific to `module-scaffold`: at least one bracketed slot per text block for the instructor's example, nuance or voice; never a polished full lesson; readings only from `spans`; the check must target the lesson objective's Bloom level; TILT wording for assignments; industry briefs use second person and job context.

Validation (`validate-design.ts`): every span's `page` within the source; every `outcomeId`/`assessmentId` referenced exists; `bloom` ∈ the union; options count and ids match `candidates`; blocks pass `validateBlockContent` and the element rules; `link.href` must appear verbatim in the source text or the block is replaced by the placeholder callout; no string contains "learning style".

## 8. Worker, data, app

- **Migration `0008_design_partner.sql`**: `design_sessions (id, course_id, data JSON, stage, created_by, created_at, updated_at)` + index on `(course_id, created_at)`; `instructor_profiles (user_id PK, data JSON, updated_at)`; `ALTER TABLE lessons ADD COLUMN objective TEXT`. Apply with `npm run db:migrate:preview` before pushing code that needs it (CLAUDE.md).
- **Workflows**: reuse `GenerationWorkflow`; a `GenerationJob.kind: 'scaffold'` with `sessionId`; `advanceGenerationJob` dispatches by kind. Extraction + analysis also run as a job (`kind: 'extract'`) so long syllabi don't hit request limits; the UI polls `getDesignSession`.
- **Routes**: `worker/router.ts` additions per §5; MCP tools per §5; OpenAPI regenerates (`npm run build:openapi` or the existing script).
- **App** (`app/src/features/design-partner/`): `Start.tsx`, `ReadConfirm.tsx`, `Approaches.tsx`, `Preview.tsx`, plus `ReviewPanel.tsx` mounted in the existing lesson editor/course workspace when `designSession` exists. Paths: `teach.design(courseId)` = `/teach/courses/:id/design`, `teach.designSession(courseId, sessionId)` = `…/design/:sessionId`. `BuilderStart` gets the second card ("Start from a syllabus") and, when `NIGHT-4-NOTES.md`'s New-course flow lands, this is option one under "How to start".
- **Shared components** (`app/src/components/`, each with `.module.css` on tokens and a story): `SourceList` (Ready / extracting / OCR / outdated / excluded, page count, anchor), `ChangeSetTable` (was / will be, counts, conflicts, summary line; reuse it for templates too), `OptionCard`, `AlignmentMatrix` (outcomes × assessments with `assessed` / `verb-mismatch` / `none`, text labels not colour alone), `Citation` (the `p. 3` mono chip; on hover/focus shows the span text; keyboard reachable), `WorkloadChart` (bars vs budget line, accessible table alternative via `aria-describedby`). Markup follows the artboards; AI content only through `AiContent` (`who="Design partner"`, `source`, `cites`).
- **Mock mode**: `shared/seed.ts` gains a seeded `DesignSource` from `tests/fixtures/syllabus/STAT110_Syllabus_Fall2026.pdf` extracted text (commit the extracted JSON as `shared/seed-syllabus.json`; regenerate with a script), so `?data=mock&as=u-okafor` can run the whole flow with the fixture AI and no upload (upload stays unavailable in demo mode, as today).
- **Docs**: `mintlify/product/design-partner.mdx` (vocabulary: Start from a syllabus, Design partner, instructional read, approaches, preview, drafts), linked from `product/authoring.mdx`; `releases/night-4.mdx` when shipped; `docs:sync` picks up the new screens and stories.

## 9. Governance and policy (must-haves)
- Consent panel on Start (copy on the artboard): syllabus-only scope; no rosters/grades/student work; strip student names; the syllabus and outputs belong to the instructor; nothing trains a model; every claim cites its page; drafts only; one-action undo. `consent.syllabusOnly` is stored with a timestamp on the session.
- `AiPolicy.designPartner.enabled` (default true where `aiAuthoring` is true); the admin Policy page gets the toggle, the allowed-architectures list, workload rates (D-034) and the default disclosure text.
- The "Start here" lesson always carries the AI-use disclosure block (instructor edits it; it is a `text` block, `origin: 'ai'`, so it must be kept like any draft).
- QM: numbers only under D-031; never QM text.
- Accessibility: all provisioned content is born accessible (heading order, no images, tables with header rows, descriptive link text from `link-text`); Tessera Access runs on the result as today. New UI: WCAG 2.2 AA, 44px learner targets don't apply (instructor surfaces use compact density), visible focus, focus return on panels, no colour-only state (the matrix uses shapes + text), no stripes (D-017; `npm test` guards it).

## 10. Tests and definition of done
1. **Unit** (`shared/service/design-partner.test.ts`): rules → questions (each code); candidate selection (table of profiles → expected three); estimator (STAT 110 fixture: 3 credits → 9 h budget; week 11 over budget); plan determinism (same inputs → same hash; different course state → different hash); apply refuses a stale hash; overlaps detection; provisioning writes outcomes, objectives, links and drafts; undo removes only untouched drafts; readiness after apply ≥ forecast for automatic checks; no `link` without a span; no "learning style" string.
2. **Repo contract**: new methods in `repo-contract.ts`, both repos pass.
3. **AI validation**: malformed task outputs are rejected with `invalid` and nothing is written (one test per task).
4. **Extraction feasibility** (`worker/access/syllabus-extraction.test.ts`, exists and passes): keep it green; extend with the `lines` output.
5. **e2e** (`tests/e2e`, mock data): upload-less journey: Start (paste the seeded syllabus) → Read → answer two questions → confirm outcomes → pick B + C + bookends → preview → apply → the course shows 7 new modules of drafts → keep one block → readiness bar updates → undo → course back to 2 modules.
6. **a11y**: `npm run a11y` zero violations including the five new app routes (add them to `tools/a11y_audit.mjs`) and the new stories; the five artboards are already in the gallery and pass.
7. **Palmyra check (D-032)**: on a preview branch with `WRITER_API_KEY`, run the real `syllabus-extract` + `syllabus-analyze` on the two fixtures and on at least five real syllabi the owner supplies (different departments, one scanned). Record in `handoff/NIGHT-4-QA.md`: field-level accuracy for outcomes, weights, schedule rows, contact, credits; whether the week-8 empty row and the weights-sum rule fire; question burden; time per stage. If schedule-row accuracy is below 90% on the real set, write up the Docling-in-the-container option (cost, latency, what it fixes) instead of building around it.
8. **Definition of done** = CLAUDE.md full lane: build, audit, walk every stage locally with screenshots, push the branch, check the preview, migrate preview D1 first, then merge to `main` after the owner's visual review of the app screens against the artboards.

## 11. Milestones (suggested worktrees; Sol implements, Astra reviews, Claude verifies and commits)
1. `agent/design-domain` — domain types, validation, policy defaults, migration, repo methods + contract tests, `Lesson.objective` wired into the existing builder.
2. `agent/design-extract` — source building with `lines`, extraction + rules, `syllabus-extract` prompt/fixture, extraction job, seed JSON, feasibility test extension.
3. `agent/design-read` — `syllabus-analyze`, estimator, learner-centeredness, deficiencies, `objective-rewrite`; `ReadConfirm` screen; `Citation`, `AlignmentMatrix`, `WorkloadChart`.
4. `agent/design-approaches` — candidate rules, `structure-options`, `Approaches` screen, `OptionCard`, instructor profile UI.
5. `agent/design-plan` — plan, hash, `ChangeSetTable`, `Preview` screen, apply/undo, scaffold job, `module-scaffold` prompt/fixture, Start-here builder.
6. `agent/design-review` — review panel, next steps, alternatives, quick actions, design record export, MCP tools, docs page, e2e, a11y, QA log.

Each brief to a worker: the section numbers above, the artboard file, the acceptance tests, and the CLAUDE.md hard rules. Read every diff before pushing.

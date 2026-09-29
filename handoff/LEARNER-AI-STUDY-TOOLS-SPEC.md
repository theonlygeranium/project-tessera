# Build spec: Learner AI study tools (measure the tutor, add two grounded study aids)

*Status: approved by owner for build planning (2026-09-28); proposed decisions still await owner ruling. Decisions D-090 to D-092 below are proposals; D-092 clarifies how D-003 applies to private learner-facing AI output and needs the owner's explicit approval. Research: `research/lms-best-practices-gaps-2026-09-28.md` (the gap report; §1, §2.3, §3 rank 7, §6.1, §7 area 10). Depends on: `handoff/AI-GOVERNANCE-SPEC.md` (the `study-tools` feature switch, opt-in per course). Builds on the hint-first tutor (D-005; `shared/service/tutor.ts`, `app/src/features/tutor/`) and learner presets and adaptations (D-004). Artboard: states on `design/canvas/LessonPlayer.dc.html` proposed (§8).*

This document is written for the implementing agent. It assumes `CLAUDE.md`, `AGENTS.md`, `handoff/PARALLEL-AGENTS.md`, `design/DECISIONS.md`, `design/DESIGN-NOTES.md` and `handoff/NIGHT-2-PLAN.md` §5.4 and §5.5 are known. Where it says "as today", the existing code is the reference and must not be rewritten.

---

## 0. What this is, in one paragraph

The research says to maintain the tutor and **measure learner use rather than expand features** (§7 area 10), so this is deliberately small. First, **measurement**: privacy-preserving usage and helpfulness signals for the tutor (and the two new aids) so the owner and instructors can see whether learners use AI help and whether it helps, with a per-message "Helpful? Yes / Not really" and aggregate views that suppress small groups. Second, two narrowly grounded aids that fit Tessera's rules. **Practice from this lesson:** a learner asks for 3 to 5 practice questions drawn only from the lesson's published blocks, answers them, and gets hint-first feedback; the questions are private, ungraded, and never drawn from quiz items, checks' answer keys or test-outs. **Review what I missed:** a personal list, without AI, of the checks and practice questions the learner got wrong, resurfaced on a spacing schedule (1, 3 and 7 days) on Today. Both are off until an instructor opts the course in (spec 5), and both are unavailable inside a graded activity whose tutor mode is Off.

Why (gap report): D2L Lumi Learner Mode, Canvas IgniteAI Study Tools and Athena, Blackboard Scholar and Workday Learning with Sana all shipped or announced learner tutors in 2026, so Tessera is at parity-plus with its integrity guarantee as the differentiator (§1, §6.1); Phil Hill notes muted reception and adoption risk (§7 area 10); an AAUP survey found 69% of faculty say AI hurts student success (§1); D2L reports 98% of Lumi sessions cite course material and keeps individual knowledge-check results private to the student (§2.3); Canvas relaunched AI-graded assignments as low-stakes chats with no gradebook column (§2.3). The report scores this 3 × 3 = 9, effort small. Tessera's difference: every aid is grounded in published course content with citations, hint-first, private to the learner, off by default at the course level, and measured so the owner can decide from evidence whether to keep or cut them.

## 1. Decisions (proposed, 2026-09-28)

| # | Decision | Consequence in this build |
|---|---|---|
| **D-090** | **Scope is measure plus two aids, no more.** Tutor measurement, "Practice from this lesson", and "Review what I missed". No summaries of lessons, flashcard generators, essay helpers or chat outside a course context in this release. After one term of data the owner decides to keep, change or cut each aid. | Keeps the surface small and the evaluation honest. |
| **D-091** | **Measurement is private by design.** Per-learner data (sessions, hints, practice attempts, helpfulness votes) is visible only to that learner. Instructors see course aggregates with groups under 5 suppressed (same rule as spec 6, D-074) and the existing tutor summaries (D-005). The owner sees institution aggregates. Learners can delete their own practice and helpfulness history. No message content is used for measurement beyond what tutor summaries already use. | New usage counters; helpfulness vote on tutor and practice messages. |
| **D-092** | **Private learner-facing AI output is governed like the tutor, not like course content.** Practice questions are generated for one learner, shown only to that learner, labelled with the Marginalia markup and their sources, never enter the course, a quiz, the gradebook or another learner's view, and are not published content. So D-003's "a person keeps drafts before students see them" applies to course content, and private study output instead follows the tutor rules: instructor opt-in per course, tutor mode limits, hint-first feedback, never the answer key (D-005). | Needs explicit owner approval because it states how D-003 applies to a new kind of output. If rejected, the fallback is instructor-kept practice sets (the instructor drafts and keeps questions per lesson, and learners draw from them), which spec 3's bank already supports. |

## 2. Scope

**In (MVP, half a Night):**
1. Helpfulness vote on each tutor reply and each practice feedback message (two buttons, optional one-line comment; the comment is private to the learner and the owner's aggregate review, never shown to instructors individually).
2. Usage counters: per learner per course per day for tutor sessions, hints, answer requests (as today), practice sets started and completed, review items cleared.
3. Instructor course view: usage over time, share of learners who used any aid (suppressed under 5), helpfulness share, and the existing tutor summaries.
4. Owner and admin view: institution aggregates by course with suppression.
5. "Practice from this lesson": from the lesson player (after the last block, and in the tutor panel as a suggestion), 3 to 5 questions, single choice or short text, generated from published blocks; answering gives feedback in hint-first order (first a hint, then the explanation on a second try or on request if the tutor mode allows Explain).
6. "Review what I missed": wrong check answers (as today's check results) and wrong practice answers queued at 1, 3 and 7 days; shown on Today as "3 to review"; answering correctly removes the item; no AI.
7. Governance wiring: `study-tools` feature (spec 5) opt-in per course; unavailable in graded activities with tutor mode Off; respects pause-all.

**Out (explicitly):** AI lesson summaries; flashcards; writing assistance on assignments; voice mode; cross-course study plans; any grade or completion effect from practice; leaderboards or streaks.

**Later (only if the data supports it):** instructor-reviewed practice pools per lesson; spaced review across courses; learner-chosen difficulty; an evaluation report template for the owner.

## 3. The flow (normative)

| Stage | Learner or instructor sees | Server does | Gate |
|---|---|---|---|
| Opt in | Instructor → Course settings → AI → "Study tools for learners" switch with a link to its card | spec 5 `updateCourseAiSettings` | Institution state On or opt-in |
| Offer | Priya finishes a lesson: "Practice from this lesson (3 to 5 questions, not graded)" | None | Feature enabled for the course; not inside a graded activity with tutor mode Off |
| Generate | A set of questions appears, labelled "Practice · drafted by AI from this lesson" with sources (block headings) | `startPractice` → `practice-questions` task over published blocks only | Rate limit: 5 sets per learner per lesson per day |
| Answer | Choose or type → "Check" → hint on a wrong first try, explanation on the second try (if the course's practice tutor mode allows Explain) → "Helpful?" | `answerPractice` scores locally on the server; feedback by the tutor rules | Tutor mode for practice activities (D-005) |
| Review | Today: "3 to review" → one question at a time; correct removes, wrong reschedules | `listReviewItems`, `answerReviewItem` | Own only |
| Measure | Instructor → Course → Insights → "Learner AI use": counts, shares, helpfulness, suppressed where small | `getCourseStudyUsage` | Instructor |
| Delete | Priya → Profile → "Delete my practice history" | `deleteMyStudyHistory` | Confirmation |

Voice: "Practice", "not graded", "from this lesson". No "smart", "personalized AI coach" or "magic"; no learning-style language (D-004).

## 4. Domain model (`shared/domain.ts`)

Added at the end of the file (small, added at the end of the section):

```ts
// ---- Learner study tools (D-090 to D-092) ----
export interface PracticeQuestion {
  id: string; type: 'single' | 'short-text'; stem: string;
  options: { id: string; text: string }[];      // single only
  /** Server-side only; never sent to the client before the learner answers twice or gives up. */
  key: { correctOptionId?: string; accepted?: string[] };
  hint: string; explanation: string; sourceBlockIds: Id[];
}
export interface PracticeSet {
  id: Id; studentId: Id; courseId: Id; lessonId: Id;
  questions: PracticeQuestion[]; provenance: Provenance;
  answers: { questionId: string; tries: number; correct: boolean | null; at: Timestamp }[];
  createdAt: Timestamp; completedAt: Timestamp | null;
}
/** What the learner receives. */
export type StudentPracticeQuestion = Omit<PracticeQuestion, 'key' | 'explanation' | 'hint'>;

export interface ReviewItem {
  id: Id; studentId: Id; courseId: Id;
  source: { kind: 'check'; blockId: Id; lessonId: Id } | { kind: 'practice'; setId: Id; questionId: string };
  dueAt: Timestamp; step: 1 | 2 | 3;           // 1, 3 and 7 days
  clearedAt: Timestamp | null;
}

export interface HelpfulnessVote {
  id: Id; studentId: Id; courseId: Id;
  target: { kind: 'tutor-message'; sessionId: Id; messageId: Id } | { kind: 'practice'; setId: Id; questionId: string };
  helpful: boolean; comment: string; at: Timestamp;
}

export interface StudyUsageDay {
  courseId: Id; day: string;                    // ISO date
  learners: number | Suppressed;                // Suppressed from spec 6
  tutorSessions: number; hints: number; answerRequests: number;
  practiceStarted: number; practiceCompleted: number; reviewCleared: number;
  helpfulShare: number | null;
}
```

Also:
- `TutorMessage` gains optional `helpful?: boolean | null` for the learner's own view.
- `ActivityKind` stays `'lesson' | 'assignment'`; practice uses the lesson's tutor setting with `practice` limits from `AiPolicy.tutorModes.practice` (as today).
- `AiTask` gains `'practice-questions'`, registered under spec 5's `study-tools` feature.
- `Today` gains optional `review?: { count: number; nextDueAt: Timestamp | null }`.

## 5. API (`shared/api.ts`)

| Operation | Method · path | Access · scope | Notes |
|---|---|---|---|
| `startPractice` | `POST /me/lessons/:lessonId/practice` | STUDENT, browserOnly | `{ count: 3..5 }` → `{ setId, questions: StudentPracticeQuestion[], provenance }` |
| `answerPractice` | `POST /me/practice/:setId/answers` | STUDENT, browserOnly | `{ questionId, value }` → `{ correct, feedback: { kind: 'hint' \| 'explain'; text } }` |
| `voteHelpful` | `POST /me/helpfulness` | STUDENT | `{ target, helpful, comment? }` |
| `listReviewItems` / `answerReviewItem` | `GET /me/review`, `POST /me/review/:itemId` | STUDENT | |
| `deleteMyStudyHistory` | `DELETE /me/study-history` | STUDENT | practice sets, review items from practice, votes |
| `getCourseStudyUsage` | `GET /courses/:courseId/study-usage` | INSTRUCTOR · `courses:read` | suppressed aggregates |
| `getInstitutionStudyUsage` | `GET /study-usage` | ADMIN · `people:read` | |

## 6. Service logic (`shared/service/study.ts`, over `Repo`)

### 6.1 Practice generation
- Check: feature enabled (spec 5 resolution), learner enrolled, lesson published, not a graded context with tutor mode Off, rate limit.
- Sources: published blocks of the lesson only; exclude `check` blocks' answers and feedback, any quiz items, test-out items, and assignment instructions for graded work due in the future (to avoid generating answers to graded tasks).
- Validate output: each question references at least one source block; single-choice has one key among 3 or 4 options; no question duplicates a `check` question verbatim; banned phrases rejected ("learning style"); otherwise reject and return a friendly "Couldn't make practice questions for this lesson right now".

### 6.2 Feedback (hint-first)
- First wrong try → `hint`. Second wrong try → `explanation` only if the practice tutor mode allows `explain` or `open`; under `hints`, a second hint and "Look again at: <block heading>" with a citation. The key is revealed only after the explanation step or when the learner chooses "Show me" (allowed only in `explain` and `open`).
- Wrong answers create `ReviewItem`s (step 1, due in 1 day).

### 6.3 Review scheduling
- Check wrong answers (from the existing check result records) also create review items (without AI) when study tools are enabled for the course.
- Correct on review → step + 1 (3 days, then 7 days), cleared after step 3; wrong → back to step 1.

### 6.4 Measurement
- Counters incremented in the same request as the action; daily rows per course; suppression applied at read (fewer than 5 distinct learners → `Suppressed`).
- Helpfulness share = helpful ÷ votes, null with fewer than 5 votes.

### 6.5 Deletion
- `deleteMyStudyHistory` deletes the learner's practice sets, practice-sourced review items and votes, conditioned on `studentId` in the delete statement; counters are aggregates and stay. Astra review (deletion code).

## 7. AI tasks (`shared/ai.ts`, prompts in `worker/ai/palmyra.ts`, fixtures)

Small additions at the end of the hotspot tables.

| Task | Input | Output | Fixture behaviour |
|---|---|---|---|
| `practice-questions` | `{ lessonTitle, objective, blocks: { id, heading, text }[], count, readingLevel }` | `{ questions: { type, stem, options?, key, hint, explanation, sourceBlockIds }[] }` | One single-choice question per heading; key = first sentence under the heading; hint = "Look at the section '<heading>'"; explanation = the sentence |

System prompt additions: questions only from the given blocks; hints point to where to look, never state the answer; explanations cite the block; plain language at the learner's reading level (`LearningProfile.readingLevel`, D-004); never "learning styles".

## 8. Worker, data, app

- **Migration:** new migration, next free at build time (>=0009). Additive: `practice_sets`, `review_items`, `helpfulness_votes`, `study_usage_days`. Apply to preview D1 first; production with the owner's OK and a restore point.
- **App:** `PracticePanel` (lesson end and tutor suggestion), `ReviewCard` on Today, `HelpfulVote` in tutor messages (two labelled buttons, 44 px), study usage section on spec 6's Insights page (or a course page if spec 6 isn't merged), profile deletion control. All AI output through `AiContent` with `who="Practice"` and sources (D-006).
- **Artboard:** add practice and review states to `design/canvas/LessonPlayer.dc.html` and the phone states to spec 8's `MobileLesson` if approved. Owner review recommended (learner-facing AI surface).
- **Mock mode:** STAT 110 opted in; a fixture practice set; Priya has 3 review items due.
- **Docs:** `mintlify/product/study-tools.mdx` (plain, no vendor names).

## 9. Governance and policy (must-haves)
- D-005: hint-first; the answer key of any graded item is never a source; the tutor mode caps feedback.
- D-092 (if approved): private output only; never content, never graded, never visible to others.
- D-003 for course content unchanged.
- D-004: reading level and preset personalisation only; no learning styles.
- D-006 and D-018: Marginalia markup with source on every practice question and feedback; no sparkles or gradients.
- D-026: managers see nothing from study tools.
- Spec 5: feature off unless the course opts in; pause-all applies; usage logged content-free.
- Accessibility: practice inputs are real radios and text inputs with labels; feedback in a polite live region; focus moves to feedback then back to the next question; 44 px targets; no stripes; tokens only.

## 10. Tests and definition of done
1. **Unit:** gating (feature off, graded with tutor Off, rate limit); source filtering excludes checks' answers, quiz items, test-outs and future graded instructions; validation rejects ungrounded or duplicate questions; hint-first sequence per tutor mode; key never in the student payload before allowed; review scheduling steps; suppression and helpfulness null rules; deletion scoped to the learner.
2. **Repo contract:** new methods; both repos pass.
3. **AI validation:** malformed `practice-questions` output rejected with nothing stored.
4. **e2e** (mock): Journey 21+ (claimed at build time): Dr. Okafor opts STAT 110 in; Priya finishes a lesson, starts practice, answers one wrong (gets a hint, not the answer, in Hints mode), votes helpful; next day (clock set in test) Today shows 1 to review; she clears it; Dr. Okafor sees aggregate usage with suppression (fewer than 5 learners in the seed shows "Fewer than 5 people").
5. **a11y:** zero violations with new states and stories.
6. **Definition of done:** CLAUDE.md full lane; preview D1 migrated first; the owner approves D-092 before merge; the owner merges.

## 11. Milestones (suggested worktrees; Sol implements, Astra reviews, Claude verifies and commits)
0. **Gate:** D-090 to D-092 approved; spec 5's feature switch merged (or a temporary course flag agreed with the owner).
1. `learner/study-measure` in `../tessera-learner-study`: helpfulness votes, counters, instructor and admin views.
2. `learner/study-review`: review items from checks, Today card (no AI; can ship first).
3. `learner/study-practice`: `practice-questions` task and fixture, practice panel, hint-first feedback, deletion (Astra review).
4. Docs, e2e, a11y; after one term, the owner reviews the measurement and decides (D-090).

Each brief: the sections above, the acceptance tests, the hotspot rule (small, added at the end of the section) and the CLAUDE.md hard rules. Read every diff before pushing.

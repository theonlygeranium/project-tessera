# Tessera evaluation plan: usability testing the Night 1 MVP

**Status: draft for the owner's approval (issue #28).** Written 2026-09-27 against what's live in production after Night 1 (`handoff/NIGHT-1-PLAN.md`, tag `night-1`). Cite the research report by section (report §N).

## 1. Why test now, and what we want to learn

Night 1 put a working product in front of three personas. It passed automated accessibility checks and scripted journeys, but no real administrator, instructor, or student has used it. Automated checks catch roughly a third to half of accessibility issues and none of the comprehension problems. This plan finds out whether real people can do the core jobs, whether they find it easy, and whether they understand Tessera's AI model.

Research questions:

| # | Question | Why it matters |
|---|---|---|
| RQ1 | Can each persona complete its core jobs **without help**? | The MVP's reason to exist (Night 1 plan §4). |
| RQ2 | Is it **more usable than today's LMSs**? Target SUS ≥ 80. | Every major LMS sits near the SUS average (Canvas faculty 68.9; ed-tech mean 70.09); 80+ would be a clear differentiator (report §2, *Usability benchmarks*). |
| RQ3 | Do people **understand the AI model**: what the AI wrote, where it came from, and that nothing reaches students until a person keeps it? | D-003 and D-006 only work if they're understood; trust should be calibrated, not blind (report §4, *Human-AI interaction principles*). |
| RQ4 | Is **reviewing AI drafts** fast enough that instructors will do it rather than resent it? | The publish gate is the core differentiator and the main friction risk (report §7b). |
| RQ5 | Can people using **assistive technology** do the same jobs? | WCAG 2.2 AA is a hard rule (D-010); issue #29 covers the screen-reader pass. |

Out of scope for this round: learning outcomes of the tutor and the spaced-review queue. Neither is built yet; §9 specifies how to measure them once they are.

## 2. What's tested

- **The Night 1 app in production**, at `https://tessera.edstratumlabs.ai/app/`, behind Cloudflare Access. Each participant's email must be added to the Access app's allow rule before the session (a Cloudflare change the owner approves; remove access afterward).
- **Fictional data only** (Meridian State, Dr. Okafor, Priya). Participants play a persona; nobody enters real student data.
- **Real AI.** AI drafting runs on Palmyra-X6, so outputs vary between sessions. Record what the model produced in each session (screenshots) so findings can be tied to the output a participant actually saw.
- **One shared database.** "Reset demo data" (administrator overview) resets it for everyone, so run sessions **one at a time** and reset between sessions (§6 checklist).

## 3. Participants and recruiting

Round 1 is formative: find the problems. Round 2 is confirmatory: measure SUS with enough people to trust it.

| Persona | Round 1 | Round 2 | Who, and the mix to aim for |
|---|---|---|---|
| Administrator | 5 | 8 | LMS or IT administrators who have set up courses or users in any LMS. At least 2 from higher ed and 1 from corporate L&D. |
| Instructor | 6 | 10 | Faculty, adjuncts, instructional designers, and corporate trainers who have built a course in an LMS in the last 2 years. At least 2 who have never used AI drafting tools and 2 who use them weekly. |
| Student | 6 | 12 | Current learners across the report's personas (§5, *Persona-to-interface mapping*): at least 1 traditional undergraduate, 1 adult or working learner, 1 corporate learner, 1 ESL or multilingual learner, and 1 mobile-first learner (on a phone). |
| Assistive technology | 2 (students) | 2 | Daily screen-reader users (1 VoiceOver, 1 NVDA if possible). These sessions also cover #29. |

About five people per persona find most of the obvious problems in a formative round. SUS needs more people for a stable estimate, which is why round 2 is larger. Even so, round-2 scores are a directional benchmark, not a statistically strong comparison (report *Caveats*: the published LMS SUS studies are small too).

**Screener** (short form): role and years in it; LMS products used in the last year; how often they use AI tools for work or study; assistive technology used, if any; device for the session; availability; consent to recording.

**Incentive:** a gift card appropriate to the role (typically higher for faculty and administrators). **Consent:** a one-page form covering recording, how recordings are stored and for how long, and that participants can stop at any time. If results will be published or used as institutional research, check whether the institution requires IRB review before round 1.

## 4. Session format

- **Remote, moderated, 50 minutes**, one participant at a time, thinking aloud, sharing their screen. They use their own browser (and their own screen reader for AT sessions).
- **Structure:** 5 min intro and consent → 35 min tasks (§5) → 10 min questionnaires and debrief (§7, Appendix B–D).
- **The moderator doesn't help** unless the participant is stuck for 2 minutes or asks to move on. That task is then scored "assisted" or "failed".
- **After each task:** the Single Ease Question ("Overall, how easy or difficult was this task?" 1–7).
- **An observer**, when possible, takes notes in the shared spreadsheet (§8) so the moderator can focus.

## 5. Tasks

Tasks are written as goals in plain language, never as button names ("add a lesson", not "click Add lesson"). Each has a success rule.

### Administrator (signs in as Alex Rivera)

| # | Task given to the participant | Success when | Measures |
|---|---|---|---|
| A1 | "You're setting up Tessera for your institution. Finish the setup with your own institution's name, a brand color, and an AI policy you'd be comfortable with." | Setup finished; they can say what the policy allows | Success, time, SEQ; ask what "Open" means and why it's locked for graded work |
| A2 | "Add these three people from a spreadsheet." (Provide a 3-row CSV with one bad email.) | Two added; the error is noticed and fixed | Success, errors, SEQ |
| A3 | "Create a course called Data Literacy 101 for next term, with Dr. Okafor teaching and Priya enrolled." | Course exists with both assignments | Success, time, SEQ |
| A4 | "Your provost asks you to turn off AI drafting for now. Do that, then tell me what instructors will notice." | Turned off; the explanation is correct | Success, comprehension (RQ3) |

### Instructor (signs in as Dr. Okafor)

| # | Task | Success when | Measures |
|---|---|---|---|
| I1 | "Use AI to start a short unit on reading charts critically for first-year students. Use these notes as a source." (Provide ~150 words to paste.) | Draft lessons exist in the course | Success; time to drafts excluding model wait; SEQ; first impression of the brief and outline |
| I2 | "Get the first lesson ready for students. Change anything you don't like." | Lesson published; at least one block edited, regenerated, or reverted | Success, time, SEQ; count of blocks kept without reading (a rubber-stamping signal, RQ4) |
| I3 | "Another lesson won't publish. Find out why and fix it." (Pre-seeded: an image without alt text and one unreviewed AI block.) | Both issues fixed and published | Success, time, SEQ |
| I4 | "Tell your students that the first quiz opens Friday. You can use AI to draft it." | Announcement published, pinned or not | Success, SEQ; did they edit the AI draft? |
| I5 | "Who in your course hasn't started yet?" | Correct names from the roster | Success, time |
| I6 | Comprehension probe: "If you hadn't clicked Keep on an AI paragraph, could a student see it?" | "No" (D-003) | RQ3 |

### Student (signs in as Priya; on a phone for the mobile-first participant)

| # | Task | Success when | Measures |
|---|---|---|---|
| S1 | "Set up your account the way that suits you." | Profile saved | Success, time, SEQ |
| S2 | "Start whatever you should work on next." | Opens the next lesson from Today in 1 click | Success, clicks, time (principle #2) |
| S3 | "Finish the lesson." (It includes a knowledge check; note how they recover from a wrong answer.) | Lesson marked complete | Success, SEQ |
| S4 | "Your instructor changed office hours this week. When are they?" | Correct answer from the announcement | Success, time |
| S5 | Comprehension probe: point at an AI-labeled block or announcement: "Who wrote this, and has anyone checked it?" | "AI drafted it; the instructor reviewed or edited it" | RQ3 |
| S6 | "Make the lessons easier for you to read." | Changes reading level or text size in the profile | Success; discoverability of personalization (D-004) |

**Assistive technology sessions** run S1–S5 with the participant's screen reader and note every blocker and workaround. They double as the #29 walkthrough.

## 6. Session checklist (moderator)

Before each session:
1. The participant's email is on the Access allow rule. They've received the link and signed in once (a one-time PIN to their email).
2. As the administrator, **Reset demo data**. For instructor sessions, pre-seed task I3's lesson: add an image with no alt text and regenerate one block, leaving it unreviewed.
3. Start recording. Open the observation sheet at the participant's row.

After each session:
1. Save screenshots of the AI outputs the participant saw (I1, I2, I4).
2. Record the questionnaire answers.
3. Reset demo data. Remove the participant from Access after the last session of the round.

## 7. Measures and targets

| Measure | Target | Minimum to ship without changes |
|---|---|---|
| Unaided task success, per task | ≥ 80% | ≥ 70% |
| Critical tasks (I2 publish, I3 fix readiness, S2 next action) | ≥ 90% | ≥ 80% |
| SUS, per persona (round 2) | **mean ≥ 80** | ≥ 72 (above the ed-tech mean of 70.09) |
| Single Ease Question, mean per task | ≥ 5.5 of 7 | ≥ 5.0 |
| S2 next action from Today | 1 click, ≤ 10 s | ≤ 2 clicks |
| I1 time to drafts, excluding model wait | ≤ 4 min | ≤ 6 min |
| AI comprehension (A4, I6, S5 answered correctly) | ≥ 90% | ≥ 80% |
| Calibrated trust (Appendix D; agreement that they understand where AI content came from) | ≥ 4 of 5 | ≥ 3.5 |
| Rubber-stamping (I2 blocks kept without being read) | Report; no target yet | n/a |
| Assistive-technology blockers on S1–S5 | 0 | 0 (any blocker is a P0) |

SUS uses the standard 10 items (Appendix B), scored the standard way (0–100). Report each persona's mean with its confidence interval next to the benchmarks. Never report a single blended number across personas.

## 8. Analysis and reporting

- **Observation sheet:** one row per participant, one column per task, recording success (unaided, assisted, or failed), time, SEQ, and quotes, plus a column per issue (a "rainbow sheet"), so it's clear how many participants hit each issue.
- **Severity** for each issue, using Nielsen's 0–4 scale:
  - 4, blocker: they couldn't complete a critical task.
  - 3, major: they completed it with serious struggle or an error.
  - 2, minor.
  - 1, cosmetic.

  Severity 3–4 issues become `type:bug` or `type:design` GitHub issues and are candidates for the next Night.
- **Round report:** `research/evaluation-round-1.md`. It gives the headline scores against §7, the top 10 issues with evidence (clips and quotes), what surprised us, the RQ1–RQ5 answers, and recommended changes. Keep participant data anonymous (P1, P2…).

## 9. Later: learning-outcome measures (when the tutor and review queue ship)

Usability isn't learning. Once the hint-first tutor (#19) and the spaced-review queue exist, add outcome studies (report §4, *The learning evidence*; §1):
- **Tutor:** within one course, randomize practice activities between Hints and Off (never Open on graded work, D-005). Measure an **unassisted** post-test and a transfer item. Bastani et al. showed that unguarded AI raised practice scores but lowered exam scores, so the unassisted test is what matters.
- **Review queue:** measure 1-week delayed retention on items that went through the queue against matched items that didn't.
- **Pre-register** the outcomes before collecting data, and report nulls. The report notes that the evidence here is narrow and short-term (*Caveats*).

## 10. Timeline

| Step | Length |
|---|---|
| Recruit round 1 (screener, scheduling, Access invites) | 1–2 weeks |
| Round 1 sessions (19, including AT) | 1 week |
| Analysis and round 1 report | 3–4 days |
| Fix severity 3–4 issues (a Night) | 1 Night |
| Round 2 (32 sessions, SUS-focused, shorter script) | 1–2 weeks |

## Appendix A. Moderator intro (read aloud)

"Thanks for helping. We're testing Tessera, not you: if something's confusing, that's exactly what we need to know. Please think out loud as you go. Everything here is made up, including the people and courses. I'll mostly stay quiet so I don't steer you; if you get stuck, tell me and we'll move on. We'll record your screen and voice so we can review it later. Is that okay?"

## Appendix B. System Usability Scale (Brooke, 1996)

Rate each from 1 (strongly disagree) to 5 (strongly agree):

1. I think that I would like to use this system frequently.
2. I found the system unnecessarily complex.
3. I thought the system was easy to use.
4. I think that I would need the support of a technical person to be able to use this system.
5. I found the various functions in this system were well integrated.
6. I thought there was too much inconsistency in this system.
7. I would imagine that most people would learn to use this system very quickly.
8. I found the system very cumbersome to use.
9. I felt very confident using the system.
10. I needed to learn a lot of things before I could get going with this system.

Scoring: odd items score (answer − 1); even items score (5 − answer); multiply the sum by 2.5.

## Appendix C. Single Ease Question (after each task)

"Overall, how easy or difficult was this task?" 1 (very difficult) to 7 (very easy).

## Appendix D. AI understanding and trust (after tasks; 1–5 agreement)

1. I could tell which content was written by AI.
2. I understood where the AI's content came from.
3. I'm confident that AI content doesn't reach students until a person has reviewed it. *(Instructors and administrators.)*
4. I'd trust AI-drafted lesson content after my instructor reviewed it. *(Students.)*
5. The AI labels got in the way. *(Reverse-scored; listen for "noise".)*

Debrief questions: "What would you tell a colleague about this?" "What would stop you from using it?" "What did you expect that wasn't there?"

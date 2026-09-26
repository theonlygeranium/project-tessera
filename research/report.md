# Designing an AI-Native LMS for Higher Ed and Corporate Learning: Evidence Base, Design Principles, and Layout Briefs (September 2026)

The winning design for a new AI-native LMS copies Canvas's predictable, module-first structure and low-friction grading, and then adds an AI layer that stays under instructor control and is tuned for learning. The AI should show outlines before it drafts, label and explain what it produces, keep edits easy, and refuse to shortcut learning. The research is unusually clear that unguarded AI raises practice scores while lowering real skill. A tutor designed around pedagogy can do the opposite.

## TL;DR

- **Borrow Canvas's backbone, not its surface.** Canvas leads North American higher ed (50% of enrollments, per Phil Hill's Year-End 2024 data). The reasons are mostly structural: a consistent Modules-based course layout, fast grading, cloud reliability and an open LTI/API ecosystem. Controlled usability studies find it only "above average" (a faculty SUS of 68.9). That leaves real room for a calmer, more focused interface to beat it on experience.
- **Build AI as a governed co-author and a Socratic tutor, not an answer machine.** In a PNAS field experiment (Bastani et al., published June 25, 2025) with "nearly a thousand high school math students," an unguarded GPT-4 raised practice performance but hurt exam performance once it was removed. A guarded "tutor" version avoided that harm. A Harvard RCT of 194 intro-physics students (Kestin et al., Scientific Reports, June 2025) found a carefully designed AI tutor produced more than double the median learning gains of an active-learning class. The interface should therefore make "hint-first," human review, provenance labels and editability the default.
- **Personalize on evidence-based variables, not "learning styles."** Those variables are prior knowledge, goals, time available, language, accessibility needs, device and bandwidth, and role or compliance requirements. Style-matching lacks support: a 2024 meta-analysis found only 26% of outcome measures showed the required crossover effect. Build accessibility (WCAG 2.2 AA, which is above the U.S. Title II legal floor of WCAG 2.1 AA) into the design system and the AI generator, not as an afterthought.

## Executive Summary

The market context as of September 2026 favors a new entrant that combines Canvas-grade usability with credible AI.

- **Higher ed is consolidated and stable.** The "Big Four" (Canvas, Brightspace, Blackboard, Moodle) have held the top four positions in North America for fifteen years. ListEdTech puts them at more than 84% of implementations.
- **The incumbents are each under pressure.**
  - Blackboard's parent Anthology went through Chapter 11. When its plan took effect on Feb 27, 2026, "approximately $1.6 billion in funded debt was eliminated" (Davis Polk, creditor counsel), and it emerged as a debt-free "Blackboard" with approximately $70 million in new financing.
  - Canvas suffered a major ShinyHunters breach and extortion incident in April–May 2026 that disrupted final exams.
  - D2L is shipping AI in measured steps under its "Lumi" brand.
- **Corporate learning is being reshaped by AI-native players.** Workday agreed to acquire Sana for "approximately $1.1 billion" (Sept 16, 2025 press release; the deal closed Nov 4, 2025), describing Sana Learn as "an end-to-end AI-native learning platform." Fosway CEO David Wilson cautions, in the 2026 9-Grid for Learning Systems, that "Delivered AI reality still lags market hype, but we are seeing big changes year on year, although corporate adoption is still patchy."

For the product team, the evidence points to four strategic moves:

1. Make course structure and navigation boringly predictable.
2. Put the AI in a visible, reversible, source-grounded co-pilot role for authors, and in a Socratic, hint-first tutor role for learners.
3. Treat accessibility, privacy and security as visible product features.
4. Express persona customization through goals, pacing, language and format controls rather than pseudo-scientific learner "types."

---

## 1. Learning Experience Design: What Defines a High-Quality Learning Experience

### The research consensus

High-quality learning experiences reliably share a small set of mechanisms. Each one has a direct consequence for the interface.

| Principle | What the evidence says | UI translation |
|---|---|---|
| **Cognitive load management** | Working memory is limited, so extraneous load (confusing navigation, clutter, split attention) steals capacity from learning. The Harvard AI-tutor RCT deliberately told its tutor to be brief, using no more than a few sentences, "to avoid cognitive overload." | Single-column lesson reading, one primary action per screen, collapsible chrome, no competing sidebars during focused study. |
| **Chunking / microlearning** | Short, coherent segments lower load and fit adult schedules. Articulate's AI course drafts formalize this with formats from "Single Lesson" (under 5 minutes) to "Extended Course" (10+ lessons, 3+ hours). | Content modeled as blocks and modules with visible time estimates. Authors see chunk length and are warned by a linter when a chunk runs long. |
| **Retrieval practice & spaced repetition** | Testing yourself beats rereading. Spaced review beats massed review. D2L's "Lumi Study Support" turns quiz results into suggested review. A D2L executive said "Instead of the quiz being the end of the learning process, it helps learners learn even more." | Low-stakes checks embedded in every lesson. A "Review queue" on the dashboard driven by spacing algorithms. Flashcards generated from course content, with the instructor able to approve them. |
| **Scaffolding & desirable difficulty** | Learners need support that fades over time. Answer-giving AI removes productive struggle (Bastani et al., PNAS 2025). | Tutor defaults to hints, worked examples and then fading. "Show answer" is gated or logged by course policy. |
| **Feedback loops** | Feedback that is timely, specific and actionable drives improvement. D2L's Lumi Feedback and Canvas's rubric tools draft feedback, and the instructor keeps control. | Inline, rubric-anchored feedback on the artifact itself. Feed-forward ("next time try…"). Visible "feedback received" states. |
| **Learner agency / self-regulated learning** | Adults and graduate learners in particular benefit from planning, monitoring and reflection support. | Goal setting at onboarding, a weekly plan, self-assessed confidence ratings, reflection prompts, and dashboards the learner owns. |
| **Social / collaborative learning & Community of Inquiry** | The Community of Inquiry model's teaching, social and cognitive presence still frames online quality. In the EDUCAUSE 2025 data, students return to in-person settings for collaborative activities. | Instructor presence surfaces (announcements with a face or video, office-hours booking), cohort activity that avoids a social-feed feel, and structured peer review. |
| **Competency/mastery progression** | Skills-first programs are now mainstream in workforce learning. Instructure launched Canvas Career as a "skills-first" product for adult learners. | Map each activity to competencies. Mastery bars per skill rather than points alone. Mastery-gated paths as an option. |
| **Backward design & alignment** | Outcomes → assessments → activities. QM's standards center alignment, and IgniteAI is positioned to "reinforce alignment between course objectives, assessment practices and evidence of student learning." | The author workflow starts from outcomes. The AI flags gaps where an outcome has no assessment. An alignment matrix view is built in. |
| **UDL / multimodal representation** | Offering multiple means of representation, action and engagement helps everyone. This is different from "learning styles" (see Section 5). | Every content block can carry a transcript, captions, alt text, an audio version and a plain-language variant. Learners choose among them freely. |

### Quality standards that should be native to the authoring tool

- **Quality Matters (QM) Higher Education Rubric, Seventh Edition.** It has 8 General Standards and 44 Specific Review Standards, scored out of 101 points.
  - The Seventh Edition extended reviews to synchronous online and continuing-education (non-credit) courses.
  - It "integrated" a focus on inclusion and belonging.
  - It made Course Maps required in the review worksheet.
  - QM has since released Version 2.0 of the Seventh Edition, which does not change the Standards themselves.
  - Design implication: a built-in "QM-style readiness check" that audits objectives, alignment, navigation instructions, accessibility and learner support before publishing. It should cover both credit and corporate continuing-ed courses.
- **OSCQR (SUNY)** and similar open rubrics can be offered as selectable checklists alongside QM. Institutions should be able to load their own rubric.

**Interpretation:** The literature converges on a message that fits AI-native design: the value lies in *structure* (alignment, chunking, retrieval, feedback) more than in *content volume*. AI makes content cheap. The LMS should therefore spend its UI budget on enforcing structure and quality, not on showcasing generation.

---

## 2. LMS UI/UX Best Practices

### What students and faculty actually value

- **Basic functions drive satisfaction.** In the EDUCAUSE 2025 Students and Technology Report:
  - 69% of students are satisfied with institutional technology services overall.
  - That rises to about 85% where students perceive their institution as "cutting-edge" and falls to 34% where it is seen as lagging. Perceived modernity strongly colors satisfaction.
- **Consistency across courses is the pain point.**
  - 70% of students say hybrid courses set clear expectations.
  - Only 59% feel instructors adapt effectively.
  - Only 48% perceive consistency across courses. This is the strongest argument for institution-level course templates.
- **Students want an aggregated, time-oriented view.** The University of Southern California (USC) presented a student-centered LMS transformation at EDUCAUSE 2025 based on a survey with 10,000+ responses. Students want "to manage multiple courses, due dates, and assignments," "integrated calendars, to-do lists, and performance views," and "flexible access, especially mobile/tablet," and they expect "predictable, consistent design."

### Usability benchmarks (SUS)

The System Usability Scale averages 68, and roughly 80.3 or above is an "A" (MeasuringU).

| Study | Platform | SUS / result |
|---|---|---|
| Abdulquadir et al., SIGITE '23 (R1 university faculty) | Canvas | **68.9**: "above-average… with a lot of room for further improvements"; issues with organization and limited feature capabilities |
| J. Information Systems & Informatics, June 2024 (120 students) | Moodle-based | **71.52** (SD 16.18) |
| Gumasing et al., ICIEA 2022 | Blackboard vs Canvas | Satisfaction means 3.56–3.88 vs 3.78–3.94; "no significant difference" |
| IEEE 2023 | Blackboard, Google Classroom, Canvas | ANOVA p = 0.054, no significant difference |
| Vlachogianni & Tselios, JRTE 2021/22 meta-review (104 papers, 170 surveys) | Ed-tech broadly | Mean **70.09**; "internet platforms" **66.25** |

**Interpretation:** Every major LMS sits near the SUS average. Canvas's market dominance is not explained by dramatically superior measured usability. It is explained by consistency, reliability, ecosystem and faculty perception relative to legacy systems. A new product that reaches the 80+ SUS band would be clearly differentiated. The evidence is thin, though: these are mostly small, single-institution studies.

### Established best practices

1. **Navigation model.** Use a persistent global navigation (Home/Dashboard, Courses, Calendar, Inbox, Search) and a consistent course-level navigation. Canvas's left course menu with Modules as the spine is the de facto mental model, and a new LMS should keep the same "course → modules → items" hierarchy.
2. **Reduce clicks to content.** The "next thing to do" should be one click from login. USC's findings and Canvas's To-Do list both point to a time-ordered action list as the primary entry point.
3. **Consistent course templates.** Institution- and program-level templates directly address the 48% "consistency" gap.
4. **Progress visualization.** Show module completion, mastery by competency and time remaining. Avoid leaderboard comparison as a default, especially for adults.
5. **Notifications.** Use digest-first delivery with per-course and per-type granularity. Critical items (deadlines, grades, instructor messages) should be separated from noise, and quiet hours should respect time zones.
6. **Mobile responsiveness.** Mobile should be a first-class learner surface covering reading, video, quizzes, discussion and notifications. Heavy authoring stays on desktop.
7. **Onboarding.** Use role-specific onboarding with a persona and goals setup (see Section 5). NN/G stresses that new users need support to learn what generative-AI tools can do. HAX Guideline 1 says "Make clear what the system can do."
8. **Accessibility.** The U.S. DOJ's ADA Title II rule makes WCAG 2.1 AA the enforceable standard for public institutions' web content, mobile apps and course materials.
   - An April 20, 2026 Interim Final Rule moved the deadlines to April 26, 2027 for entities serving populations of 50,000+ and April 26, 2028 for smaller ones.
   - The DOJ reportedly cited AI-generated content as an emerging accessibility risk.
   - D2L is already aligning its authoring tools to WCAG 2.2 A/AA.
   - A new LMS should target WCAG 2.2 AA natively, including focus appearance, target size, dragging alternatives and consistent help. Every AI-generated asset (alt text, captions, color contrast, headings) should be accessible by default.

### Design-system guidance for learning products

- **Typography.** Use a highly legible humanist sans for UI and an optional reading serif for long-form lessons. Set a 16–18px base for reading, a line length of about 60–75 characters, generous line-height, and support for user-controlled text size and dyslexia-friendly spacing.
- **Density.** Offer two density modes. "Comfortable" is the learner default. "Compact" suits instructors and admins in gradebooks and tables. Mature design systems commonly offer both.
- **Color.** Use a calm neutral base with one brand accent. Semantic colors (success, warning, error, AI) must not rely on hue alone. Contrast must be at least 4.5:1 for text. Institutions need theming, but under contrast-safe constraints.
- **Motion.** Keep motion minimal and purposeful: state transitions and progress feedback. Honor prefers-reduced-motion. Avoid celebratory animation in compliance contexts, where it feels patronizing.
- **AI visual language.** Use a distinct, consistent, *labeled* treatment for AI content. Do not rely on the sparkle icon alone. NN/G's 2024 research found the ✨ icon is ambiguous: in its quantitative study (n=107), users associated it with favoriting (about 17%) and visual effects (about 17%), and "no one attributed the concept of 'artificial intelligence' to the icon."

---

## 3. Why Canvas Is So Popular and Effective, and How Competitors Compare

### Market position (dated data)

- **North America higher ed by enrollment (Phil Hill & Associates, Year-End 2024, published Feb 2025):**
  - Canvas 50%, D2L Brightspace 20%, Blackboard 12%, Moodle 9%.
  - Brightspace overtook Blackboard for second place by enrollment, driven largely by the SUNY and CUNY system migrations.
- **By institution count (ListEdTech):**
  - Canvas holds about 43%.
  - Moodle, Brightspace and Blackboard each hold 12–16%.
  - "Others" total 3.4%.
- **Edutechnica, Spring 2025:** Canvas holds more US higher-ed share than its next three competitors combined. This comes via Instructure's own blog, so treat the framing as vendor-amplified.
- **Outside North America, Moodle dominates by institution count** (end-2023 data). Shares range from 73% in Latin America to 56% in Oceania, with a slow decline in most regions. For a global product, Moodle's long-tail, open-source, self-hosted market matters.
- **Ownership.** KKR and Dragoneer completed their $4.8 billion take-private of Instructure in late 2024.

**Vendor-claim caution:** Instructure's marketing cites "a verified 100% uptime record throughout 2025 and early 2026," a "4.6 out of 5-star satisfaction rating" and "94% of faculty" praising organization tools. These are unaudited marketing claims. The 100% uptime claim in particular sits awkwardly next to the May 2026 incident, when Canvas was put into maintenance mode.

### The product and UX reasons for Canvas's success

1. **Modules as a linear, legible spine.** Instructors build a sequence of weeks or units, and students follow it top to bottom, with completion requirements and prerequisites when needed. This gives both roles the same mental model and is the single most copied pattern in LMS design.
2. **Fast, low-friction grading (SpeedGrader).** It combines a submission viewer, rubric, annotation and comment in one screen, which saves time on the heaviest recurring faculty task.
3. **A clean, consistent UI built on a design system (Instructure UI / InstUI, open-source React components).** Consistency across tools was the main contrast with legacy Blackboard.
4. **Cloud-native from the start.** Commentators note that Canvas "was cloud-native from day one while competitors were retrofitting legacy on-premise architectures." Phil Hill has long identified "intuitive design, cloud hosting & scalability, and open integrations to third-party apps" as the defining LMS features of the past dozen years.
5. **Open ecosystem.** It offers LTI-based integrations, a large REST API, an open-source (AGPL) core, and Canvas Commons for sharing content.
6. **Aggregated student views.** The Dashboard, To-Do list, Calendar and mobile apps match exactly what USC's students asked for.
7. **Community and network effects.** Every institution in U.S. News' 2026 top 10 National Universities uses Canvas (Instructure claim). Faculty who move between institutions bring Canvas familiarity with them.
8. **AI strategy (2025–2026).**
   - **IgniteAI** was announced at InstructureCon on July 23, 2025 as a "conductor" for AI, alongside a global **OpenAI partnership**.
   - The first wave shipped in the November 2025 Canvas release, including a Rubric Generator, Discussion Insights and translations.
   - The **IgniteAI Agent** is built on Model Context Protocol (MCP). It was planned for global availability by March 2026, with free access through June 30, 2026.
   - The **LLM-Enabled Assignment** is in its experimental stage. It lets educators embed a structured conversational assistant in an assignment, define how the AI interacts and what evidence returns, and see students' AI interactions.
   - **Canvas Career** is a skills-first, "AI-native" product for workforce learners. It was in beta from July 2025 and became broadly available in early 2026.

**Canvas's weaknesses, which are the new entrant's openings:**
- Faculty-measured usability is only average, with the SIGITE study citing organization issues.
- Course pages look inconsistent across instructors.
- Notifications are noisy.
- AI features arrive as a bolt-on "suite."
- The April–May 2026 breach:
  - ShinyHunters claimed 3.65 TB of data covering roughly 275 million users across about 8,809 schools.
  - Instructure said passwords, birth dates, government IDs and financial data were not involved.
  - A May 7 defacement took Canvas offline.
  - Inside Higher Ed reported that Instructure paid a ransom. Instructure said the data was returned and copies destroyed.
  - Reed Smith described it as Instructure's second compromise by the same group in about eight months.
  - Security, transparency and "single point of failure" resilience are now purchasing criteria, not back-office details.

### Competitor snapshot

| Platform | What users tend to value | Common complaints / risks | 2025–26 status |
|---|---|---|---|
| **D2L Brightspace** | Strong usability gains; Phil Hill says it became "fully competitive with Instructure Canvas… in terms of general system usability and intuitive design"; competency tools; corporate push | Deep configuration can overwhelm; older-looking areas | Lumi Tutor, Study Support, Insights, Chat and Feedback shipped at Fusion 2025; Createspace authoring (limited availability Aug 2026, general availability planned Dec 2026); Lumi Remix (Fusion, July 9, 2026) |
| **Blackboard (formerly Anthology)** | Ultra modernized the UI; AI Design Assistant was adopted early, with 300+ institutions per Phil Hill in 2024 | Migration pain from Original to Ultra; institutional churn | Chapter 11 filed Sept 29, 2025. Plan effective Feb 27, 2026, eliminating about $1.6B of debt; about $70M new financing; rebranded "Blackboard"; co-founder Matthew Pittinsky expected to return as CEO |
| **Moodle** | Open source, flexible, global, cheap to host | Inconsistent UX that depends on theme and plugins; admin burden | Dominant outside North America; slow share decline |
| **Google Classroom** | Simplicity, Google Workspace integration, free | Shallow course structure for higher ed and corporate use | Gemini "Guided Learning" launched Aug 2025 as a tutoring mode |
| **Workday Learning + Sana** | HRIS-native data; Sana's AI-native search, agents and content generation | Josh Bersin (Sept 2025): Sana gives Workday "a badly-needed upgrade to its learning solution" | Acquisition closed Nov 4, 2025 (about $1.0–1.1B); Sana Learn positioned as an "end-to-end AI-native learning platform" |
| **SAP SuccessFactors Learning** | Compliance depth, enterprise scale | Admin-heavy UI | "Strategic Challenger" in Fosway 2025 9-Grid |
| **Docebo, Cornerstone, Absorb, TalentLMS, 360Learning** | Automation, catalogs, compliance tracking; 360Learning's collaborative authoring | Admin-oriented UIs; learners experience them as "a catalog, not a course" | All marketing AI heavily; Fosway warns delivered AI lags marketing |
| **Articulate Rise/Storyline** | Beautiful block-based responsive authoring; AI Assistant drafts whole courses; Storyline Accessibility Checker | Maestro Learning's review: AI "doesn't use Bloom's Taxonomy or other learning models"; don't rely on AI imagery or instructional content | Q4 2025: AI captions, image generation, Manage Blocks, Quick Share |
| **Creator platforms (Kajabi, Thinkific, Teachable, LearnWorlds)** | Marketing and commerce, fast setup, attractive templates | Weak pedagogy and assessment; limited accessibility and standards | Useful benchmarks for storefront and onboarding polish |

---

## 4. AI-Native LMS and AI-Assisted Authoring

### The learning evidence the UI must respect

- **Guardrails decide whether AI helps or harms.**
  - Bastani et al. (PNAS, June 2025) gave nearly a thousand high-school students either "GPT Base" (a ChatGPT-like interface) or "GPT Tutor" (prompts designed to safeguard learning).
  - AI access improved practice performance, with GPT Tutor showing roughly 127% gains on practice problems.
  - Students relying on the unguarded tool underperformed once access was removed.
  - Safeguards, "especially asking the AI tutor to provide teacher-designed hints instead of giving away answers," mitigated the harm.
- **Pedagogically engineered tutors can outperform strong baselines.**
  - Kestin et al. (Scientific Reports, June 2025) ran an RCT with 194 Harvard intro-physics students. Students "learn significantly more in less time" with a custom AI tutor than in an active-learning class, and "feel more engaged and more motivated."
  - The tutor was given correct solutions (limiting hallucination), kept responses short, and followed research-based scaffolding.
  - Caveat: this was one course at one elite institution, the author designed the tutor, and the outcome was short-term. The authors themselves say they cannot presume the result generalizes to higher-order synthesis tasks.
- **Consumer AI has converged on "study modes."**
  - ChatGPT Study Mode launched in July 2025.
  - Gemini Guided Learning launched Aug 6, 2025.
  - Claude's "Learning" style launched in Claude for Education in April 2025 and was extended to all users on Aug 14, 2025.
  - The common weak point is that answer-giving mode is one toggle away. An LMS can do better through *course-level policy*, meaning the instructor sets the tutor's mode per activity.

### Leading examples and the UI patterns they establish

| Product | Pattern | Lesson for the new LMS |
|---|---|---|
| **Articulate Rise AI course drafts** | Staged wizard: describe or upload sources → AI proposes **course details** (duration, topic, tone, audience, goals, objectives) → **outline** → choose "text and interactive" vs "text only" → draft. There are inline "Edit with AI" controls at each stage, a **"Reasoning"** link explaining the recommended format, and thumbs up/down feedback. | Show the plan before the product. Human checkpoints at objectives and outline are the most efficient place to intervene. |
| **Instructure IgniteAI / LLM-Enabled Assignment** | The educator defines AI behavior, objectives and evidence returned. Students converse in-LMS, and teachers see the interactions. The agent uses MCP to act across Canvas APIs. | Frame the AI activity as an *assignment type* with a teacher-authored spec, plus a transcript for the teacher. |
| **D2L Lumi** | Course-grounded tutor (chat, quizzes, flashcards, study plans), post-quiz study suggestions, rubric-based draft feedback "Instructors stay in control and can edit," and outcome-alignment suggestions. | Embed AI at moments in the workflow (after a quiz, while grading) rather than only in a chat box. |
| **ChatGPT / Claude / Gemini study modes** | Socratic questioning, hints, check-for-understanding. | Make this the default tutor persona. |

### Human-AI interaction principles to encode

**Microsoft's Guidelines for Human-AI Interaction** (Amershi et al., CHI 2019) set out 18 guidelines. They were validated with 49 design practitioners testing 20 AI products. The most relevant ones for an LMS are:
- G1 "Make clear what the system can do."
- G2 "Make clear how well the system can do what it can do."
- G9 "Support efficient correction. Make it easy to edit, refine, or recover when the AI system is wrong."
- G10 "Scope services when in doubt."
- G11 "Make clear why the system did what it did."
- G15 "Encourage granular feedback."
- G17 "Provide global controls."
- G18 "Notify users about changes."

**Google PAIR's People + AI Guidebook** has six chapters: User Needs + Defining Success, Data Collection + Evaluation, Mental Models, Explainability + Trust, Feedback + Control, and Errors + Graceful Failure. Two points matter most here:
- "Help users calibrate their trust… the user shouldn't trust the system completely."
- A warning against "AI magic" messaging, which "can establish mental models that overestimate what the product can actually do."

**Nielsen Norman Group** makes four relevant arguments:
- *AI chatbots discourage error checking* (May 2025): "today's LLMs encourage users to take outputs at face value," and most tools "fail in this responsibility" of helping users catch errors.
- *AI hallucinations* (Feb 2025): recommends source links, confidence cues and contextual warnings rather than a generic small-font disclaimer.
- *Generative UI* (Mar 2024): interfaces "dynamically generated in real time by artificial intelligence." NN/G presents this explicitly as an anticipated direction with an unclear timeline, not a settled practice.
- *The 5 Qualities of Site-Specific AI Chatbots* (July 2026): handoff willingness, flexibility, proactivity, emotional responsiveness and transparency.

**Resulting pattern library for the LMS:**
1. **Plan → Draft → Review → Publish** as a visible pipeline, with AI output always landing as a *draft* and never auto-published to learners.
2. **Provenance on every block.** Each block carries a label such as "AI-drafted from *Week3_slides.pdf*, p. 4–7" or "Edited by instructor" or "Human-authored," with a source link and a diff view.
3. **Granular regenerate/refine** at block, section and course level (G9, G15), with version history and one-click revert.
4. **Explain-why popovers** ("Why this quiz item?" → shows the outcome and source passage) (G11).
5. **Capability and limits disclosure** at first use and in settings (G1, G2), in plain language.
6. **Global AI controls** by institution, course and learner (G17): tutor mode, allowed tools, data retention and model region.
7. **Co-pilot, not autopilot.** Agentic actions (bulk date shifts, re-aligning rubrics, messaging at-risk learners) are shown as a *proposed change set* that the instructor approves.

### Ethical and pedagogical guardrails

- **Academic integrity.** Design assessments for the AI era: process-visible assignments, AI-use declarations and oral or reflective components. Tutor transcripts should be visible to instructors under a clear policy.
- **Hallucination.** Ground generation in instructor-supplied sources and show citations. The Harvard tutor's use of supplied solutions is the model to follow. Flag low-confidence items for review.
- **Bias.** Mitigate social biases (HAX G6). Run bias and representation checks on generated examples, names and images.
- **Over-automation.** Fosway notes that task automation is reshaping instructional-design roles. Keep the human reviewer accountable and measure review depth, not just speed.
- **Privacy and security.** Follow FERPA (U.S. higher ed) and GDPR (EU and corporate) obligations. Provide no-training-on-customer-data commitments, data-residency options and admin-visible AI logs. The Canvas incident shows that messages between students and teachers are highly sensitive data.
- **Accessibility of AI output.** The DOJ reportedly flagged AI-generated content as an accessibility risk, so the generator must produce headings, alt text, captions and sufficient contrast by default.

---

## 5. Learner Personas and Personalization

### What to personalize, and what not to

- **Do not personalize by "learning style."**
  - Pashler et al. (2008) found "virtually no evidence" for the crossover interaction needed to validate style-matching.
  - A 2024 meta-analysis (Clinton-Lisell & Litzinger, 21 studies, 1,712 participants) found a small overall effect (g = 0.31). Only 26% of outcome measures showed the crossover pattern the meshing hypothesis requires, so the authors' evidence remains weak for the core claim.
  - Melzner & Kappes (Instructional Science, 2024, N = 222) found no support.
  - *The contested nuance:* offering multiple formats is good UDL practice. *Assigning* learners to one format based on a style quiz is not supported.
- **Do personalize on variables that matter:**
  - prior knowledge (diagnostic pre-checks, placement out of mastered content)
  - goals and motivation (degree, promotion, certification, compliance deadline)
  - time available and pacing
  - language and reading level
  - accessibility needs
  - device and bandwidth
  - role or job context (corporate)

### Persona-to-interface mapping

| Persona | Primary need | Interface expression |
|---|---|---|
| Traditional undergrad | Juggle multiple courses and deadlines | Cross-course "This week" list, calendar, mobile push digests, study-group entry points |
| Graduate / professional-degree | Depth, autonomy, research | Compact density, reading-heavy lesson player, citation export, fewer nudges |
| Adult / working learner | Fit learning into fragments of time | Time-boxed "15-minute sessions," resume-where-you-left-off, flexible deadlines view, evening/weekend reminders |
| Corporate compliance | Finish correctly and fast; proof of completion | Test-out option (place out via assessment), clear due date and certificate, minimal gamification, audit trail |
| Corporate upskilling | Skills tied to role and career | Skills profile, role-based paths, manager visibility (opt-in), "ask the knowledge base" |
| Certification candidate | Exam readiness | Blueprint-aligned mastery map, spaced review queue, timed practice exams |
| Neurodivergent learners | Reduced distraction, predictability | Focus mode, reduced motion, chunk timers, explicit task checklists, consistent layouts |
| ESL / multilingual | Comprehension | Interface and content translation (Canvas and D2L both now offer AI translation), glossaries, plain-language toggle, bilingual side-by-side |
| Mobile-first / low-bandwidth | Access anywhere | Offline downloads, audio-only and text-only modes, lightweight pages, SMS/WhatsApp-style nudges |
| Accessibility needs | Equal access | Screen-reader-first components, captions and transcripts everywhere, keyboard paths, user-controlled text size and contrast |

### How the interface should express customization

1. **Onboarding "learning profile."** Ask about goals, weekly time budget, language, accessibility preferences, device and notification style. Profiles should be editable at any time and never forced.
2. **Presets, not a hundred settings.** Offer persona presets ("Busy professional," "Exam prep," "Focus & low-distraction," "Low bandwidth") that set density, pacing, reminder cadence and format defaults.
3. **Tone and difficulty controls on the AI tutor**, bounded by instructor policy.
4. **Transparent adaptivity.** When the system adapts a path, say why ("Skipped Module 2 because you scored 92% on the pre-check; undo") (HAX G11, G16).

**Evidence caveat:** Rigorous evidence on *interface-level* persona customization (as opposed to adaptive sequencing) is thin. Personalization features should be A/B tested against learning outcomes, not just engagement.

---

## 6. Modern Product and UI Inspiration Beyond LMSs

The following benchmarks come from design practice rather than peer-reviewed research. They are widely cited as models for calm, focused, AI-native interfaces.

| Product | Pattern worth borrowing | Ed-tech application |
|---|---|---|
| **Notion** | Block-based editor; slash commands; inline AI on selection | Course authoring as blocks (Rise already proves the model); "/quiz," "/reflection," "/case" commands |
| **Linear** | Speed, keyboard-first, command palette (⌘K), restrained color, opinionated workflows | Instructor command palette ("Extend deadline for Section B," "Open SpeedGrader for Essay 2"); calm triage views |
| **Figma** | Multiplayer presence, comments pinned to objects, component libraries | Co-authoring with presence; reviewer comments pinned to blocks; shared institutional block libraries |
| **Duolingo** | Streaks, tiny sessions, immediate feedback, spaced review | Review queue and daily goals, *used selectively* (right for upskilling and language, wrong for compliance) |
| **Claude / ChatGPT / Gemini** | Conversational canvas + side-by-side artifact; study/learning modes | Tutor side panel with artifacts (worked examples, diagrams) and a course-grounded knowledge scope |
| **Perplexity** | Answers with inline citations | Every tutor answer cites the course source passage |
| **Cursor** | AI proposals shown as diffs to accept or reject | Author reviews AI edits as tracked changes |

**Adoption signals in ed-tech:** Block-based authoring (Rise, D2L Createspace), side-panel assistants (Lumi, IgniteAI), agentic actions via MCP (IgniteAI Agent) and study modes (all major labs) are already shipping. Generative UI remains mostly aspirational, per NN/G's own framing.

---

## 7. Synthesis: Design Guidance for the New AI-Native LMS

### (a) Learner experience

- **Dashboard ("Today"):** a single prioritized list across all courses (due items, review-queue cards, instructor messages); a weekly time budget against planned work; progress by competency; persona presets control density and nudges.
- **Course home:** instructor welcome (presence); a "Start/Resume" primary button; a module map with time estimates and completion; outcomes visible; template enforced by institution or program.
- **Module/lesson player:** focus mode with a single column; progress rail; embedded retrieval checks every few minutes; format switcher (video / transcript / audio / plain language); tutor in a collapsible side panel, hint-first and course-grounded, with citations.
- **Assessments:** low-stakes checks everywhere; clear policies (AI allowed? attempts? timing?); accommodations applied automatically from the profile; test-out for corporate learners.
- **Feedback:** rubric-anchored, inline on the artifact; AI-drafted and instructor-approved, labeled accordingly; a "next step" link to targeted review.
- **Progress:** mastery by skill; completion certificates and credentials with a portable record; no default public leaderboards.
- **Social:** structured discussion with AI-summarized threads for instructors; peer review; cohort presence in a light-touch form.

### (b) Instructor/author experience

- **Natural-language course builder:** prompt + sources → course brief (audience, outcomes, duration, tone, persona targets) → outline → drafts. Human checkpoints at brief and outline, and a "Reasoning" view at each stage.
- **File-to-course ingestion:** accepts slides, PDFs, docs, videos (auto-transcribed), SCORM packages and existing courses; content chunked into blocks with source anchors; duplicate and outdated detection.
- **Modular content blocks:** text, media, interactive (H5P-style), knowledge check, scenario/role-play (LLM-enabled), reflection, discussion prompt, assignment. Each block has outcome tags, time estimate, accessibility status and provenance.
- **AI review/edit workflow:** tracked-changes diffs; accept or reject per block; a "review coverage" meter; a quality linter (QM/OSCQR-style alignment, accessibility, reading level, bias).
- **Persona targeting:** variants per persona (plain-language, 15-minute micro-path, compliance-only path) generated from one master and kept in sync.
- **Analytics:** outcome mastery heatmaps; item analysis; at-risk signals with *suggested* interventions that need approval; tutor-conversation insights (common misconceptions).

### (c) Admin/institution experience

- **Integrations:** LTI 1.3 / LTI Advantage; SIS (higher ed) and HRIS (Workday, SAP SuccessFactors); SSO; SCORM 1.2/2004 import, xAPI with an LRS, cmi5; open APIs plus MCP endpoints for agents.
- **Reporting:** compliance completion and audit trails (corporate); program outcome and accreditation evidence (higher ed); accessibility conformance dashboard (Title II readiness).
- **AI governance console:** model and provider choices; data residency and retention; tutor-mode policies by program; content-labeling rules; usage and cost monitoring; incident logs; opt-outs; security posture visible to customers.

### Suggested information architecture

**Global navigation (left rail, collapsible):** Today · Learn (My courses & paths) · Calendar · Inbox · Search/Ask (⌘K) · Profile & preferences.
**Instructor adds:** Create (Studio) · Grade (triage queue) · Insights.
**Admin adds:** Catalog & enrollment · Integrations · AI Governance · Reports · Templates & brand.
**Course level:** Home · Modules (spine) · Assessments · Discussions · Grades/Mastery · People · Tutor (panel, not a page).
**Principle:** Every object is reachable through the command palette and through the "Today" list. Modules remain the canonical structure that the AI edits, so AI never invents a parallel structure.

### Signature interactions (differentiators)

1. **"Plan-first" course generation** with an editable course brief and outline before any content is drafted.
2. **Provenance chips and a diff-review mode** on every AI-touched block, plus a review-coverage meter.
3. **Policy-bound Socratic tutor.** The instructor sets the mode per activity (hint-only / explain / open). The tutor cites course sources, and its transcripts are visible to the instructor.
4. **Persona variants from one master course,** kept in sync automatically.
5. **Instructor command palette and agent change-sets.** Natural-language requests like "Move Week 5 due dates by two days for Section B" produce a previewable change set.
6. **Built-in quality and accessibility linter** mapped to QM-style standards and WCAG 2.2 AA, which runs before publish.
7. **Unified "Today" across degree courses, corporate paths and review cards,** one interface for both markets.

---

## 8. Layout Concept Briefs (as built in `design/canvas/` and `docs/screens/`)

### Concept A: "Focus Lesson Player" (learner) — `LessonPlayer.dc.html`
- **Regions:** slim top bar (course, lesson, progress %, exit focus); left progress rail with chunks and time estimates; center reading column (~680px); right tutor panel.
- **Key components:** chunk cards with inline knowledge checks; format switcher; "Explain differently" and "Give me a hint," bounded by instructor policy; next-up action.
- **Interaction model:** linear, one action at a time; answering a check reveals feedback inline; tutor responds in 2–4 sentences with a citation chip.
- **Grounding:** cognitive load; retrieval practice; Harvard RCT tutor design (brevity, scaffolding); Bastani guardrails (hint-first); UDL; WCAG 2.2.

### Concept B: "Prompt-to-Course Canvas" (author) — `CourseBuilder.dc.html`
- **Regions:** left Sources panel with extraction status; center outline → block stack; right Co-author panel; bottom quality bar.
- **Key components:** Brief card; outline tree; slash-command block library; provenance chips; diff view; persona-variant tabs; publish-readiness checklist.
- **Interaction model:** Brief → Outline → Draft → Review → Publish stepper; every AI output lands as a draft; regenerate per block; version history.
- **Grounding:** Articulate's staged draft flow; HAX G1, G9, G11, G15; PAIR trust calibration; NN/G on error checking and the sparkles icon; QM alignment.

### Concept C: "Adaptive Today Dashboard" (learner) — `Main.dc.html`, `MobileToday.dc.html`
- **Regions:** greeting and weekly time ring; "Do next" priority stack; review queue; courses and paths with mastery bars; instructor presence; persona preset switcher.
- **Interaction model:** presets reconfigure density, card types and nudges; every adaptive choice carries a "why" and an undo.
- **Grounding:** USC student feedback; EDUCAUSE consistency gap; evidence-based personalization; HAX G11, G16–G17.

### Concept D: "Instructor Command Center" — `InstructorCommand.dc.html`
- **Regions:** left triage queue; center submission viewer with rubric side by side; right insights panel; global ⌘K palette.
- **Key components:** AI-drafted rubric feedback, labeled and editable; bulk actions as previewable change sets; misconception cards from tutor transcripts; nudge composer requiring approval.
- **Grounding:** Canvas SpeedGrader efficiency; D2L Lumi Feedback; IgniteAI Discussion Insights; HAX co-pilot principles.

### Concept E: "Governance & Outcomes Console" (admin) — `AdminConsole.dc.html`
- **Regions:** KPI strip; left navigation; center report canvas; right policy inspector.
- **Key components:** AI policy matrix (program × tutor mode × retention × model region); integration health; accessibility audit; simulation before apply.
- **Grounding:** Title II deadlines; FERPA/GDPR; lessons from the Canvas breach; Fosway's call for operational AI; HAX G17.

---

## Design Principles Checklist

- [ ] Modules are the single canonical course spine. AI edits it and never bypasses it.
- [ ] The next action is one click from login, and a unified "Today" list spans all courses and paths.
- [ ] Institution and program templates enforce cross-course consistency.
- [ ] Lessons are chunked with time estimates, and retrieval checks are embedded in every lesson.
- [ ] The AI tutor defaults to hints and Socratic prompts, grounded in course sources with citations. The mode is set by instructor policy.
- [ ] All AI output lands as a labeled draft with provenance, a diff and revert. A human approves it before learners see it.
- [ ] The system explains its adaptations and AI suggestions ("why") and offers undo.
- [ ] Capabilities and limits are disclosed. Avoid "AI magic" language and ambiguous sparkle-only icons.
- [ ] Personalization uses prior knowledge, goals, time, language, accessibility, device and role, never "learning styles."
- [ ] WCAG 2.2 AA holds across UI and generated content: captions, alt text, contrast, keyboard access, target size, reduced motion.
- [ ] Agentic actions appear as previewable change sets that need approval.
- [ ] A quality and alignment linter (QM/OSCQR-style) runs before publish.
- [ ] Interoperability covers LTI 1.3, SIS/HRIS, SCORM, xAPI and cmi5, plus open APIs and MCP.
- [ ] AI governance is visible: model choice, data residency, retention, logs and FERPA/GDPR controls.
- [ ] Features are measured against learning outcomes, not just engagement or authoring speed.

---

## Caveats

- **Market data differ by method.** Phil Hill (enrollment-weighted), ListEdTech (institution counts) and Edutechnica (scraping) give different Canvas shares, from about 43% to 50% or more. All are North America-centric. Moodle leads elsewhere.
- **Vendor claims are unaudited.** Articulate's "up to 9 times faster," Instructure's uptime and satisfaction figures, and vendor AI adoption numbers should be treated as marketing.
- **AI-tutor evidence is promising but narrow.** Both headline studies (Bastani in high-school math, Kestin in Harvard physics) are single-context and short-term. Neither tests corporate compliance or long-term retention.
- **LMS usability studies are small,** mostly single-institution, and consistently find no significant differences among the major LMSs.
- **Satisfaction and sentiment data (G2, Capterra, Reddit) were not systematically mined.** Validate the competitor love/hate columns with primary review analysis and user interviews.
- **Rapidly moving facts.** The Canvas breach investigation, Blackboard's leadership transition, D2L Createspace availability and IgniteAI pricing after June 30, 2026 are all in flux as of September 2026.

## Sources

1. Phil Hill — State of Higher Ed LMS Market for US and Canada, Year-End 2024 — https://onedtech.philhillaa.com/p/state-of-higher-ed-lms-market-for-us-and-canada-year-end-2024-edition
2. ListEdTech — LMS HED, Instructure — https://compass.listedtech.com/zp81q-hed-xt3m-inst-a9wbl-k0y6d/
3. ListEdTech — LMS Market Share — https://listedtech.com/blog/lms-market-share/
4. Reed Smith — Canvas/Instructure cyberattack — https://www.reedsmith.com/articles/canvasinstructure-cyberattack-key-developments-and-action-items-for-higher-education-institutions/
5. Wikipedia — 2026 Canvas data breach — https://en.wikipedia.org/wiki/2026_Canvas_data_breach
6. Inside Higher Ed — Instructure Pays Ransom to Canvas Hackers — https://www.insidehighered.com/news/tech-innovation/administrative-tech/2026/05/11/instructure-pays-ransom-canvas-hackers
7. Instructure — Security Incident Update & FAQs — https://www.instructure.com/incident_update
8. Phil Hill — D2L Fusion Conference Notes 2025 — https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2025
9. Phil Hill — D2L Fusion 24 Conference Notes — https://onedtech.philhillaa.com/p/d2l-fusion-24-conference-notes
10. Phil Hill — Observations on the Higher Education LMS Market — https://onedtech.philhillaa.com/p/observations-on-higher-ed-lms-market
11. Hechinger Report — An AI tutor helped Harvard students learn more physics in less time — https://hechingerreport.org/proof-points-ai-tutor-harvard-physics/
12. Kestin et al., Scientific Reports 2025 — AI tutoring outperforms in-class active learning — https://www.nature.com/articles/s41598-025-97652-6
13. ETC Journal — Review of Kestin et al. — https://etcjournal.com/2025/11/10/review-of-kestin-et-al-s-june-2025-harvard-study-on-ai-tutoring/
14. Bastani et al., PNAS 2025 — Generative AI without guardrails can harm learning — https://www.pnas.org/doi/10.1073/pnas.2422633122
15. Bastani et al., SSRN preprint — https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4895486
16. Articulate — AI Assistant in Rise 360: AI Course Drafts — https://www.articulatesupport.com/article/AI-Assistant-in-Rise-360-AI-Course-Drafts
17. Articulate — Rise 360: Create Content with AI Assistant — https://www.articulatesupport.com/article/Rise-360-Create-Content-with-AI-Assistant
18. Articulate — Newest Feature Releases Q4 2025 — https://www.articulate.com/blog/articulate-360s-newest-feature-releases-q4-2025/
19. Articulate — New Features and Updates Q2 2025 — https://www.articulate.com/blog/announcing-new-features-and-updates-q2-2025/
20. Maestro Learning — Articulate Rise 360 AI review — https://maestrolearning.com/blogs/articulate-rise-360-ai/
21. D2L — Product Highlights From Fusion 2025 — https://www.d2l.com/blog/product-highlights-from-fusion-2025/
22. D2L — New Lumi features — https://www.d2l.com/newsroom/new-d2l-lumi-features-enhance-personalized-learning-and-language-capabilities/
23. D2L via PR Newswire — Fusion 2026 announcements — https://www.prnewswire.com/news-releases/d2l-announces-new-ai-enhanced-content-creation-and-personalized-learning-at-fusion-2026-302822234.html
24. ListEdTech — D2L Fusion 2025 takeaways — https://listedtech.com/blog/d2l-fusion-2025/
25. Instructure — IgniteAI and ecosystem updates — https://www.instructure.com/press-release/instructure-delivers-safe-simple-ai-promise-igniteai-and-major-ecosystem-updates
26. Instructure — InstructureCon 2025 announcements — https://www.instructure.com/resources/blog/instructurecon-2025-partner-product-announcements
27. Instructure — OpenAI partnership — https://www.instructure.com/press-release/instructure-and-openai-announce-global-partnership-embed-ai-learning-experiences
28. Government Technology — Instructure partners with OpenAI — https://www.govtech.com/education/instructure-partners-with-openai-launches-embedded-ai-features
29. Instructure — Canvas Career launch — https://www.instructure.com/press-release/instructure-launches-canvas-career-skills-first-ai-powered-learning-experience
30. Instructure — Canvas Career broad availability — https://www.instructure.com/press-release/instructure-advances-skills-first-workforce-learning-broad-availability-canvas-career
31. Instructure — Canvas LMS v. the Competition — https://www.instructure.com/resources/blog/canvas-lms-v-competition-why-higher-ed-chooses-canvas
32. Wikipedia — Instructure — https://en.wikipedia.org/wiki/Instructure
33. Jeanne Beatrix Law — EDUCAUSE 2025 Students and Technology — https://jeannebealaw.substack.com/p/the-educause-2025-students-and-technology
34. EDUCAUSE — USC's Student-Centered LMS Transformation — https://events.educause.edu/annual-conference/2025/agenda/from-feedback-to-functionality-uscs-student-centered-lms-transformation
35. Oregon State — QM Rubric 7th Edition: What's New — https://blogs.oregonstate.edu/inspire/2023/07/10/quality-matters-rubric-7th-edition-whats-new/
36. Quality Matters — Higher Ed Rubric — https://www.qualitymatters.org/qa-resources/rubric-standards/higher-ed-rubric
37. FGCU — QM Rubric 7th Edition changes — https://www.fgcu.edu/digitallearning/digital-learning-blog/2023-10-27-qm-7thed-rubric
38. MeasuringU — Measuring Usability with the SUS — https://measuringu.com/sus/
39. Abdulquadir et al., SIGITE '23 — Usability Study of an LMS — https://dl.acm.org/doi/fullHtml/10.1145/3585059.3611415
40. JISI 2024 — SUS Evaluations in Online Learning Platform — https://journal-isi.org/index.php/isi/article/view/750
41. Gumasing et al., ICIEA 2022 — Blackboard vs Canvas — https://dl.acm.org/doi/fullHtml/10.1145/3523132.3523137
42. IEEE 2023 — Blackboard, Google Classroom and Canvas — https://ieeexplore.ieee.org/document/10111426
43. Vlachogianni & Tselios — SUS systematic review — https://eric.ed.gov/?id=EJ1365411
44. Microsoft — Guidelines for Human-AI Interaction — https://www.microsoft.com/en-us/research/wp-content/uploads/2019/01/Guidelines-for-Human-AI-Interaction-camera-ready.pdf
45. Google PAIR — People + AI Guidebook — https://medium.com/google-design/people-ai-guidebook-41ec2ee5ec3f
46. Google PAIR — Explainability + Trust — https://pair.withgoogle.com/chapter/explainability-trust/
47. Google PAIR — Mental Models — https://pair.withgoogle.com/chapter/mental-models/
48. NN/G — The Proliferation and Problem of the Sparkles Icon — https://www.nngroup.com/articles/ai-sparkles-icon-problem/
49. NN/G — AI Chatbots Discourage Error Checking — https://www.nngroup.com/articles/ai-chatbots-discourage-error-checking/
50. NN/G — AI Hallucinations — https://www.nngroup.com/articles/ai-hallucinations/
51. NN/G — Generative UI and Outcome-Oriented Design — https://www.nngroup.com/articles/generative-ui/
52. NN/G — AI topic index — https://www.nngroup.com/topic/ai/
53. UPCEA — DOJ Extends Accessibility Deadline — https://upcea.edu/doj-extends-accessibility-deadline-to-april-2027-policy-matters-april-2026/
54. accessiBe — Title II deadline extended — https://accessibe.com/accessibility-platform/reports/title-ii-higher-education/title-ii-deadline-extend-higher-ed
55. Davis Polk — Anthology chapter 11 restructuring — https://www.davispolk.com/experience/anthology-chapter-11-restructuring
56. Campus Technology — Anthology Rebrands as Blackboard — https://campustechnology.com/articles/2026/03/03/anthology-rebrands-as-blackboard-following-financial-restructuring.aspx
57. Yahoo Finance — Blackboard emerges debt-free — https://finance.yahoo.com/news/blackboard-formerly-anthology-emerges-debt-140000617.html
58. Workday — Completes Acquisition of Sana — https://newsroom.workday.com/2025-11-04-Workday-Completes-Acquisition-of-Sana
59. Workday — Definitive Agreement to Acquire Sana — https://investor.workday.com/news-and-events/press-releases/news-details/2025/Workday-Signs-Definitive-Agreement-to-Acquire-Sana-09-16-2025/default.aspx
60. SEC — Workday 10-Q FY2025 — https://www.sec.gov/Archives/edgar/data/1327811/000132781125000198/wday-20251031.htm
61. SAP — Strategic Challenger, 2025 Fosway 9-Grid — https://news.sap.com/2025/03/sap-strategic-challenger-2025-fosway-9-grid-learning-systems/
62. Fosway — 9-Grid for Learning Systems — https://www.fosway.com/9-grid-2/learning-systems/
63. Learning News — 2025 Fosway 9-Grid for Learning Systems — https://learningnews.com/news/fosway/2025/2025-fosway-9-grid-for-learning-systems
64. Learning News — 2025 Fosway 9-Grid for Digital Learning — https://learningnews.com/news/fosway/2025/2025-fosway-9-grid-for-digital-learning
65. TechCrunch — Gemini Guided Learning — https://techcrunch.com/2025/08/06/google-takes-on-chatgpts-study-mode-with-new-guided-learning-tool-in-gemini/
66. WinBuzzer — Claude Learning Modes — https://winbuzzer.com/2025/08/14/anthropic-launches-learning-modes-for-claude-catching-up-with-chatgpt-and-google-gemini-xcxwbn/
67. Glasp — AI Study Modes compared — https://glasp.co/articles/ai-study-modes-compared
68. Pashler et al. — Learning Styles: Concepts and Evidence — https://pubmed.ncbi.nlm.nih.gov/26162104/
69. Clinton-Lisell & Litzinger 2024 — Frontiers in Psychology meta-analysis — https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1428732/epub
70. Melzner & Kappes 2024 — Testing the meshing hypothesis — https://www.researchgate.net/publication/386048451_Testing_the_meshing_hypothesis_in_prospective_teachers_Are_there_effects_of_matching_learning_style_and_presentation_mode_on_learning_performance_and_on_metacognitive_aspects_of_learning
71. Cubite — LMS Market Share 2026 — https://cubite.io/blogs/lms-market-share-2026
72. HigherEdJobs — Emerging Trends in University LMSs — https://www.higheredjobs.com/Articles/articleDisplay.cfm?ID=3570

# Research findings: an AI instructional-design partner for Tessera

Research compiled 2026-09-28 for the "AI instructional design partner" feature (syllabus upload -> deep instructional analysis -> multiple course-structure proposals -> faculty pick/combine -> provisioned modules with starter content). The brief's central constraint: it must feel like collaborating with a skilled academic instructional designer, not a course generator, and must never imply that faculty can rely on the AI alone.

Sources are 2019-2026 where possible, favouring peer-reviewed HCI/ed-tech research, EDUCAUSE, university CTL guidance, and reputable practitioner writing. Each claim links to its source. Where a source could not be fetched directly (ResearchGate/ACM paywalls returned 403/429), the citation points to the abstract page or a secondary summary and is marked as such.

---

## 0. Executive design principles (the short version)

1. **Consult before you generate.** Human IDs open with an intake conversation about goals, learners, and teaching philosophy, not with a deliverable. The AI partner should do the same: the first output after upload is a set of *questions and observations grounded in the syllabus*, not a course.
2. **Faculty are the instructor of record; the AI is process expertise.** The research consistently shows faculty keep final approval rights and resent anyone who steps into content or pedagogy uninvited (Halupa 2019; Chen & Carliner 2024; Mueller et al. 2022). Frame every suggestion as a design option with a rationale, never a verdict.
3. **Options, not answers; rationale, not authority.** Present 2-4 structural approaches with trade-offs and the syllabus evidence behind each. This is both what IDs do (alignment mapping, backward design) and what human-AI guidelines recommend (Amershi G11 "make clear why"; PAIR "n-best alternatives").
4. **Every AI claim points at syllabus text.** Provenance to source spans is the single strongest countermeasure to the "hallucinated objective / wrong week count" failure class, and it is what faculty verification behaviour actually demands (Frontiers 2026 study: teachers escalate to "objectivity-as-process", i.e. traceability).
5. **Staged commitment with real friction at the right points.** Draft -> review -> accept, with a change-set preview before provisioning and one-click undo after. Add cognitive forcing (e.g., faculty confirm or edit objectives *before* seeing the AI's proposed structure) where overreliance is most costly (Buçinca et al. 2021).
6. **Calibrate trust, do not maximise it.** Show what was extracted with confidence, what was inferred, and what is missing; ask targeted follow-ups for gaps instead of filling them silently (HAX G2, G10; PAIR "calibrate trust"; Lee et al. 2025 on confidence effects).
7. **Own the governance story up front.** Faculty IP over materials, no training on uploads, no student data, accessible output by default (WCAG 2.1 AA), and an institutional-policy hook. The ASU "Atom" backlash (April 2026) shows exactly what happens when these are absent.

---

## 1. How human instructional designers actually work with faculty

### 1.1 The consultation process

University consultation guides follow an ADDIE-shaped arc: a pre-meeting questionnaire and syllabus review, a ~1-hour initial meeting, a design phase of 4-6 meetings over 4-12 weeks, a development phase where the ID shifts to feedback and review, and a formal review against a rubric ([Texas A&M System, Instructional Design Consultation Guide v1.2, 2017](https://www.tamus.edu/academic/wp-content/uploads/sites/24/2017/07/Instructional-Design-Consultation-Guide-v1.2.pdf)). The same guide is explicit that the ID role *changes* over time: from direct questioning in analysis/design to "feedback and course review" in development. That arc is a good template for the AI partner's modes (intake -> propose -> provision -> review/enrich).

The dominant design frame in CTL guidance is backward design: (1) identify desired results, (2) determine acceptable evidence, (3) plan learning experiences; "instead of starting with the content to be covered, the textbook to be used, or even the test to be passed, you begin with the goals" ([MIT Teaching + Learning Lab, Backward Design](https://tll.mit.edu/teaching-resources/course-design/backward-design/)). The practical artefact IDs use to operationalise this is the course alignment matrix, which maps course- and module-level objectives to assessments and instructional materials so there is "a clear path to alignment" ([Quality Matters, Benefits of a Course Alignment Matrix, 2016](https://www.qualitymatters.org/qa-resources/resource-center/conference-presentations/benefits-course-alignment-matrix-avoid-0)). QM's Bridge to Quality guide is the practitioner reference for the standards the matrix supports ([Quality Matters, Bridge to Quality](https://www.qualitymatters.org/higher-ed-bridge-guide-basic)).

**Implication:** the AI partner's "deep instructional analysis" should *produce* an alignment matrix from the syllabus (objectives x assessments x weekly topics), and its structural proposals should be expressed as alternative ways to resolve gaps in that matrix. That is recognisably what an academic ID does, and it is legible to faculty who have worked with QM or a CTL.

### 1.2 What IDs ask in a kickoff

From the Texas A&M consultation guide (the most detailed public question bank found), the initial meeting covers ([TAMUS Guide, 2017](https://www.tamus.edu/academic/wp-content/uploads/sites/24/2017/07/Instructional-Design-Consultation-Guide-v1.2.pdf)):

- *Prior experience and philosophy:* "What is your teaching style?" "Describe successful and unsuccessful teaching experiences."
- *Goals for the process:* "What would you like to get out of this design process?" "How do you define a quality online course?" "How will you measure success?" "How do you envision us working together?"
- *Course goals:* "What are the goals for learners taking this course?" "How does your course relate to the program curriculum?"
- *Learners and context:* prior knowledge, motivation, characteristics, access to prior academic information.
- *Next steps:* define roles, milestones, timeline; follow with a written summary email of agreed goals and analysis findings.

The design-phase questions then go module by module: 3-5 key objectives, why they matter, where learners will apply them, which Bloom's verb fits, how content is sequenced, how assessment aligns and when it happens (formative vs summative), what the instructor and the students will *do*, and how feedback flows.

**Translation to the AI partner (what to ask, when, how):**

| Stage | Human ID practice | AI partner behaviour |
|---|---|---|
| Before first output | Reads syllabus, prepares questions | Extract + analyse silently; surface *only* what needs the faculty member's judgement |
| Kickoff | Asks about philosophy, goals, learners, success criteria | 3-6 questions, each anchored to something in the syllabus ("Your syllabus lists 14 weeks but the schedule shows 13 topics; is Week 8 an exam or a break?"), plus one open question about teaching philosophy and what they want from the redesign |
| Design | Proposes sequences and alignment, explains trade-offs | 2-4 structure options, each with rationale, evidence (syllabus spans), and what it would change |
| Development | Shifts to feedback/review | Provision skeleton + starter content flagged as draft; per-item accept/edit/reject |
| Review | Rubric-based check | Alignment and accessibility checks with explanations, never silent rewrites |

Never open with "Here is your course." Open with "Here is what I understood, and here is what I need from you."

### 1.3 What faculty value and resent

The empirical literature is unusually consistent:

- **Faculty see themselves as the primary creators; IDs as expertise-on-call.** In interviews with 15 instructors, faculty "consistently viewed themselves as the primary creators of courses," valued "the expertise provided by instructional designers in helping instructors achieve their goals," preferred targeted help over comprehensive redesign, and retained "final approval rights." The authors argue most ID-faculty relationships are better described as *consultative* than collaborative ([Carliner & Chen, "Instructional Design: A Collaboration or A Consultation?", JAID, 2024](https://edtecharchives.org/journal/723/13045)). Their earlier integrative review coined the "special SME" framing for faculty ([Chen & Carliner, Performance Improvement Quarterly, 2021](https://onlinelibrary.wiley.com/doi/abs/10.1002/piq.21339)).
- **Content is "the primary combat zone."** Faculty perceive design processes as too time-intensive, resist teaching differently, and see quality standards as "an 'impingement' on academic freedom"; IDs' number-one obstacle is lack of faculty buy-in, and conflict arises when "designers overstep into content decisions." Recommended remedies: explicit written roles, a course development guide, a warm initial contact, structured initial meetings, advance planning and firm deadlines ([Halupa, International Journal of Higher Education, 2019](https://files.eric.ed.gov/fulltext/EJ1203205.pdf)).
- **Eight conflict types collapse into three themes:** design/development disagreements (process, delivery, assessment, tools); philosophical/pedagogical/autonomy-loss conflicts ("perceived threats to faculty autonomy"); and communication/scheduling ([Mueller, Richardson, Watson & Watson, TechTrends, 2022](https://link.springer.com/article/10.1007/s11528-022-00694-0)).
- **Successful collaborations** rest on clear division of labour, regular communication, defined scope, trust and rapport, and both sides understanding what an ID does; barriers were "understanding the role of an instructional designer, trust and rapport" and insufficient buy-in ([Richardson et al., ETR&D, 2019](https://link.springer.com/article/10.1007/s11423-018-9636-4); abstract at [ERIC EJ1221418](https://eric.ed.gov/?id=EJ1221418)).
- **Faculty-ID partnerships are increasingly reframed around pedagogy, not tools** ([Oregon State Ecampus, "It Takes Two", 2022](https://blogs.oregonstate.edu/inspire/2022/01/31/it-takes-two-fostering-collaborative-faculty-instructional-designer-relationships-for-student-centered-learning/); [ASU, "The ASU Instructional Designer: Building Effective Relationships", 2025](https://teachonline.asu.edu/index.php/2025/04/the-asu-instructional-designer-building-effective-relationships)).

**Design consequences:**

- The AI must have *explicit, visible role boundaries*: it structures, aligns, sequences, drafts scaffolding, and checks quality; it does not decide what is true in the discipline or what the instructor's philosophy should be. Put this in the UI (a persistent "how we work together" statement), not just in marketing.
- Suggestions about content should be phrased as questions or optional drafts, never as corrections ("You might consider a formative check before the midterm because X" rather than "Your assessment plan is unbalanced").
- Respect time: faculty resent processes that feel slow and bureaucratic. Front-load the value (a useful analysis in minutes) and keep the question burden low, with "skip for now" always available.
- Always show the faculty member as the author. The provisioned course must carry their voice and their decisions; AI-drafted items should be visibly marked as drafts until accepted.

---

## 2. Human-in-the-loop and mixed-initiative UX patterns

### 2.1 Foundational guidelines

**Amershi et al., "Guidelines for Human-AI Interaction" (CHI 2019) / Microsoft HAX Toolkit.** Eighteen guidelines validated across 20 AI products ([paper PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2019/01/Guidelines-for-Human-AI-Interaction-camera-ready.pdf); [HAX Toolkit](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/)). The ones that bind most on this feature:

- G1/G2: make clear what the system can do and *how well* (set expectations that extraction may be incomplete and that proposals are options).
- G7/G8/G9: efficient invocation, dismissal, and correction (every suggestion is one click to accept, dismiss, or edit inline).
- G10: scope services when in doubt (when the syllabus is ambiguous, ask or offer a narrower service rather than guessing).
- G11: make clear why the system did what it did (rationale on every proposal).
- G16: convey consequences of user actions (change-set preview before provisioning).
- G17: provide global controls (turn off starter-content generation, set generation depth, choose which sections the AI may touch).

**Horvitz, "Principles of Mixed-Initiative User Interfaces" (CHI 1999).** Still the clearest statement of the design problem: consider uncertainty about the user's goals, *employ dialog to resolve key uncertainties*, minimise the cost of poor guesses, scope the precision of the service to the uncertainty, allow efficient invocation and termination, and provide "mechanisms for efficient agent-user collaboration to refine results" ([Horvitz, CHI 1999](https://erichorvitz.com/chi99horvitz.pdf); [Microsoft Research page](https://www.microsoft.com/en-us/research/publication/principles-mixed-initiative-user-interfaces/)). Directly applicable: the AI should ask targeted questions when the expected value of asking exceeds the cost of a wrong guess (missing week count, unclear grading weights), and otherwise proceed with a clearly labelled assumption.

**Google PAIR People + AI Guidebook.** Users "shouldn't implicitly trust your AI system in all circumstances, but rather calibrate their trust correctly." Show confidence via categorical labels, *n-best alternatives*, or numeric values with caution; explain specific outputs, articulate data sources "to prevent privacy surprises," scale explanation depth to stakes, and build trust progressively through onboarding and in-product guidance ([PAIR, Explainability + Trust](https://pair.withgoogle.com/guidebook-v2/chapter/explainability-trust/); [Mental Models](https://pair.withgoogle.com/guidebook-v2/chapter/mental-models/); [Patterns](https://pair.withgoogle.com/guidebook-v2/patterns)). "N-best alternatives" is essentially the "several course-structure approaches" pattern in the brief.

**Shneiderman, Human-Centered AI.** The core reframing is a two-dimensional space where high human control and high automation are compatible, not a trade-off; the goal is "reliable, safe and trustworthy" systems that amplify human abilities rather than replace them ([Shneiderman, IJHCI 2020 / arXiv](https://arxiv.org/abs/2002.04087); [Human-Centered AI, OUP 2022](https://global.oup.com/academic/product/human-centered-ai-9780192845290)). For Tessera: high automation in extraction, alignment checking, and drafting; high human control over objectives, structure choice, and every provisioned item.

### 2.2 Interaction patterns worth adopting (with evidence or precedent)

| Pattern | What it looks like here | Backing |
|---|---|---|
| AI asks first (plan mode) | After analysis, a short clarifying-question step precedes any proposal | Cursor Plan Mode: the agent "research[es] your codebase and ask[s] clarifying questions" before planning; the company reports this "significantly improve[s]" output and auto-suggests planning for complex tasks ([Cursor, Introducing Plan Mode, Oct 2025](https://cursor.com/blog/plan-mode); [Cursor Plan Mode docs](https://cursor.com/docs/agent/plan-mode)) |
| Options, not answers | 2-4 structural approaches with trade-offs, each editable/combinable | PAIR n-best alternatives; Horvitz "scope precision to uncertainty" |
| Rationale on every suggestion | "Because your syllabus states X (p.2) and the assessment plan weights Y at 40%" | Amershi G11; PAIR specific-output explanations |
| Provenance / citations to source spans | Every extracted objective, week, policy, and weight links to the syllabus text it came from | See section 5; supported by teacher verification behaviour ([Frontiers in Psychology, Apr 2026](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1781772/full)) |
| Confidence and gaps made visible | "Extracted (high confidence) / Inferred / Missing, please confirm" states on each field | HAX G2, G10; PAIR confidence display guidance |
| Staged commitment | Analysis -> proposals -> plan -> change-set preview -> provision -> per-item review | GitHub's guidance that human review becomes "the bottleneck, by design," with reviewers asked to "request implementation plans before investing review time" ([GitHub Blog, May 2026](https://github.blog/ai-and-ml/generative-ai/agent-pull-requests-are-everywhere-heres-how-to-review-them/)) |
| Diff / change-set preview | Before provisioning, a list of "will create 14 modules, 42 pages, 6 assessments; touches nothing existing" | Amershi G16 |
| Undo and dismiss | Everything provisioned is reversible in one action; drafts can be discarded module-by-module | Amershi G8/G9; Horvitz "minimise cost of poor guesses" |
| Sandbox first | Build into a sandbox/draft course, then copy to live | IDs already do this with AI-drafted content ([Fang & Broussard, EDUCAUSE Review, Aug 2024](https://er.educause.edu/articles/2024/8/augmented-course-design-using-ai-to-boost-efficiency-and-expand-capacity)) |
| Critique mode | Instead of generating, the AI reviews the faculty member's own structure against alignment/QM-style criteria | Fits Carliner & Chen's finding that faculty want targeted help, not wholesale redesign |
| Steerable generation | Global controls for tone, depth, pedagogy defaults (e.g., active-learning bias), and "AI may not touch" zones | Amershi G17 |

### 2.3 Over-reliance, automation bias, and deskilling: the evidence

- **Cognitive forcing functions reduce overreliance.** Buçinca, Malaya & Gajos tested three CFFs in AI-assisted decision making: on-demand explanations (user asks), *update* (user decides first, then sees the AI), and *wait* (AI suggestion delayed). All reduced overreliance relative to simply showing explanations, but participants *preferred* the less-forcing designs, so there is a trust-vs-think trade-off to manage ([Buçinca, Malaya & Gajos, CSCW 2021](https://arxiv.org/abs/2102.09692); [Harvard page](https://www.eecs.harvard.edu/~kgajos/papers/2021/bucinca2021trust.shtml)). Follow-on work explores *partial explanations* as a lighter-touch forcing function ([Buçinca et al., PACM HCI 2025](https://dl.acm.org/doi/10.1145/3710946); paywalled, cited from listing at [Buçinca publications](https://zbucinca.github.io/publications/)).
- **Confidence in the AI predicts less critical thinking.** In a survey of 319 knowledge workers (936 examples), "higher confidence in GenAI is associated with less critical thinking, while higher self-confidence is associated with more critical thinking"; GenAI shifts effort "toward information verification, response integration, and task stewardship" ([Lee et al., CHI 2025, Microsoft Research](https://www.microsoft.com/en-us/research/publication/the-impact-of-generative-ai-on-critical-thinking-self-reported-reductions-in-cognitive-effort-and-confidence-effects-from-a-survey-of-knowledge-workers/); [ACM DL](https://dl.acm.org/doi/full/10.1145/3706598.3713778)). Design implication stated by the authors: build tools that support verification and integration and calibrate user confidence.
- **Ironies of automation, applied to design work.** Shukla et al. (CHI EA 2025) map Bainbridge's 1983 ironies onto AI-assisted design: de-skilling, cognitive offloading, and misplaced responsibilities, with practitioners valuing reduced repetitive work but fearing over-reliance and skill erosion ([arXiv 2503.03924](https://arxiv.org/abs/2503.03924); [ACM DL](https://dl.acm.org/doi/10.1145/3706599.3719931)). The original is [Bainbridge, "Ironies of Automation", 1983 (overview)](https://en.wikipedia.org/wiki/Ironies_of_Automation).
- **Educators specifically.** EDUCAUSE's 2026 workforce study found 94% of higher-ed staff had used AI for work in six months, yet "loss of independent thinking skills" was a top-three urgent risk (51%), alongside misinformation (55%) and unauthorised data use (52%) ([EDUCAUSE, The Impact of AI on Work in Higher Education, Jan 2026](https://www.educause.edu/research/2026/the-impact-of-ai-on-work-in-higher-education)). A synthesis of 18 ID-relevant papers reports that over-reliance "reduced unique assessment designs by 32% and encouraged passive acceptance of suggestions," that 78% of GPT-4 lesson plans needed significant adjustment, and that fabricated citations were common ([Hardman, "Beyond the Hype", Jun 2025](https://drphilippahardman.substack.com/p/beyond-the-hype-what-18-recent-research)). Commercial lesson-plan generators were found to default to "teacher-centered classrooms with limited opportunities for student choice, goal-setting, and meaningful dialogue," which prompt design could mitigate ([Social Innovations Journal, Apr 2025](https://socialinnovationsjournal.com/index.php/sij/article/view/10004)).
- **How teachers actually verify.** Pre-service science teachers raise their evidence standards when content is for teaching ("two or three authoritative checks"), escalate verification on red flags like unverifiable citations, and shift from "objectivity-as-style" to "objectivity-as-process" (traceability, checkability) after encountering errors ([Frontiers in Psychology, Apr 2026](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1781772/full)).

**Countermeasures to build in:**

1. *Faculty-first objectives.* Before showing proposed structures, ask faculty to confirm, edit, or reorder the extracted learning objectives (an "update"-style CFF at the highest-leverage decision). Keep it fast (checkbox confirm) so the preference cost stays low.
2. *Ask for one sentence of rationale when accepting a whole structure* ("Why does this fit your students?"), stored as design notes. Optional per-item; required once per course. Lee et al.'s finding that self-confidence drives critical thinking suggests prompting the faculty member's *own* expertise, not just asking them to check the AI.
3. *Reflective prompts at provisioning*: "Which module are you least sure about? I will flag it for extra review."
4. *Verification affordances*: every starter-content item shows its source (syllabus span, faculty answer, or "AI draft, unverified") so review effort goes where it matters.
5. *No silent defaults*: pedagogical defaults (active learning, formative checks, alignment) are visible settings with explanations, so the tool does not embed the teacher-centred bias found in lesson-plan generators.
6. *Deliberately unfinished starter content*: scaffolds with clearly marked slots for the instructor's examples, disciplinary nuance, and voice, rather than polished prose that invites passive acceptance.

---

## 3. Faculty attitudes and trust

### 3.1 The landscape

- **Use is broad but supervised.** Ithaka S+R's 246 interviews across 19 US/Canadian universities found instructors use AI to create assignments, prepare lectures, and revise feedback, viewing it as an "assistant" requiring significant supervision and modification; they want discipline-specific guidance, peer communities, and "secure, affordable institutional access" ([Ithaka S+R, Making AI Generative for Higher Education, May 2025](https://sr.ithaka.org/publications/making-ai-generative-for-higher-education/)).
- **Enthusiasm with sharp concerns.** 81% of higher-ed staff are enthusiastic or cautiously enthusiastic; 46% are unaware of institutional AI policy; 56% use non-institutional tools; top risks are misinformation, unauthorised data use, loss of independent thinking, and inadequate data protection ([EDUCAUSE, Jan 2026](https://www.educause.edu/research/2026/the-impact-of-ai-on-work-in-higher-education)). The 2025 AI Landscape Study frames an institutional "digital AI divide" in readiness and governance ([EDUCAUSE 2025 AI Landscape Study, Feb 2025](https://library.educause.edu/resources/2025/2/2025-educause-ai-landscape-study)); the 2026 Horizon Report covers trust and AI's reshaping of teaching ([EDUCAUSE Horizon Report 2026](https://library.educause.edu/resources/2026/5/2026-educause-horizon-report-teaching-and-learning-edition)).
- **Tyton's Time for Class 2025** reports institutions "rebalancing human connection and digital innovation," with only 36% of instructors saying digital learning has led to student success, and argues for a student-support mindset in digital tools ([Tyton Partners, Time for Class 2025 PDF](https://4213961.fs1.hubspotusercontent-na1.net/hubfs/4213961/Publications/Time%20for%20Class/Tyton%20Partners_Time%20for%20Class%202025.pdf); [press release, Jun 2025](https://www.globenewswire.com/news-release/2025/06/11/3097384/0/en/Tyton-Partners-Releases-2025-Time-for-Class-Report-Institutions-Rebalance-Human-Connection-and-Digital-Innovation-in-Higher-Ed.html)).
- **Instructional designers are cautious change agents.** IDs describe a "conscientious and cautious approach and ethical concerns about GenAI integration," and want guardrails and protocols before wide deployment ([Kumar et al., Online Learning, 2024](https://olj.onlinelearningconsortium.org/index.php/olj/article/view/4501)).

### 3.2 A cautionary case: ASU's "Atom" (April 2026)

Inside Higher Ed reported faculty alarm at an ASU AI course builder that pulled from professors' lecture videos, slides, and assignments to assemble personalised modules. Objections: materials used *without notification* ("Frankensteinian" edits to a lecture video), factual errors (a misnamed scholar), decontextualised clips, fears that bad-faith actors could extract content to "dox professors over their teachings," and no faculty consultation before launch; the president conceded it "was not ready for prime time" ([Inside Higher Ed, Apr 29 2026](https://www.insidehighered.com/news/tech-innovation/artificial-intelligence/2026/04/29/faculty-concerned-about-asus-new-ai-course)).

This is a near-perfect negative template: the feature failed on consent, provenance, accuracy, and governance before anyone evaluated the pedagogy.

### 3.3 What would make faculty trust an AI course-design tool

Synthesising the above with the ID-faculty literature:

| Trust driver | Evidence | Product requirement |
|---|---|---|
| Control and final say | Carliner & Chen 2024; Mueller et al. 2022 | Nothing publishes without explicit acceptance; per-item and whole-course reject; AI never edits accepted content without a visible proposal |
| Transparency of reasoning | Amershi G11; PAIR | Rationale + evidence on every proposal; "what I assumed" list |
| Disciplinary accuracy | ASU case; Hardman synthesis (fabricated citations) | Starter content avoids unverifiable factual claims and citations unless from the syllabus or faculty-supplied sources; visibly flags "needs SME check" |
| Fit with teaching philosophy | TAMUS intake questions; Halupa on academic freedom | Ask about philosophy up front; offer structures that reflect it; never grade the instructor's pedagogy |
| IP and consent | AAUP guidance; ASU case | Faculty own uploads and outputs; no training on uploads; clear "who can see this" |
| Data privacy | EDUCAUSE 2026 (52% unauthorised data use); UW-Madison FERPA guidance | No student data required; syllabus-only scope; institutional data-processing terms |
| Low time cost | Halupa 2019 ("too time intensive") | Value in minutes; question burden capped; everything skippable |
| Institutional sanction | Ithaka S+R (want secure institutional access); EDUCAUSE (46% unaware of policy) | Admin-configurable policy banner and defaults; exportable design record for QM/CTL review |

EDUCAUSE Review's framing from Quality Matters and iDesign leadership is the sector's current consensus voice: humans "serve as mentors and architects of learning" and "make pedagogical decisions"; AI should "amplify what educators already do well," align with explicit instructional purposes, and connect to established quality frameworks ([Adair & Kilgore, EDUCAUSE Review, Feb 2026](https://er.educause.edu/articles/2026/2/ai-and-course-design-machines-can-help-but-only-humans-can-teach)). Six Red Marbles argues institutions get stuck on AI course design until they settle "who owns course design" ([Six Red Marbles, 2025](https://www.sixredmarbles.com/insights/ai-course-design-higher-education-institutions-get-stuck/); page could not be fetched, cited from search listing).

---

## 4. Positioning and voice

### 4.1 Framing that augments rather than replaces

The role split the research supports is: **faculty = subject-matter expert and instructor of record; the AI = process and structure expertise** (the "special SME" framing from Chen & Carliner 2021, and the consultative model from Carliner & Chen 2024). Adair & Kilgore's "machines can help, but only humans can teach" is the sector-safe headline ([EDUCAUSE Review, Feb 2026](https://er.educause.edu/articles/2026/2/ai-and-course-design-machines-can-help-but-only-humans-can-teach)).

Suggested voice rules for UI copy and the assistant persona:

- **Say what you did and why, in the instructor's terms.** "I mapped your seven objectives against the eight assessments in your syllabus. Objectives 5 and 6 are not assessed anywhere; here are three ways to close that gap."
- **Ask, then offer.** "Before I propose a structure: is the Week 8 gap a break or an exam week?"
- **Name the boundary.** "You decide what is true in your field and how you want to teach it. I handle sequencing, alignment, and scaffolding, and I will show you my evidence."
- **Label drafts as drafts.** "Starter content, not reviewed" as a persistent badge, not a one-time toast.
- **Never claim completeness or autonomy.** Avoid "your course is ready," "auto-generated course," "AI-built." Prefer "draft structure for your review," "provisioned from your choices."
- **Avoid hype and anthropomorphic over-claiming.** No "magic," "instantly," "perfect." PAIR's guidance on mental models: set expectations about what the system cannot do ([PAIR, Mental Models](https://pair.withgoogle.com/guidebook-v2/chapter/mental-models/)).

### 4.2 Products praised for a collaborative rather than generative feel

- **Cursor Plan Mode (Oct 2025):** plan first, ask clarifying questions, editable plan, then build; auto-suggested for complex tasks ([Cursor blog](https://cursor.com/blog/plan-mode)). The closest analogue to "intake -> proposals -> provision."
- **GitHub Copilot's coding agent and agent-PR review (2025-2026):** work arrives as a draft pull request for human review; GitHub's own guidance says to demand a plan before reviewing large changes and that "human review becomes the bottleneck, by design" ([GitHub, Meet the new coding agent, May 2025](https://github.blog/news-insights/product-news/github-copilot-meet-the-new-coding-agent/); [GitHub, Agent PRs, May 2026](https://github.blog/ai-and-ml/generative-ai/agent-pull-requests-are-everywhere-heres-how-to-review-them/)). Draft-PR = "draft course structure awaiting your review."
- **Notion, Figma, Duolingo AI design write-ups** emphasise AI inside existing workflows with inline accept/reject rather than separate "generate" surfaces ([ADPList, How Duolingo, Notion and Figma design AI](https://adplist.substack.com/p/how-duolingo-notion-and-figma-design)). Grammarly's suggestion-card model (accept/dismiss with a reason) remains the canonical "suggestion, not replacement" pattern.
- **Blackboard's AI Design Assistant** is the main LMS precedent: it generates module structure, test questions, rubrics, and images inside the course, with instructor review before insertion ([Anthology, AI Design Assistant help](https://help.blackboard.com/Learn/Instructor/Ultra/Course_Content/Create_Content/AI_Design_Assistant); [NIU guidance](https://www.niu.edu/blackboard/content/ai-design-assistant.shtml)). Campus guides frame it as a starting point requiring instructor editing, which is also its limitation: it generates from a prompt, not from a deep analysis of the instructor's own syllabus, and it does not run an intake conversation. That gap is Tessera's differentiation.
- **ID practitioners' own workflow** with generative AI: iterative, in a sandbox course, treating AI as "inspiration, not final output," with SME review and disclosure ([Fang & Broussard, EDUCAUSE Review, Aug 2024](https://er.educause.edu/articles/2024/8/augmented-course-design-using-ai-to-boost-efficiency-and-expand-capacity)).

---

## 5. Technical best practices for the pipeline (2025-2026)

### 5.1 Parsing PDF/DOCX syllabi

- **Layout-aware parsing first.** Docling (IBM, MIT-licensed) combines a DocLayNet layout model with TableFormer for table structure, runs on commodity hardware, and exports structured JSON/Markdown with element-level provenance ([Docling Technical Report, arXiv 2408.09869](https://arxiv.org/abs/2408.09869); [GitHub](https://github.com/docling-project/docling)). Managed alternatives (LlamaParse, Unstructured, Reducto, Azure Document Intelligence) differ mainly on table fidelity, OCR, and per-field bounding-box citations; vendor comparisons are self-interested, so test on a sample of real syllabi ([Reducto comparison, vendor-authored](https://llms.reducto.ai/document-parser-comparison); [LlamaIndex table-extraction benchmark 2025](https://www.llamaindex.ai/insights/table-extraction-benchmark); [Procycons independent benchmark 2025](https://procycons.com/en/blogs/pdf-data-extraction-benchmark/)).
- **OCR fallback** for scanned syllabi (common for older or departmental templates); route pages with no text layer to OCR and mark extraction confidence lower.
- **Tables carry the highest-value data** (weekly schedule, grading weights). Keep table cells as structured rows with page/bbox provenance rather than flattening to text; a survey of document parsing covers why tables and reading order are the dominant error sources ([Document Parsing Unveiled, arXiv 2410.21169](https://export.arxiv.org/abs/2410.21169)).
- **DOCX** is easier (native structure), but headings and tables are frequently faked with formatting; normalise to the same intermediate representation as PDF.

### 5.2 Structured extraction

- **Use a strict JSON schema** with provider-enforced structured outputs ([OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs); [Anthropic structured outputs, hands-on guide, 2025](https://towardsdatascience.com/hands-on-with-anthropics-new-structured-output-capabilities/); [Bedrock validated JSON](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html)). Schema-driven extraction with validation is a well-established pattern ([Simon Willison, Structured data extraction with LLM schemas, 2025](https://simonw.substack.com/p/structured-data-extraction-from-unstructured)); iterative schema refinement improves reliability ([PARSE, arXiv 2510.08623](https://arxiv.org/abs/2510.08623)); ExtractBench offers an evaluation methodology for complex nested extraction ([ExtractBench, arXiv 2602.12247](https://arxiv.org/html/2602.12247)).
- **Syllabus entity schema (recommended).** Open Syllabus, trained on ~35,000 annotated syllabi, tags: course title/code/section, meeting days/time/location, instructor and contact, description, *learning outcomes*, *topic outline*, *assignment schedule*, *grading rubric*, *assessment strategy*, credits, and required readings with `doc_span` raw text plus parsed citation ([Open Syllabus docs, syllabi DataFrame](https://docs.opensyllabus.org/syllabi.html); [data sources and processing](https://docs.opensyllabus.org/models.html)). Adopt this as the baseline and add: policies (attendance, late work, AI use, accommodations), modality, term dates and holidays, prerequisites, and per-assessment weight/due-date/objective links. Open Syllabus is a licensed dataset, not open training data, but its field taxonomy is public and the closest thing to a standard.
- **Every field carries provenance**: `{value, source_spans:[{page, bbox or char offsets, text}], confidence, origin: extracted | inferred | user_supplied | missing}`. This is what lets the UI cite the syllabus for every claim and route low-confidence fields to faculty confirmation.
- **Normalise, then validate with rules**: week count vs term dates, grading weights sum to 100, every assessment has a due date within term, each objective has a Bloom-level verb, holidays from the institution's academic calendar are respected. Rule failures become follow-up questions, not silent fixes.

### 5.3 Multi-step agentic pipeline with checkpoints

Recommended stages, each with an inspectable artefact and a human checkpoint where the decision is consequential:

1. **Ingest and parse** -> layout JSON with provenance. Automated.
2. **Extract** -> syllabus entities with confidence and spans. Automated, then *faculty confirmation of low-confidence and missing fields* (targeted questions, capped in number).
3. **Analyse** -> alignment matrix, gaps, workload/pacing observations, policy inventory. Automated; shown with evidence.
4. **Propose** -> 2-4 structure options with rationale and diff against the syllabus's own order. *Faculty choose/combine/edit* (checkpoint).
5. **Plan** -> concrete change-set (modules, pages, assessments, dates). *Faculty approve* (checkpoint).
6. **Provision** -> create draft objects marked "starter, unreviewed," with per-item accept/edit/reject. Reversible.
7. **Review/enrich** -> alignment, accessibility, and completeness checks as suggestions.

Industry guidance for document pipelines converges on classify -> parse -> extract -> validate -> human review, with confidence thresholds routing uncertain outputs to people and corrections feeding evaluation; a commonly cited operating point is ~95% field accuracy before auto-approval ([Extend, Agentic Document Extraction Guide, Mar 2026](https://www.extend.ai/resources/agentic-document-extraction-complete-guide); [LandingAI, architecting extraction at scale](https://landing.ai/llms/how-to-architect-a-document-extraction-pipeline-at-scale); [LlamaIndex, agentic document extraction](https://www.llamaindex.ai/blog/agentic-document-extraction)). For syllabi the "human" is the faculty member, so thresholds should be conservative and questions should be few and specific.

### 5.4 Evaluating extraction quality

- Build a labelled set of 100-300 real syllabi spanning disciplines, modalities, and formats (scanned PDFs, DOCX, templated department syllabi). Measure **field-level precision/recall** and **document-level "all required fields correct"** rates, plus span-grounding accuracy (does the cited span actually support the value) ([Extend guide, Mar 2026](https://www.extend.ai/resources/agentic-document-extraction-complete-guide); [ExtractBench](https://arxiv.org/html/2602.12247)).
- Track downstream **question burden** (how many follow-ups per syllabus) and **faculty edit rate** on provisioned items as product-level quality metrics.
- Log every faculty correction as an evaluation example.

### 5.5 Known failure modes (and mitigations)

| Failure | Cause | Mitigation |
|---|---|---|
| Hallucinated or "improved" objectives | Model rewrites weak objectives into Bloom-perfect ones and presents them as extracted | Separate `extracted` from `suggested`; show original text verbatim with span; suggestions appear only as labelled alternatives |
| Wrong week count / misaligned schedule | Table parse errors, holidays, exam weeks, multiple sections | Cross-check against term dates and academic calendar; ask when counts disagree; never infer holidays silently |
| Grading weights do not sum | Table extraction or extra credit | Rule validation -> question |
| Policies treated as content | Boilerplate institutional policy text pulled into modules | Classify sections; policies go to a policy inventory, not module content |
| Fabricated readings or citations | Model completes partial references | Only carry readings with a `doc_span`; never invent bibliographic data ([Hardman synthesis, Jun 2025](https://drphilippahardman.substack.com/p/beyond-the-hype-what-18-recent-research)) |
| Teacher-centred defaults in starter content | Model priors | Explicit pedagogy settings; prompt design for active learning ([Social Innovations Journal, Apr 2025](https://socialinnovationsjournal.com/index.php/sij/article/view/10004)) |
| Decontextualised or altered instructor material | Automated recomposition | Do not restructure faculty-authored artefacts without proposal + acceptance (ASU case) |

---

## 6. Governance

### 6.1 FERPA and data scope

A syllabus itself is generally not an education record, but campus guidance prohibits sharing FERPA-protected or restricted institutional data with unapproved AI tools, requires institutional review of tools before protected data is used, and expects that "any record created by an AI tool must be reviewed, corrected and validated by a human before it is shared" ([UW-Madison Registrar, FERPA and AI](https://registrar.wisc.edu/ferpa-and-artificial-intelligence-ai/); [NMU CTL, Understanding FERPA in the Context of Generative AI](https://nmu.edu/ctl/understanding-ferpa-context-generative-ai-guide-faculty); [JHU generative AI guidelines](https://teaching.jhu.edu/university-teaching-policies/generative-ai/guidelines/)). Implications: keep the feature syllabus-only (no rosters, grades, or student work), strip any embedded student names, document data flows for institutional security review, and ship the feature under the institution's data-processing agreement, since 56% of staff already use unvetted tools and institutions are trying to consolidate ([EDUCAUSE, Jan 2026](https://www.educause.edu/research/2026/the-impact-of-ai-on-work-in-higher-education)).

### 6.2 IP and consent

AAUP's AI/edtech policy resources (2025-2026) call for ownership of course materials to "reside with the Designated Instructional Appointee who creates them," for materials not to be incorporated into AI training or other systems without creator permission, for faculty to be able to opt out without employment burden, and for faculty committees with real authority over edtech procurement ([AAUP, Resource Guide for Addressing AI in Higher Education, 2026](https://www.aaup.org/sites/default/files/2026-03/AAUP-AI-Committee-Policy-Resources-for-AI-and-EdTech.pdf); [AAUP Statement on Intellectual Property](https://www.aaup.org/reports-publications/aaup-policies-reports/policy-statements/statement-intellectual-property); [MLA, Academic Freedom and Faculty IP in the Era of LMSs](https://www.mla.org/About-Us/Governance/Committees/Committee-Listings/Professional-Issues/Committee-on-Academic-Freedom-and-Professional-Rights-and-Responsibilities/Academic-Freedom-and-Faculty-Intellectual-Property-in-the-Era-of-Zoom-and-Learning-Management-Systems)). Product requirements: faculty own uploads and outputs; no training on customer content; explicit consent before any faculty material is reused outside the course; an exportable record of what the AI proposed and what the instructor decided (also useful for QM reviews and promotion files). Institutional AI policy frameworks for faculty are surveyed in [Azevedo, New Directions for Adult and Continuing Education, 2025](https://onlinelibrary.wiley.com/doi/10.1002/ace.70013).

### 6.3 Accessibility

DOJ's April 2024 Title II rule requires public institutions' web content and mobile apps, including LMS content and course materials, to meet WCAG 2.1 AA, with narrow exceptions for archived content, pre-existing conventional documents, third-party content, and individualized password-protected documents ([Federal Register, Apr 24 2024](https://www.federalregister.gov/documents/2024/04/24/2024-07758/nondiscrimination-on-the-basis-of-disability-accessibility-of-web-information-and-services-of-state); [UW Civil Rights Compliance summary](https://www.washington.edu/civilrights/policies-and-guidance/ada-guidance/digital-accessibility/); [OLC, Sep 2025](https://onlinelearningconsortium.org/olc-insights/2025/09/federal-digital-a11y-requirements/)). On April 20 2026 DOJ extended the deadlines by one year (large entities to April 26 2027; smaller entities to April 26 2028) while signalling future rulemaking ([Reed Smith, Apr 2026](https://www.reedsmith.com/articles/doj-extends-digital-accessibility-compliance-dates-under-title-ii-of-the-ada/)). Practical requirement: everything the AI provisions must be born accessible: semantic headings, alt text prompts (never auto-filled with guesses), captions/transcript slots for media, accessible tables, sufficient contrast, keyboard-navigable components; and the review stage should run an accessibility check with explanations, as many campuses now expect of course content ([UC Berkeley, ADA Title II update](https://ue.berkeley.edu/news/ada-title-ii-update-new-requirements-digital-course-content-accessibility); [NC State federal requirements](https://accessibility.ncsu.edu/digital-accessibility/federal-digital-accessibility-requirements/)). Targeting WCAG 2.2 AA is prudent given the trajectory, but 2.1 AA is the legal floor.

---

## 7. Sources that could not be fully retrieved

- Richardson et al. 2019 full text (ResearchGate 429); cited from the Springer abstract page.
- Mueller et al. 2022 full text; cited from the Springer abstract.
- Buçinca et al. 2025 (ACM 403); cited from the author's publication list.
- Six Red Marbles article (SSL error); cited from search listing only.
- EDUCAUSE 2025 AI Landscape Study key findings are members-only; only the framing is cited.
- Kumar et al. 2024 was fetched from the OLJ abstract; the JAID paper "Generative AI in Instructional Design: Adoption, Benefits, and Best Practices" ([EdTech Books](https://edtechbooks.org/jaid_14_3/ciglaqjrnb)) did not render and is listed for follow-up.

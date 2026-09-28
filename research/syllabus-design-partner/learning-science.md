# Learning Science and Instructional Design Foundations for an AI Instructional Design Partner

Research findings to drive product requirements for Tessera's syllabus-to-course-structure feature (upload syllabus, deep instructional analysis, propose structure options, faculty pick/combine, provision modules with starter content).

Compiled 2026-09-28. Every claim is cited inline. Where a fetched source was paywalled, the citation points to the abstract/landing page.

---

## 0. Executive framing: what the evidence says the feature must be

1. **Alignment is the master principle.** Every major framework (UbD, Constructive Alignment, Fink, QM Standards 2-6, OSCQR) converges on one requirement: objectives, assessments, activities, and materials must be explicitly and visibly linked. QM Specific Review Standard 2.4 states it directly: "The relationship between learning objectives, learning activities, and assessments is made clear" ([QM Higher Education Rubric, Seventh Edition](https://www.qualitymatters.org/sites/default/files/PDFs/StandardsfromtheQMHigherEducationRubric.pdf)). Fink's warning is the design rationale: "If a teacher breaks one of the connections in a course, inevitably another is broken" ([Fink, A Self-Directed Guide to Designing Courses for Significant Learning](https://www.bu.edu/sph/files/2011/06/selfdirected1.pdf)). **Product implication:** the alignment matrix (objective x assessment x activity x module) is the core data model, not a report generated afterward.

2. **The syllabus is a weak but real signal.** Learner-centered syllabus rubrics (Cullen & Harris 2009; Palmer, Bach & Streifer 2014) are validated instruments, and a 2024 PLOS One study found that syllabi scoring higher on learner-centeredness (especially the "Power and Control" factor) were associated with smaller grade equity gaps in STEM ([How syllabi relate to outcomes in higher education, PLOS One 2024](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0301331)). **Product implication:** the analysis stage should score the uploaded syllabus on a published rubric and show faculty the gaps, not silently "fix" them.

3. **Faculty judgment must gate every generative step.** The 2023-2026 literature on generative AI in course design consistently reports generic, decontextualized, occasionally inaccurate output that requires "extensive human review" ([Exploring instructional designers' utilization and perspectives on generative AI tools, ETR&D 2024](https://link.springer.com/article/10.1007/s11423-024-10437-y)), and EDUCAUSE's position is that AI should not replace "thoughtful pedagogy or faculty expertise" ([AI and Course Design: Machines Can Help, but Only Humans Can Teach, EDUCAUSE Review 2026](https://er.educause.edu/articles/2026/2/ai-and-course-design-machines-can-help-but-only-humans-can-teach)). **Product implication:** propose-then-approve at every stage; label starter content as drafts; never fabricate readings or citations.

---

## 1. Frameworks that should drive ANALYSIS and GENERATION

The table below is the working spec. Each framework gets: (a) what the AI analysis should CHECK for in the syllabus, (b) what the AI should PROPOSE in a structure. Details and citations follow.

| Framework | Analysis CHECKS | Structure PROPOSALS |
|---|---|---|
| Backward Design / UbD | Are desired results stated before content? Are there "big ideas"/enduring understandings and essential questions? Is there evidence (assessment) for each result? | Stage-1/2/3 scaffold: transfer goals -> performance tasks -> learning plan; modules organized around essential questions, not chapters |
| Constructive Alignment | Do ILO verbs match assessment tasks? Do activities require the same verbs? | Per-module ILO -> TLA -> AT triplets; flag verb mismatches |
| Fink Integrated Course Design | Situational factors captured? Do goals span all six categories or only foundational knowledge? Is assessment "forward-looking"? Is there FIDeLity feedback? | Add human dimension / caring / learning-how-to-learn goals; castle-top in-class/out-of-class sequencing |
| Merrill First Principles | Is there a real-world problem/task anchoring the course? Activation, demonstration, application, integration present? | Problem-centered module template with 4-phase lesson pattern |
| Gagne Nine Events | Does each module/lesson have attention, objectives, recall, content, guidance, practice, feedback, assessment, transfer? | Default lesson skeleton (9 slots) used to generate starter content |
| Bloom (Anderson & Krathwohl) | Are objectives measurable? Which cognitive process level and knowledge dimension? Does the distribution match course level? Do assessments match level? | Objective rewrite suggestions; level-by-module progression; assessment-type suggestions per level |
| Cognitive Load Theory | Is content chunked? Any weeks with too many new high-interactivity concepts? Novice vs. expert audience? | Segmenting; simple-to-complex; worked examples early, faded later; pre-training modules |
| Mayer multimedia principles | Media plan (if any) for redundancy/coherence/segmenting | Starter content guidance: short segmented videos, narration+graphics, signaling |
| UDL 3.0 | Multiple means of engagement/representation/action-expression? Learner agency? Flexibility in how learning is demonstrated? | Alternative assessment paths; choice points; accessibility defaults |
| TILT | Do assignments state purpose, task, criteria? | Every generated assignment uses Purpose/Task/Criteria template |
| Andragogy + SDT | Relevance to learner goals? Choice? Use of learner experience? Autonomy + structure? | Choice architecture within structure; rationale statements; competence-building progression |
| Retrieval + spaced practice | Are there frequent low-stakes quizzes? Is prior content revisited later? | Post-lesson retrieval checks; cumulative/spiral review slots; spaced re-exposure schedule |
| Community of Inquiry | Teaching presence plan? Social presence design? Cognitive presence (inquiry) activities? | For online/hybrid: discussion/inquiry design per module; instructor-interaction plan |
| QM 7th ed. / OSCQR | Course & module objectives measurable; alignment stated; grading policy; assessment variety/sequence; progress tracking; instructor interaction plan | Module-level objectives; alignment map view; assessment sequencing; RSI plan |

### 1.1 Backward Design / Understanding by Design (Wiggins & McTighe)

UbD's three stages are: (1) identify desired results, (2) determine acceptable evidence, (3) plan learning experiences and instruction. Stage 1 distinguishes transfer goals, "enduring understandings," and "essential questions"; Stage 2 emphasizes performance tasks (GRASPS) plus other evidence; Stage 3 is planned last so that activities serve results ([Understanding by Design, Wikipedia overview](https://en.wikipedia.org/wiki/Understanding_by_Design); [UbD and the Backward Design Framework, Open Guide to Teaching and Learning in Higher Education](https://pressbooks.pub/etsu/chapter/understanding-by-design-ubd-and-the-backward-design-framework/); [Wiggins & McTighe brief introduction](https://wit.edu/sites/default/files/2020-10/Understanding%20by%20Design%20mctighe%20MTSU.pdf)).

- **CHECK:** Does the syllabus lead with outcomes, or with a topic list? Are there any "big idea" statements or essential questions? Is there a summative performance task (not just exams)? Is there evidence for every stated outcome?
- **PROPOSE:** A "UbD scaffold" output: 2-4 enduring understandings, 3-6 essential questions, a culminating performance task, then modules mapped to essential questions. A 2025 human-AI hybrid co-design model built on exactly this UbD sequence (transfer goals -> GRASPS performance tasks -> learning activities) and reported that it worked when educators evaluated outputs with "validation rubrics assessing alignment across learning objectives, assessments, and activities" ([A Human-AI Hybrid Co-Design Model, ERIC EJ1476270](https://files.eric.ed.gov/fulltext/EJ1476270.pdf)).

### 1.2 Constructive Alignment (Biggs)

Biggs' model: intended learning outcomes (ILOs) are written with a verb specifying what the student must do; teaching/learning activities (TLAs) require students to perform that verb; assessment tasks (ATs) check whether they can. The "constructive" half is that students construct meaning through what they do, so the activity, not the lecture, is the unit of design ([Constructive alignment, Queen Mary Academy](https://www.qmul.ac.uk/queenmaryacademy/educators/resources/curriculum-design/constructive-alignment/); [Using Constructive Alignment to Foster Teaching Learning Processes, ERIC EJ1215464](https://files.eric.ed.gov/fulltext/EJ1215464.pdf)).

- **CHECK:** Parse each objective's verb; parse each assessment's required performance; flag mismatches (e.g., objective says "design" but the only assessment is a multiple-choice exam). Flag objectives with no assessment and assessments with no objective.
- **PROPOSE:** For each module, generate ILO/TLA/AT triplets; show a verb-consistency indicator.

### 1.3 Fink's Taxonomy of Significant Learning and Integrated Course Design

Six categories: Foundational Knowledge, Application, Integration, Human Dimension, Caring, Learning How to Learn ([Fink's Significant Learning Outcomes, University at Buffalo](https://www.buffalo.edu/catt/teach/develop/design/learning-outcomes/finks.html)). Integrated Course Design has 12 steps in three phases; Step 1 is analyzing **situational factors**: specific context (class size, delivery format, physical environment), general context, nature of subject (theoretical vs. practical, convergent vs. divergent), learner characteristics, and teacher characteristics. Fink's "educative assessment" has four elements: forward-looking assessment (real-life context), explicit criteria and standards, self-assessment, and "FIDeLity" feedback (Frequent, Immediate, Discriminating, Lovingly delivered). The "castle-top diagram" sequences in-class and out-of-class activities so they "build on each other" ([Fink, A Self-Directed Guide](https://www.bu.edu/sph/files/2011/06/selfdirected1.pdf)).

- **CHECK:** Extract situational factors from the syllabus (class size, modality, term length, level, prerequisites) and ask faculty for any missing ones before generating. Classify each objective by Fink category; flag courses whose goals are 100% foundational knowledge. Check for self-assessment and feedback frequency.
- **PROPOSE:** Suggested goals in missing categories (with faculty opt-in); a castle-top sequence per module (before-class / in-class / after-class); forward-looking assessment ideas tied to the discipline's real-world tasks.

### 1.4 Merrill's First Principles of Instruction

Merrill (2002) synthesized instructional theories into five principles: learning is promoted when (1) learners engage in solving real-world **problems**, (2) prior knowledge is **activated**, (3) new knowledge is **demonstrated**, (4) learners **apply** it, and (5) it is **integrated** into their world ([First Principles of Instruction, Wikipedia](https://en.wikipedia.org/wiki/First_Principles_of_Instruction); [Merrill's Principles of Instruction, University of Iowa Tippie](https://students.tippie.uiowa.edu/tippie-resources/technology/instructional-design/models/merrill); [First principles of instruction, EduTech Wiki](https://edutechwiki.unige.ch/en/First_principles_of_instruction)).

- **CHECK:** Is there an authentic problem or task that the course progresses toward? Do modules include demonstration (worked examples) before application? Is there an integration step (reflection, public performance, transfer)?
- **PROPOSE:** A "problem-centered" structure option and a 4-phase (activate/demonstrate/apply/integrate) lesson template for starter content. Merrill's model is especially suitable for industry training because it starts with a task, not a topic.

### 1.5 Gagne's Nine Events of Instruction

The nine events: gain attention; inform learners of objectives; stimulate recall of prior learning; present content; provide learning guidance; elicit performance; provide feedback; assess performance; enhance retention and transfer ([Gagne's Nine Events of Instruction, NIU CITL](https://www.niu.edu/citl/resources/guides/instructional-guide/gagnes-nine-events-of-instruction.shtml); [Gagne's 9 Events, UF CITT](https://citt.it.ufl.edu/resources/course-development/the-learning-process/designing-the-learning-experience/gagnes-9-events-of-instruction/)).

- **CHECK:** Mostly not checkable at syllabus level; check whether the syllabus mentions any formative practice/feedback loop at all.
- **PROPOSE:** Use the nine events as the default **lesson-level skeleton** when provisioning starter content (hook, objectives, recall prompt, content, guidance/examples, practice, feedback, check, transfer task). This gives faculty a predictable, editable scaffold rather than a wall of generated prose.

### 1.6 Bloom's Revised Taxonomy (Anderson & Krathwohl 2001)

The revision has two dimensions: the cognitive process dimension (Remember, Understand, Apply, Analyze, Evaluate, Create) and the knowledge dimension (Factual, Conceptual, Procedural, Metacognitive); an objective is a verb (process) plus a noun (knowledge type). The standard handout format is a two-dimensional grid for placing objectives ([A Model of Learning Objectives, Iowa State / CSUDH handout](https://www.csudh.edu/Assets/csudh-sites/academic-affairs/docs/assessment-student-learning/revised-blooms-handout.pdf); [Bloom's Taxonomy of Educational Objectives, UIC CATE](https://teaching.uic.edu/cate-teaching-guides/syllabus-course-design/blooms-taxonomy-of-educational-objectives/)).

- **CHECK:** For each objective: (a) is it measurable (observable verb vs. "understand," "know," "appreciate," "be familiar with")? (b) which process level and knowledge type? (c) does the distribution suit course level (QM 2.5: objectives "suit and reflect the course level")? (d) does each assessment's demanded level match the objective's level?
- **PROPOSE:** Rewrite suggestions for unmeasurable objectives (show original + suggestion; faculty accept/edit); a heatmap of objectives by level; assessment-type recommendations per level (e.g., Create -> project/portfolio; Analyze -> case analysis; Remember/Understand -> retrieval quizzes). Caution: Bloom's is a classification aid, not a hierarchy of value; avoid implying "higher is always better."

### 1.7 Cognitive Load Theory (Sweller)

Sweller's 2019 review lists the effects most relevant to structure: the **worked example effect** (novices learn more from studying solutions than solving equivalent problems, an effect that reverses with expertise: the **expertise reversal effect**); **split-attention** and **redundancy** (do not force integration of separated sources; do not duplicate); **element interactivity** (complexity relative to expertise determines load); the **transient information effect** (spoken/video content vanishes, so "self-pacing or segmentation" is needed); and the **isolated elements effect**, which supports presenting simple elements first and then their interactions ([Sweller, van Merrienboer & Paas 2019, Cognitive Architecture and Instructional Design: 20 Years Later](https://leadinglearner.me/wp-content/uploads/2019/02/sweller2019_article_cognitivearchitectureandinstru.pdf)).

- **CHECK:** Count new concepts per week (from topics/chapters); flag weeks with unusually many high-interactivity concepts; infer novice/expert from course level and prerequisites.
- **PROPOSE:** Chunk modules so each has a small number of interacting concepts; front-load worked examples and fade them ("completion problems" then full problems) as the course progresses; insert pre-training modules for terminology before complex content; segment media.

### 1.8 Mayer's Multimedia Principles

Mayer's twelve principles: coherence, signaling, redundancy, spatial contiguity, temporal contiguity, segmenting, pre-training, modality, multimedia, personalization, voice, image ([12 Principles of Multimedia Learning, University of Hartford FCLD](https://www.hartford.edu/faculty-staff/faculty/fcld/_files/12%20Principles%20of%20Multimedia%20Learning.pdf)). Segmenting ("user-paced segments rather than a continuous unit") and pre-training are the two that directly bear on module structure; coherence and redundancy bear on generated content.

- **CHECK:** If the syllabus references lecture recordings/videos, flag length and whether they are segmented.
- **PROPOSE:** Generated media guidance in starter content: short segmented videos, narration over graphics rather than narrated on-screen text, conversational tone, strip decorative extras. Video length evidence: Guo, Kim & Rubin's analysis of 6.9M MOOC video sessions found engagement drops sharply after about six minutes ([How video production affects student engagement, ACM L@S 2014](https://dl.acm.org/doi/10.1145/2556325.2566239); summarized by [OSCQR, How Long Should Instructional Videos Be?](https://oscqr.suny.edu/how-long-should-instructional-videos-be/)).

### 1.9 Universal Design for Learning 3.0 (CAST, 2024)

UDL 3.0 keeps the three principles (Engagement, Representation, Action & Expression), renames guidelines as "Design Options for...," states the goal as "learner agency that is purposeful & reflective, resourceful & authentic, strategic & action-oriented," adds learners' "multiple and intersecting identities as part of variability," and adds considerations to "address biases, threats, and distractions" and "challenge exclusionary practices" ([About the Guidelines 3.0 Update, CAST](https://udlguidelines.cast.org/more/about-guidelines-3-0/); [UDL Guidelines 3.0: A Community-Driven, Research-Based Process, CAST](https://www.cast.org/resources/tips-articles/udl-guidelines-3-0-a-community-driven-research-based-process-toward-fulfilling-the-promise-of-universal-design-for-learning/)).

- **CHECK:** Single-mode assessment (all exams, or all essays)? Any stated flexibility in how students demonstrate learning? Any accessibility statement? Any choice in topics/projects?
- **PROPOSE:** Choice points in each structure option (e.g., "demonstrate via paper, presentation, or prototype"); representation variety in starter content (text + visual + example); accessibility defaults (headings, alt text, captions). UDL should appear as a lens applied to every structure, not as a separate structure type.

### 1.10 Transparency in Learning and Teaching (TILT, Winkelmes)

The TILT assignment template asks instructors to state **Purpose** (skills, knowledge, connection to objectives), **Task** (what to do and how), and **Criteria** (what excellence looks like, with examples). Winkelmes et al. (2016, *Peer Review* 18[1/2]) found that transparent assignments improved academic confidence, sense of belonging, and metacognitive awareness, with larger benefits for first-generation, low-income, and underrepresented students ([Transparency in Learning and Teaching, Indiana University CITL](https://citl.indiana.edu/teaching-resources/evidence-based/transparency.html); [Winkelmes TILT handout, University of Michigan CRLT](https://crlt.umich.edu/sites/default/files/Winkelmes_TILT_Handout.pdf)).

- **CHECK:** Do assignment descriptions in the syllabus state purpose and criteria, or only task and due date?
- **PROPOSE:** Every generated assignment/activity uses the Purpose/Task/Criteria template. This is cheap, evidence-backed, and directly addresses the "generic AI content" problem by forcing a rationale tied to the course's own objectives.

### 1.11 Andragogy (Knowles) and Self-Determination Theory

Knowles' six assumptions: self-concept (self-direction), role of experience, readiness to learn (tied to life/work roles), orientation to learning (problem-centered), need to know why, and internal motivation ([Andragogy in Practice, PMC 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11008574/); [Andragogy, Wikipedia](https://en.wikipedia.org/wiki/Andragogy)). SDT identifies autonomy, competence, and relatedness as the psychological needs that underlie intrinsic motivation ([Ryan & Deci 2020, Intrinsic and extrinsic motivation from a self-determination theory perspective](https://stial.ie/resources/Ryan%20and%20Deci%202020%20self%20determination%20theory.pdf)). A 2025 meta-analysis found that teacher autonomy support and provision of structure each have moderate-to-large effects on motivation and engagement, that they "reinforced each other, with a large effect size," and that the best strategy is "structure in an autonomy-supportive way" ([Blending Teacher Autonomy Support and Provision of Structure, Educational Psychology Review 2025](https://link.springer.com/article/10.1007/s10648-025-09994-2)). A 2024 meta-analysis of SDT-based interventions in education confirms positive effects on need satisfaction and outcomes ([Wang et al. 2024, systematic review and meta-analysis of SDT-based interventions](https://selfdeterminationtheory.org/wp-content/uploads/2024/06/2024_WangWangEtAl_MetaEdu.pdf)).

- **CHECK:** Is rationale given for assignments/policies ("need to know")? Any choice? Any use of learners' prior experience? Are policies framed punitively (a Cullen & Harris "power and control" signal)?
- **PROPOSE:** Rationale statements on each module and assignment; bounded choice (choose 2 of 3 cases; choose project topic); early competence wins (a small, achievable first assessment); peer interaction for relatedness. Do **not** propose unstructured freedom; the evidence favors structure plus autonomy.

### 1.12 Retrieval practice and spaced practice

Dunlosky et al. (2013) rated ten techniques; **practice testing** and **distributed practice** received "high utility" because they "benefited students of many different ages and ability levels"; rereading, highlighting, and summarization were low utility ([Improving Students' Learning With Effective Learning Techniques, PSPI 2013](https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html); [Dunlosky, Strengthening the Student Toolbox, AFT 2013](https://www.aft.org/ae/fall2013/dunlosky)). A 2021 meta-analysis of classroom quizzing (222 studies, 573 effects, 48,478 students) found g = 0.499 overall; gains increased with repetition (once g = 0.444; three or more times g = 0.642); corrective feedback raised the effect (g = 0.537 vs 0.374 without); post-class quizzes (g = 0.536) far outperformed pre-class quizzes (g = 0.186) ([Yang et al. 2021, Testing (quizzing) boosts classroom learning, Psychological Bulletin](https://gwern.net/doc/psychology/spaced-repetition/2021-yang.pdf)). Cepeda et al.'s (2006) review of 254 studies established that spaced study reliably beats massed study, with optimal gaps scaling with the retention interval ([Cepeda et al. 2006, Distributed practice in verbal recall tasks](https://www.yorku.ca/ncepeda/publications/CPVWR2006.html)).

- **CHECK:** Count assessments and their spacing; flag courses with only midterm + final (no formative retrieval); flag topics that appear once and never recur.
- **PROPOSE:** A post-lesson retrieval check in every module (auto-graded, low or zero stakes, with feedback); cumulative elements in later assessments; a "spaced review" slot that re-surfaces Module N content in Modules N+2 and N+5 (spiral pattern, section 3).

### 1.13 Community of Inquiry (online/hybrid)

The CoI framework describes online learning as the intersection of **teaching presence** (design and organization, facilitation, direct instruction), **social presence**, and **cognitive presence** (practical inquiry: triggering event, exploration, integration, resolution) ([CoI Framework, Athabasca University](https://coi.athabascau.ca/coi-model/); [Designing a Community of Inquiry in Online Courses, ERIC EJ1240692](https://files.eric.ed.gov/fulltext/EJ1240692.pdf)). A 2022 meta-analysis of 19 studies found teaching presence had the strongest correlation with *actual* learning (r = .353), while cognitive presence correlated most strongly with perceived learning (r = .663) and satisfaction (r = .586) ([A Meta-Analysis on the Community of Inquiry Presences and Learning Outcomes, Online Learning 2022](https://olj.onlinelearningconsortium.org/index.php/olj/article/view/2604)).

- **CHECK (online/hybrid only):** Instructor interaction plan (QM 5.3)? Discussion/collaboration design? Inquiry-type activities?
- **PROPOSE:** Per-module teaching-presence elements (module overview/announcement draft, facilitation prompts), one social-presence touchpoint, and one inquiry cycle (triggering question -> exploration -> integration -> resolution artifact). This also satisfies U.S. "regular and substantive interaction" requirements that OSCQR now maps explicitly ([RSI Standards, OSCQR](https://oscqr.suny.edu/rsi/rsi-standards/)).

### 1.14 Quality Matters (Higher Ed Rubric, 7th ed.) and OSCQR

QM 7th edition General Standards: 1 Course Overview and Introduction; 2 Learning Objectives (Competencies); 3 Assessment and Measurement; 4 Instructional Materials; 5 Learning Activities and Learner Interaction; 6 Course Technology; 7 Learner Support; 8 Accessibility and Usability. The alignment standards are the essential (3-point) ones: 2.1 course objectives measurable; 2.2 module/unit objectives measurable and aligned to course objectives; 2.3 objectives clearly stated and prominently located; 2.4 relationship between objectives, activities and assessments made clear; 2.5 objectives suit the course level; 3.1 assessments measure the objectives; 3.2 grading policy stated at course start; 3.3 evaluation criteria specific and descriptive; 3.4 assessments sequenced, varied, suited to level; 3.5 multiple opportunities to track progress with timely feedback; 4.1 materials support objectives; 4.2 relationship between materials and activities explained; 5.1 activities support objectives; 5.2 activities provide active-learning interaction; 5.3 instructor's plan for interacting is stated; 6.1 tools support objectives ([QM Higher Education Rubric, Seventh Edition standards](https://www.qualitymatters.org/sites/default/files/PDFs/StandardsfromtheQMHigherEducationRubric.pdf); [Higher Ed Course Design Rubric, QM](https://www.qualitymatters.org/qa-resources/rubric-standards/higher-ed-rubric)).

OSCQR is SUNY's free, CC-BY, 50-standard rubric in six categories (Course Overview & Information 1-10; Technology & Tools 11-15; Design & Layout 16-28; Content & Activities 29-37; Interaction 38-43; Assessment & Feedback 44-50); it is explicitly "non-evaluative" and produces an action plan rather than a score ([About OSCQR](https://oscqr.suny.edu/about/about-oscqr/); [Get OSCQR](https://oscqr.suny.edu/get-oscqr/)).

- **CHECK:** Run a QM-style "pre-review" on the syllabus limited to what a syllabus can evidence: 2.1, 2.5, 3.2, 3.3, 3.4, 3.5, 5.3, plus a note that 2.2/2.4/3.1/4.1/5.1 will be satisfied by the generated module structure.
- **PROPOSE:** Module-level objectives for every module (2.2); an alignment map view (2.4); assessment sequencing with variety (3.4); progress checkpoints (3.5); instructor interaction plan draft (5.3). Because OSCQR is CC-BY, its standards can be embedded verbatim as checklist items; QM's rubric is licensed and should be referenced by number, not reproduced.

---

## 2. Syllabus analysis research: what to measure and what predicts structure

### 2.1 Validated learner-centered syllabus rubrics

**Cullen & Harris (2009)** built a rubric with three factors and sub-factors, scored 1-4: **Community** (teacher accessibility; learning rationale "tied to learning outcomes"; collaboration), **Power and Control** (teacher's role, student's role, outside resources, "syllabus weighted towards student learning outcomes and means of assessment" vs. policies), and **Evaluation/Assessment** (grades tied to outcomes; feedback mechanisms; summative and formative evaluation; learning outcomes "tied to specific assessments"; revision/redoing encouraged) ([Cullen & Harris 2009, Assessing Learner-Centredness Through Course Syllabi](https://www.researchgate.net/publication/233056548_Assessing_Learner-Centredness_Through_Course_Syllabi)). A 2024 PLOS One study applied a 13-item version at a minority-serving research university (218 course-instructor pairs; 50 syllabi) and found that courses with small grade opportunity gaps had significantly more learner-centered syllabi (p = 0.037), with the Power and Control factor strongest (each 1-point increase associated with 75% higher odds of a small gap) ([How syllabi relate to outcomes in higher education, PLOS One 2024](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0301331)).

**Palmer, Bach & Streifer (2014), "Measuring the Promise"** scores a syllabus on four components (Learning Goals and Objectives; Assessment Activities; Schedule; Overall Learning Environment) on a content-focused -> transitional -> learning-focused continuum (0-46 points; learning-focused is roughly 31+). Pre/post analysis of 54 syllabi from UVA's Course Design Institute showed mean scores rising from 9.4 to 31.4, with 55% reaching learning-focused status ([Measuring the Promise: A Learning-Focused Syllabus Rubric, To Improve the Academy 2014](https://onlinelibrary.wiley.com/doi/abs/10.1002/tia2.20004); [Learning-focused Syllabus Rubric, UVA Teaching Hub](https://teaching.virginia.edu/resources/syllabus-rubric); [Syllabus Rubric Guide, UCLA CEILS](https://ceils.ucla.edu/wp-content/uploads/sites/2/2016/10/Syllabus-Rubric-Guide-11-24-141.pdf)). The Learning Goals criteria ask whether objectives are present, student-centered, use measurable higher-order verbs, and cover more than foundational knowledge; the Assessment criteria ask whether assessments are aligned, varied, and formative as well as summative; the Schedule criteria ask whether the schedule shows learning activities and not just topic coverage.

**Product implication:** Implement both rubrics as the analysis scoring layer. Palmer et al. gives the design-quality score (objectives/assessment/schedule/environment); Cullen & Harris adds the climate/equity lens. Show scores with the rubric language and the specific syllabus text that produced each score, so faculty can contest them.

### 2.2 Syllabus as contract vs. learning tool

The syllabus literature distinguishes the contractual syllabus (policies, rules, warnings) from the learning-centered syllabus (rationale, outcomes, how to succeed). Harnish & Bridges (2011) experimentally manipulated syllabus tone and found "a syllabus written in a friendly, rather than unfriendly, tone evoked perceptions of the instructor being more warm, more approachable, and more motivated to teach" ([Effect of syllabus tone, Social Psychology of Education 2011](https://link.springer.com/article/10.1007/s11218-011-9152-4)). Richmond's IDEA Paper #60 documents one professor's conversion to a learner-centered syllabus using Cullen & Harris ([Constructing a Learner-Centered Syllabus, IDEA Paper #60](https://files.eric.ed.gov/fulltext/ED573642.pdf)).

**Product implication:** the analysis should distinguish policy text from pedagogical text and report the ratio; it can offer a "warm tone" rewrite of the course description and module intros but should not touch institutional policy language.

### 2.3 Common syllabus deficiencies the analyzer should detect

Drawn from the rubrics above and QM standards:

1. **Unmeasurable objectives** ("understand," "appreciate," "be exposed to") and objectives absent entirely (QM 2.1; Palmer et al. Learning Goals).
2. **Misalignment**: objective verbs not matched by any assessment; assessments not tied to any objective; weights concentrated on assessments that measure only lower-order levels (QM 2.4, 3.1; Biggs).
3. **Missing formative assessment**: only midterm + final; no low-stakes checkpoints (QM 3.4, 3.5; Cullen & Harris Evaluation; Yang et al. 2021 evidence).
4. **Topic-only schedule**: weeks listed as chapter numbers with no activities (Palmer et al. Schedule criterion).
5. **Workload mismatch** to credit hours (see 2.4).
6. **No rationale / punitive framing** (Cullen & Harris Community and Power & Control).
7. **Single-mode assessment** and no flexibility (UDL 3.0).
8. **No instructor-interaction plan** for online courses (QM 5.3; OSCQR RSI).

### 2.4 Syllabus signals that predict structure decisions

| Signal in syllabus | What it drives | Evidence / heuristic |
|---|---|---|
| Credit hours + term length | Total expected student time; number of modules; workload budget | U.S. federal definition: one credit hour approximates "one hour of classroom or direct faculty instruction and a minimum of two hours of out-of-class student work each week for approximately fifteen weeks" ([34 CFR 600.2](https://www.ecfr.gov/current/title-34/subtitle-B/chapter-VI/part-600/subpart-A/section-600.2)). A 3-credit, 15-week course therefore budgets roughly 9 hours/week (3 in class + 6 out) and about 135 hours total; an 8-week version must fit the same hours into half the weeks. |
| Contact hours / meeting pattern | In-class vs. out-of-class split (castle-top); flipped feasibility | Fink castle-top; flipped requires reliable pre-class time. |
| Modality (F2F, online async/sync, hybrid, HyFlex) | Whether CoI/RSI elements are required; whether weekly vs. self-paced modules; HyFlex equivalency | QM 5.3; OSCQR RSI; HyFlex principles (section 3). |
| Assessment list + weights | Bloom levels actually rewarded; formative/summative balance; milestone placement | Biggs alignment; QM 3.4. High-weight single project -> project-based with milestones; many quizzes -> weekly modules with retrieval checks; licensure exam -> mastery/CBE. |
| Textbook chapters / readings per week | Reading load and concept density; whether course is textbook-sequenced | Rice workload estimator rates: e.g., 67 pages/hr for survey reading with no new concepts vs. 5-9 pages/hr for "engage" reading with many new concepts; writing 45 min to 10 hrs per page depending on genre and drafting ([Rice CTE, How Much Should We Assign?](https://cte.rice.edu/blog/2016/workload); [Course Workload Estimator, Rice CTE](https://cte.rice.edu/resources/workload-estimator)). |
| Weekly topic list | Candidate module boundaries; concept density per week; recurring topics (spiral candidates) | CLT element interactivity; Mayer pre-training. |
| Prerequisites / course level (100- vs 400-level; graduate) | Novice vs. expert assumption -> worked-example density, scaffolding, Bloom distribution | Expertise reversal effect (Sweller 2019); QM 2.5. |
| Class size | Feasibility of PBL/discussion/peer review vs. auto-graded retrieval | Fink situational factors. |
| Discipline / subject nature | Convergent vs. divergent; procedural vs. conceptual; case tradition | Fink; PBL/flipped effect moderators (section 3). |
| Group work, labs, fieldwork, clinicals | Milestone structures; equivalency needs | Project-based/PBL patterns. |
| Program/accreditation outcomes referenced | Competency mapping; CBE candidate | C-BEN framework. |

**Product implication:** the analyzer should extract these fields into a structured "course profile" and surface the profile for faculty confirmation before generating structure options (Fink Step 1 in software form). The workload estimator should be built in, with its assumptions editable, and it should compute per-module hours against the credit-hour budget.

---

## 3. Course-structuring patterns the AI can propose

Each pattern: fit, evidence, risks. The AI should present 3-4 of these as options with a rationale tied to the course profile, and allow combining (e.g., weekly cadence + project milestones + spiral review).

### 3.1 Weekly / topic-sequenced
- **Fit:** Default for most lecture-based, textbook-driven, large-enrollment courses; async online courses benefit from a consistent weekly rhythm. Vanderbilt and Charlotte CTL guidance recommends consistent module templates and chunked, predictable pacing in online courses ([Online Course Module Structure, Vanderbilt](https://www.vanderbilt.edu/cdr/module1/online-course-module-structure/); [Chunking and Pacing in Online Courses, UNC Charlotte CTL](https://teaching.charlotte.edu/teaching-guides/online-learning/chunking-and-pacing-online-courses/)).
- **Evidence:** Consistency and predictability are QM/OSCQR design standards; weekly retrieval checks capture the quizzing effect (Yang et al. 2021).
- **Risks:** Becomes a chapter-coverage plan; objectives get lost; no integration. Mitigate with module objectives and a cumulative element.

### 3.2 Unit / theme-based
- **Fit:** Humanities, social sciences, interdisciplinary or survey courses; courses with essential questions.
- **Evidence:** UbD's "big ideas" and essential questions organize content around transfer rather than coverage ([UbD overview](https://pressbooks.pub/etsu/chapter/understanding-by-design-ubd-and-the-backward-design-framework/)).
- **Risks:** Uneven unit lengths; workload spikes at unit ends. Mitigate with workload leveling.

### 3.3 Problem- / case-based (PBL)
- **Fit:** Professional and clinical disciplines (medicine, nursing, law, business, engineering), smaller sections or well-structured teams, courses with applied objectives.
- **Evidence:** Strobel & van Barneveld's meta-synthesis: "PBL was superior when it comes to long-term retention, skill development and satisfaction of students and teachers, while traditional approaches were more effective for short-term retention as measured by standardized board exams" ([When is PBL More Effective?, IJPBL 2009](https://scholarworks.iu.edu/journals/index.php/ijpbl/article/view/28220)). Merrill's problem-centered principle underpins it.
- **Risks:** Weaker short-term factual recall; facilitation load scales with sections; needs well-designed problems. Propose only when objectives are Apply/Analyze/Evaluate-heavy; pair with retrieval checks for foundational knowledge.

### 3.4 Project-based with milestones
- **Fit:** Design, software, capstone, writing-intensive, studio, community-engaged courses; any course with a single high-weight deliverable.
- **Evidence:** Chen & Yang's meta-analysis (30 studies, 12,585 students) found d = 0.71 for PjBL on achievement, with effects moderated by subject area, hours of instruction, and technology support, and not by education level ([Chen & Yang 2019, Educational Research Review](https://www.sciencedirect.com/science/article/abs/pii/S1747938X19300211)).
- **Risks:** Late-semester overload; free-riding in teams; insufficient scaffolding. The AI should generate milestones (proposal, plan, draft, peer review, final) placed against the workload budget and require formative feedback at each milestone (Fink FIDeLity).

### 3.5 Competency / mastery-based (CBE)
- **Fit:** Industry training, professional certification prep, programs with explicit competency frameworks, self-paced online.
- **Evidence:** C-BEN's Quality Framework has eight elements including "Clear, Measurable, Meaningful and Integrated Competencies," "Coherent, Competency Driven Program and Curriculum Design," and "Credential-Level Assessment Strategy," on the premise that "progress toward a credential should be determined by what learners know and are able to do" ([C-BEN Quality Framework User's Guide](https://www.c-ben.org/wp-content/uploads/2022/02/CBEN-22-005-Quality-Framework-for-CBE-Programs-A-User_s-Guide.pdf)). Umbrella reviews note the evidence base is still descriptive and practice-varied ([A Scoping Umbrella Review of Competency-Based Education, CBE Review Journal](https://journals.ku.edu/cberj/article/view/24119)).
- **Risks:** Requires assessment infrastructure (multiple attempts, mastery thresholds); credit-hour/financial-aid compliance in higher ed; isolates learners if self-paced without community. Propose for industry audiences and for higher-ed courses that already list competencies.

### 3.6 Flipped / blended
- **Fit:** Courses with reliable contact time and procedural/problem-solving content (STEM problem sets, health sciences, language); moderate class sizes.
- **Evidence:** A 2025 second-order meta-analysis (32 meta-analyses, 928 studies, 219,236 students) reports g = 0.726 overall, larger for behavioral than cognitive outcomes, "more effective in health-related subject and language than STEM," with "large heterogeneity" and "highly context-dependent" effectiveness ([The effectiveness of the flipped classroom: A second-order meta-analysis, Educational Research Review 2025](https://www.sciencedirect.com/science/article/abs/pii/S0883035525003283)). Active learning generally: Freeman et al. found failure rates fall from 34% to 22% and exam scores rise ~6% under active learning across 225 STEM studies ([Freeman et al. 2014, PNAS](https://www.pnas.org/doi/abs/10.1073/pnas.1319030111)).
- **Risks:** Students skipping pre-work; front-loaded production cost for faculty; pre-class quizzes have small effects (g = 0.186) versus post-class (Yang et al. 2021), so accountability should come from in-class application rather than pre-quizzes alone.

### 3.7 Spiral curriculum
- **Fit:** Cumulative, skill-building disciplines (math, languages, programming, clinical reasoning); multi-course sequences.
- **Evidence:** Bruner's principle of revisiting topics at increasing complexity; widely used in medical education ([Spiral Curriculum, MedEdMentor](https://mededmentor.org/theory-database/theory-index/spiral-curriculum/)); mechanistically supported by spacing (Cepeda et al. 2006) and repeated retrieval (Yang et al. 2021: 3+ quizzes g = 0.642).
- **Risks:** Perceived redundancy; harder to map to a linear textbook. Best offered as an overlay ("spaced review" slots) on another structure rather than as a standalone option.

### 3.8 Scaffolded skill progression
- **Fit:** Skills courses (writing, lab technique, coding, statistics); novice audiences.
- **Evidence:** Scaffolding with fading is grounded in Vygotsky's ZPD and in CLT's worked-example -> completion -> full-problem progression and expertise reversal ([Sweller et al. 2019](https://leadinglearner.me/wp-content/uploads/2019/02/sweller2019_article_cognitivearchitectureandinstru.pdf); [Scaffolding in Teacher-Student Interaction: A Decade of Research](https://link.springer.com/article/10.1007/s10648-010-9127-6)).
- **Risks:** Over-scaffolding experts; under-specified fading schedule. AI should generate an explicit support-fading plan per skill.

### 3.9 "Bookend" structure
- **Fit:** Any course; especially useful for reflective, professional, or general-education courses.
- **Description:** An opening module that sets purpose, community, and a diagnostic/baseline (Gagne events 1-3; CoI social presence; TILT purpose), and a closing module that integrates, reflects, and transfers (Fink Integration/Learning How to Learn; Merrill Integration; Gagne event 9). Boettcher's eCoaching tip describes bookending as a way "to add structure and meaning" with a strong start and close ([eCoaching Tip 85, Designing for Learning](http://designingforlearning.info/ecoachingtips/ecoaching-tip-85/)); scenario-based training uses the same pattern ([Using eLearning Scenarios as Bookends, Scissortail](https://scissortailcs.com/using-elearning-scenarios-as-bookends/)).
- **Evidence:** Indirect (component evidence from Gagne, CoI teaching presence, TILT, retrieval of baseline).
- **Risks:** Tokenistic if the bookends are not tied to assessments. Should be an overlay applied to every structure by default.

### 3.10 HyFlex
- **Fit:** Institutions committed to attendance-mode choice; smaller classes; faculty with tech support.
- **Evidence:** Beatty's four principles: learner choice, equivalency, reusability, accessibility ([Values and Principles of Hybrid-Flexible Course Design, EdTech Books](https://edtechbooks.org/hyflex/hyflex_values?book_nav=true)). A 2025 systematic review of 57 studies found mixed academic results, high satisfaction, and that synchronous attendance correlated with higher grades than asynchronous; students struggled with self-regulation, and the review recommends scaffolding self-regulated learning, transactional-distance dialogue, and CoI presence ([HyFlex course design: outcomes, challenges, and supports, Journal of Computing in Higher Education 2025](https://link.springer.com/article/10.1007/s12528-025-09452-6)).
- **Risks:** Equivalency is hard; asynchronous students underperform; heavy instructor load. The AI should generate mode-equivalent activity triplets for every module and self-regulation scaffolds (weekly plan, progress dashboards).

### 3.11 Term-length variants (accelerated)
- Shortened 7-8 week terms are spreading in community colleges with reported completion gains (e.g., Odessa College success rates 67% -> 87% since 2014; a Virginia CCS study found positive effects on grades and completion), but researchers caution results are "mixed-to-positive," that success "depends on how it's implemented," and that burnout is a risk ([Shorter term, bigger gain?, EdSource 2025](https://edsource.org/2025/accelerated-learning-community-colleges/743832)). **Product implication:** term length is an input to the workload budget, not a structure choice; the AI must recompute per-module hours and warn when compression exceeds the credit-hour budget.

---

## 4. Adult learning science for industry / corporate training audiences

The feature can serve both audiences if the *analysis* accepts a training brief or competency list as the "syllabus" and the *structure options* include performance-centered patterns.

### 4.1 Andragogy and SDT (see 1.11)
Industry learners are voluntary or mandated adults with job roles; the "need to know," problem orientation, and use of experience are non-negotiable. Structure proposals should lead every module with "why this matters to your work," use scenario/practice first, and offer choice within structure.

### 4.2 Action mapping (Cathy Moore)
Action mapping starts with a measurable business goal, then asks what people need to **do** (not know), designs realistic practice activities, and supplies only the minimum information needed to complete the practice; Moore added a flowchart in 2013 to test "is training really the answer?" and stresses that the map's purpose is "to **prevent** the casual adding of content" ([Action mapping: A visual approach to training design, Cathy Moore](https://blog.cathy-moore.com/action-mapping-a-visual-approach-to-training-design/); [Action Mapping FAQs](https://blog.cathy-moore.com/action-mapping/action-mapping-faqs/)).
- **CHECK (industry brief):** Is there a business/performance goal with a metric? Are behaviors named? Is training the right intervention (vs. job aid/process fix)?
- **PROPOSE:** A "performance-first" structure: goal -> behaviors -> practice scenarios -> minimal content; job-aid suggestions where a module's content is reference material.

### 4.3 Performance-based objectives (Mager / ABCD)
Mager's format specifies **performance** (observable behavior), **conditions**, and **criterion**; the ABCD variant adds Audience ([Techniques and Methods of Performance Objectives, GMU](https://mason.gmu.edu/~ndabbagh/cehdclass/Resources/IDKB/objective_formats.htm); [Robert Mager's Performance-Based Learning Objectives, Vector Solutions](https://www.vectorsolutions.com/resources/blogs/robert-magers-performance-based-learning-objectives/)). For industry, the objective analyzer should apply Mager's three parts rather than only Bloom's verb check.

### 4.4 Evaluation: Kirkpatrick and Phillips
Kirkpatrick's four levels: Reaction, Learning, Behavior, Results; the New World Kirkpatrick Model recommends starting design at Level 4 (organizational results), identifying leading indicators and "required drivers," and treating the performance environment as a foundation ([The Kirkpatrick Model, Kirkpatrick Partners](https://www.kirkpatrickpartners.com/the-kirkpatrick-model/)). Phillips adds Level 5 ROI ([Phillips ROI Model, Whatfix](https://whatfix.com/blog/phillips-roi-model/)).
- **PROPOSE:** For industry structures, generate an evaluation plan per module (Level 2 checks) and per course (Level 3 behavior indicators and Level 4 metrics drawn from the business goal), so the course map includes evaluation, not just assessment.

### 4.5 70-20-10
The 70-20-10 split traces to CCL interviews of 191 executives (McCall, Lombardo & Morrison; Lombardo & Eichinger 1996). ATD notes "there is a lack of empirical data supporting 70:20:10" and that the original data were retrospective recollections, recommending it be treated as a reminder that learning happens through experience and others, not a resource-allocation formula ([70-20-10: Where Is the Evidence?, ATD](https://www.td.org/content/atd-blog/70-20-10-where-is-the-evidence)).
- **Product implication:** do not present 70-20-10 as evidence-based. Do use its underlying idea: every industry structure option should include on-the-job application tasks and social/coaching components alongside formal modules.

### 4.6 Microlearning
Systematic reviews (2024-2025) report positive effects of short, focused learning units on retention and engagement in workplace and higher-ed contexts, while noting inconsistent definitions and study quality ([Revolutionizing learning in the digital age: a systematic literature review of microlearning strategies, Interactive Learning Environments 2024](https://www.tandfonline.com/doi/abs/10.1080/10494820.2024.2331638); [Microlearning beyond boundaries: A systematic review and a novel framework, PMC 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC11774797/)). Mechanistically it inherits segmenting (Mayer), spacing (Cepeda), and retrieval (Yang) evidence.
- **PROPOSE:** For industry, a "microlearning path" option: 5-10 minute units, each with one performance objective, one practice item, and spaced re-exposure; explicitly warn that microlearning suits discrete procedures and refreshers better than complex conceptual change.

---

## 5. Module design evidence: granularity, workload, assessment frequency, course maps

### 5.1 Granularity
- **Module = one week** is the dominant higher-ed convention for async online and matches QM/OSCQR expectations of consistent structure; CTLs recommend a repeated module template (overview, objectives, materials, activities, assessment, summary) ([Vanderbilt, Online Course Module Structure](https://www.vanderbilt.edu/cdr/module1/online-course-module-structure/); [Concordia CTL, Online module design](https://www.concordia.ca/ctl/tech-tools/practices/design-your-course/module-design.html)).
- **Lesson/segment length:** video engagement drops after ~6 minutes (Guo et al. 2014); students prefer segments under 15 minutes ([OSCQR video length guidance](https://oscqr.suny.edu/how-long-should-instructional-videos-be/)). CLT's transient-information and isolated-elements effects support small, self-paced segments (Sweller 2019).
- **Rule of thumb for generation:** 3-5 module objectives per module; each objective maps to at least one activity and one assessment item; each module contains one retrieval check and one feedback opportunity.

### 5.2 Weekly workload norms
- Federal credit-hour definition: 1 hour direct instruction + minimum 2 hours out-of-class per week per credit for ~15 weeks ([34 CFR 600.2](https://www.ecfr.gov/current/title-34/subtitle-B/chapter-VI/part-600/subpart-A/section-600.2)). So a 3-credit course budgets ~9 hours/week total; 4-credit ~12.
- Use the Rice estimator's reading and writing rate tables to convert assigned pages and assignments into hours; the authors caution that writing rates are "far more speculative" than reading rates ([Rice CTE, How Much Should We Assign?](https://cte.rice.edu/blog/2016/workload); OSU's adaptation: [Workload Estimation, OSU ASC ODE](https://ascode.osu.edu/workload-estimation)).
- **Product implication:** show per-module estimated hours against the budget; flag modules over budget; make rate assumptions editable.

### 5.3 Assessment frequency
- Frequent low-stakes quizzing produces g ~ 0.5, more with repetition and feedback (Yang et al. 2021). Distributed practice is high-utility (Dunlosky et al. 2013). QM 3.4/3.5 require sequenced, varied assessments and multiple progress checkpoints.
- **Rule of thumb:** at least one formative check per module with feedback; a summative assessment at least every 3-4 modules; cumulative elements in later summatives.

### 5.4 The alignment matrix / course map as the standard deliverable
Course maps are the standard instructional-design deliverable: a table with course objectives, module objectives, materials, activities, assessments, and (often) Bloom level and time estimates per row, used to verify QM alignment ([Course Maps: A Key Tool, UNM CTL](https://ctl.unm.edu/instructors/explore-new-ideas/course-map-a-key-tool-for-designing-and-updating-your-course.html); [Course Mapping Template, HPU CTL](https://www.hpu.edu/ctl/instructional_resources/course-mapping.html); [Course Map and Mapping Components, Reynolds CC](https://www.reynolds.edu/faculty_and_staff/cetl/teaching-guides-and-resources/teaching-strategy-and-pedagogy/accelerated-terms/coursemapmappingcomponents.pdf); [Alignment, Course Map Guide](https://www.coursemapguide.com/alignment)).
- **Product implication:** the course map should be a first-class, exportable object (CSV/XLSX for QM reviewers); every generated module row must be traceable to a course objective; empty cells are visible gaps, not hidden.

---

## 6. Generative AI in course design (2023-2026): quality problems and guardrails

### 6.1 What the research reports
- **Practitioner use and concerns.** A mixed-methods study of 70 instructional designers (13 interviewed) found GenAI used mainly for brainstorming, low-stakes drafting, and adapting materials, with major concerns about "hallucinations, bias, and inaccuracy requiring extensive human review," privacy/data leakage, authorship/copyright, and missing institutional policy ([Exploring instructional designers' utilization and perspectives on generative AI tools, ETR&D 2024](https://link.springer.com/article/10.1007/s11423-024-10437-y)). A follow-up on IDs' prioritizations for ChatGPT integration is in ETR&D 2025 ([An exploration of instructional designers' prioritizations for integrating ChatGPT](https://link.springer.com/article/10.1007/s11423-025-10509-7)).
- **Generic, decontextualized, sometimes wrong output.** Preservice teachers designing units with ChatGPT found outputs "generalized" and "dull," ignoring specific learners, with unrealistic pacing (e.g., eight chapters in 15 minutes) and factual errors; they evaluated outputs on accuracy, relevance, applicability, and specificity and concluded human judgment was essential for contextual tailoring ([Bridging Generative AI Technology and Teacher Education, CITE Journal 2024](https://citejournal.org/volume-24/issue-4-24/general/bridging-generative-ai-technology-and-teacher-education-understanding-preservice-teachers-processes-of-unit-design-with-chatgpt/)). A SWOT analysis of ChatGPT for natural-sciences course design reports similar strengths (speed, ideation) and weaknesses (accuracy, currency, need for verification) ([ChatGPT for natural sciences course design: SWOT, Natural Sciences Education 2024](https://acsess.onlinelibrary.wiley.com/doi/10.1002/nse2.70003)).
- **Fabricated references.** LLM citation fabrication is well documented; a 2025 experimental study found fabrication rates in LLM-generated mental-health research citations varied with topic familiarity and prompt specificity ([Influence of Topic Familiarity and Prompt Specificity on Citation Fabrication, JMIR/PMC 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12658395/)), and a 2026 analysis of computing-education literature documents "emerging hallucinations" in citations ([Testing Our Foundations: Citation Trends, Errors, and Emerging Hallucinations, arXiv 2026](https://arxiv.org/html/2609.16574v1)).
- **Human-AI co-design models.** The UbD-based hybrid model (ERIC EJ1476270) recommends grounding the model with pedagogical source material, structured prompts, alignment validation rubrics, and reflective questioning, with the principle that "AI should not replace teacher expertise but rather augment it through dynamic, informed human oversight" ([A Human-AI Hybrid Co-Design Model](https://files.eric.ed.gov/fulltext/EJ1476270.pdf)). A JAID 2025 co-creative approach combines GenAI with learning analytics under designer control ([A Co-Creative Approach for AI-Enhanced Instructional Design, JAID](https://edtechbooks.org/jaid_14_3/yqdqercqzk)); a companion JAID paper surveys adoption and best practices ([Generative AI in Instructional Design: Adoption, Benefits, and Best Practices, JAID](https://edtechbooks.org/jaid_14_3/ciglaqjrnb)).
- **EDUCAUSE stance.** AI should "streamline routine tasks," "embed quality checks directly into the design process," and "connect to established frameworks like Quality Matters," and should not replace "thoughtful pedagogy or faculty expertise" or operate without "clearly defined instructional purpose"; faculty remain "mentors, architects of learning, and stewards of student success" ([AI and Course Design, EDUCAUSE Review 2026](https://er.educause.edu/articles/2026/2/ai-and-course-design-machines-can-help-but-only-humans-can-teach)). The 2025 Horizon Action Plan focuses on building faculty GenAI literacy rather than automation ([2025 EDUCAUSE Horizon Action Plan: Building Skills and Literacy for Teaching with GenAI](https://library.educause.edu/resources/2025/9/2025-educause-horizon-action-plan-building-skills-and-literacy-for-teaching-with-genai)).
- **LLMs and Bloom's levels.** Work on LLM question generation at targeted Bloom levels shows models can be steered by taxonomy templates but require evaluation for level fidelity ([Automated Educational Question Generation at Different Bloom's Skill Levels Using LLMs](https://link.springer.com/chapter/10.1007/978-3-031-64299-9_12); [How Teachers Can Use LLMs and Bloom's Taxonomy to Create Educational Quizzes, arXiv 2024](https://arxiv.org/html/2401.05914)), which supports using Bloom as an explicit generation constraint and a post-generation check.

### 6.2 Guardrails to build into the product (derived from the above)

1. **Ground every generation in the faculty's own artifacts.** The syllabus, confirmed course profile, and faculty-approved objectives are the only sources for starter content; the model is instructed to cite which syllabus passage each proposal derives from (provenance display).
2. **No fabricated sources.** Starter content must not invent readings, citations, datasets, or statistics. Readings come from the syllabus or are marked "[placeholder: faculty to select]." Any external reference must resolve (DOI/URL check) or be dropped.
3. **Alignment validation before provisioning.** Run an automated QM-style alignment check (every module objective -> course objective; every assessment -> objective; verb-level match) and block provisioning of orphaned items; show the map.
4. **Bloom/Mager level fidelity check.** Classify generated objectives and assessment items by level and compare to intended level; flag drift.
5. **Specificity check against genericness.** Score generated text for course-specific nouns (from the syllabus) vs. boilerplate; reject or flag modules that could apply to any course.
6. **Workload feasibility check.** Compute hours per module using the estimator; block plans exceeding the credit-hour budget without faculty override.
7. **Propose, don't decide.** Structure options are presented with rationale and trade-offs (including the evidence caveats above); faculty select/combine; nothing is provisioned without explicit approval. Every generated element is editable and labeled as a draft.
8. **Situational-factor confirmation first.** Before any generation, faculty confirm the extracted course profile (Fink Step 1), which also captures context the syllabus omits (learner population, prior knowledge, institutional constraints).
9. **Transparency and rationale.** Each proposal shows which framework(s) motivated it (e.g., "retrieval check added per QM 3.5 and Yang et al. 2021") so faculty can accept, adapt, or reject on pedagogical grounds.
10. **Privacy and IP.** Syllabi and course materials are faculty IP; do not use them for model training without consent; support institutional policy settings (a top ID concern in the ETR&D 2024 study).
11. **Accessibility by default.** Generated content meets UDL 3.0 and QM Standard 8 basics (structure, alt text prompts, captions).
12. **Evaluate the feature itself with Kirkpatrick-style evidence.** Track faculty edits to generated content (a proxy for quality), alignment-check pass rates, and downstream QM review outcomes.

---

## 7. Requirements-oriented summary (for the PRD)

**Analysis stage must produce:**
- Structured course profile (credits, term, modality, contact hours, level, prerequisites, class size, discipline, assessments + weights, weekly topics, readings) for faculty confirmation.
- Objective audit: measurability, Bloom level/knowledge type (or Mager parts for industry), Fink category, course-level fit.
- Alignment audit: objective <-> assessment <-> activity coverage and verb match; orphan detection.
- Learner-centeredness scores on Palmer et al. (four components, 0-46) and Cullen & Harris (three factors), with quoted evidence.
- Workload estimate vs. credit-hour budget.
- Deficiency list mapped to QM/OSCQR standard numbers.

**Structure-generation stage must offer:**
- 3-4 structure options from section 3, selected by course-profile rules, each with fit rationale, evidence caveats, risks, and a mini course map; combinable overlays (bookends, spiral review, UDL choice points, CoI presence plan, milestone plan).

**Module-provisioning stage must produce, per module:**
- Title, description with rationale ("why this matters"), 3-5 measurable module objectives mapped to course objectives, suggested activities using the Gagne/Merrill lesson skeleton, one retrieval check, one TILT-formatted assignment (purpose/task/criteria), estimated hours, materials slots (from the syllabus or placeholders), and, for online courses, teaching-presence and interaction elements.
- All items flagged "draft"; provenance to syllabus passages; alignment map updated live; empty cells visible.

**Non-negotiables:** faculty approval gates, no fabricated sources, editable everything, framework-cited rationale, workload feasibility, accessibility defaults.

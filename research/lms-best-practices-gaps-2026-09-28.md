# LMS Best Practices and Feature Gaps: Research for Project Tessera

Prepared for: Jeff Geronimo (Project Tessera owner)
Date: Monday, September 28, 2026 (PT)
Scope: Higher education and workplace learning platforms (Canvas, Blackboard/Anthology Learn, Moodle, D2L Brightspace, Cornerstone, Docebo, Workday Learning, SAP SuccessFactors, 360Learning, TalentLMS and others), with sources from 2024 to 2026 preferred. Every claim links to its source inline. Dates are publication dates unless noted. Reddit thread dates marked "approx." are estimated from the thread and could be off by a few weeks.

---

## 1. Executive summary

- **The ADA Title II deadline moved.** The DOJ's April 20, 2026 interim final rule pushed the April 24, 2026 compliance date to **April 26, 2027** for public entities of 50,000+ people and to **April 26, 2028** for smaller ones. The technical standard is still **WCAG 2.1 AA**, not 2.2 ([Federal Register, Apr 20, 2026](https://www.federalregister.gov/documents/2026/04/20/2026-07663/extension-of-compliance-dates-for-nondiscrimination-on-the-basis-of-disability-accessibility-of-web); [ADA.gov guide](https://www.ada.gov/resources/small-entity-compliance-guide/)). HHS moved its parallel Section 504 dates to May 11, 2027 and May 10, 2028 ([HHS, May 7, 2026](https://www.hhs.gov/press-room/hhs-extends-mobile-and-web-accessibility-deadline.html)). Remediation work is still heavy and faculty feel unsupported ([Inside Higher Ed, Apr 21, 2026](https://www.insidehighered.com/news/government/colleges-localities/2026/04/21/doj-extends-web-accessibility-deadline); [Independent Florida Alligator, Feb 22, 2026](https://www.alligator.org/article/2026/02/uf-faculty-react-new-accessibility-guidelines)).
- **Buyers rank UX and integration well above AI.** eLearning Industry's 2026 benchmark puts User Experience first (70%), then pricing (63%), integration (59%), analytics (46%) and AI (30%). It also finds 42% of vendors saying they have "fully integrated AI" while only 7.5% of buyers report that ([eLearning Industry, Aug 19, 2026](https://elearningindustry.com/lms-selection-criteria)).
- **Workplace dissatisfaction is at a record high.** Fosway says over half of buyers are negative about their learning tech, and almost two in three say their LMS/LXP is not delivering on AI ([Fosway, Nov 2025](https://www.fosway.com/research/next-gen-learning/better-learning-platforms/)). Josh Bersin calls the LMS "designed to track and manage content, not be easy to use" ([Bersin, 2025 report PDF](https://info.joshbersin.com/hubfs/L%26D%2025_05%20Its%20Time%20for%20an%20L%26D%20Revolution%20Report.pdf)).
- **Gradebook trust is the most concrete daily pain in higher ed.** Faculty report wrong calculations, drop-lowest surprises, quiz scores that fail to sync, and what-if grades that don't match. Some instructors hide the calculated total because it is "never correct" ([r/Professors, Jan 2025](https://www.reddit.com/r/Professors/comments/1i5b7r3/canvas_gradebook_and_extra_credit/); [Instructure Community, Jan 2026](https://community.instructure.com/en/discussion/664637/intermittent-issues-with-new-quiz-scores-not-populating-in-grades-and-speedgrader)).
- **Content authoring is where vendors are putting their money in 2026.** Blackboard's new content editor has about 1,300 Ideas Exchange requests behind it. Canvas is piloting a block editor. D2L launched Createspace, a versioned "create once, improve everywhere" content system ([Phil Hill on Blackboard, Jul 28, 2026](https://onedtech.philhillaa.com/p/building-blackboard-together-conference-notes-2026); [on InstructureCon, Jul 29, 2026](https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026); [on D2L Fusion, Jul 27, 2026](https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026)).
- **Learner-facing AI tutors are now common.** D2L Lumi Learner Mode, Canvas IgniteAI Study Tools and the Athena project, Blackboard Scholar, and Workday Learning powered by Sana (GA July 22, 2026) all shipped or announced one in 2026. Faculty are still skeptical: an AAUP survey cited by Inside Higher Ed found 69% of faculty say AI hurts student success ([Inside Higher Ed, Aug 1, 2025](https://www.insidehighered.com/news/faculty/learning-assessment/2025/08/01/faculty-are-latest-targets-higher-eds-ai-ification); [Workday, Jul 22, 2026](https://www.prnewswire.com/news-releases/workday-learning-powered-by-sana-now-generally-available-as-an-ai-native-learning-experience-built-on-workdays-trusted-data-302831592.html)).
- **Security, continuity and data ownership are now buying criteria.** The Canvas intrusions on April 29 and May 7, 2026 took Canvas offline during finals. In response, customers' top continuity request was gradebook access ([Instructure incident page](https://www.instructure.com/incident_update); [The Register, May 12, 2026](https://www.theregister.com/security/2026/05/12/double-canvas-intrusion-confirmed-as-shinyhunters-resets-leak-deadline/5238361); [Phil Hill, Jul 29, 2026](https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026)).
- **What this means for Tessera:** its human-reviewed AI, accessibility tooling and transparent tutor line up well with where the market is heading. But it is missing table-stakes interoperability (LTI 1.3, SIS/HRIS, SCORM/xAPI/cmi5, grade passback) and a mobile experience. The highest-leverage development focus is **interoperability, an explainable gradebook, and authoring at scale** (Section 7).

---

## 2. Top best practices to adopt (2024 to 2026)

### 2.1 UX and admin/course-building workflow
- **Cut the clicks to the first useful action.** Bersin cites a bank where employees need "at least six clicks" to start a course ([Bersin 2025](https://info.joshbersin.com/hubfs/L%26D%2025_05%20Its%20Time%20for%20an%20L%26D%20Revolution%20Report.pdf)). UX is buyers' top criterion at 70% ([eLearning Industry, Aug 2026](https://elearningindustry.com/lms-selection-criteria)).
- **Make course structure consistent across courses.** EDUCAUSE's 2025/2026 student research points to frustration with inconsistent course practices and a preference for fewer, well-integrated tools ([EDUCAUSE 2025 Students and Technology Report](https://library.educause.edu/resources/2025/4/2025-educause-students-and-technology-report); summarized by [EIM Partnerships](https://eimpartnerships.com/articles/students-seek-balance-between-on-site-engagement-and-technological-flexibility-educause-2025-report-finds)). *Note: we could not fetch the EDUCAUSE page directly (Cloudflare), so this relies on summaries.*
- **Keep fixing everyday friction, with dates attached.** Phil Hill praised D2L's "unglamorous, daily-friction" work: zero-point quiz questions, quiz annotations, and distributed sub-org admin ([Jul 27, 2026](https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026)). He also said Canvas customers asked for "more concrete improvements to core workflows, even small ones" ([Jul 29, 2026](https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026)).
- **Delegate administration.** D2L now lets sub-org admins manage their own navigation, themes and announcements ([Jul 27, 2026](https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026)). On the workplace side, practitioners complain that Workday Learning left L&D with "no control" because the HRIS team owns it ([r/instructionaldesign, approx. May 2024](https://www.reddit.com/r/instructionaldesign/comments/1d4b9zy/workday_learning/)).

### 2.2 Accessibility (WCAG 2.1 AA legally; 2.2 as the forward target)
- **Build to WCAG 2.1 AA for Title II, and aim for 2.2 where you can.** 2.1 AA is what the rule requires ([ADA.gov](https://www.ada.gov/resources/small-entity-compliance-guide/)). D2L is already marketing H5P's WCAG 2.2 AA alignment ([Jul 27, 2026](https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026)).
- **Treat course content as in scope.** The 2024 final rule dropped the course-content exceptions that were in the 2023 proposal, so every PDF, video, image and audio clip needs to be accessible ([Inside Higher Ed, Apr 21, 2026](https://www.insidehighered.com/news/government/colleges-localities/2026/04/21/doj-extends-web-accessibility-deadline)).
- **Remediate inside the workflow, with a human approving.** Blackboard Ally's PDF auto-tagging (GA July 2026) has the instructor review tags before the file goes back into the course. Early adopter demand was 70+ institutions against a target of 20. Phil Hill calls untagged PDFs and missing video audio description the two biggest gaps ([Jul 28, 2026](https://onedtech.philhillaa.com/p/building-blackboard-together-conference-notes-2026)).
- **Support STEM content.** A UF math lecturer spent "20 to 30 hours modifying just one file" of LaTeX math and said: "they're not giving me any tools" ([Alligator, Feb 22, 2026](https://www.alligator.org/article/2026/02/uf-faculty-react-new-accessibility-guidelines)). Tagged LaTeX-to-PDF workflows now exist ([r/Professors guide, 2026](https://www.reddit.com/r/Professors/comments/1rg7mke/latex_and_the_ada_accessibility_requirements_a/); [LaTeX tagging project](https://latex3.github.io/tagging-project/documentation/usage-instructions)).
- **Offer alternative formats.** Blackboard is adding an enhanced reader format with word emphasis, a reading ruler and dark mode ([Jul 28, 2026](https://onedtech.philhillaa.com/p/building-blackboard-together-conference-notes-2026)).

### 2.3 AI features and governance
- **Opt-in, disclosed, grounded in course content, with human review.** Canvas IgniteAI tools are "disabled by default," opted into course by course, and each one ships with "AI Nutrition Facts" ([Univ. of Delaware, May 5, 2026](https://sites.udel.edu/canvas/2026/05/canvas-igniteai-tools/)). D2L reports that 98% of Lumi sessions cite course material, and Learner Mode keeps individual knowledge-check results private to the student ([Jul 27, 2026](https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026)).
- **Disclose AI in third-party tools too.** Instructure will ask partners to disclose their AI features in its partner portal ([Jul 29, 2026](https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026)).
- **Plan for immature institutional governance.** In EDUCAUSE's 2025 AI Landscape Study, 39% of institutions had AI acceptable-use policies (up from 23%), and only 9% felt their cybersecurity and privacy policies were adequate for AI risks ([GovTech summary of EDUCAUSE 2025](https://www.govtech.com/education/higher-ed/survey-higher-ed-ai-adoption-faces-financial-policy-hurdles)).
- **Keep high-stakes AI evaluation formative.** Canvas relaunched its AI-graded "LLM Assignments" as low-stakes "Knowledge Chats" with no gradebook column ([Jul 29, 2026](https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026)). Derek Bruff had warned that students "self-censor" when a chatbot grades them ([Inside Higher Ed, Aug 1, 2025](https://www.insidehighered.com/news/faculty/learning-assessment/2025/08/01/faculty-are-latest-targets-higher-eds-ai-ification)).
- **Frame integrity around authorship, not detection.** Blackboard's Cursive records the writing process instead of producing an AI-likelihood score. Phil Hill flags that it sits on the line of surveillance overreach ([Jul 28, 2026](https://onedtech.philhillaa.com/p/building-blackboard-together-conference-notes-2026)).

### 2.4 Analytics
- **Measure outcomes, not just completions.** 46% of buyers call analytics essential ([eLearning Industry, Aug 2026](https://elearningindustry.com/lms-selection-criteria)). "Better data and analytics" is the first reason Brandon Hall lists for switching LMS ([Brandon Hall, undated](https://brandonhall.com/making-the-move-time-for-a-new-lms/)). Workday pitches tying safety training to incident data ([Jul 22, 2026](https://www.prnewswire.com/news-releases/workday-learning-powered-by-sana-now-generally-available-as-an-ai-native-learning-experience-built-on-workdays-trusted-data-302831592.html)).
- **Close the loop from insight to action.** Lumi Insights now suggests fixes: edit the problem question, revise content, or email the students who struggled ([Jul 27, 2026](https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026)).

### 2.5 Interoperability
- **Support only LTI 1.3 / LTI Advantage, with dynamic registration.** 1EdTech deprecated LTI 1.1 ([1EdTech](https://www.1edtech.org/lti-security-announcement-and-deprecation-schedule)). Instructure is moving its own integrations to 1.3 by the end of 2026 ([Jul 29, 2026](https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026)). Brightspace Apps is LTI 1.3 only and explains requested permissions in plain language ([Jul 27, 2026](https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026)). Dynamic registration is documented for [Canvas](https://canvas.instructure.com/doc/api/file.registration.html) and [Moodle](https://moodlelti.theedtech.dev/dynreg/).
- **Keep SCORM 1.2 and add cmi5 and xAPI.** SCORM is still dominant for completion tracking. cmi5 support varies: Docebo, Absorb and Moodle support it, while others are partial ([LMSPedia 2026 guide](https://lmspedia.org/cmi5-guide-lms-implementation-2026/), secondary source). Cornerstone users say xAPI results report only "completed," not pass/fail ([r/instructionaldesign, approx. Jan 2024](https://www.reddit.com/r/instructionaldesign/comments/19722q3/what_are_your_opinions_on_cornerstone_ondemand_as/)).
- **Make SIS and HRIS sync observable and recoverable.** Banner passback fails for many reasons, including missing grading schemes, unposted grades, and grades "rolled to history" ([Weber State](https://www.weber.edu/online/grades.html); [USU, Apr 2025 update](https://usu.service-now.com/kb_view.do?sysparm_article=KB0015004); [D2L Banner error codes](https://community.d2l.com/brightspace/kb/articles/23801-export-grades-to-banner-grades)). Workday provisioning depends on sync reports and role mapping ([Workday docs](https://doc.workday.com/admin-guide/en-us/human-capital-management/learning/workday-learning-powered-by-sana/steps--set-up-user-provisioning-for-workday-learni.html)).
- **Offer an agent interface.** Canvas added bidirectional MCP support ([Jul 29, 2026](https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026)).

### 2.6 Mobile
- **Full mobile parity, including grades.** Canvas's mobile what-if grades don't work with weighted grading periods and aren't saved ([Instructure KB, May 18, 2026](https://community.instructure.com/en/kb/articles/661733-how-do-i-check-my-what-if-grades-in-the-canvas-app-on-my-android-device)). Docebo reviewers mention clunky mobile use ([review aggregation](https://www.techjockey.com/us/reviews/docebo), weak source). Frontline and offline-first guidance comes mainly from vendor blogs ([example](https://icantech.ai/insights/mobile-learning-for-frontline-workers)), so the evidence here is thin.

### 2.7 Compliance training
- **Role-based auto-assignment from HR data.** Workday/Sana updates learning paths "automatically when employees join, change roles, or move regions" ([Jul 22, 2026](https://www.prnewswire.com/news-releases/workday-learning-powered-by-sana-now-generally-available-as-an-ai-native-learning-experience-built-on-workdays-trusted-data-302831592.html)).
- **Test-out with legal review, plus short scenario-based modules.** Practitioners report compliance completion "at like 20%" ([r/elearning, approx. Nov 2025](https://www.reddit.com/r/elearning/comments/1ow3fmu/compliance_training_completion_is_at_like_20_and/)). Test-out guidance notes some mandates require seat time ([Articulate](https://www.articulate.com/blog/reboot-your-compliance-training-test-and-learn/); [ATD case PDF](https://assets.td.org/m/6743d2ccd25829f3/original/Consumers-Energy-Cutting-Costs-by-Testing-for-Existing-Knowledge.pdf)).
- **Transcripts people can actually use.** One Cornerstone admin said transcripts "are an audit trail, not anything useful for learner, HRBP, or manager" ([r/instructionaldesign, approx. Jan 2024](https://www.reddit.com/r/instructionaldesign/comments/19722q3/what_are_your_opinions_on_cornerstone_ondemand_as/)).

### 2.8 Security, continuity and data ownership
- **Customers should control their own gradebook and roster exports.** After the breach, Instructure is adding admin bulk gradebook exports and roster exports. Read-only outage access and offline grading are listed as uncommitted ([Jul 29, 2026](https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026)).
- **Tenant isolation and egress monitoring.** D2L says these are why a similar attack would fail on Brightspace. That is D2L's claim, not independently verified ([Jul 27, 2026](https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026)).

---

## 3. Most-requested missing features and top pain points (ranked)

Evidence strength: **Strong** = several independent sources, including analyst or primary data. **Moderate** = consistent practitioner reports plus some secondary sources. **Weak** = vendor blogs or a single anecdote.

| Rank | Pain point | Evidence | Platforms / audiences | Key sources |
|---|---|---|---|---|
| 1 | Clunky, click-heavy UX; hard to find things; heavy admin burden | Strong | All; worst reports for Cornerstone, Workday Learning, SuccessFactors ILX, Blackboard Ultra, Brightspace, Moodle | [Fosway 2025](https://www.fosway.com/research/next-gen-learning/better-learning-platforms/); [eLI 2026](https://elearningindustry.com/lms-selection-criteria); [Bersin 2025](https://info.joshbersin.com/hubfs/L%26D%2025_05%20Its%20Time%20for%20an%20L%26D%20Revolution%20Report.pdf); [Cornerstone thread](https://www.reddit.com/r/instructionaldesign/comments/1i6o5du/cornerstone/) ("wildly manual, clunky, unintuitive, and outdated"); [Ultra thread](https://www.reddit.com/r/Professors/comments/1f1st5y/blackboard_ultra/) ("more unnecessary clicks"); [SAP Community on ILX](https://community.sap.com/t5/human-capital-management-q-a/new-ilx-blues/qaq-p/14173853); [Moodle "monolith" feedback](https://onedtech.philhillaa.com/p/moodlemoot-global-conference-notes-2025) |
| 2 | Weak integration and data sync (SIS, HRIS, LTI, content standards) | Strong | Workplace (HRIS) and higher ed (SIS passback) | [eLI 59% integration](https://elearningindustry.com/lms-selection-criteria); [Bersin 2025: "only 15% of organizations have their L&D systems well integrated"](https://info.joshbersin.com/hubfs/L%26D%2025_05%20Its%20Time%20for%20an%20L%26D%20Revolution%20Report.pdf); [Brandon Hall](https://brandonhall.com/when-shopping-for-an-lms-look-for-a-partner/); [D2L Banner errors](https://community.d2l.com/brightspace/kb/articles/23801-export-grades-to-banner-grades) |
| 3 | Gradebook inaccuracy and opacity (weights, drop-lowest, missing zeros, sync failures, what-if mismatch) | Strong (higher ed) | Canvas, Moodle, Blackboard Ultra, Brightspace | [Grades wrong](https://www.reddit.com/r/Professors/comments/1p4oxgj/canvas_is_calculating_grades_incorrectly/); [drop-lowest surprise](https://www.reddit.com/r/Professors/comments/1hetmya/aita_didnt_explain_how_canvas_drops_grades/); [New Quiz sync, Jan 2026](https://community.instructure.com/en/discussion/664637/intermittent-issues-with-new-quiz-scores-not-populating-in-grades-and-speedgrader); [Moodle natural weighting bug](https://docs.moodle.org/500/en/Natural_weighting) |
| 4 | Accessibility remediation burden (PDFs, slides, math, video) | Strong | Public higher ed; also all 504 recipients | [IHE Apr 2026](https://www.insidehighered.com/news/government/colleges-localities/2026/04/21/doj-extends-web-accessibility-deadline); [Alligator Feb 2026](https://www.alligator.org/article/2026/02/uf-faculty-react-new-accessibility-guidelines) ("doubled her course prep time"); [Ally uptake](https://onedtech.philhillaa.com/p/building-blackboard-together-conference-notes-2026) |
| 5 | Authoring and reuse friction (no bulk edits, sharing quizzes, migrations that break, content that can't be updated) | Moderate to strong | Canvas, Ultra, Brightspace, Moodle; SCORM-heavy workplace | [Canvas bulk move](https://community.instructure.com/en/discussion/610504/bulk-reorder-module-items); [New Quizzes sharing](https://community.instructure.com/en/discussion/667006/new-quiz-features-request); [Ultra nesting and test import](https://www.reddit.com/r/Professors/comments/1clmt8h/switching_to_blackboard_ultra_any_tips_from_those/); [SCORM updates](https://community.articulate.com/discussions/discuss/editing-existing-rise-scorm-to-update-course-in-lms---not-working-as-expected/904355) |
| 6 | Reporting that can't be trusted or customized | Moderate to strong | Cornerstone, Docebo, TalentLMS, 360Learning; compliance teams | [Cornerstone](https://www.reddit.com/r/instructionaldesign/comments/19722q3/what_are_your_opinions_on_cornerstone_ondemand_as/) ("Analytics are buggy on a good day"); [Brandon Hall](https://brandonhall.com/making-the-move-time-for-a-new-lms/); Docebo/TalentLMS review aggregations ([1](https://www.techjockey.com/us/reviews/docebo), [2](https://www.educate-me.co/blog/talentlms-review), weak) |
| 7 | AI that is untrusted or underdelivers; unclear data use; pedagogy concerns | Moderate to strong | All; faculty most skeptical | [Fosway](https://www.fosway.com/research/next-gen-learning/better-learning-platforms/); [IHE Aug 2025](https://www.insidehighered.com/news/faculty/learning-assessment/2025/08/01/faculty-are-latest-targets-higher-eds-ai-ification); [eLI AI gap](https://elearningindustry.com/lms-selection-criteria); [muted Learner Mode reaction](https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026) |
| 8 | Reliability, regressions, vendor support and lock-in | Moderate | Canvas (breach, New Quizzes regression), Cornerstone support, SAP Litmos support, Saba EOL | [New Quizzes regression, Mar 2026](https://community.instructure.com/en/discussion/665336/in-new-quizzes-after-students-have-taken-a-quiz-and-its-graded-i-want-students-to-be-able-to-view-quiz-questions-and-right-and-wrong-answers); [Canvas breach](https://www.theregister.com/security/2026/05/12/double-canvas-intrusion-confirmed-as-shinyhunters-resets-leak-deadline/5238361); [vendor thread](https://www.reddit.com/r/instructionaldesign/comments/xtnwuz/out_of_all_the_lms_vendors_out_there_which_one/) (older, 2022); [Saba EOL Dec 2026](https://www.schoox.com/blog/workday-learning-vs-cornerstone-which-enterprise-learning-platform-is-right-for-you-2026/) (competitor blog) |
| 9 | Compliance training disengagement | Moderate | Workplace | [r/elearning](https://www.reddit.com/r/elearning/comments/1ow3fmu/compliance_training_completion_is_at_like_20_and/); [r/instructionaldesign](https://www.reddit.com/r/instructionaldesign/comments/1piq2st/struggling_with_sub20_percent_completion_on/) |
| 10 | Mobile and offline gaps | Weak in this sweep | Frontline workplace; students checking grades | [Canvas mobile what-if limits](https://community.instructure.com/en/kb/articles/661733-how-do-i-check-my-what-if-grades-in-the-canvas-app-on-my-android-device); vendor blogs |

Selected voices (brief quotes):
- "Canvas help was no help... Canvas support closed the cases... without resolving the issues." ([r/Professors, approx. Feb 2025](https://www.reddit.com/r/Professors/comments/1iir3ns/canvas_grade_book_issue_no_support_from_support/))
- "to grade 7 essay questions for a hundred students on a quiz I have to click 'next' 7 hundred times." ([r/canvas, approx. May 2025](https://www.reddit.com/r/canvas/comments/1kim5z2/speedgrader_is_absolute_garbage/)). Note: Canvas documents a Grade by Question option for New Quizzes ([Instructure Community](https://community.instructure.com/en/discussion/562706/grade-by-question-in-speedgrader-for-new-quizzes)), so part of this is a discoverability problem.
- "Workday are a HRIS company who stuck the bones of an LMS on the side." ([r/instructionaldesign, approx. May 2024](https://www.reddit.com/r/instructionaldesign/comments/1d4b9zy/workday_learning/)). This predates Workday Learning powered by Sana (GA July 2026).
- "this functionality was lost on the eve of exams I was giving to 600 students." (Canvas New Quizzes, [Instructure Community, Mar 2026](https://community.instructure.com/en/discussion/665336/in-new-quizzes-after-students-have-taken-a-quiz-and-its-graded-i-want-students-to-be-able-to-view-quiz-questions-and-right-and-wrong-answers))
- "The system is still a course management system, and... it has not yet earned the L." (Phil Hill paraphrasing incoming Blackboard CEO Matt Pittinsky, [Jul 28, 2026](https://onedtech.philhillaa.com/p/building-blackboard-together-conference-notes-2026))

---

## 4. Deep dive A: Gradebook

### 4.1 Best practices
1. **One calculation engine for everything.** Instructor view, learner view, what-if, mobile and SIS export should all use the same engine. Canvas what-if results can differ from actual rules and aren't available with weighted grading periods on mobile ([Instructure KB, May 2026](https://community.instructure.com/en/kb/articles/661733-how-do-i-check-my-what-if-grades-in-the-canvas-app-on-my-android-device); [UBC student guide](https://students.canvas.ubc.ca/what-if-grades-in-canvas/)).
2. **Explicit handling of missing work.** Drop-lowest in Canvas needs zeros entered, and blank cells break it ([Ohio State](https://teaching.resources.osu.edu/toolsets/carmencanvas/guides/calculate-final-grades)). Turning on drop-lowest before all scores are in surprised students ([r/Professors, approx. Dec 2024](https://www.reddit.com/r/Professors/comments/1hetmya/aita_didnt_explain_how_canvas_drops_grades/)).
3. **First-class extra credit.** Instructors work around it with 0%-weighted groups or 0-point items ([r/Professors, Jan 19, 2025](https://www.reddit.com/r/Professors/comments/1i5b7r3/canvas_gradebook_and_extra_credit/)). Moodle's Natural aggregation has native extra credit, but switching schemes marks weighted items as extra credit because of a known bug ([Moodle docs](https://docs.moodle.org/500/en/Natural_weighting); [Grade aggregation](https://docs.moodle.org/500/en/Grade_aggregation)).
4. **Automated late and missing policies** that show up on learner views and respect accommodations. Blackboard's new student to-do list respects accommodations and release conditions ([Jul 28, 2026](https://onedtech.philhillaa.com/p/building-blackboard-together-conference-notes-2026)).
5. **Grade posting and muting** (held grades released together) with a clear state indicator. Unposted or hidden grades are left out of final calculations and passback ([Ohio State](https://teaching.resources.osu.edu/toolsets/carmencanvas/guides/calculate-final-grades)).
6. **Grade-by-question and side-by-side grading** with rubric, feedback and submission in one view ([Grade by Question](https://community.instructure.com/en/discussion/562706/grade-by-question-in-speedgrader-for-new-quizzes); complaint in Section 3).
7. **Standards and mastery grading that feeds the official grade.** Canvas's Learning Mastery Gradebook runs separately from the traditional gradebook. It can't apply grading schemes or weight and nest outcomes, and outcomes can't be edited once used ([LMU SBG Hub](https://sbghub.lmu.build/implementation/integration-with-lms/); [CanvasSBG workaround](https://github.com/BRueckert/CanvasSBG)). Blackboard moved outcomes and mastery into its core license in July 2026, and D2L simplified outcome alignment ([Blackboard](https://onedtech.philhillaa.com/p/building-blackboard-together-conference-notes-2026); [D2L](https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026)).
8. **Accessible grid plus an accessible single-student view.** Canvas offers keyboard shortcuts on the grid and an "Individual View" built for screen readers ([VCU](https://vcuonline.zendesk.com/hc/en-us/articles/360032132251-How-do-I-use-the-Gradebook); [Instructure](https://community.instructure.com/en/kb/articles/660826-how-do-i-use-the-gradebook)).
9. **SIS passback with a pre-flight check and a clear error report.** Enforce a valid grading scheme, make sure letter grades are present, collect last-attended dates for F grades, and warn before grades roll to history ([Weber](https://www.weber.edu/online/grades.html); [USU](https://usu.service-now.com/kb_view.do?sysparm_article=KB0015004); [TAMUCC GradeSync 2025](https://www.tamucc.edu/dlai/faculty/assets/gradesync-job-aid_2025.pdf); [D2L error table](https://community.d2l.com/brightspace/kb/articles/23801-export-grades-to-banner-grades)).
10. **Export and continuity.** Institutions' top continuity ask after the Canvas breach was gradebook access ([Jul 29, 2026](https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026)).

### 4.2 Current state by platform
- **Canvas:** Mature grid, SpeedGrader, posting policies, what-if, Learning Mastery Gradebook. Recurring reports of calculation confusion and New Quizzes sync failures ([Jan 2026 thread](https://community.instructure.com/en/discussion/664637/intermittent-issues-with-new-quiz-scores-not-populating-in-grades-and-speedgrader)). IgniteAI Grading Assistance suggests scores and feedback from the rubric; it is opt-in and expected to carry extra cost ([UD, May 2026](https://sites.udel.edu/canvas/2026/05/canvas-igniteai-tools/)). Admin bulk gradebook export is in early adoption ([Jul 2026](https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026)).
- **Blackboard Learn Ultra:** A rebuilt gradebook is in beta: more rows and columns in view, direct grading, and a grading-tasks panel. There is also a rubric overhaul (central management, import/export, multiple rubrics per assignment) ([Jul 2026](https://onedtech.philhillaa.com/p/building-blackboard-together-conference-notes-2026)). Faculty had called the old Ultra gradebook "worse... a lot fewer features," noted that late submissions were hidden, and said an assignment can't be edited once a student opens it ([r/Professors, 2024](https://www.reddit.com/r/Professors/comments/1clmt8h/switching_to_blackboard_ultra_any_tips_from_those/); [approx. Jan 2025](https://www.reddit.com/r/Professors/comments/1hvsqmc/lms_blackboard_ultra/)).
- **Moodle:** Natural aggregation is the default, with other schemes that admins can enable. Documentation acknowledges a conversion bug and possible deprecation of other schemes ([docs](https://docs.moodle.org/500/en/Natural_weighting)).
- **D2L Brightspace:** Setup wizard, competency and rubric alignment, Banner export with coded errors. Faculty call it click-heavy ([r/Professors, approx. Aug 2025](https://www.reddit.com/r/Professors/comments/1moqqqo/d2l_makes_me_want_to_claw_my_eyes_out_how_do_yall/); [approx. Dec 2024](https://www.reddit.com/r/Professors/comments/1hmtxgj/my_goodness_bightspace_is_absolute_trash/)). *We only had search snippets for these threads; Reddit blocked full fetch.*
- **Workplace LMSs** (Cornerstone, Docebo, TalentLMS) center on completion transcripts and certifications rather than weighted gradebooks. The complaints there are about reporting accuracy (see Section 3).

### 4.3 Common complaints (summary)
Wrong or opaque totals; drop-lowest and missing-zero surprises; extra-credit workarounds; quiz-to-gradebook sync failures; clunky navigation through each student's quiz; separate mastery gradebook; SIS passback errors; and support that can't resolve problems ([r/Professors, approx. Feb 2025](https://www.reddit.com/r/Professors/comments/1iir3ns/canvas_grade_book_issue_no_support_from_support/)).

### 4.4 Tessera recommendations (gradebook)
Tessera today has rubrics, AI-drafted feedback, held grades and CSV export.
1. **Explainable totals (new).** Every calculated grade gets a "How this was calculated" panel listing weights, drops, excluded items and late penalties. Learners see the same view.
2. **Grade-setup linter before publishing (new).** Warn about drop-lowest without zeros, weights that don't add up, items marked "do not count," and mismatches between the grading scheme and the SIS.
3. **Exact what-if (new).** Use the server engine rather than a client approximation. Allow saving it, and make it work on mobile.
4. **Table-stakes policy features (verify current status).** Weighted categories, drop lowest/highest, extra credit, automated late and missing policies with accommodations, excused status, grading periods.
5. **Grade-by-question and side-by-side grading.** Include AI-drafted feedback that stays labeled and requires review, which Tessera's server-enforced review model already supports.
6. **Mastery view tied to the official grade (new).** Outcomes roll up to a grade scheme, with configurable calculation and a reassessment workflow.
7. **Accessible grid.** Proper ARIA grid semantics, keyboard shortcuts, a single-student accessible view, and a screen-reader walkthrough (already on backlog).
8. **SIS passback (backlog).** LTI AGS plus OneRoster/Banner-style final-grade submit, with a pre-flight check and an error report.
9. **Continuity exports.** Institution-level bulk gradebook and roster export in open formats alongside the existing CSV.

---

## 5. Deep dive B: Instructor content authoring

### 5.1 Best practices
1. **Block-based, accessible editing with switchable WYSIWYG and HTML.** Ultra users complained they could use "either WYSIWYG or HTML, not both" ([r/Professors, approx. Aug 2024](https://www.reddit.com/r/Professors/comments/1f1st5y/blackboard_ultra/)). Canvas's block editor enters early adoption this fall, with AI extras reserved for higher tiers ([Jul 2026](https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026)). Blackboard's new editor focuses on tables and keyboard navigation ([Jul 2026](https://onedtech.philhillaa.com/p/building-blackboard-together-conference-notes-2026)).
2. **Bulk operations.** Canvas can't multi-select and move module items; each has to be moved individually or through "Move Contents" for a whole module ([Instructure Community](https://community.instructure.com/en/discussion/610504/bulk-reorder-module-items); [r/Professors 2022](https://www.reddit.com/r/Professors/comments/wb5wxn/canvas_lms_functionality/), older).
3. **Flexible structure.** Ultra limits folder nesting and drag-and-drop is "very glitchy" ([r/Professors, approx. May 2024](https://www.reddit.com/r/Professors/comments/1clmt8h/switching_to_blackboard_ultra_any_tips_from_those/)).
4. **Versioning with safe updates.** Canvas has page history and restore ([Instructure KB](https://community.instructure.com/en/kb/articles/660960-how-do-i-view-the-history-of-a-page-in-a-course)). D2L Createspace offers versioned source content synced to many courses ([Jul 2026](https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026)). Replacing a SCORM package while learners are mid-course can break resume ([Moodle US](https://supportus.moodle.com/support/solutions/articles/80001142558-scorm-best-practices-for-updating-scorm-activities-in-moodle); [Articulate community](https://community.articulate.com/discussions/discuss/editing-existing-rise-scorm-to-update-course-in-lms---not-working-as-expected/904355)).
5. **Blueprint and template sync with transparent rules.** In Canvas Blueprint, locked items always overwrite, and edited unlocked items are skipped and logged as exceptions ([Instructure](https://community.instructure.com/en/kb/articles/628548-blueprint-sync-functionalities)).
6. **Course copy without broken links or media.** Copying and pasting between courses creates links back to the old course. Images in New Quizzes item banks can go missing on import ([UWGB](https://blog.uwgb.edu/catl/broken-links-in-canvas/); [Instructure Community](https://community.instructure.com/en/discussion/629692/missing-images-in-new-quizzes-linked-to-item-banks-when-course-is-imported)).
7. **Shareable question banks with in-quiz grouping.** New Quizzes dropped "Question Groups," so one exam might need 15 item banks ([Feb 25, 2026](https://community.instructure.com/en/discussion/665320/confirm-question-groups-are-impossible-in-nq)). Teachers also want quizzes they can share and results by section ([Instructure Community](https://community.instructure.com/en/discussion/667006/new-quiz-features-request)). Moodle 5.0 moved to shareable question banks ([CLAMP, Jun 18, 2025](https://www.clamp-it.org/blog/2025/06/18/the-question-bank-in-moodle-5-0/)). Ultra imports publisher test banks awkwardly ([r/Professors, May 17, 2025](https://www.reddit.com/r/Professors/comments/1koi6we/new_to_blackboard_ultra_how_to_select_and_use/)).
8. **Accessibility checks while authoring, not after.** Blackboard's Learning Object Repository carries accessibility scoring, so a fix to a shared object flows to every course that uses it ([Jul 2026](https://onedtech.philhillaa.com/p/building-blackboard-together-conference-notes-2026)).
9. **AI authoring that converts existing material, with an author reviewing.** Workday/Sana turns PDFs and decks into structured courses, proposes outlines, objectives and checks that "authors can review and adjust," and supports real-time co-authoring and translation ([Jul 22, 2026](https://www.prnewswire.com/news-releases/workday-learning-powered-by-sana-now-generally-available-as-an-ai-native-learning-experience-built-on-workdays-trusted-data-302831592.html)). D2L's Lumi Remix and "SCORM scraper" uplift legacy content ([Jul 2026](https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026)). IgniteAI generates quiz questions and rubrics ([UD, May 2026](https://sites.udel.edu/canvas/2026/05/canvas-igniteai-tools/)).
10. **Cleaner paste from Word and Docs.** RCE paste quirks are documented widely ([MiraCosta KB](https://miracosta.atlassian.net/wiki/spaces/KB/pages/3321036833); [Cidi Labs](https://support.cidilabs.com/knowledgebase/personality-quirks-of-the-rich-content-editor)).

### 5.2 Current state by platform
- **Canvas:** Modules with drag-and-drop and a "Move to" tray (single item). RCE with page history. Blueprint. Block editor coming. New Quizzes is near parity but was disrupted by a Feb 25 to Mar 4, 2026 regression ([thread](https://community.instructure.com/en/discussion/665336/in-new-quizzes-after-students-have-taken-a-quiz-and-its-graded-i-want-students-to-be-able-to-view-quiz-questions-and-right-and-wrong-answers); [updates post](https://community.instructure.com/en/discussion/665633/what-s-new-in-new-quizzes-the-updates-you-ve-been-asking-for)).
- **Blackboard Ultra:** Original courses stop running at the end of 2026. New content editor in beta. Learning Object Repository with accessibility scoring. AI Design Assistant ([Jul 2026](https://onedtech.philhillaa.com/p/building-blackboard-together-conference-notes-2026)). NIU recommends against auto-converting live courses because submissions can be lost ([NIU](https://www.niu.edu/blackboard/ultra/best-practices.shtml)).
- **D2L Brightspace:** The Content Experience is used by about 70% of customers and is getting a full-width viewer and a collapsible table of contents. Creator+ (paid), H5P, Lumi Remix, and Createspace for versioned sync ([Jul 2026](https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026)).
- **Moodle:** 5.x has shared question banks, an AI subsystem with a policy layer, and a React-based re-architecture targeted to finish by 2027 ([moodledev AI subsystem](https://moodledev.io/docs/5.3/apis/subsystems/ai); [MoodleMoot 2025 notes](https://onedtech.philhillaa.com/p/moodlemoot-global-conference-notes-2025)).
- **Workplace:** Workday Learning (Sana) offers AI conversion and co-authoring. Workday Learning's older version was criticized for a "lack of course design tools" ([r/instructionaldesign, approx. May 2024](https://www.reddit.com/r/instructionaldesign/comments/1d4b9zy/workday_learning/)). Bersin argues SCORM-based authoring is being replaced by "dynamic content" systems ([Feb 2026](https://joshbersin.com/2026/02/new-research-how-ai-transforms-400-billion-of-corporate-learning/)).

### 5.3 Pain points (summary)
No bulk editing; painful migrations and conversions; quizzes that can't be shared or grouped; broken links after copy; SCORM updates that break learner progress; lost HTML control; slow accessibility fixes; and AI features locked behind premium tiers ([Canvas tiers, Jul 2026](https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026)).

### 5.4 Tessera recommendations (authoring)
Tessera today has a module/lesson outline editor, block-based lessons, AI drafting at any scope, templates with preview-before-apply, and persona variants.
1. **Multi-select and bulk actions in the outline (new).** Move, duplicate, publish/unpublish, set dates, and apply a template to a selection. Make every bulk action a keyboard-accessible alternative to drag-and-drop, with one-click undo.
2. **Versioned source with sync (new).** Lessons and question banks become versioned objects. Updates push to linked courses with a preview of the change, respect local edits (exceptions shown, not silently skipped), and never break in-progress attempts. This extends preview-before-apply and one-click undo from templates to content.
3. **Question banks.** Shareable banks with in-quiz groups and random draws, results by section, and QTI 2.1 import/export. *The Tessera context doesn't mention quizzes or question banks; if they aren't built, this is a table-stakes gap.*
4. **Import and migration (partly new).** Canvas/Common Cartridge/QTI/SCORM import with a link-and-media validator, plus the in-progress "Start from a syllabus" flow. Converting existing material is the strongest AI authoring pattern in the market (see 5.1 item 9).
5. **Accessibility at authoring time (built, extend).** Add math (LaTeX to MathML), video captioning and audio-description workflows, and course-wide bulk remediation. Tessera's per-lesson scoring and AI fixes are already ahead of most native editors.
6. **Keep HTML escape hatches.** A source view for each block, clean paste from Word and Docs, and block-level history.
7. **Keep AI unbundled.** Competitors gate AI authoring to premium tiers, so including reviewed AI drafting by default is a differentiator.

---

## 6. Opportunities for Project Tessera to differentiate

### 6.1 Gap-to-status map

| Market gap / best practice | Tessera status | Notes |
|---|---|---|
| Human-in-the-loop AI with provenance and enforced review | **Already addressed** | Matches the market's direction (Canvas opt-in plus "Nutrition Facts," D2L citations). Differentiator: server-enforced review before publish. |
| Accessibility scoring and AI remediation, alternate formats, publish policy | **Already addressed** | Scores WCAG 2.2, a superset of the legally required 2.1 AA. Needs math, video, bulk and institution reporting. |
| Transparent, hint-first tutor that never sees the answer key | **Already addressed** | Competitors now have tutors (Lumi Learner Mode, Canvas Study Tools, Athena, Scholar, Sana), so this is parity-plus. The integrity guarantee is the differentiator. |
| Compliance training: test-out, certificates, audit trail, privacy-first manager view | **Already addressed** | Addresses usable transcripts and completion fatigue. Needs HRIS-driven assignment. |
| Quality readiness (OSCQR / custom rubrics), plain-language and micro-path variants | **Already addressed** | Speaks to student demand for consistency. |
| Agent API (REST, SDK, MCP with destructive actions excluded) | **Already addressed** | Canvas now has bidirectional MCP, so this is parity. The safety exclusions are a trust story. |
| Rubrics, AI-drafted feedback, held grades, CSV export | **Partly addressed** | See gradebook gaps in Section 4.4. |
| LTI 1.3 / Advantage (AGS, NRPS, Deep Linking) | **On backlog** | Table stakes; blocks institutional adoption. |
| SIS / HRIS sync and grade passback | **On backlog** | Table stakes. |
| SCORM / xAPI / cmi5 | **On backlog** | Table stakes for workplace. |
| Mobile player with tutor, dark/compact modes | **On backlog** | Table stakes. |
| Screen-reader walkthrough, usability study | **On backlog** | Needed to credibly claim accessibility of Tessera itself. |
| Explainable gradebook, setup linter, exact what-if, mastery-to-grade | **Not yet planned (new)** | Strong higher ed demand. |
| Bulk authoring operations and versioned content sync | **Not yet planned (new)** | Vendors are investing heavily here. |
| Question banks with groups, sharing, QTI | **Unknown / verify** | Table stakes if missing. |
| Customer-controlled continuity (full exports, read-only mode) | **Not yet planned (new)** | Post-breach buying criterion. |
| Institution AI policy console and AI disclosure cards | **Not yet planned (new)** | Governance is immature (EDUCAUSE 39% / 9%). |
| Accessibility conformance report (VPAT/ACR) for Tessera, security attestations | **Not yet planned (new)** | Procurement table stakes. |
| Institutional SSO (SAML/OIDC), provisioning beyond Cloudflare Access invites | **Verify** | Likely needed for pilots at any scale. |

### 6.2 Top differentiation opportunities
1. **"Trust you can inspect" AI.** Combine Tessera's existing provenance, enforced review and transparent tutor with a per-feature AI disclosure card (model, data use, what it can and can't see) and an institution AI policy console. This answers the faculty skepticism and immature governance described in Section 2.3 ([IHE](https://www.insidehighered.com/news/faculty/learning-assessment/2025/08/01/faculty-are-latest-targets-higher-eds-ai-ification); [GovTech/EDUCAUSE](https://www.govtech.com/education/higher-ed/survey-higher-ed-ai-adoption-faces-financial-policy-hurdles); [eLI "trust is the next arena"](https://elearningindustry.com/lms-selection-criteria)).
2. **Explainable gradebook.** Show the math, run a pre-publish linter, provide exact what-if, and keep mastery tied to the official grade. No major platform markets this, and the complaints are widespread (Section 4).
3. **Accessibility remediation as a core workflow, including STEM.** Tessera already does document remediation with alternate formats. Adding LaTeX/MathML and course-wide bulk fixes targets the April 2027 and 2028 deadlines ([Federal Register](https://www.federalregister.gov/documents/2026/04/20/2026-07663/extension-of-compliance-dates-for-nondiscrimination-on-the-basis-of-disability-accessibility-of-web); [Alligator](https://www.alligator.org/article/2026/02/uf-faculty-react-new-accessibility-guidelines)). Caveat: Blackboard Ally already runs in about 1,000 institutions, 60% of them on competitors' LMSs ([Phil Hill](https://onedtech.philhillaa.com/p/building-blackboard-together-conference-notes-2026)).
4. **Syllabus-to-course plus versioned content with safe sync.** "Start from a syllabus" (in progress), then versioned lessons and banks with preview-before-sync and undo. This competes with D2L Createspace and Workday/Sana conversion, but without premium gating.
5. **Compliance training people don't hate.** Test-out, plain-language and micro-path variants, privacy-first manager view and verifiable certificates are already built. Adding HRIS-driven auto-assignment would close the loop ([Workday/Sana](https://www.prnewswire.com/news-releases/workday-learning-powered-by-sana-now-generally-available-as-an-ai-native-learning-experience-built-on-workdays-trusted-data-302831592.html); [r/elearning](https://www.reddit.com/r/elearning/comments/1ow3fmu/compliance_training_completion_is_at_like_20_and/)).
6. **Your data, always.** One-click full export (gradebook, roster, content in Common Cartridge/QTI), a read-only continuity mode, and the existing audit trail. Canvas lists read-only outage access as uncommitted ([Phil Hill](https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026)).

### 6.3 Where Tessera is honestly behind (table stakes)
LTI 1.3/Advantage, SIS/HRIS rostering and grade passback, SCORM/xAPI/cmi5 playback, native mobile, institutional SSO, VPAT/ACR and security attestations (SOC 2 or equivalent), and possibly quizzes/question banks, discussions, calendar and notifications (not listed in the provided context; verify). The market data says integration (59%) outranks AI (30%) as a buying criterion ([eLI](https://elearningindustry.com/lms-selection-criteria)). Without these, Tessera's AI strengths are unlikely to get it past procurement.

---

## 7. Prioritized focus recommendations for Project Tessera

**Scoring:** Demand (1 to 5, from breadth and strength of evidence across sources and audiences) x Impact (1 to 5, effect on adoption, learner outcomes and legal risk) = Score out of 25. Effort (S/M/L) is shown separately and used only to break ties. The scores are the analyst's judgment based on the evidence cited here, not measured data.

| Rank | Area | Demand | Impact | Score | Effort | Tessera status |
|---|---|---|---|---|---|---|
| 1 | Interoperability: LTI 1.3 Advantage, SIS/HRIS sync, grade passback, SCORM/cmi5/xAPI | 5 | 5 | 25 | L | Backlog |
| 2 | Gradebook correctness and transparency | 5 | 5 | 25 | M | Partly built |
| 3 | Authoring at scale: bulk ops, question banks, versioned reuse/sync, import | 4 | 5 | 20 | M-L | Partly built (editor, AI, templates); rest not planned |
| 4 | Accessibility remediation depth (math, video, bulk, reporting, own ACR) | 5 | 4 | 20 | M | Built (core); extensions not planned |
| 5 | AI governance and disclosure (policy console, disclosure cards) | 4 | 4 | 16 | S-M | Partly built (provenance, review) |
| 6 | Actionable analytics and trustworthy compliance reporting | 4 | 4 | 16 | M | Partly built (compliance reports) |
| 7 | Data portability, continuity and security posture | 3 | 5 | 15 | M | Partly built (audit trail, CSV); rest not planned |
| 8 | Mobile player with tutor (offline later) | 3 | 4 | 12 | L | Backlog |
| 9 | Compliance training automation (HRIS-driven assignment) | 3 | 4 | 12 | M (after #1) | Built core; HRIS on backlog |
| 10 | Learner-facing AI study tools | 3 | 3 | 9 | S | Built (tutor); competitors at parity |

### Detail per area

**1. Interoperability (Backlog).**
- *Why:* Integration is the #3 buying criterion (59%) ([eLI](https://elearningindustry.com/lms-selection-criteria)), and only 15% of organizations have well-integrated L&D systems ([Bersin 2025 report](https://info.joshbersin.com/hubfs/L%26D%2025_05%20Its%20Time%20for%20an%20L%26D%20Revolution%20Report.pdf)). Integration is a top reason to switch LMS ([Brandon Hall](https://brandonhall.com/when-shopping-for-an-lms-look-for-a-partner/)), and the ecosystem is going LTI 1.3 only ([Phil Hill](https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026)).
- *Impact:* This gates every institutional pilot. It also lets Tessera run as a tool inside Canvas or Brightspace (for example, accessibility or syllabus-to-course features over LTI) before it tries to replace the LMS.
- *Next step:* Ship Tessera as an **LTI 1.3 tool** first (Deep Linking plus AGS grade return plus NRPS roster, with dynamic registration), certified with 1EdTech. Then add OneRoster CSV/API import and a SCORM 1.2/cmi5 player.

**2. Gradebook (Partly built).**
- *Why:* This is the most consistent faculty complaint in 2024 to 2026 (Section 4.3). Canvas and Blackboard are both reworking theirs ([Blackboard rebuilt gradebook](https://onedtech.philhillaa.com/p/building-blackboard-together-conference-notes-2026)), and gradebook access was the top continuity ask.
- *Impact:* Student trust, fewer support tickets, and passing faculty evaluation.
- *Next step:* Specify the policy features (weights, drops, extra credit, late/missing/excused) and one grade engine with an "explain this grade" view, plus a setup linter. Then run a 5-instructor test using real syllabi.

**3. Authoring at scale (Partly built).**
- *Why:* Blackboard's editor has about 1,300 requests behind it. Canvas's bulk-move gap is years old. New Quizzes has sharing and grouping gaps. D2L Createspace and Workday/Sana show vendors investing here (Section 5).
- *Impact:* Instructor time, which is the core of Tessera's value proposition.
- *Next step:* Add multi-select bulk actions in the outline. Build a question bank with groups and QTI 2.1. Prototype versioned lesson sync with a change preview.

**4. Accessibility depth (Built core).**
- *Why:* The legal deadlines are April 2027 and 2028, and faculty workload is well documented (Section 2.2).
- *Impact:* High legal and ethical stakes. This is Tessera's clearest existing strength, which is why it ranks #4: extending it matters, but closing the gaps in #1 to #3 matters more.
- *Next step:* LaTeX/MathML and equation remediation, a caption and audio-description workflow, course- and institution-level accessibility reports, and publishing Tessera's own ACR after the screen-reader walkthrough (backlog).

**5. AI governance (Partly built).**
- *Why:* EDUCAUSE found 39% of institutions have AI policies and 9% feel their policies are adequate ([GovTech](https://www.govtech.com/education/higher-ed/survey-higher-ed-ai-adoption-faces-financial-policy-hurdles)). AAUP found 69% of faculty say AI hurts student success ([IHE](https://www.insidehighered.com/news/faculty/learning-assessment/2025/08/01/faculty-are-latest-targets-higher-eds-ai-ification)). Canvas's "Nutrition Facts" set the bar ([UD](https://sites.udel.edu/canvas/2026/05/canvas-igniteai-tools/)).
- *Next step:* A per-feature disclosure card plus an admin policy console with per-feature on/off by org or course, data retention settings, and model choice.

**6. Analytics and compliance reporting (Partly built).**
- *Why:* 46% of buyers call analytics essential ([eLI](https://elearningindustry.com/lms-selection-criteria)). Reporting accuracy is a top workplace complaint ([Cornerstone thread](https://www.reddit.com/r/instructionaldesign/comments/19722q3/what_are_your_opinions_on_cornerstone_ondemand_as/)).
- *Next step:* An "insight to action" loop (for example, item analysis leading to a suggested fix, or at-risk learners leading to a drafted, human-reviewed nudge), plus pass/fail-accurate compliance exports.

**7. Data portability and continuity (Partly built).**
- *Why:* The Canvas breach and the continuity asks that followed ([Instructure](https://www.instructure.com/incident_update); [Phil Hill](https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026)).
- *Next step:* Full course/gradebook/roster export in open formats, a documented security posture, and a read-only mode design.

**8. Mobile (Backlog).**
- *Why:* Reasonable expectation, but the evidence gathered here is weak (Section 2.6).
- *Next step:* A responsive learner player with the tutor and grades. Validate offline need with workplace pilots before building native apps.

**9. Compliance automation (Built core, HRIS on backlog).**
- *Next step:* HRIS-driven rule-based assignment once rostering from #1 exists.

**10. Learner AI study tools (Built).**
- *Why:* Four major vendors launched these in 2026. Phil Hill notes muted reception and adoption risk ([D2L notes](https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026)).
- *Next step:* Maintain the tutor and measure learner use rather than expanding features.

### Check against the deep dives
- **Gradebook deep dive:** *Aligns.* The evidence confirms a top-tier rank and supports tying it with interoperability on score. It stays #2 only because grade passback (part of #1) is needed to make the gradebook usable at institutions.
- **Authoring deep dive:** *Aligns, and the ranking was adjusted.* Before the deep dive, authoring at scale scored 3 x 5 = 15 (around #6). The deep dive's evidence (Blackboard's roughly 1,300 editor requests, Canvas bulk-move and New Quizzes gaps, D2L Createspace, Workday/Sana conversion) raised Demand to 4 and moved it to #3, above accessibility depth. Accessibility has equal demand but Tessera already covers most of it.

---

## 8. Caveats about sources
- **Reddit:** Full thread pages were blocked (a bot check on WebFetch; curl returned empty). Quotes come from search-result snippets that show the post text. Where no date appeared, dates are approximate. Reddit posters self-select for frustration.
- **EDUCAUSE:** library.educause.edu and educause.edu returned Cloudflare challenges. The AI Landscape figures (39%, 9%) come from GovTech's summary, and the student-consistency findings from secondary summaries.
- **G2, Capterra, TrustRadius:** G2 returned 403. Docebo, TalentLMS and 360Learning review themes come from aggregators and competitor blogs (Techjockey, educate-me, rfp.wiki, Schoox), which are weak and sometimes vendor-motivated. Treat them as directional.
- **Vendor claims** (D2L's 50% build-time reduction, Workday/Sana's "up to 98%" creation time, D2L's security architecture claims) are unverified. Phil Hill notes the D2L claims are not verifiable.
- **Brandon Hall:** The switching-reasons pages are undated and may predate 2024. The Docebo-hosted Brandon Hall summary cites 2015 to 2017 data and is used only as background.
- **Josh Bersin** is a commercial party (Galileo, a Sana partner, and quoted in Workday's launch), so his "replace the LMS" framing has a commercial interest.
- **Phil Hill / On EdTech** posts are analyst opinion, but they are detailed and recent (July 2026). Parts of his reports are premium and weren't accessed.
- **The ADA/504 dates** come from primary Federal Register, ADA.gov and HHS sources. The IFR invited public comment (DOJ through June 22, 2026), so the rule text could still change.
- **Not researched in depth:** Moodle Tracker vote counts, Canvas Community idea vote totals, TrustRadius, Training Industry primary research, and r/sysadmin. No statistics were invented. Where a number appears, it is quoted from the linked source.

---

## 9. Sources

**Regulation and accessibility**
- Federal Register, DOJ Title II IFR, Apr 20, 2026: https://www.federalregister.gov/documents/2026/04/20/2026-07663/extension-of-compliance-dates-for-nondiscrimination-on-the-basis-of-disability-accessibility-of-web
- ADA.gov Small Entity Compliance Guide: https://www.ada.gov/resources/small-entity-compliance-guide/
- HHS Section 504 extension, May 7, 2026: https://www.hhs.gov/press-room/hhs-extends-mobile-and-web-accessibility-deadline.html
- Inside Higher Ed, "DOJ Extends Web Accessibility Deadline," Apr 21, 2026: https://www.insidehighered.com/news/government/colleges-localities/2026/04/21/doj-extends-web-accessibility-deadline
- Independent Florida Alligator, Feb 22, 2026: https://www.alligator.org/article/2026/02/uf-faculty-react-new-accessibility-guidelines
- LaTeX tagging project: https://latex3.github.io/tagging-project/documentation/usage-instructions
- r/Professors LaTeX accessibility guide (2026): https://www.reddit.com/r/Professors/comments/1rg7mke/latex_and_the_ada_accessibility_requirements_a/

**Analysts and market**
- Phil Hill, Spring 2026 Higher Ed LMS Market Analysis, May 7, 2026: https://onedtech.philhillaa.com/p/spring-2026-higher-ed-lms-market-analysis
- Phil Hill, D2L Fusion notes, Jul 27, 2026: https://onedtech.philhillaa.com/p/d2l-fusion-conference-notes-2026
- Phil Hill, Building Blackboard Together notes, Jul 28, 2026: https://onedtech.philhillaa.com/p/building-blackboard-together-conference-notes-2026
- Phil Hill, InstructureCon notes, Jul 29, 2026: https://onedtech.philhillaa.com/p/instructurecon-conference-notes-2026
- Glenda Morgan, MoodleMoot Global notes, Sep 24, 2025: https://onedtech.philhillaa.com/p/moodlemoot-global-conference-notes-2025
- Edutechnica, LMS Data Spring 2026, Jun 17, 2026: https://edutechnica.com/2026/06/17/lms-data-spring-2026-updates/
- Fosway, Digital Learning Realities, Nov 2025: https://www.fosway.com/research/next-gen-learning/better-learning-platforms/
- Josh Bersin, It's Time for an L&D Revolution (2025): https://info.joshbersin.com/hubfs/L%26D%2025_05%20Its%20Time%20for%20an%20L%26D%20Revolution%20Report.pdf
- Josh Bersin, Feb 2026 research post: https://joshbersin.com/2026/02/new-research-how-ai-transforms-400-billion-of-corporate-learning/
- Josh Bersin, enterprise learning tech market, Feb 2026: https://joshbersin.com/2026/02/the-enterprise-learning-tech-market-quickly-transforms-around-ai/
- PR Newswire, Josh Bersin Company research release: https://www.prnewswire.com/news-releases/ai-is-disrupting-the-400-billion-corporate-training-market-at-a-quickening-pace-warns-the-josh-bersin-company-302684945.html
- eLearning Industry, LMS Selection Criteria, Aug 19, 2026: https://elearningindustry.com/lms-selection-criteria
- Brandon Hall, Making the Move (undated): https://brandonhall.com/making-the-move-time-for-a-new-lms/
- Brandon Hall, When Shopping for an LMS (undated): https://brandonhall.com/when-shopping-for-an-lms-look-for-a-partner/
- Brandon Hall / EBSCO, L&D in 2025: https://web.brandonhall.com/hubfs/Research%20Reports%20%28Files%29/BHG_EBSCO_L%26D%20in%202025_RB.pdf
- GovTech summary of EDUCAUSE 2025 AI Landscape: https://www.govtech.com/education/higher-ed/survey-higher-ed-ai-adoption-faces-financial-policy-hurdles
- EDUCAUSE 2025 Students and Technology Report: https://library.educause.edu/resources/2025/4/2025-educause-students-and-technology-report
- Inside Higher Ed, Faculty and Canvas AI, Aug 1, 2025: https://www.insidehighered.com/news/faculty/learning-assessment/2025/08/01/faculty-are-latest-targets-higher-eds-ai-ification

**Vendors and institutions**
- Instructure incident update: https://www.instructure.com/incident_update
- Instructure incident fact sheet, May 13, 2026: https://www.instructure.com/sites/default/files/pdf/Instructure_by_Canvas_Incident_Fact_Sheet_5.13.26.pdf
- The Register, May 12, 2026: https://www.theregister.com/security/2026/05/12/double-canvas-intrusion-confirmed-as-shinyhunters-resets-leak-deadline/5238361
- Inside Higher Ed, Canvas pauses data delivery, Jul 16, 2026: https://www.insidehighered.com/news/quick-takes/2026/07/16/canvas-pauses-data-delivery
- Univ. of Delaware, Canvas IgniteAI tools, May 5, 2026: https://sites.udel.edu/canvas/2026/05/canvas-igniteai-tools/
- Workday Learning powered by Sana GA, Jul 22, 2026: https://www.prnewswire.com/news-releases/workday-learning-powered-by-sana-now-generally-available-as-an-ai-native-learning-experience-built-on-workdays-trusted-data-302831592.html
- Workday provisioning docs: https://doc.workday.com/admin-guide/en-us/human-capital-management/learning/workday-learning-powered-by-sana/steps--set-up-user-provisioning-for-workday-learni.html
- 1EdTech LTI deprecation: https://www.1edtech.org/lti-security-announcement-and-deprecation-schedule
- Canvas LTI registration docs: https://canvas.instructure.com/doc/api/file.registration.html
- Moodle LTI dynamic registration: https://moodlelti.theedtech.dev/dynreg/
- Moodle AI subsystem: https://moodledev.io/docs/5.3/apis/subsystems/ai
- Moodle docs, Natural weighting: https://docs.moodle.org/500/en/Natural_weighting
- Moodle docs, Grade aggregation: https://docs.moodle.org/500/en/Grade_aggregation
- CLAMP, Moodle 5.0 question bank, Jun 18, 2025: https://www.clamp-it.org/blog/2025/06/18/the-question-bank-in-moodle-5-0/
- Moodle US, SCORM update best practices: https://supportus.moodle.com/support/solutions/articles/80001142558-scorm-best-practices-for-updating-scorm-activities-in-moodle
- LMSPedia cmi5 guide 2026: https://lmspedia.org/cmi5-guide-lms-implementation-2026/
- SAP Community, New ILX Blues: https://community.sap.com/t5/human-capital-management-q-a/new-ilx-blues/qaq-p/14173853
- Schoox, Workday Learning vs Cornerstone 2026 (competitor blog): https://www.schoox.com/blog/workday-learning-vs-cornerstone-which-enterprise-learning-platform-is-right-for-you-2026/
- Ohio State, Calculate Final Grades: https://teaching.resources.osu.edu/toolsets/carmencanvas/guides/calculate-final-grades
- Weber State, Input Final Grades: https://www.weber.edu/online/grades.html
- USU, Submit Grades to Banner: https://usu.service-now.com/kb_view.do?sysparm_article=KB0015004
- TAMUCC GradeSync job aid 2025: https://www.tamucc.edu/dlai/faculty/assets/gradesync-job-aid_2025.pdf
- D2L, Export grades to Banner: https://community.d2l.com/brightspace/kb/articles/23801-export-grades-to-banner-grades
- LMU Standards-based Grading Hub: https://sbghub.lmu.build/implementation/integration-with-lms/
- CanvasSBG (GitHub): https://github.com/BRueckert/CanvasSBG
- VCU, Canvas Gradebook: https://vcuonline.zendesk.com/hc/en-us/articles/360032132251-How-do-I-use-the-Gradebook
- NIU, Ultra best practices: https://www.niu.edu/blackboard/ultra/best-practices.shtml
- UWGB, Avoiding broken links in Canvas: https://blog.uwgb.edu/catl/broken-links-in-canvas/
- Articulate, compliance test-out: https://www.articulate.com/blog/reboot-your-compliance-training-test-and-learn/

**Instructure Community**
- New Quiz scores not populating (Jan 2026): https://community.instructure.com/en/discussion/664637/intermittent-issues-with-new-quiz-scores-not-populating-in-grades-and-speedgrader
- New Quiz features request: https://community.instructure.com/en/discussion/667006/new-quiz-features-request
- Question Groups in NQ (Feb 25, 2026): https://community.instructure.com/en/discussion/665320/confirm-question-groups-are-impossible-in-nq
- New Quizzes updates: https://community.instructure.com/en/discussion/665633/what-s-new-in-new-quizzes-the-updates-you-ve-been-asking-for
- New Quizzes access regression (Mar 2026): https://community.instructure.com/en/discussion/665336/in-new-quizzes-after-students-have-taken-a-quiz-and-its-graded-i-want-students-to-be-able-to-view-quiz-questions-and-right-and-wrong-answers
- Grade by Question: https://community.instructure.com/en/discussion/562706/grade-by-question-in-speedgrader-for-new-quizzes
- Bulk reorder module items: https://community.instructure.com/en/discussion/610504/bulk-reorder-module-items
- Blueprint sync: https://community.instructure.com/en/kb/articles/628548-blueprint-sync-functionalities
- What-if grades (mobile, May 18, 2026): https://community.instructure.com/en/kb/articles/661733-how-do-i-check-my-what-if-grades-in-the-canvas-app-on-my-android-device
- Page history: https://community.instructure.com/en/kb/articles/660960-how-do-i-view-the-history-of-a-page-in-a-course
- Missing images in item banks: https://community.instructure.com/en/discussion/629692/missing-images-in-new-quizzes-linked-to-item-banks-when-course-is-imported

**Reddit (quoted from search snippets; see caveats)**
- https://www.reddit.com/r/Professors/comments/1iir3ns/canvas_grade_book_issue_no_support_from_support/
- https://www.reddit.com/r/Professors/comments/1p4oxgj/canvas_is_calculating_grades_incorrectly/
- https://www.reddit.com/r/Professors/comments/1i5b7r3/canvas_gradebook_and_extra_credit/
- https://www.reddit.com/r/canvas/comments/1kim5z2/speedgrader_is_absolute_garbage/
- https://www.reddit.com/r/Professors/comments/1hetmya/aita_didnt_explain_how_canvas_drops_grades/
- https://www.reddit.com/r/Professors/comments/1hvsqmc/lms_blackboard_ultra/
- https://www.reddit.com/r/Professors/comments/1f1st5y/blackboard_ultra/
- https://www.reddit.com/r/Professors/comments/1clmt8h/switching_to_blackboard_ultra_any_tips_from_those/
- https://www.reddit.com/r/Professors/comments/1koi6we/new_to_blackboard_ultra_how_to_select_and_use/
- https://www.reddit.com/r/Professors/comments/1moqqqo/d2l_makes_me_want_to_claw_my_eyes_out_how_do_yall/
- https://www.reddit.com/r/Professors/comments/1hmtxgj/my_goodness_bightspace_is_absolute_trash/
- https://www.reddit.com/r/Professors/comments/1okviwd/whats_the_worst_lms/
- https://www.reddit.com/r/Professors/comments/wb5wxn/canvas_lms_functionality/
- https://www.reddit.com/r/instructionaldesign/comments/19722q3/what_are_your_opinions_on_cornerstone_ondemand_as/
- https://www.reddit.com/r/instructionaldesign/comments/1i6o5du/cornerstone/
- https://www.reddit.com/r/instructionaldesign/comments/1d4b9zy/workday_learning/
- https://www.reddit.com/r/instructionaldesign/comments/xtnwuz/out_of_all_the_lms_vendors_out_there_which_one/
- https://www.reddit.com/r/elearning/comments/1ow3fmu/compliance_training_completion_is_at_like_20_and/
- https://www.reddit.com/r/instructionaldesign/comments/1piq2st/struggling_with_sub20_percent_completion_on/

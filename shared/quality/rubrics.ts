// Built-in readiness rubrics (D-024). Both ship with Tessera and can't be edited;
// institutions add their own as custom rubrics (for example QM items under their own
// license: QM's rubric text is never reproduced here).
//
// - The Tessera standard is written in plain words for Tessera, in areas that parallel
//   common course-quality frameworks.
// - OSCQR 4.0 is reproduced verbatim under CC BY 4.0 with the required attribution.
//   Source: https://oscqr.suny.edu/ (OSCQR 4.0, 2022). Check kinds are Tessera's mapping,
//   not part of OSCQR: automatic only where a check covers the whole standard.
import type { AutomaticCheck, Rubric, RubricCheckKind, RubricStandard } from '../domain';

const BUILT_AT = '2026-09-27T00:00:00.000Z';

type ItemSpec = [number: string, text: string, kind: RubricCheckKind, checkOrCriteria?: AutomaticCheck | string];

function standard(prefix: string, number: string, title: string, description: string, items: ItemSpec[]): RubricStandard {
  return {
    id: `${prefix}-s${number}`,
    number,
    title,
    description,
    items: items.map(([n, text, kind, extra]) => ({
      id: `${prefix}-${n}`,
      number: n,
      text,
      kind,
      check: kind === 'automatic' ? (extra as AutomaticCheck) : null,
      criteria: kind === 'automatic' ? '' : (extra ?? ''),
    })),
  };
}

export const TESSERA_RUBRIC_ID = 'rubric-tessera';
export const OSCQR_RUBRIC_ID = 'rubric-oscqr';

export const TESSERA_RUBRIC: Rubric = {
  id: TESSERA_RUBRIC_ID,
  name: 'Tessera course standard',
  source: 'tessera',
  version: '1.0',
  attribution: null,
  builtIn: true,
  updatedAt: BUILT_AT,
  standards: [
    standard('tsr', '1', 'Overview and navigation', 'Learners know where to start, how the course works, and how to reach the instructor.', [
      ['1.1', 'A "Start here" lesson tells learners how the course works and where to begin.', 'automatic', 'navigation-instructions'],
      ['1.2', 'Learners can find how to contact the instructor.', 'automatic', 'instructor-contact'],
      ['1.3', 'The welcome introduces the instructor and sets expectations for participation and communication.', 'ai', 'The course welcome names the instructor, says what learners will do each week, and states how and when learners and the instructor communicate.'],
      ['1.4', 'The course follows its template\'s required structure.', 'automatic', 'template-followed'],
    ]),
    standard('tsr', '2', 'Outcomes and objectives', 'What learners will be able to do is stated, measurable, and connected.', [
      ['2.1', 'The course lists its learning outcomes.', 'automatic', 'outcomes-present'],
      ['2.2', 'Outcomes describe what learners will be able to do, in terms that can be observed or measured.', 'ai', 'Each outcome uses an observable action (for example explain, calculate, design, evaluate) rather than "understand" or "know", and names what the learner acts on.'],
      ['2.3', 'Every module states an objective.', 'automatic', 'module-objectives'],
      ['2.4', 'Module objectives lead to the course outcomes.', 'ai', 'Each module objective supports at least one course outcome, and together the modules cover every outcome.'],
    ]),
    standard('tsr', '3', 'Assessment and feedback', 'Assessments measure the outcomes, and learners know how they\'re judged.', [
      ['3.1', 'Every check, scenario, and assignment is tagged with the outcomes it assesses.', 'automatic', 'assessments-aligned'],
      ['3.2', 'Every outcome is assessed at least once.', 'automatic', 'outcomes-assessed'],
      ['3.3', 'Assignments say how they\'re graded, with a rubric or clear criteria.', 'ai', 'Each assignment has instructions that state what to submit and how it will be judged, through a rubric or explicit criteria.'],
      ['3.4', 'Learners practice with feedback before graded work.', 'ai', 'Knowledge checks, scenarios, or other ungraded practice with feedback come before each graded assignment on the same skills.'],
    ]),
    standard('tsr', '4', 'Materials', 'Materials support the outcomes, fit the time, and read at the right level.', [
      ['4.1', 'Materials support the outcomes, are current, and cite their sources.', 'attestation', 'A reviewer confirms the materials support the outcomes, are current for the field, and name their sources.'],
      ['4.2', 'Every lesson has a time estimate that fits its content.', 'automatic', 'time-estimates'],
      ['4.3', 'The reading level suits the audience.', 'automatic', 'reading-level'],
      ['4.4', 'Third-party materials are used within their licenses.', 'attestation', 'A reviewer confirms that copyrighted and openly licensed materials are used within their terms and credited.'],
    ]),
    standard('tsr', '5', 'Engagement and interaction', 'Learners act, not only read, and the instructor is present.', [
      ['5.1', 'Lessons include active practice, not only reading.', 'ai', 'Most lessons include at least one thing the learner does: a knowledge check, a scenario, a worked problem, or a prompt to apply the idea.'],
      ['5.2', 'The course plans regular instructor presence.', 'attestation', 'A reviewer confirms the instructor plans announcements, timely feedback, and scheduled contact across the term.'],
    ]),
    standard('tsr', '6', 'Technology and AI', 'AI-drafted content has been reviewed and tools behave as learners expect.', [
      ['6.1', 'Every AI-drafted block has been reviewed and kept by a person.', 'automatic', 'ai-drafts-kept'],
      ['6.2', 'Tutor settings fit each activity: hints on graded work, never the answer.', 'attestation', 'A reviewer confirms each activity\'s tutor mode matches its purpose under the institution\'s AI policy.'],
      ['6.3', 'Links say where they go.', 'automatic', 'descriptive-links'],
    ]),
    standard('tsr', '7', 'Learner support', 'Learners know where to get help and what the rules are.', [
      ['7.1', 'The course points learners to academic, accessibility, and technical support.', 'ai', 'The course names where to get academic help, how to request accessibility accommodations, and where to get technical help.'],
      ['7.2', 'The course states its policies on late work, academic integrity, and AI use.', 'ai', 'The course states what happens with late work, what academic integrity requires, and which uses of AI are allowed.'],
    ]),
    standard('tsr', '8', 'Accessibility', 'Everyone can use the course.', [
      ['8.1', 'The course meets the institution\'s accessibility score.', 'automatic', 'access-score'],
      ['8.2', 'Video has captions or a transcript, and images have alt text.', 'automatic', 'media-alternatives'],
      ['8.3', 'A reviewer has used the course with a keyboard and a screen reader.', 'attestation', 'A reviewer completed the course\'s main path with only a keyboard and with a screen reader, and found no blockers.'],
    ]),
  ],
};
export const OSCQR_ATTRIBUTION = "The OSCQR Rubric, Dashboard & Process are made available by Online Learning Consortium, Inc. (OLC - https://onlinelearningconsortium.org/) under the Creative Commons Attribution 4.0 International License (CC By 4.0). To view a copy of this license, visit https://creativecommons.org/licenses/by/4.0/. The OSCQR Rubric, Dashboard & Process were originally developed by the State University of New York (SUNY) through the Open SUNY® COTE, now SUNY Online Teaching (https://online.suny.edu/onlineteaching/). Open SUNY, SUNY Online, and its logos are registered trademarks of the State University of New York.";

export const OSCQR_RUBRIC: Rubric = {
  id: OSCQR_RUBRIC_ID,
  name: 'OSCQR',
  source: 'oscqr',
  version: '4.0',
  attribution: OSCQR_ATTRIBUTION,
  builtIn: true,
  updatedAt: BUILT_AT,
  standards: [
    standard('oscqr', "1", "Course Overview and Information", '', [
      ["1", "Course includes Welcome and Getting Started content.", "automatic", "navigation-instructions"],
      ["2", "Course provides an overall orientation or overview, as well as module-level overviews to make course content, activities, assignments, due dates, interactions, and assessments, predictable and easy to navigate/find.", "ai"],
      ["3", "Course includes a course information area and syllabus that make course expectations clear and findable.", "ai"],
      ["4", "A printable syllabus is available to learners (PDF, HTML).", "attestation", "Confirm learners can print or download the syllabus (Tessera's reading version and PDF export count)."],
      ["5", "Course includes links to relevant campus policies on plagiarism, computer use, filing grievances, accommodating disabilities, etc.", "ai"],
      ["6", "Course provides access to online learner success resources (technical help, support services, orientation, academic honesty, tutoring).", "ai"],
      ["7", "Course information states whether the course is fully online, blended, or web-enhanced.", "ai"],
      ["8", "Course provides appropriate guidelines for successful participation regarding technical requirements (e.g., browser version, mobile, publisher resources, secure content, pop-ups, browser issues, microphone, webcam).", "ai"],
      ["9", "Course objectives/outcomes are clearly defined, measurable, and aligned to learning activities and assessments.", "ai"],
      ["10", "Course provides contact information for instructor, department, and program.", "ai"],
    ]),
    standard('oscqr', "2", "Course Technology & Tools", '', [
      ["11", "Requisite skills for using technology tools (websites, software, and hardware) are clearly stated and supported with resources.", "ai"],
      ["12", "Technical skills required for participation in course learning activities scaffold in a timely manner (orientation, practice, and application - where appropriate).", "ai"],
      ["13", "Frequently used technology tools are easily accessed. Any tools not being utilized are removed from the course menu.", "attestation", "Tessera's course menu shows only the tools the course uses. Confirm any outside tools the course links to are easy to reach."],
      ["14", "Course includes links to privacy policies for technology tools.", "attestation", "Confirm the course links to the privacy policy of every outside tool it asks learners to use."],
      ["15", "Any technology tools meet accessibility standards.", "attestation", "Confirm every outside tool the course uses meets accessibility standards (a vendor accessibility statement or VPAT)."],
    ]),
    standard('oscqr', "3", "Design and Layout", '', [
      ["16", "A logical, consistent, and uncluttered layout is established. The course is easy to navigate (consistent color scheme and icon layout, related content organized together, self-evident titles).", "attestation", "Tessera's layout is consistent by design. Confirm the course's titles are self-evident and related content is grouped."],
      ["17", "Large blocks of information are divided into manageable sections with ample white space around and between the blocks.", "ai"],
      ["18", "There is enough contrast between text and background for the content to be easily viewed.", "attestation", "Tessera's own text meets 4.5:1 contrast. Confirm uploaded images, slides, and documents also have enough contrast."],
      ["19", "Instructions are provided and well written.", "ai"],
      ["20", "Course is free of grammatical and spelling errors.", "ai"],
      ["21", "Text is formatted with titles, headings, and other styles to enhance readability and improve the structure of the document.", "ai"],
      ["22", "Flashing and blinking text are avoided.", "attestation", "Tessera's player doesn't flash or blink. Confirm embedded media and uploaded files don't either."],
      ["23", "A sans-serif font with a standard size of at least 12 pt is used.", "attestation", "Tessera's player sets readable type. Confirm uploaded documents and slides use readable fonts and sizes."],
      ["24", "When possible, information is displayed in a linear format instead of as a table.", "ai"],
      ["25", "Tables are accompanied by a title and summary description.", "ai"],
      ["26", "Table header rows and columns are assigned.", "ai"],
      ["27", "Slideshows use a predefined slide layout and include unique slide titles.", "attestation", "Confirm uploaded slideshows use built-in layouts and unique slide titles (Tessera Access checks uploaded PPTX files)."],
      ["28", "For all slideshows, there are simple, non-automatic transitions between slides.", "attestation", "Confirm uploaded or linked slideshows don't advance automatically."],
    ]),
    standard('oscqr', "4", "Content and Activities", '', [
      ["29", "Course offers access to a variety of engaging resources to present content, support learning and collaboration, and facilitate regular and substantive interaction with the instructor.", "ai"],
      ["30", "Course provides activities for learners to develop higher-order thinking and problem-solving skills, such as critical reflection and analysis.", "ai"],
      ["31", "Course provides activities that emulate real world applications of the discipline, such as experiential learning, case studies, and problem-based activities.", "ai"],
      ["32", "Where available, Open Educational Resources, free, or low cost materials are used.", "ai"],
      ["33", "Course materials and resources include copyright and licensing status, clearly stating permission to share where applicable.", "ai"],
      ["34", "Text content is available in an easily accessed format, preferably HTML. All text content is readable by assistive technology, including a PDF or any text contained in an image.", "attestation", "Confirm uploaded documents are readable by assistive technology (Tessera Access scans PDFs, Word, and PowerPoint files; its reading version is HTML)."],
      ["35", "A text equivalent for every non-text element is provided (\"alt\" tags, captions, transcripts, etc.), and audio description is provided for video-only content.", "automatic", "media-alternatives"],
      ["36", "Text, graphics, and images are understandable when viewed without color. Text should be used as a primary method for delivering information.", "attestation", "Confirm no information depends on color alone in images, charts, and uploaded files."],
      ["37", "Hyperlink text is descriptive and makes sense when out of context (avoid using \"click here\").", "automatic", "descriptive-links"],
    ]),
    standard('oscqr', "5", "Interaction", '', [
      ["38", "Regular and substantive instructor-to-student expectations, and predictable/scheduled interactions and feedback, are present, appropriate for the course length and structure, and are easy to find.", "attestation", "Confirm the course plans regular, scheduled instructor interaction and feedback, and says when learners can expect it."],
      ["39", "Expectations for all course interactions (instructor to student, student to student, student to instructor) are clearly stated and modeled in all course interaction/communication channels.", "ai"],
      ["40", "Learners have an opportunity to get to know the instructor.", "ai"],
      ["41", "Course provides activities intended to build a sense of class community, support open communication, promote regular and substantive interaction, and establish trust (e.g., ice-breaking activities, Course Bulletin Board, planned Office Hours, and dedicated discussion forums).", "ai"],
      ["42", "Course offers opportunities for learner to learner interaction and constructive collaboration.", "ai"],
      ["43", "Course provides learners with opportunities in course interactions to share resources and inject knowledge from diverse sources of information with guidance and/or standards from the instructor.", "ai"],
    ]),
    standard('oscqr', "6", "Assessment and Feedback", '', [
      ["44", "Course grading policies, including consequences of late submissions, are clearly stated in the Course Information/Syllabus materials.", "ai"],
      ["45", "Course includes frequent, appropriate, and authentic methods to assess the learners' mastery of content.", "ai"],
      ["46", "Criteria for the assessment of a graded assignment are clearly articulated (rubrics, exemplary work).", "ai"],
      ["47", "Course provides opportunities for learners to review their performance and assess their own learning throughout the course (via pre-tests, self-tests with feedback, reflective assignments, peer assessment, etc.).", "ai"],
      ["48", "Learners are informed when a timed response is required. Proper lead time is provided to ensure there is an opportunity to prepare an accommodation.", "ai"],
      ["49", "Learners have easy access to a well-designed and up-to-date gradebook.", "attestation", "Tessera's gradebook is always available to learners. Confirm grades are released promptly."],
      ["50", "Course includes the opportunity for learners to provide descriptive feedback on their experience in the online course, the course design, content, user experience, and technology.", "ai"],
    ]),
  ],
};

export const BUILT_IN_RUBRICS: Rubric[] = [TESSERA_RUBRIC, OSCQR_RUBRIC];

export function builtInRubric(id: string): Rubric | null {
  return BUILT_IN_RUBRICS.find((r) => r.id === id) ?? null;
}

/** The default readiness policy (D-029): the Tessera standard, advisory. */
export const DEFAULT_READINESS_POLICY = { rubricId: TESSERA_RUBRIC_ID, minimumPercent: null } as const;

// Contextual help for setting up a course (administrators and instructors).
// All copy lives here so it can be reviewed and edited in one place. Components in
// app/src/help/ render it; pages only choose which topic to show.
//
// Voice: plain, direct, second person, sentence case. Say what the page is for, what
// happens next, and who does which step. No marketing language. Never promise what the
// product doesn't do.

/** Where a link in help content points. Resolved to a URL by the page (see resolveHelpLink). */
export type HelpLink =
  | 'admin.people' | 'admin.courses' | 'admin.course' | 'admin.courseReadiness' | 'admin.programs' | 'admin.templates'
  | 'admin.rubrics' | 'admin.policy'
  | 'teach.course' | 'teach.build' | 'teach.generate' | 'teach.template' | 'teach.readiness' | 'teach.outcomes';

export interface PageHelp {
  /** Short heading for the help panel, for example "About this page". */
  title: string;
  /** One or two sentences: what this page is for. */
  summary: string;
  /** Optional numbered steps: how to use the page. */
  steps?: string[];
  /** Optional one-line tips. */
  tips?: string[];
  /** What usually comes next, with a link. */
  next?: { text: string; link: HelpLink; label: string };
}

export const PAGE_HELP = {
  'admin.courses': {
    title: 'About creating courses',
    summary: 'Create the course shell here: its code, title, and term. An instructor builds the content afterwards.',
    steps: [
      'Fill in the code, title, and term. The description is optional.',
      'Pick a program if the course belongs to one. The program\'s template adds its required modules and lessons to the new course automatically; with no program, the institution\'s template applies, if there is one.',
      'Create the course, then assign an instructor and enroll students on the next page.',
    ],
    tips: [
      'Set up templates and programs first if you want every new course to start with the same structure.',
      'Instructors can also create their own courses; they become the instructor automatically.',
    ],
    next: { text: 'Want courses to share a required structure?', link: 'admin.templates', label: 'Set up templates' },
  },
  'admin.course': {
    title: 'About this course',
    summary: 'Assign who teaches and who takes the course, and choose its program. The instructor builds and publishes the content from their own workspace.',
    steps: [
      'Choose the program, if any. Its template and brand accent apply to the course.',
      'Assign at least one instructor. Only assigned instructors can edit the course.',
      'Enroll students. They see lessons only after the instructor publishes them.',
      'Check the course\'s readiness report at any time to see how close it is to your standard.',
    ],
    next: { text: 'See how the course measures up against your rubric.', link: 'admin.courseReadiness', label: 'Open the readiness report' },
  },
  'teach.courses': {
    title: 'About your courses',
    summary: 'Open a course you teach, or create a new one. You become its instructor.',
    steps: [
      'Fill in the code, title, and term.',
      'Pick a program if the course belongs to one. Its template adds the required modules and lessons automatically.',
      'Open the course to choose how to build it.',
    ],
    tips: ['Only an administrator can enroll students. Ask yours to enroll them when the course is ready.'],
  },
  'teach.workspace': {
    title: 'About the course workspace',
    summary: 'This is where the course takes shape: the welcome and outcomes students see first, and the modules and lessons that hold the content.',
    steps: [
      'Write a short welcome and list the course outcomes.',
      'Build the outline: modules, then lessons inside them. Use AI, the template, or add them yourself.',
      'Open each lesson to add content. Keep or revert every AI draft; nothing AI-written reaches students until you keep it.',
      'Check readiness, then publish each lesson when it\'s ready.',
    ],
    tips: [
      'Lessons are published one at a time, so you can open the course while you finish later modules.',
      'Outcomes can also be edited on the Outcomes page, where you tag checks and assignments with the outcomes they assess.',
    ],
  },
  'teach.build': {
    title: 'About building with AI',
    summary: 'Describe the course and add your source material. Tessera drafts a brief, then an outline, then the lessons, and you review each step before the next.',
    steps: [
      'Say what the course covers and who it\'s for. Paste or upload your notes, syllabus, or readings as sources.',
      'Review the brief: audience, outcomes, and size. Change anything, then draft the outline.',
      'Review the outline: rename, reorder, add, or remove lessons. Then draft the lessons.',
      'Open each lesson and keep, edit, or revert the AI blocks.',
    ],
    tips: ['AI drafts are never published on their own. The lessons stay drafts until you keep the blocks and publish.'],
  },
  'teach.generate': {
    title: 'About generating drafts',
    summary: 'Add AI-drafted elements to lessons that already exist: text, checks, scenarios, tables, and more.',
    steps: [
      'Choose the whole course, or pick modules and lessons.',
      'Choose the kinds of elements to draft, and add an instruction if you like.',
      'Generate, then review the drafts in each lesson.',
    ],
    tips: ['Use this after you have an outline. To draft a whole course from scratch, use Build with AI.'],
  },
  'teach.template': {
    title: 'About templates',
    summary: 'Your institution or program can require certain modules, lessons, and blocks in every course. This page shows what the course is missing.',
    steps: [
      'Review what applying the template would add. It never removes or renames anything.',
      'Apply it to add the missing pieces, then fill in the required blocks.',
    ],
    tips: ['New courses get the template automatically. Use this page if the template changed after the course was created.'],
  },
  'teach.readiness': {
    title: 'About readiness',
    summary: 'The readiness report checks the course against your institution\'s rubric, item by item, and links to the exact place to fix each gap.',
    steps: [
      'Automatic items update as you edit the course. Follow their fix links.',
      'Run the AI-assisted items. Each finding is a draft: accept or dismiss it.',
      'Attest items a reviewer has to confirm, with a short note.',
    ],
    tips: ['If your institution sets a minimum, lessons can\'t be published until the course reaches it. Otherwise the report is advisory.'],
  },
  'teach.outcomes': {
    title: 'About outcomes',
    summary: 'Outcomes say what learners will be able to do. Tag checks, scenarios, and assignments with the outcomes they assess so readiness can confirm every outcome is covered.',
  },
  'admin.programs': {
    title: 'About programs',
    summary: 'A program groups related courses so they share a template and a brand accent.',
    steps: ['Create the program and pick its template.', 'Add courses to it from each course\'s page, or when you create a course.'],
  },
  'admin.templates': {
    title: 'About templates',
    summary: 'A template lists the modules, lessons, and blocks every course must have, plus default tutor modes and an accessibility floor.',
    steps: [
      'Create a template and add its required modules, lessons, and blocks.',
      'Set it as the institution template, or give it to a program.',
      'New courses start with its structure. Existing courses can preview and apply it.',
    ],
    tips: ['Templates only add. They never delete or rename what an instructor has built.'],
  },
} satisfies Record<string, PageHelp>;

export type PageHelpId = keyof typeof PAGE_HELP;

/** The three ways to start building a course's content (shown on an empty course). */
export const START_OPTIONS = [
  {
    id: 'ai',
    title: 'Build with AI',
    description: 'Describe the course and add your materials. Tessera drafts the outline and lessons for you to review.',
    link: 'teach.build' as HelpLink,
    action: 'Start with AI',
  },
  {
    id: 'template',
    title: 'Start from the template',
    description: 'Add the modules, lessons, and blocks your institution or program requires, then fill them in.',
    link: 'teach.template' as HelpLink,
    action: 'Review the template',
    /** Shown instead when no template applies to the course. */
    unavailable: 'No template applies to this course. An administrator can set one up.',
  },
  {
    id: 'manual',
    title: 'Add it yourself',
    description: 'Create modules and lessons below and write the content block by block.',
    link: null,
    action: 'Add the first module',
  },
] as const;

/** Setup checklist steps. Each step's state is computed from the course (see useCourseSetupSteps). */
export const SETUP_STEPS = {
  admin: [
    { id: 'created', label: 'Create the course' },
    { id: 'instructor', label: 'Assign an instructor' },
    { id: 'students', label: 'Enroll students' },
    { id: 'content', label: 'Instructor builds the content' },
    { id: 'published', label: 'Instructor publishes lessons' },
  ],
  instructor: [
    { id: 'home', label: 'Write the welcome and outcomes' },
    { id: 'outline', label: 'Build the outline' },
    { id: 'drafts', label: 'Review every AI draft' },
    { id: 'readiness', label: 'Check readiness' },
    { id: 'published', label: 'Publish lessons' },
  ],
} as const;

/** One-line explanations of each step, shown under the checklist when the step is current. */
export const SETUP_STEP_HELP: Record<string, string> = {
  created: 'The course exists. Next, choose who teaches it.',
  instructor: 'Assign at least one instructor. They build the content from their workspace.',
  students: 'Enroll the students who will take the course. They see lessons only after they\'re published.',
  content: 'The instructor adds modules and lessons, using AI, the template, or their own content.',
  home: 'Students see the welcome and outcomes first. Keep the welcome short and personal.',
  outline: 'Add modules and lessons, or let AI or the template add them for you.',
  drafts: 'Keep, edit, or revert each AI block. Drafts never reach students.',
  readiness: 'Open the readiness report and work through anything not met.',
  published: 'Publish lessons one at a time as each is ready.',
};

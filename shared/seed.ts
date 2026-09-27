// Fictional demo data (CLAUDE.md: content is fictional). Seeds the mock adapter and
// the D1 database (on first request, and on "Reset demo data"). Deterministic: no
// random ids or clocks, so tests and screenshots are stable.
import type {
  Adaptation, Announcement, ApiToken, Assignment, Block, BuilderSession, Course, FileRecord, Id, Institution, Invitation, Lesson, LessonProgress, Module, Submission, Timestamp, TutorSetting, User,
} from './domain';
import type { FileVersion, GenerationJob, StoredFormat, StoredScan, StoredTutorSession } from './repo';

export interface SeedData {
  institution: Institution;
  users: User[];
  courses: Course[];
  enrollments: { courseId: Id; userId: Id }[];
  modules: Module[];
  lessons: Lesson[];
  blocks: Block[];
  assignments: Assignment[];
  submissions: Submission[];
  tutorSettings: TutorSetting[];
  tutorSessions: StoredTutorSession[];
  /** Stored announcement rows; names and read state are joined in at read time. */
  announcements: Omit<Announcement, 'courseTitle' | 'authorName' | 'authorInitials' | 'read'>[];
  reads: { announcementId: Id; userId: Id; readAt: Timestamp }[];
  progress: (LessonProgress & { userId: Id })[];
  adaptations: Adaptation[];
  builderSessions: BuilderSession[];
  generationJobs: GenerationJob[];
  apiTokens: (ApiToken & { hash: string })[];
  invitations: Invitation[];
  files: FileRecord[];
  fileVersions: FileVersion[];
  scans: StoredScan[];
  formats: StoredFormat[];
}

/** Demo "now". The seed's timestamps sit in the week before it. */
export const SEED_NOW: Timestamp = '2026-09-26T16:00:00.000Z';

const t = (day: number, hour = 15) => `2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;

export const DEMO_USER_IDS = {
  administrator: 'u-admin',
  instructor: 'u-okafor',
  student: 'u-priya',
} as const;

export function seedData(): SeedData {
  const institution: Institution = {
    id: 'inst-meridian',
    name: 'Meridian State University',
    shortName: 'Meridian State',
    accent: 'teal',
    setupComplete: false,
    policy: {
      aiAuthoring: true,
      tutorModes: { graded: ['off', 'hints', 'explain'], practice: ['off', 'hints', 'explain', 'open'] },
    },
    accessPolicy: { minimumScore: 0, blockingSeverities: ['critical'] },
  };

  const users: User[] = [
    { id: 'u-admin', name: 'Alex Rivera', email: 'alex.rivera@meridian.example.edu', role: 'administrator', initials: 'AR', profile: null },
    { id: 'u-okafor', name: 'Dr. Amara Okafor', email: 'a.okafor@meridian.example.edu', role: 'instructor', initials: 'AO', profile: null },
    { id: 'u-chen', name: 'Prof. Daniel Chen', email: 'd.chen@meridian.example.edu', role: 'instructor', initials: 'DC', profile: null },
    { id: 'u-priya', name: 'Priya Natarajan', email: 'priya.n@meridian.example.edu', role: 'student', initials: 'PN', profile: null },
    { id: 'u-marcus', name: 'Marcus Bell', email: 'marcus.bell@meridian.example.edu', role: 'student', initials: 'MB', profile: {
      goals: ['finish-degree'], goalNote: '', weeklyMinutes: 120, language: 'en', readingLevel: 'standard',
      accessibility: { captions: true, reducedMotion: false, largerText: false, screenReader: false }, reminders: 'weekly', completedAt: t(19, 20) } },
    { id: 'u-sofia', name: 'Sofia Alvarez', email: 'sofia.alvarez@meridian.example.edu', role: 'student', initials: 'SA', profile: null },
    { id: 'u-jordan', name: 'Jordan Lee', email: 'jordan.lee@meridian.example.edu', role: 'student', initials: 'JL', profile: null },
  ];

  const courses: Course[] = [
    {
      id: 'c-stat110',
      code: 'STAT 110',
      title: 'Reasoning with Data',
      term: 'Fall 2026',
      description: 'An introduction to asking questions with data, describing variability, and drawing careful conclusions.',
      welcome:
        'Welcome! This course is about thinking clearly with data, not memorizing formulas. Each lesson takes about 15 minutes and ends with a short check. Post questions any time; I read them every weekday morning.',
      outcomes: [
        'Tell a statistical question from a non-statistical one.',
        'Identify cases and variables in a data set.',
        'Describe the center and spread of a distribution.',
      ],
      instructorIds: ['u-okafor'],
      status: 'active',
    },
    {
      id: 'c-comm120',
      code: 'COMM 120',
      title: 'Writing for the Public',
      term: 'Fall 2026',
      description: 'Plain-language writing for real readers: audience, structure, and revision.',
      welcome: 'Good writing starts with a reader. We\'ll practice on short pieces every week and revise together.',
      outcomes: ['Describe a specific reader and what they need.', 'Revise a paragraph for plain language.'],
      instructorIds: ['u-chen'],
      status: 'active',
    },
  ];

  const enrollments = [
    { courseId: 'c-stat110', userId: 'u-priya' },
    { courseId: 'c-stat110', userId: 'u-marcus' },
    { courseId: 'c-stat110', userId: 'u-sofia' },
    { courseId: 'c-comm120', userId: 'u-priya' },
    { courseId: 'c-comm120', userId: 'u-jordan' },
  ];

  const modules: Module[] = [
    { id: 'm-stat-1', courseId: 'c-stat110', title: 'Asking statistical questions', position: 0 },
    { id: 'm-stat-2', courseId: 'c-stat110', title: 'Describing distributions', position: 1 },
    { id: 'm-comm-1', courseId: 'c-comm120', title: 'Knowing your reader', position: 0 },
  ];

  const lessons: Lesson[] = [
    { id: 'l-stat-1', moduleId: 'm-stat-1', courseId: 'c-stat110', title: 'What makes a question statistical?', minutes: 12, position: 0, status: 'published', publishedAt: t(20) },
    { id: 'l-stat-2', moduleId: 'm-stat-1', courseId: 'c-stat110', title: 'Cases and variables', minutes: 15, position: 1, status: 'published', publishedAt: t(22) },
    { id: 'l-stat-3', moduleId: 'm-stat-2', courseId: 'c-stat110', title: 'Center: mean and median', minutes: 15, position: 0, status: 'draft', publishedAt: null },
    { id: 'l-comm-1', moduleId: 'm-comm-1', courseId: 'c-comm120', title: 'Who is the reader?', minutes: 10, position: 0, status: 'published', publishedAt: t(21) },
  ];

  const human = (id: Id, lessonId: Id, position: number, updatedAt: Timestamp) =>
    ({ id, lessonId, position, origin: 'human', aiState: null, provenance: null, previous: null, updatedAt }) as const;

  const blocks: Block[] = [
    // STAT 110 · Lesson 1
    { ...human('b-s1-1', 'l-stat-1', 0, t(19)), type: 'heading', level: 2, text: 'Questions that expect variability' },
    { ...human('b-s1-2', 'l-stat-1', 1, t(19)), type: 'text', text:
      'A statistical question is one you answer with data that varies. "How old am I?" has one answer. "How old are the students in this course?" has many answers, and describing them is the work of statistics.\n\nWhen you read a question, ask: would different people, places, or times give different answers? If yes, it\'s probably statistical.' },
    { ...human('b-s1-3', 'l-stat-1', 2, t(19)), type: 'callout', tone: 'tip', title: 'A quick test', text: 'Try to answer the question with a single number you could look up. If you can, it isn\'t a statistical question.' },
    { ...human('b-s1-4', 'l-stat-1', 3, t(19)), type: 'check', question: 'Which of these is a statistical question?',
      options: [
        { id: 'a', text: 'What time does the library open on Monday?' },
        { id: 'b', text: 'How many hours a week do Meridian State students study?' },
        { id: 'c', text: 'What is the capital of the state?' },
      ],
      correctOptionId: 'b',
      feedbackCorrect: 'Study hours vary from student to student, so answering it means describing that variability.',
      feedbackIncorrect: 'That question has one fixed answer. Look for the one whose answer changes from person to person.' },
    { ...human('b-s1-5', 'l-stat-1', 4, t(19)), type: 'text', text: 'Next, we\'ll name the things we measure (variables) and who or what we measure them on (cases).' },

    // STAT 110 · Lesson 2
    { ...human('b-s2-1', 'l-stat-2', 0, t(21)), type: 'heading', level: 2, text: 'Rows are cases, columns are variables' },
    { ...human('b-s2-2', 'l-stat-2', 1, t(21)), type: 'text', text:
      'In a tidy data table, each row is one case: a student, a city, a day. Each column is a variable: something recorded about every case, such as major, population, or rainfall.\n\nVariables are categorical (groups, like major) or quantitative (numbers you can average, like hours studied).' },
    { ...human('b-s2-3', 'l-stat-2', 2, t(21)), type: 'check', question: 'A survey records each student\'s major and weekly study hours. What are the cases?',
      options: [
        { id: 'a', text: 'The students who answered the survey' },
        { id: 'b', text: 'Major and weekly study hours' },
        { id: 'c', text: 'The survey questions' },
      ],
      correctOptionId: 'a',
      feedbackCorrect: 'Each student is one row, one case.',
      feedbackIncorrect: 'Major and hours are what was recorded (the variables). Who were they recorded about?' },

    // STAT 110 · Lesson 3 (draft)
    { ...human('b-s3-1', 'l-stat-3', 0, t(24)), type: 'heading', level: 2, text: 'Two ways to describe the middle' },
    { ...human('b-s3-2', 'l-stat-3', 1, t(24)), type: 'text', text: 'The mean adds every value and divides by how many there are. The median is the middle value once the data are sorted.' },
    { id: 'b-s3-3', lessonId: 'l-stat-3', position: 2, origin: 'ai', aiState: 'draft', updatedAt: t(25),
      provenance: { model: 'palmyra-x6', task: 'block-regenerate', generatedAt: t(25), sources: [], summary: 'Add a worked example with study hours' },
      previous: null, type: 'text', text:
      'Suppose five students study 2, 3, 3, 4, and 13 hours a week. The mean is 25 ÷ 5 = 5 hours, but four of the five study less than that. The median, 3 hours, sits in the middle of the sorted list and isn\'t pulled up by the one long week.\n\nWhen a few values are far from the rest, the median usually describes a typical case better.' },

    // COMM 120 · Lesson 1
    { ...human('b-c1-1', 'l-comm-1', 0, t(20)), type: 'heading', level: 2, text: 'Write to one person' },
    { ...human('b-c1-2', 'l-comm-1', 1, t(20)), type: 'text', text:
      'Before you draft, picture a single reader: what do they already know, what do they need to do next, and how much time do they have? Every choice in the piece follows from those answers.' },
    { ...human('b-c1-3', 'l-comm-1', 2, t(20)), type: 'check', question: 'What should you decide before drafting?',
      options: [
        { id: 'a', text: 'The number of paragraphs' },
        { id: 'b', text: 'Who the reader is and what they need' },
        { id: 'c', text: 'Which fonts to use' },
      ],
      correctOptionId: 'b',
      feedbackCorrect: 'The reader shapes everything else.',
      feedbackIncorrect: 'That comes later. Start with the person you\'re writing for.' },
  ];

  const announcements: SeedData['announcements'] = [
    { id: 'a-stat-welcome', courseId: 'c-stat110', authorId: 'u-okafor', title: 'Welcome to Reasoning with Data',
      body: 'Hi everyone, and welcome. Start with Module 1 this week; it takes about 30 minutes in total.\n\nOffice hours are Tuesdays 2–3 pm in Hall 204 or online.',
      pinned: true, status: 'published', origin: 'human', aiState: null, provenance: null, publishedAt: t(20, 9), createdAt: t(20, 9) },
    { id: 'a-stat-office', courseId: 'c-stat110', authorId: 'u-okafor', title: 'Office hours move to Thursday this week',
      body: 'This week only, office hours are Thursday 2–3 pm. Same room.',
      pinned: false, status: 'published', origin: 'human', aiState: null, provenance: null, publishedAt: t(25, 10), createdAt: t(25, 10) },
    { id: 'a-comm-reading', courseId: 'c-comm120', authorId: 'u-chen', title: 'First reading is posted',
      body: 'The first short reading is up in Module 1. Bring one question about it to Wednesday\'s session.',
      pinned: false, status: 'published', origin: 'human', aiState: null, provenance: null, publishedAt: t(24, 12), createdAt: t(24, 12) },
    { id: 'a-stat-draft', courseId: 'c-stat110', authorId: 'u-okafor', title: 'Coming up: Module 2',
      body: 'Next week we move from questions to describing distributions.',
      pinned: false, status: 'draft', origin: 'human', aiState: null, provenance: null, publishedAt: null, createdAt: t(26, 8) },
  ];

  const reads = [
    { announcementId: 'a-stat-welcome', userId: 'u-priya', readAt: t(20, 18) },
    { announcementId: 'a-stat-welcome', userId: 'u-marcus', readAt: t(21, 8) },
  ];

  const progress: SeedData['progress'] = [
    { userId: 'u-priya', lessonId: 'l-stat-1', state: 'in-progress', checks: {}, updatedAt: t(25, 19) },
    { userId: 'u-marcus', lessonId: 'l-stat-1', state: 'completed', checks: { 'b-s1-4': { correct: true, attempts: 1 } }, updatedAt: t(22, 20) },
    { userId: 'u-marcus', lessonId: 'l-stat-2', state: 'completed', checks: { 'b-s2-3': { correct: true, attempts: 2 } }, updatedAt: t(24, 20) },
  ];

  const assignments: Assignment[] = [{
    id: 'asg-stat-1', moduleId: 'm-stat-1', courseId: 'c-stat110', title: 'Find the statistical question', position: 0,
    status: 'published', publishedAt: t(24), dueAt: '2026-10-02T23:59:00.000Z', points: 10, submissionType: 'text',
    rubric: [
      { id: 'criterion-question', title: 'Question', description: 'A question that expects variability.', levels: [{ id: 'clear', title: 'Clear', points: 5, description: 'Clearly statistical.' }, { id: 'developing', title: 'Developing', points: 3, description: 'Partly statistical.' }] },
      { id: 'criterion-reason', title: 'Reasoning', description: 'Explain why answers vary.', levels: [{ id: 'clear', title: 'Clear', points: 5, description: 'Explains the variation.' }, { id: 'developing', title: 'Developing', points: 3, description: 'Partial explanation.' }] },
    ], instructions: [{ ...human('b-asg-1', 'asg-stat-1', 0, t(24)), type: 'text', text: 'Write one statistical question about your community. Explain why you expect its answers to vary.' }],
  }];
  const submissions: Submission[] = [];
  return { institution, users, courses, enrollments, modules, lessons, blocks, assignments, submissions, announcements, reads, progress, adaptations: [], builderSessions: [], generationJobs: [], apiTokens: [], invitations: [], files: [], fileVersions: [], scans: [], formats: [], tutorSettings: [], tutorSessions: [] };
}

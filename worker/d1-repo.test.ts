import { describe, expect, it } from 'vitest';
import type {
  Block, BuilderSession, Course, Institution, LearningProfile, Lesson, Module, User,
} from '../shared/domain';
import type { StoredAnnouncement, StoredProgress } from '../shared/repo';
import { seedData, type SeedData } from '../shared/seed';
import { D1Repo } from './d1-repo';
import { createTestDb } from './test/d1-shim';

function fresh() {
  return new D1Repo(createTestDb() as never);
}

const policy: Institution['policy'] = {
  aiAuthoring: true,
  tutorModes: { graded: ['off', 'hints'], practice: ['off', 'hints', 'explain'] },
};

const profile: LearningProfile = {
  goals: ['upskill', 'curiosity'],
  goalNote: 'Switch into data work',
  weeklyMinutes: 180,
  language: 'en',
  readingLevel: 'plain',
  accessibility: { captions: true, reducedMotion: true, largerText: false, screenReader: false },
  reminders: 'weekly',
  completedAt: '2026-09-26T16:00:00.000Z',
};

const provenance = {
  model: 'palmyra-x6',
  task: 'lesson-draft' as const,
  generatedAt: '2026-09-20T12:00:00.000Z',
  sources: [{ id: 'src-1', name: 'notes.md' }],
  summary: 'Draft the introduction',
};

function byRoleName(a: User, b: User) {
  const rank = { administrator: 0, instructor: 1, student: 2 };
  return rank[a.role] - rank[b.role] || (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1);
}

function byNewest<T extends { id: string; publishedAt: string | null; createdAt: string }>(a: T, b: T) {
  const at = a.publishedAt ?? a.createdAt;
  const bt = b.publishedAt ?? b.createdAt;
  if (at !== bt) return at < bt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

async function expectSeed(repo: D1Repo, seed: SeedData = seedData()) {
  expect(await repo.getInstitution()).toEqual(seed.institution);
  expect(await repo.listUsers()).toEqual([...seed.users].sort(byRoleName));
  for (const user of seed.users) {
    expect(await repo.getUser(user.id)).toEqual(user);
    expect(await repo.findUserByEmail(user.email.toUpperCase())).toEqual(user);
  }

  const courses = [...seed.courses].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : a.id < b.id ? -1 : 1));
  expect(await repo.listCourses()).toEqual(courses);
  for (const course of seed.courses) expect(await repo.getCourse(course.id)).toEqual(course);
  expect(await repo.listEnrollments({})).toEqual(
    [...seed.enrollments].sort((a, b) => (a.courseId < b.courseId ? -1 : a.courseId > b.courseId ? 1 : a.userId < b.userId ? -1 : 1)),
  );

  for (const course of seed.courses) {
    const modules = seed.modules
      .filter((module) => module.courseId === course.id)
      .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
    expect(await repo.listModules(course.id)).toEqual(modules);
    const lessons = modules.flatMap((module) =>
      seed.lessons.filter((lesson) => lesson.moduleId === module.id).sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1)),
    );
    expect(await repo.listLessons({ courseId: course.id })).toEqual(lessons);
  }
  for (const module of seed.modules) expect(await repo.getModule(module.id)).toEqual(module);
  for (const lesson of seed.lessons) {
    expect(await repo.getLesson(lesson.id)).toEqual(lesson);
    const blocks = seed.blocks
      .filter((block) => block.lessonId === lesson.id)
      .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
    expect(await repo.listBlocks(lesson.id)).toEqual(blocks);
  }
  for (const block of seed.blocks) expect(await repo.getBlock(block.id)).toEqual(block);

  expect(await repo.listAnnouncements({})).toEqual([...seed.announcements].sort(byNewest));
  for (const announcement of seed.announcements) expect(await repo.getAnnouncement(announcement.id)).toEqual(announcement);
  expect(await repo.listReads({})).toEqual(
    [...seed.reads].sort((a, b) => (a.announcementId < b.announcementId ? -1 : a.announcementId > b.announcementId ? 1 : a.userId < b.userId ? -1 : 1)),
  );
  const progress = [...seed.progress].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : a.lessonId < b.lessonId ? -1 : 1));
  expect(await repo.listProgress({})).toEqual(progress);
  for (const row of seed.progress) expect(await repo.getProgress(row.userId, row.lessonId)).toEqual(row);
  for (const course of seed.courses) expect(await repo.listBuilderSessions(course.id)).toEqual(seed.builderSessions.filter((session) => session.courseId === course.id));
}

describe('D1 shim', () => {
  it('runs statements, rolls a failed batch back, and reads rows', async () => {
    const db = createTestDb();
    await expect(db.batch([
      db.prepare(`INSERT INTO institution (id, name, short_name, accent, setup_complete, policy) VALUES ('i', 'N', 'S', 'teal', 0, '{}')`),
      db.prepare(`INSERT INTO institution (id, name, short_name, accent, setup_complete, policy) VALUES ('i', 'N', 'S', 'teal', 0, '{}')`),
    ])).rejects.toThrow(/UNIQUE/);
    expect(await new D1Repo(db as never).isEmpty()).toBe(true);

    await db.prepare(
      'INSERT INTO institution (id, name, short_name, accent, setup_complete, policy) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind('i', 'Name', 'Short', 'teal', 1, '{}').run();
    expect(await db.prepare('SELECT name FROM institution WHERE id = ?').bind('i').first()).toEqual({ name: 'Name' });
    expect(await db.prepare('SELECT name FROM institution WHERE id = ?').bind('i').first('name')).toBe('Name');
    expect(await db.prepare('SELECT name FROM institution WHERE id = ?').bind('missing').first()).toBeNull();
    expect(await db.prepare('SELECT id, name FROM institution').raw()).toEqual([['i', 'Name']]);
    expect((await db.prepare('SELECT id FROM institution').all()).results).toEqual([{ id: 'i' }]);
  });
});

describe('D1Repo', () => {
  it('round-trips every entity, including JSON and null AI state', async () => {
    const repo = fresh();
    const institution: Institution = {
      id: 'inst', name: 'Example College', shortName: 'Example', accent: 'plum', setupComplete: false, policy,
    };
    await repo.putInstitution(institution);
    const student: User = {
      id: 'u-sam', name: 'Sam Student', email: 'sam@example.edu', role: 'student', initials: 'SS', profile,
    };
    const admin: User = {
      id: 'u-ada', name: 'Ada Admin', email: 'ada@example.edu', role: 'administrator', initials: 'AA', profile: null,
    };
    await repo.putUser(student);
    await repo.putUser(admin);
    const course: Course = {
      id: 'c1', code: 'EX 101', title: 'Examples', term: 'Fall 2026', description: 'A course', welcome: 'Hello',
      outcomes: ['Read a table', 'Name a variable'], instructorIds: [admin.id], status: 'active',
    };
    await repo.putCourse(course);
    await repo.setEnrollments(course.id, [student.id]);
    const module: Module = { id: 'm1', courseId: course.id, title: 'Start', position: 0 };
    await repo.putModule(module);
    const lesson: Lesson = {
      id: 'l1', moduleId: module.id, courseId: course.id, title: 'First', minutes: 12, position: 0,
      status: 'draft', publishedAt: null,
    };
    await repo.putLesson(lesson);

    const blocks: Block[] = [
      { id: 'b-h', lessonId: lesson.id, position: 0, origin: 'human', aiState: null, provenance: null, previous: null, updatedAt: '2026-09-20T12:00:00.000Z', type: 'heading', level: 2, text: 'Hello' },
      { id: 'b-t', lessonId: lesson.id, position: 1, origin: 'human', aiState: null, provenance: null, previous: null, updatedAt: '2026-09-20T12:00:00.000Z', type: 'text', text: 'Line one.\n\nLine two.' },
      { id: 'b-c', lessonId: lesson.id, position: 2, origin: 'human', aiState: null, provenance: null, previous: null, updatedAt: '2026-09-20T12:00:00.000Z', type: 'callout', tone: 'tip', title: 'Tip', text: 'Look again.' },
      { id: 'b-i', lessonId: lesson.id, position: 3, origin: 'human', aiState: null, provenance: null, previous: null, updatedAt: '2026-09-20T12:00:00.000Z', type: 'image', src: '/img.png', alt: '', decorative: true, caption: '' },
      { id: 'b-k', lessonId: lesson.id, position: 4, origin: 'human', aiState: null, provenance: null, previous: null, updatedAt: '2026-09-20T12:00:00.000Z', type: 'check', question: 'Which one?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'b', feedbackCorrect: 'Yes', feedbackIncorrect: 'No' },
      { id: 'b-ai', lessonId: lesson.id, position: 5, origin: 'ai', aiState: 'draft', provenance, previous: { type: 'text', text: 'Earlier draft.' }, updatedAt: '2026-09-20T12:30:00.000Z', type: 'text', text: 'New draft.' },
    ];
    for (const block of blocks) await repo.putBlock(block);

    const announcement: StoredAnnouncement = {
      id: 'a1', courseId: course.id, authorId: admin.id, title: 'Hello', body: 'Welcome.\n\nStart here.',
      pinned: true, status: 'published', origin: 'ai', aiState: 'kept',
      provenance: { ...provenance, task: 'announcement' }, publishedAt: '2026-09-21T09:00:00.000Z', createdAt: '2026-09-21T08:00:00.000Z',
    };
    await repo.putAnnouncement(announcement);
    const read = { announcementId: announcement.id, userId: student.id, readAt: '2026-09-21T10:00:00.000Z' };
    await repo.putRead(read);
    const progress: StoredProgress = {
      userId: student.id, lessonId: lesson.id, state: 'in-progress',
      checks: { 'b-k': { correct: false, attempts: 2 } }, updatedAt: '2026-09-22T10:00:00.000Z',
    };
    await repo.putProgress(progress);
    const older: BuilderSession = {
      id: 'bs-old', courseId: course.id, prompt: 'Teach questions', sources: [{ id: 'src-1', name: 'notes.md', text: 'Data varies.' }],
      stage: 'brief', brief: null, outline: null, lessonIds: [], provenance: null, createdAt: '2026-09-01T00:00:00.000Z',
    };
    const newer: BuilderSession = {
      id: 'bs-new', courseId: course.id, prompt: 'Teach questions with sources',
      sources: [{ id: 'src-1', name: 'notes.md', text: 'Data varies.' }], stage: 'outline',
      brief: { audience: 'First-years', outcomes: ['Tell a statistical question'], moduleCount: 2, lessonsPerModule: 2, lessonMinutes: 15, tone: 'Warm', notes: 'Short lessons' },
      outline: { modules: [{ title: 'Start', lessons: [{ title: 'Questions', minutes: 12, objective: 'Spot variability' }] }] },
      lessonIds: [lesson.id], provenance, createdAt: '2026-09-02T00:00:00.000Z',
    };
    await repo.putBuilderSession(older);
    await repo.putBuilderSession(newer);

    expect(await repo.getInstitution()).toEqual(institution);
    expect(await repo.getUser(student.id)).toEqual(student);
    expect(await repo.getUser(admin.id)).toEqual(admin);
    expect(await repo.findUserByEmail('SAM@example.edu')).toEqual(student);
    expect(await repo.listUsers().then((rows) => rows.map((row) => row.id))).toEqual([admin.id, student.id]);
    expect(await repo.getCourse(course.id)).toEqual(course);
    expect(await repo.listEnrollments({ courseId: course.id })).toEqual([{ courseId: course.id, userId: student.id }]);
    expect(await repo.getModule(module.id)).toEqual(module);
    expect(await repo.getLesson(lesson.id)).toEqual(lesson);
    expect(await repo.listBlocks(lesson.id)).toEqual(blocks);
    for (const block of blocks) expect(await repo.getBlock(block.id)).toEqual(block);
    expect((await repo.getBlock('b-h'))?.aiState).toBeNull();
    expect(await repo.getAnnouncement(announcement.id)).toEqual(announcement);
    expect(await repo.listReads({ userId: student.id })).toEqual([read]);
    expect(await repo.getProgress(student.id, lesson.id)).toEqual(progress);
    expect(await repo.listBuilderSessions(course.id)).toEqual([newer, older]);
    expect(await repo.getBuilderSession(newer.id)).toEqual(newer);

    const renamed = { ...course, title: 'Examples, revised' };
    await repo.putCourse(renamed);
    expect(await repo.getCourse(course.id)).toEqual(renamed);
    const cleared: User = { ...student, profile: null };
    await repo.putUser(cleared);
    expect(await repo.getUser(student.id)).toEqual(cleared);

    await repo.deleteBlock('b-h');
    expect(await repo.getBlock('b-h')).toBeNull();
    await repo.deleteAnnouncement(announcement.id);
    expect(await repo.getAnnouncement(announcement.id)).toBeNull();
    await repo.deleteModule(module.id);
    expect(await repo.getModule(module.id)).toBeNull();
    expect(await repo.getUser('missing')).toBeNull();
    expect(await repo.getCourse('missing')).toBeNull();
    expect(await repo.getBuilderSession('missing')).toBeNull();
  });

  it('orders users, lessons, and announcements by the repo rules', async () => {
    const repo = fresh();
    const users: User[] = [
      { id: 'u-zoe', name: 'Zoe Student', email: 'zoe@example.edu', role: 'student', initials: 'ZS', profile: null },
      { id: 'u-maya', name: 'Maya Admin', email: 'maya@example.edu', role: 'administrator', initials: 'MA', profile: null },
      { id: 'u-amy', name: 'Amy Student', email: 'amy@example.edu', role: 'student', initials: 'AS', profile: null },
      { id: 'u-aaron', name: 'Aaron Instructor', email: 'aaron@example.edu', role: 'instructor', initials: 'AI', profile: null },
    ];
    for (const user of users) await repo.putUser(user);
    expect((await repo.listUsers()).map((user) => user.id)).toEqual(['u-maya', 'u-aaron', 'u-amy', 'u-zoe']);
    expect((await repo.listUsers({ role: 'student' })).map((user) => user.id)).toEqual(['u-amy', 'u-zoe']);

    await repo.putInstitution({ id: 'inst', name: 'Example', shortName: 'Ex', accent: 'blue', setupComplete: true, policy });
    await repo.putCourse({ id: 'c1', code: 'EX 1', title: 'Example', term: 'Fall', description: '', welcome: '', outcomes: [], instructorIds: [], status: 'active' });
    await repo.putModule({ id: 'm-late', courseId: 'c1', title: 'Later', position: 1 });
    await repo.putModule({ id: 'm-early', courseId: 'c1', title: 'Early', position: 0 });
    await repo.putLesson({ id: 'l-b', moduleId: 'm-early', courseId: 'c1', title: 'Second', minutes: 5, position: 1, status: 'draft', publishedAt: null });
    await repo.putLesson({ id: 'l-c', moduleId: 'm-late', courseId: 'c1', title: 'Third', minutes: 5, position: 0, status: 'published', publishedAt: '2026-09-02T00:00:00.000Z' });
    await repo.putLesson({ id: 'l-a', moduleId: 'm-early', courseId: 'c1', title: 'First', minutes: 5, position: 0, status: 'draft', publishedAt: null });
    expect((await repo.listLessons({ courseId: 'c1' })).map((lesson) => lesson.id)).toEqual(['l-a', 'l-b', 'l-c']);
    expect((await repo.listLessons({ moduleId: 'm-early' })).map((lesson) => lesson.id)).toEqual(['l-a', 'l-b']);

    const announcements: StoredAnnouncement[] = [
      { id: 'a-old', courseId: 'c1', authorId: 'u-aaron', title: 'Old', body: 'Old', pinned: false, status: 'published', origin: 'human', aiState: null, provenance: null, publishedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'a-draft', courseId: 'c1', authorId: 'u-aaron', title: 'Draft', body: 'Draft', pinned: false, status: 'draft', origin: 'human', aiState: null, provenance: null, publishedAt: null, createdAt: '2026-03-01T00:00:00.000Z' },
      { id: 'a-mid', courseId: 'c1', authorId: 'u-aaron', title: 'Mid', body: 'Mid', pinned: true, status: 'published', origin: 'human', aiState: null, provenance: null, publishedAt: '2026-02-01T00:00:00.000Z', createdAt: '2026-02-01T00:00:00.000Z' },
    ];
    for (const announcement of announcements) await repo.putAnnouncement(announcement);
    expect((await repo.listAnnouncements({ courseIds: ['c1'] })).map((announcement) => announcement.id)).toEqual(['a-draft', 'a-mid', 'a-old']);
    expect(await repo.listAnnouncements({ courseIds: [] })).toEqual([]);
  });

  it('replaces a lesson\'s blocks and leaves other lessons alone', async () => {
    const repo = fresh();
    await repo.reset(seedData());
    const replacement: Block[] = [
      { id: 'b-new-b', lessonId: 'l-stat-1', position: 3, origin: 'human', aiState: null, provenance: null, previous: null, updatedAt: '2026-09-26T00:00:00.000Z', type: 'text', text: 'Second' },
      { id: 'b-new-a', lessonId: 'l-stat-1', position: 1, origin: 'ai', aiState: 'kept', provenance, previous: null, updatedAt: '2026-09-26T00:00:00.000Z', type: 'heading', level: 3, text: 'First' },
    ];
    await repo.replaceBlocks('l-stat-1', replacement);
    expect(await repo.listBlocks('l-stat-1')).toEqual([replacement[1], replacement[0]]);
    expect(await repo.getBlock('b-s1-1')).toBeNull();
    expect(await repo.getBlock('b-s2-1')).not.toBeNull();
  });

  it('replaces one course\'s enrollments', async () => {
    const repo = fresh();
    await repo.reset(seedData());
    await repo.setEnrollments('c-stat110', ['u-jordan', 'u-priya']);
    expect(await repo.listEnrollments({ courseId: 'c-stat110' })).toEqual([
      { courseId: 'c-stat110', userId: 'u-jordan' },
      { courseId: 'c-stat110', userId: 'u-priya' },
    ]);
    expect(await repo.listEnrollments({ courseId: 'c-comm120' })).toEqual([
      { courseId: 'c-comm120', userId: 'u-jordan' },
      { courseId: 'c-comm120', userId: 'u-priya' },
    ]);
    await repo.setEnrollments('c-stat110', []);
    expect(await repo.listEnrollments({ courseId: 'c-stat110' })).toEqual([]);
  });

  it('deletes a lesson together with its blocks and progress', async () => {
    const repo = fresh();
    await repo.reset(seedData());
    expect(await repo.listBlocks('l-stat-1')).not.toEqual([]);
    expect(await repo.getProgress('u-priya', 'l-stat-1')).not.toBeNull();
    await repo.deleteLesson('l-stat-1');
    expect(await repo.getLesson('l-stat-1')).toBeNull();
    expect(await repo.listBlocks('l-stat-1')).toEqual([]);
    expect(await repo.getProgress('u-priya', 'l-stat-1')).toBeNull();
    expect(await repo.getProgress('u-marcus', 'l-stat-1')).toBeNull();
    expect(await repo.getLesson('l-stat-2')).not.toBeNull();
    expect(await repo.getProgress('u-marcus', 'l-stat-2')).not.toBeNull();
    expect((await repo.listBlocks('l-stat-2')).length).toBeGreaterThan(0);
  });

  it('keeps the first readAt when a receipt is written twice', async () => {
    const repo = fresh();
    await repo.reset(seedData());
    const first = { announcementId: 'a-stat-office', userId: 'u-priya', readAt: '2026-09-25T12:00:00.000Z' };
    await repo.putRead(first);
    await repo.putRead({ ...first, readAt: '2026-09-26T12:00:00.000Z' });
    expect(await repo.listReads({ announcementId: 'a-stat-office', userId: 'u-priya' })).toEqual([first]);
    expect(await repo.listReads({ announcementId: 'a-stat-welcome', userId: 'u-priya' })).toEqual([
      { announcementId: 'a-stat-welcome', userId: 'u-priya', readAt: '2026-09-20T18:00:00.000Z' },
    ]);
  });

  it('reports an empty database until an institution row exists', async () => {
    const repo = fresh();
    expect(await repo.isEmpty()).toBe(true);
    await repo.putInstitution(seedData().institution);
    expect(await repo.isEmpty()).toBe(false);
  });

  it('resets to the seed and reads every seed entity back', async () => {
    const repo = fresh();
    expect(await repo.isEmpty()).toBe(true);
    await repo.putUser({ id: 'u-extra', name: 'Extra', email: 'extra@example.edu', role: 'student', initials: 'EX', profile: null });
    await repo.reset(seedData());
    expect(await repo.isEmpty()).toBe(false);
    expect(await repo.getUser('u-extra')).toBeNull();
    await expectSeed(repo);

    await repo.reset(seedData());
    await expectSeed(repo);
    expect(await repo.listUsers({ role: 'instructor' })).toHaveLength(2);
    expect(await repo.listEnrollments({ userId: 'u-priya' })).toHaveLength(2);
    expect((await repo.listAnnouncements({ courseIds: ['c-stat110'] })).map((announcement) => announcement.id)).toEqual([
      'a-stat-draft', 'a-stat-office', 'a-stat-welcome',
    ]);
    expect(await repo.listProgress({ lessonIds: [] })).toEqual([]);
    expect(await repo.listProgress({ userId: 'u-marcus' })).toHaveLength(2);
    expect((await repo.listLessons({ moduleId: 'm-stat-1' })).map((lesson) => lesson.id)).toEqual(['l-stat-1', 'l-stat-2']);
    expect((await repo.listCourses()).map((course) => course.code)).toEqual(['COMM 120', 'STAT 110']);
  });
});

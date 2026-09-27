import { ApiError } from '../api';
import type { Block, LessonProgress, StudentBlock, TaskItem } from '../domain';
import type { Service, ServiceContext } from './context';
import { canReachCourse, fail, moduleFor, studentLesson, user, content } from './helpers';
import { courses } from './courses';
import { announcements } from './announcements';

const defaultProgress = (lessonId: string): LessonProgress => ({ lessonId, state: 'not-started', checks: {}, updatedAt: null });
const publicProgress = (p: LessonProgress): LessonProgress => ({ lessonId: p.lessonId, state: p.state, checks: p.checks, updatedAt: p.updatedAt });
const visible = (b: Block) => b.origin !== 'ai' || b.aiState === 'kept';
export const student: Pick<Service, 'saveProfile' | 'getToday' | 'getStudentLesson' | 'answerCheck' | 'setLessonProgress'> = {
  saveProfile: async (ctx, input) => {
    const goals = ['finish-degree', 'career-change', 'upskill', 'compliance', 'curiosity'];
    if (!Array.isArray(input.goals) || input.goals.some(x => !goals.includes(x)) || !Number.isInteger(input.weeklyMinutes) || input.weeklyMinutes < 0 || input.weeklyMinutes > 2400 || !['standard','plain'].includes(input.readingLevel) || !['off','daily','weekly'].includes(input.reminders)) fail('invalid', 'Invalid learning profile.');
    const u = user(ctx); u.profile = { ...input, goals: [...input.goals], goalNote: input.goalNote.trim(), language: input.language.trim(), completedAt: ctx.now() };
    await ctx.repo.putUser(u); return u;
  },
  getToday: async ctx => {
    const u = user(ctx), summaries = await courses.listCourses(ctx, undefined);
    const tasks: TaskItem[] = [];
    for (const c of summaries) {
      const lessons = (await ctx.repo.listLessons({ courseId: c.id })).filter(l => l.status === 'published');
      const progress = await ctx.repo.listProgress({ userId: u.id, lessonIds: lessons.map(x => x.id) });
      const lesson = lessons.find(l => progress.find(p => p.lessonId === l.id)?.state !== 'completed');
      if (!lesson) continue;
      const state = progress.find(p => p.lessonId === lesson.id)?.state ?? 'not-started';
      const m = await moduleFor(ctx, lesson.moduleId);
      tasks.push({ id: `task-${lesson.id}`, kind: state === 'in-progress' ? 'resume' : progress.length ? 'next' : 'start', title: lesson.title, context: `${c.code} · ${m.title}`, minutes: lesson.minutes, courseId: c.id, lessonId: lesson.id, state });
    }
    tasks.sort((a,b) => (a.kind === 'resume' ? -1 : 0) - (b.kind === 'resume' ? -1 : 0));
    const feed = await announcements.listAnnouncements(ctx, {});
    const unreadCount = feed.filter(x => !x.read).length;
    const recent = feed.slice().sort((a,b) => Number(a.read) - Number(b.read) || (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt)).slice(0,5);
    const cutoff = Date.parse(ctx.now()) - 7 * 24 * 60 * 60 * 1000;
    let minutesDone = 0;
    for (const c of summaries) {
      const lessons = (await ctx.repo.listLessons({ courseId: c.id })).filter(x => x.status === 'published');
      const byId = new Map(lessons.map(l => [l.id, l]));
      for (const p of await ctx.repo.listProgress({ userId: u.id, lessonIds: lessons.map(x => x.id) })) {
        if (p.state === 'completed' && p.updatedAt && Date.parse(p.updatedAt) >= cutoff && Date.parse(p.updatedAt) <= Date.parse(ctx.now())) minutesDone += byId.get(p.lessonId)?.minutes ?? 0;
      }
    }
    return { doNext: tasks, announcements: recent, unreadCount, courses: summaries, week: { minutesGoal: u.profile?.weeklyMinutes ?? 120, minutesDone } };
  },
  getStudentLesson: async (ctx, { lessonId }) => {
    const l = await studentLesson(ctx, lessonId), c = await canReachCourse(ctx, l.courseId), m = await moduleFor(ctx, l.moduleId);
    const blocks: StudentBlock[] = (await ctx.repo.listBlocks(lessonId)).filter(visible).map(b => {
      const meta = { id: b.id, position: b.position, origin: b.origin, provenance: b.provenance };
      const c = content(b);
      // Students never receive the answer key (D-005).
      if (c.type === 'check') return { ...meta, type: 'check', question: c.question, options: c.options };
      return { ...meta, ...c } as StudentBlock;
    });
    const siblings = (await ctx.repo.listLessons({ courseId: l.courseId })).filter(x => x.status === 'published');
    const index = siblings.findIndex(x => x.id === lessonId);
    const p = await ctx.repo.getProgress(user(ctx).id, lessonId);
    return { lesson: l, moduleTitle: m.title, courseTitle: c.title, blocks, progress: p ? publicProgress(p) : defaultProgress(lessonId), previousLessonId: siblings[index-1]?.id ?? null, nextLessonId: siblings[index+1]?.id ?? null };
  },
  answerCheck: async (ctx, { lessonId, blockId, optionId }) => {
    await studentLesson(ctx, lessonId);
    const b = (await ctx.repo.listBlocks(lessonId)).find(x => x.id === blockId && visible(x));
    if (!b || b.type !== 'check' || !b.options.some(x => x.id === optionId)) throw new ApiError('invalid', 'Invalid check or option.');
    const u = user(ctx), p = await ctx.repo.getProgress(u.id, lessonId) ?? { ...defaultProgress(lessonId), userId: u.id };
    const correct = b.correctOptionId === optionId, attempts = (p.checks[blockId]?.attempts ?? 0) + 1;
    p.checks[blockId] = { correct, attempts }; if (p.state === 'not-started') p.state = 'in-progress'; p.updatedAt = ctx.now();
    await ctx.repo.putProgress(p); return { correct, feedback: correct ? b.feedbackCorrect : b.feedbackIncorrect, attempts };
  },
  setLessonProgress: async (ctx, { lessonId, state }) => {
    await studentLesson(ctx, lessonId);
    if (state !== 'in-progress' && state !== 'completed') fail('invalid', 'Invalid progress state.');
    const u = user(ctx), p = await ctx.repo.getProgress(u.id, lessonId) ?? { ...defaultProgress(lessonId), userId: u.id };
    if (p.state !== 'completed' || state === 'completed') p.state = state;
    p.updatedAt = ctx.now(); await ctx.repo.putProgress(p); return publicProgress(p);
  },
};

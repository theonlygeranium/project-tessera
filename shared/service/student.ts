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
    const u = await ctx.repo.getUser(user(ctx).id) ?? user(ctx), summaries = await courses.listCourses(ctx, undefined);
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
    if (u.profile?.sessionMinutes !== undefined) {
      const limit = u.profile.sessionMinutes;
      tasks.sort((a, b) => Number(b.minutes <= limit) - Number(a.minutes <= limit));
    }
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
  getStudentLesson: async (ctx, { lessonId, version = 'auto' }) => {
    const requested = await studentLesson(ctx, lessonId);
    const master = requested.variantOf ? await studentLesson(ctx, requested.variantOf.lessonId) : requested;
    const profile = (await ctx.repo.getUser(user(ctx).id))?.profile;
    const variants = (await ctx.repo.listVariantLessons(master.id)).filter(v => v.status === 'published');
    const matched = profile?.readingLevel === 'plain' ? variants.find(v => v.variantOf?.audience === 'plain') : undefined;
    const available = matched ?? (profile?.sessionMinutes !== undefined && profile.sessionMinutes <= 15 ? variants.find(v => v.variantOf?.audience === 'micro') : undefined);
    const chosen = version === 'full' ? master : requested.variantOf ? requested : available ?? master;
    const why = (audience: 'plain' | 'micro') => audience === 'plain' ? 'Shown in plain language because your profile asks for plain reading.' : 'Shown as a 15-minute version because your sessions are 15 minutes or less.';
    const c = await canReachCourse(ctx, master.courseId), m = await moduleFor(ctx, chosen.moduleId);
    const blocks: StudentBlock[] = (await ctx.repo.listBlocks(chosen.id)).filter(visible).map(b => {
      const meta = { id: b.id, position: b.position, origin: b.origin, provenance: b.provenance };
      const c = content(b);
      // Students never receive the answer key (D-005).
      if (c.type === 'check') return { ...meta, type: 'check', question: c.question, options: c.options };
      return { ...meta, ...c } as StudentBlock;
    });
    const siblings = (await ctx.repo.listLessons({ courseId: master.courseId })).filter(x => x.status === 'published');
    const index = siblings.findIndex(x => x.id === master.id);
    const p = await ctx.repo.getProgress(user(ctx).id, master.id);
    return { lesson: chosen, moduleTitle: m.title, courseTitle: c.title, blocks, progress: p ? publicProgress(p) : defaultProgress(master.id), previousLessonId: siblings[index-1]?.id ?? null, nextLessonId: siblings[index+1]?.id ?? null,
      variant: chosen.variantOf ? { audience: chosen.variantOf.audience, why: available?.id === chosen.id ? why(chosen.variantOf.audience) : `You opened the ${chosen.variantOf.audience === 'plain' ? 'plain-language' : '15-minute'} version.`, fullLessonId: master.id } : null,
      variantAvailable: chosen.variantOf || !available ? null : { audience: available.variantOf!.audience, lessonId: available.id, why: why(available.variantOf!.audience) } };
  },
  answerCheck: async (ctx, { lessonId, blockId, optionId }) => {
    const lesson = await studentLesson(ctx, lessonId);
    const progressId = lesson.variantOf?.lessonId ?? lessonId;
    if (lesson.variantOf) await studentLesson(ctx, progressId);
    const b = (await ctx.repo.listBlocks(lessonId)).find(x => x.id === blockId && visible(x));
    if (!b || b.type !== 'check' || !b.options.some(x => x.id === optionId)) throw new ApiError('invalid', 'Invalid check or option.');
    const u = user(ctx), p = await ctx.repo.getProgress(u.id, progressId) ?? { ...defaultProgress(progressId), userId: u.id };
    const correct = b.correctOptionId === optionId, attempts = (p.checks[blockId]?.attempts ?? 0) + 1;
    p.checks[blockId] = { correct, attempts }; if (p.state === 'not-started') p.state = 'in-progress'; p.updatedAt = ctx.now();
    await ctx.repo.putProgress(p); return { correct, feedback: correct ? b.feedbackCorrect : b.feedbackIncorrect, attempts };
  },
  setLessonProgress: async (ctx, { lessonId, state }) => {
    const lesson = await studentLesson(ctx, lessonId);
    const progressId = lesson.variantOf?.lessonId ?? lessonId;
    if (lesson.variantOf) await studentLesson(ctx, progressId);
    if (state !== 'in-progress' && state !== 'completed') fail('invalid', 'Invalid progress state.');
    const u = user(ctx), p = await ctx.repo.getProgress(u.id, progressId) ?? { ...defaultProgress(progressId), userId: u.id };
    if (p.state !== 'completed' || state === 'completed') p.state = state;
    p.updatedAt = ctx.now(); await ctx.repo.putProgress(p); return publicProgress(p);
  },
};

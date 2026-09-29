import type { Course, CourseSummary, LessonSummary, RosterEntry } from '../domain';
import type { Service, ServiceContext } from './context';
import { canReachCourse, canTeach, course, fail, lessonFor, minutes, moduleFor, move, renumberLessons, renumberModules, required, user } from './helpers';
import { learnerCourse } from './learner';
import { applyTemplatePlan, effectiveTemplate } from './templates';
import { saveCourseOutcomes } from './outcomes';

export async function summary(ctx: ServiceContext, c: Course, asLearner = false): Promise<CourseSummary> {
  const [modules, lessons, enrollments] = await Promise.all([ctx.repo.listModules(c.id), ctx.repo.listLessons({ courseId: c.id }), ctx.repo.listEnrollments({ courseId: c.id })]);
  const names = await Promise.all(c.instructorIds.map(id => ctx.repo.getUser(id)));
  const u = user(ctx), published = lessons.filter(x => x.status === 'published');
  const learnerView = asLearner || u.role === 'student';
  const progress = learnerView ? await ctx.repo.listProgress({ userId: u.id, lessonIds: published.map(x => x.id) }) : [];
  const p = c.programId ? await ctx.repo.getProgram(c.programId) : null;
  return { ...c, ...(p ? { program: { id: p.id, name: p.name, accent: p.brand.accent } } : {}), instructorNames: names.filter(x => x !== null).map(x => x.name), moduleCount: modules.length, lessonCount: learnerView ? published.length : lessons.length, publishedLessonCount: published.length, studentCount: enrollments.length, progress: learnerView ? (published.length ? progress.filter(x => x.state === 'completed').length / published.length : 0) : null, startedLessonCount: learnerView ? progress.filter(x => x.state !== 'not-started').length : null };
}

export const courses: Pick<Service, 'listCourses' | 'createCourse' | 'getCourseOutline' | 'updateCourse' | 'setCourseInstructors' | 'getCourseEnrollments' | 'setCourseEnrollments' | 'getRoster' | 'createModule' | 'updateModule' | 'deleteModule' | 'createLesson' | 'updateLesson' | 'deleteLesson'> = {
  listCourses: async ctx => {
    const u = user(ctx), all = await ctx.repo.listCourses();
    const enrollments = u.role === 'student' ? await ctx.repo.listEnrollments({ userId: u.id }) : [];
    const visible = all.filter(c => u.role === 'administrator' || u.role === 'instructor' && c.instructorIds.includes(u.id) || u.role === 'student' && c.status === 'active' && enrollments.some(e => e.courseId === c.id));
    return Promise.all(visible.map(c => summary(ctx, c)));
  },
  createCourse: async (ctx, input) => {
    if (input.programId && !(await ctx.repo.getProgram(input.programId))) fail('invalid', 'Program not found.');
    const creator = user(ctx);
    const c: Course = { id: ctx.newId('c'), code: required(input.code, 'code'), title: required(input.title, 'title'), term: required(input.term, 'term'), description: input.description?.trim() ?? '', welcome: '', outcomes: [], instructorIds: creator.role === 'instructor' ? [creator.id] : [], status: 'active', programId: input.programId ?? null };
    const template = input.skipTemplate ? null : await effectiveTemplate(ctx, c);
    await ctx.repo.putCourse(c);
    if (template) await applyTemplatePlan(ctx, c, template, { course: { id: c.id }, modules: [], lessons: [], blocks: {} });
    return c;
  },
  getCourseOutline: async (ctx, { courseId, asLearner = false }) => {
    const c = asLearner ? await learnerCourse(ctx, courseId) : await canReachCourse(ctx, courseId);
    const u = user(ctx), learnerView = asLearner || u.role === 'student', modules = await ctx.repo.listModules(courseId);
    const out = [];
    for (const m of modules) {
      const lessons = await ctx.repo.listLessons({ moduleId: m.id });
      const visible = learnerView ? lessons.filter(l => l.status === 'published') : lessons;
      if (learnerView && !visible.length) continue;
      const summaries: LessonSummary[] = [];
      for (const l of visible) {
        const progress = learnerView ? await ctx.repo.getProgress(u.id, l.id) : null;
        const blocks = learnerView ? [] : await ctx.repo.listBlocks(l.id);
        summaries.push({ ...l, progress: learnerView ? progress?.state ?? 'not-started' : null, draftBlockCount: learnerView ? null : blocks.filter(b => b.origin === 'ai' && b.aiState !== 'kept').length });
      }
      out.push({ ...m, lessons: summaries });
    }
    const designSession = learnerView ? undefined : (await ctx.repo.listDesignSessions(courseId)).find(session => session.stage === 'review');
    return { course: await summary(ctx, c, asLearner), modules: out, ...(!learnerView && designSession ? { designSession: { id: designSession.id, stage: designSession.stage } } : {}) };
  },
  updateCourse: async (ctx, input) => {
    const c = await canReachCourse(ctx, input.courseId);
    if (user(ctx).role === 'student') fail('forbidden', 'Cannot edit this course.');
    for (const key of ['code', 'title', 'term'] as const) if (input[key] !== undefined) c[key] = required(input[key], key);
    if (input.description !== undefined) c.description = input.description.trim();
    if (input.welcome !== undefined) c.welcome = input.welcome.trim();
    if (input.outcomes !== undefined && (input.outcomes.length > 30 || input.outcomes.some(x => typeof x !== 'string' || !x.trim() || x.trim().length > 500))) fail('invalid', 'Outcomes must have 1–500 characters, at most 30.');
    await ctx.repo.putCourse(c);
    if (input.outcomes !== undefined) {
      const old = await ctx.repo.listOutcomes(c.id);
      await saveCourseOutcomes(ctx, c.id, input.outcomes.map((text, position) => ({ id: old[position]?.id, text })));
    }
    return (await ctx.repo.getCourse(c.id))!;
  },
  setCourseInstructors: async (ctx, input) => {
    const c = await course(ctx, input.courseId);
    for (const id of input.userIds) if ((await ctx.repo.getUser(id))?.role !== 'instructor') fail('invalid', 'Every instructor id must identify an instructor.');
    c.instructorIds = [...new Set(input.userIds)]; await ctx.repo.putCourse(c); return c;
  },
  getCourseEnrollments: async (ctx, { courseId }) => { await canReachCourse(ctx, courseId); return { userIds: (await ctx.repo.listEnrollments({ courseId })).map(x => x.userId) }; },
  setCourseEnrollments: async (ctx, { courseId, userIds }) => {
    await course(ctx, courseId);
    for (const id of userIds) if ((await ctx.repo.getUser(id))?.role !== 'student') fail('invalid', 'Every enrollment id must identify a student.');
    await ctx.repo.setEnrollments(courseId, userIds); return { userIds: [...new Set(userIds)] };
  },
  getRoster: async (ctx, { courseId }) => {
    await canReachCourse(ctx, courseId);
    const lessons = (await ctx.repo.listLessons({ courseId })).filter(x => x.status === 'published');
    const enrollments = await ctx.repo.listEnrollments({ courseId }); const entries: RosterEntry[] = [];
    for (const enrollment of enrollments) {
      const u = await ctx.repo.getUser(enrollment.userId); if (!u) continue;
      const progress = await ctx.repo.listProgress({ userId: u.id, lessonIds: lessons.map(x => x.id) });
      entries.push({ user: { id: u.id, name: u.name, email: u.email, initials: u.initials }, completedLessons: progress.filter(x => x.state === 'completed').length, publishedLessons: lessons.length, lastActivity: progress.map(x => x.updatedAt).filter((x): x is string => x !== null).sort().at(-1) ?? null });
    }
    return entries.sort((a,b) => a.user.name.localeCompare(b.user.name));
  },
  createModule: async (ctx, { courseId, title }) => {
    await canTeach(ctx, courseId);
    const m = { id: ctx.newId('m'), courseId, title: required(title, 'title'), position: (await ctx.repo.listModules(courseId)).length };
    await ctx.repo.putModule(m); return m;
  },
  updateModule: async (ctx, input) => {
    const m = await moduleFor(ctx, input.moduleId); await canTeach(ctx, m.courseId);
    if (input.title !== undefined) m.title = required(input.title, 'title');
    if (input.objective !== undefined) m.objective = input.objective?.trim() || undefined;
    await ctx.repo.putModule(m);
    if (input.position !== undefined) {
      const ids = (await ctx.repo.listModules(m.courseId)).map(x => x.id);
      await renumberModules(ctx, m.courseId, move(ids, m.id, input.position));
    }
    return (await moduleFor(ctx, m.id));
  },
  deleteModule: async (ctx, { moduleId }) => {
    const m = await moduleFor(ctx, moduleId); await canTeach(ctx, m.courseId);
    if ((await ctx.repo.listLessons({ moduleId })).length) fail('conflict', 'Module has lessons.');
    await ctx.repo.deleteModule(moduleId);
    await renumberModules(ctx, m.courseId, (await ctx.repo.listModules(m.courseId)).map(x => x.id)); return { ok: true };
  },
  createLesson: async (ctx, { moduleId, title, minutes: duration }) => {
    const m = await moduleFor(ctx, moduleId); await canTeach(ctx, m.courseId);
    const l = { id: ctx.newId('l'), moduleId, courseId: m.courseId, title: required(title, 'title'), minutes: minutes(duration ?? 15), position: (await ctx.repo.listLessons({ moduleId })).length, status: 'draft' as const, publishedAt: null };
    await ctx.repo.putLesson(l); return l;
  },
  updateLesson: async (ctx, input) => {
    const l = await lessonFor(ctx, input.lessonId); await canTeach(ctx, l.courseId);
    const oldModule = l.moduleId;
    if (input.moduleId !== undefined && input.moduleId !== oldModule) {
      const target = await moduleFor(ctx, input.moduleId);
      if (target.courseId !== l.courseId) fail('invalid', 'A lesson can only move within its course.');
      l.moduleId = target.id; l.position = (await ctx.repo.listLessons({ moduleId: target.id })).length;
    }
    if (input.title !== undefined) l.title = required(input.title, 'title');
    if (input.minutes !== undefined) l.minutes = minutes(input.minutes);
    await ctx.repo.putLesson(l);
    if (oldModule !== l.moduleId) await renumberLessons(ctx, oldModule, (await ctx.repo.listLessons({ moduleId: oldModule })).map(x => x.id));
    if (input.position !== undefined) await renumberLessons(ctx, l.moduleId, move((await ctx.repo.listLessons({ moduleId: l.moduleId })).map(x => x.id), l.id, input.position));
    return lessonFor(ctx, l.id);
  },
  deleteLesson: async (ctx, { lessonId }) => {
    const l = await lessonFor(ctx, lessonId); await canTeach(ctx, l.courseId);
    await ctx.repo.deleteLesson(lessonId);
    await renumberLessons(ctx, l.moduleId, (await ctx.repo.listLessons({ moduleId: l.moduleId })).map(x => x.id)); return { ok: true };
  },
};

import { logError } from './log';
import type { Announcement, Provenance } from '../domain';
import type { StoredAnnouncement } from '../repo';
import type { Service, ServiceContext } from './context';
import { aiEnabled, aiFailed, canReachCourse, canTeach, course, fail, provenance, required, user } from './helpers';

async function joined(ctx: ServiceContext, row: StoredAnnouncement): Promise<Announcement> {
  const c = await course(ctx, row.courseId), author = await ctx.repo.getUser(row.authorId);
  const read = user(ctx).role !== 'student' || (await ctx.repo.listReads({ userId: user(ctx).id, announcementId: row.id })).length > 0;
  return { ...row, courseTitle: c.title, authorName: author?.name ?? '', authorInitials: author?.initials ?? '', read };
}
async function announcementForTeacher(ctx: ServiceContext, id: string) {
  const a = await ctx.repo.getAnnouncement(id) ?? fail('not-found', 'Announcement not found.');
  await canTeach(ctx, a.courseId); return a;
}
export const announcements: Pick<Service, 'listAnnouncements' | 'createAnnouncement' | 'updateAnnouncement' | 'deleteAnnouncement' | 'markAnnouncementRead' | 'draftAnnouncement'> = {
  listAnnouncements: async (ctx, { courseId }) => {
    const u = user(ctx);
    if (courseId) await canReachCourse(ctx, courseId);
    let courseIds: string[];
    if (courseId) courseIds = [courseId];
    else if (u.role === 'administrator') courseIds = (await ctx.repo.listCourses()).map(x => x.id);
    else if (u.role === 'instructor') courseIds = (await ctx.repo.listCourses()).filter(x => x.instructorIds.includes(u.id)).map(x => x.id);
    else {
      const enrolled = new Set((await ctx.repo.listEnrollments({ userId: u.id })).map(x => x.courseId));
      courseIds = (await ctx.repo.listCourses()).filter(x => x.status === 'active' && enrolled.has(x.id)).map(x => x.id);
    }
    const rows = (await ctx.repo.listAnnouncements({ courseIds })).filter(x => u.role !== 'student' || x.status === 'published');
    const result = await Promise.all(rows.map(x => joined(ctx, x)));
    return result.sort((a,b) => Number(b.pinned) - Number(a.pinned) || (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt));
  },
  createAnnouncement: async (ctx, input) => {
    await canTeach(ctx, input.courseId);
    const now = ctx.now();
    const row: StoredAnnouncement = { id: ctx.newId('a'), courseId: input.courseId, authorId: user(ctx).id, title: required(input.title, 'title'), body: required(input.body, 'body'), pinned: input.pinned, status: input.publish ? 'published' : 'draft', origin: input.aiDraft ? 'ai' : 'human', aiState: input.aiDraft ? (input.publish ? 'kept' : 'draft') : null, provenance: input.aiDraft ?? null, publishedAt: input.publish ? now : null, createdAt: now };
    await ctx.repo.putAnnouncement(row); return joined(ctx, row);
  },
  updateAnnouncement: async (ctx, input) => {
    const row = await announcementForTeacher(ctx, input.announcementId);
    if (input.title !== undefined) row.title = required(input.title, 'title');
    if (input.body !== undefined) row.body = required(input.body, 'body');
    if (input.pinned !== undefined) row.pinned = input.pinned;
    if (input.publish !== undefined) {
      row.status = input.publish ? 'published' : 'draft'; row.publishedAt = input.publish ? ctx.now() : null;
      if (row.origin === 'ai') row.aiState = input.publish ? 'kept' : 'draft';
    }
    await ctx.repo.putAnnouncement(row); return joined(ctx, row);
  },
  deleteAnnouncement: async (ctx, { announcementId }) => { await announcementForTeacher(ctx, announcementId); await ctx.repo.deleteAnnouncement(announcementId); return { ok: true }; },
  markAnnouncementRead: async (ctx, { announcementId }) => {
    const a = await ctx.repo.getAnnouncement(announcementId) ?? fail('not-found', 'Announcement not found.');
    await canReachCourse(ctx, a.courseId);
    if (user(ctx).role === 'student' && a.status !== 'published') fail('not-found', 'Announcement not found.');
    await ctx.repo.putRead({ announcementId, userId: user(ctx).id, readAt: ctx.now() }); return { ok: true };
  },
  draftAnnouncement: async (ctx, { courseId, prompt }) => {
    const c = await canTeach(ctx, courseId); await aiEnabled(ctx); const clean = required(prompt, 'prompt');
    let result;
    try { result = await ctx.ai.run('announcement', { courseTitle: c.title, instructorName: user(ctx).name, prompt: clean }); }
    catch (error) { logError('AI task failed:', error instanceof Error ? error.message : error, (error as { details?: unknown })?.details ?? ''); return aiFailed(); }
    if (!result.output || typeof result.output.title !== 'string' || typeof result.output.body !== 'string' || !result.output.title.trim() || !result.output.body.trim()) aiFailed();
    return { title: result.output.title.trim(), body: result.output.body.trim(), provenance: provenance(ctx, result.model, 'announcement', clean.slice(0,120)) };
  },
};

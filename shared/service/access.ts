// Tessera Access handlers (D-022): lesson reports, course and institution roll-ups,
// the CSV export, the publish policy, document scans and fixes, and AI fix
// suggestions. Document engines (parsers, fixers) are provided by the Worker
// through `ctx.documents`; without one (mock mode) document operations say so.
import { ApiError } from '../api';
import { lessonAccessReport } from '../access/blocks';
import { combine, summarize } from '../access/score';
import type { AccessReport, AccessTrendPoint, CourseAccessReport, FileRecord, Id, InstitutionAccessReport } from '../domain';
import type { StoredScan } from '../repo';
import type { Service, ServiceContext } from './context';
import { canReachCourse, canTeach, fail, lessonFor, user } from './helpers';

const CSV_HEADER = 'Report date,Course,Item,Type,Score,Grade,Issue code,WCAG SC,WCAG level,Severity,Issue,Location,Fix hint';
const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function docs(ctx: ServiceContext) {
  if (!ctx.documents) throw new ApiError('unsupported', 'Document scanning, fixes, and AI suggestions run on the server, not in demo mode.');
  return ctx.documents;
}

async function staffCourse(ctx: ServiceContext, courseId: Id) {
  const c = await canReachCourse(ctx, courseId);
  if (user(ctx).role === 'student') fail('forbidden', 'Staff only.');
  return c;
}

/** Scans a lesson's blocks now, stores the scan, and returns the report. */
export async function scanLesson(ctx: ServiceContext, lessonId: Id): Promise<AccessReport> {
  const lesson = await lessonFor(ctx, lessonId);
  const report = lessonAccessReport(lessonId, await ctx.repo.listBlocks(lessonId), ctx.now());
  const stored: StoredScan = { ...report, id: ctx.newId('scan'), courseId: lesson.courseId, version: null };
  await ctx.repo.putScan(stored);
  return report;
}

async function requireFile(ctx: ServiceContext, fileId: Id): Promise<FileRecord> {
  const f = await ctx.repo.getFile(fileId);
  if (!f) throw new ApiError('not-found', 'File not found.');
  await staffCourse(ctx, f.courseId);
  return f;
}

function trend(scans: StoredScan[]): AccessTrendPoint[] {
  // One point per day: the mean score of that day's scans, oldest first.
  const byDay = new Map<string, { scores: number[]; issues: number }>();
  for (const s of scans) {
    const day = s.scannedAt.slice(0, 10);
    const d = byDay.get(day) ?? { scores: [], issues: 0 };
    d.scores.push(s.score); d.issues += s.issueCount;
    byDay.set(day, d);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-30)
    .map(([day, d]) => ({ at: `${day}T00:00:00.000Z`, score: Math.round(d.scores.reduce((n, x) => n + x, 0) / d.scores.length), issueCount: d.issues }));
}

function topIssues(scans: StoredScan[]): CourseAccessReport['topIssues'] {
  const counts = new Map<string, CourseAccessReport['topIssues'][number]>();
  for (const s of scans) for (const i of s.issues) {
    const t = counts.get(i.code) ?? { code: i.code, title: i.title, count: 0, wcag: i.wcag };
    t.count += i.count; counts.set(i.code, t);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 8);
}

/** The latest scan per target within a set of scans (newest first). */
function latestPerTarget(scans: StoredScan[]): StoredScan[] {
  const seen = new Set<string>(); const out: StoredScan[] = [];
  for (const s of scans) { const key = `${s.target.kind}:${s.target.kind === 'lesson' ? s.target.lessonId : s.target.fileId}`; if (!seen.has(key)) { seen.add(key); out.push(s); } }
  return out;
}

async function courseReport(ctx: ServiceContext, courseId: Id): Promise<CourseAccessReport> {
  const now = ctx.now();
  const lessons = await ctx.repo.listLessons({ courseId });
  // Lessons are cheap to scan, so a course report always reflects current content.
  const lessonReports = await Promise.all(lessons.map(async (l) => ({ l, r: await scanLesson(ctx, l.id) })));
  const files = await ctx.repo.listFiles(courseId);
  const allScans = await ctx.repo.listScans({ courseId });
  const latest = latestPerTarget(allScans);
  const summaries = latest.map((s) => ({ score: s.score, grade: s.grade, issueCount: s.issueCount, bySeverity: s.bySeverity, scannedAt: s.scannedAt }));
  return {
    courseId,
    summary: combine(summaries, now) ?? summarize([], now),
    lessons: lessonReports.map(({ l, r }) => ({ lessonId: l.id, title: l.title, status: l.status, summary: { score: r.score, grade: r.grade, issueCount: r.issueCount, bySeverity: r.bySeverity, scannedAt: r.scannedAt } })),
    files: files.map((f) => ({ fileId: f.id, name: f.name, kind: f.kind, summary: f.scan })),
    topIssues: topIssues(latest),
    trend: trend(allScans),
  };
}

export const access: Pick<Service, 'getLessonAccess' | 'getCourseAccess' | 'getInstitutionAccess' | 'exportInstitutionAccess' | 'updateAccessPolicy' | 'scanFile' | 'getFileAccess' | 'fixFileIssue' | 'suggestFix'> = {
  getLessonAccess: async (ctx, { lessonId }) => {
    const l = await lessonFor(ctx, lessonId);
    await staffCourse(ctx, l.courseId);
    return scanLesson(ctx, lessonId);
  },
  getCourseAccess: async (ctx, { courseId }) => { await staffCourse(ctx, courseId); return courseReport(ctx, courseId); },
  getInstitutionAccess: async (ctx): Promise<InstitutionAccessReport> => {
    const now = ctx.now();
    const courses = await ctx.repo.listCourses();
    const perCourse = await Promise.all(courses.map(async (c) => ({ c, r: await courseReport(ctx, c.id), names: (await Promise.all(c.instructorIds.map((id) => ctx.repo.getUser(id)))).flatMap((u) => (u ? [u.name] : [])) })));
    const allScans = latestPerTarget(await ctx.repo.listScans({}));
    const summaries = perCourse.map((x) => x.r.summary).filter((s) => s.issueCount > 0 || s.score < 100 || allScans.length > 0);
    return {
      summary: combine(summaries, now) ?? summarize([], now),
      courses: perCourse.map(({ c, r, names }) => ({ courseId: c.id, code: c.code, title: c.title, instructorNames: names, summary: r.summary })).sort((a, b) => (a.summary?.score ?? 100) - (b.summary?.score ?? 100)),
      topIssues: topIssues(allScans),
      trend: trend(await ctx.repo.listScans({})),
    };
  },
  exportInstitutionAccess: async (ctx) => {
    const date = ctx.now().slice(0, 10);
    const courses = new Map((await ctx.repo.listCourses()).map((c) => [c.id, c]));
    const lessons = new Map((await ctx.repo.listLessons({})).map((l) => [l.id, l]));
    const rows = [CSV_HEADER];
    for (const s of latestPerTarget(await ctx.repo.listScans({}))) {
      const course = courses.get(s.courseId)?.code ?? s.courseId;
      const item = s.target.kind === 'lesson' ? lessons.get(s.target.lessonId)?.title ?? s.target.lessonId : (await ctx.repo.getFile(s.target.fileId))?.name ?? s.target.fileId;
      for (const i of s.issues) rows.push([date, course, item, s.target.kind, s.score, s.grade, i.code, i.wcag.sc, i.wcag.level, i.severity, i.title, i.location.label ?? i.location.blockId ?? (i.location.page ? `page ${i.location.page}` : ''), i.fixHint].map(csvCell).join(','));
      if (s.issues.length === 0) rows.push([date, course, item, s.target.kind, s.score, s.grade, '', '', '', '', 'No issues', '', ''].map(csvCell).join(','));
    }
    return { csv: rows.join('\n') + '\n' };
  },
  updateAccessPolicy: async (ctx, policy) => {
    const inst = await ctx.repo.getInstitution();
    if (!Number.isInteger(policy.minimumScore) || policy.minimumScore < 0 || policy.minimumScore > 100) fail('invalid', 'minimumScore must be 0–100.');
    const valid = new Set(['critical', 'serious', 'moderate', 'minor']);
    if (!Array.isArray(policy.blockingSeverities) || policy.blockingSeverities.some((s) => !valid.has(s))) fail('invalid', 'Invalid severity.');
    inst.accessPolicy = { minimumScore: policy.minimumScore, blockingSeverities: [...new Set(policy.blockingSeverities)] };
    await ctx.repo.putInstitution(inst);
    return inst;
  },
  scanFile: async (ctx, { fileId }) => {
    const f = await requireFile(ctx, fileId);
    const report = await docs(ctx).scan(f);
    await ctx.repo.putScan({ ...report, id: ctx.newId('scan'), courseId: f.courseId, version: f.version });
    return report;
  },
  getFileAccess: async (ctx, { fileId }) => {
    const f = await requireFile(ctx, fileId);
    const latest = await ctx.repo.latestScan('file', fileId);
    if (latest && latest.version === f.version) { const { id: _i, courseId: _c, version: _v, ...report } = latest; return report; }
    return access.scanFile(ctx, { fileId });
  },
  fixFileIssue: async (ctx, { fileId, issueIndex, fix }) => {
    const f = await ctx.repo.getFile(fileId);
    if (!f) throw new ApiError('not-found', 'File not found.');
    await canTeach(ctx, f.courseId);
    const engine = docs(ctx);
    const latest = await ctx.repo.latestScan('file', fileId);
    if (!latest || latest.version !== f.version) throw new ApiError('conflict', 'Scan the file first.');
    if (!latest.issues[issueIndex]) throw new ApiError('invalid', 'No such issue.');
    const updated = await engine.fix(f, fix, user(ctx).id);
    await ctx.repo.putFile(updated);
    return access.scanFile(ctx, { fileId });
  },
  suggestFix: async (ctx, { target, kind }) => {
    if (!(await ctx.repo.getInstitution()).policy.aiAuthoring) fail('ai-disabled', 'AI authoring is disabled.');
    const engine = docs(ctx);
    if ('lessonId' in target) {
      const l = await lessonFor(ctx, target.lessonId);
      await canTeach(ctx, l.courseId);
      const block = (await ctx.repo.listBlocks(l.id)).find((b) => b.id === target.blockId);
      if (!block) throw new ApiError('not-found', 'Block not found.');
      return engine.suggest({ kind, block, courseTitle: (await ctx.repo.getCourse(l.courseId))?.title ?? '' }, ctx);
    }
    const f = await ctx.repo.getFile(target.fileId);
    if (!f) throw new ApiError('not-found', 'File not found.');
    await canTeach(ctx, f.courseId);
    return engine.suggest({ kind, file: f, element: target.element, courseTitle: (await ctx.repo.getCourse(f.courseId))?.title ?? '' }, ctx);
  },
};

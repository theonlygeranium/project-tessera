// Files (D-019) and accessible formats (D-022). The bytes live in R2 and are moved
// by the Worker (`POST …/files/upload`, `GET /files/:id/content`); these handlers
// manage the records. Format generation needs the document engine (`ctx.documents`).
import { ApiError } from '../api';
import type { AccessibleFormat, FileRecord, FormatStatus } from '../domain';
import type { Service, ServiceContext } from './context';
import { canReachCourse, canTeach, fail, user } from './helpers';

const FORMATS: AccessibleFormat[] = ['reading', 'audio', 'epub', 'ocr'];

/**
 * Who can read a file: staff who reach the course, and enrolled students for files
 * staff uploaded (course materials) or that they uploaded themselves. A student never
 * reads another student's upload (a submission). Answers not-found rather than
 * forbidden so ids can't be probed.
 */
export async function canReadFile(ctx: ServiceContext, f: FileRecord): Promise<void> {
  await canReachCourse(ctx, f.courseId);
  const u = user(ctx);
  if (u.role !== 'student') return;
  if (f.visibility === 'staff') throw new ApiError('not-found', 'File not found.');
  if (f.uploadedBy === u.id) return;
  const uploader = await ctx.repo.getUser(f.uploadedBy);
  if (!uploader || uploader.role === 'student') throw new ApiError('not-found', 'File not found.');
}

export async function readableFile(ctx: ServiceContext, fileId: string) {
  const f = await ctx.repo.getFile(fileId);
  if (!f) throw new ApiError('not-found', 'File not found.');
  await canReadFile(ctx, f);
  return f;
}

function status(f: { format: AccessibleFormat; state: FormatStatus['state']; outputKey: string | null; generatedAt: string | null } | null, format: AccessibleFormat, fileId: string): FormatStatus {
  return { format, state: f?.state ?? 'none', outputFileId: f?.state === 'ready' && f.outputKey ? `${fileId}:${format}` : null, generatedAt: f?.generatedAt ?? null };
}

export const files: Pick<Service, 'listFiles' | 'getFile' | 'setFileVisibility' | 'deleteFile' | 'getFormats' | 'requestFormat'> = {
  listFiles: async (ctx, { courseId, limit, cursor }) => {
    await canReachCourse(ctx, courseId);
    const listed = await ctx.repo.listFiles(courseId);
    const all: FileRecord[] = [];
    for (const f of listed) { try { await canReadFile(ctx, f); all.push(f); } catch { /* not visible to this person */ } }
    const size = Math.min(Math.max(limit ?? 50, 1), 200);
    const start = cursor ? Math.max(0, all.findIndex((f) => f.id === cursor)) : 0;
    const items = all.slice(start, start + size);
    return { items, nextCursor: all[start + size]?.id ?? null };
  },
  getFile: async (ctx, { fileId }) => readableFile(ctx, fileId),
  setFileVisibility: async (ctx, { fileId, visibility }) => {
    if (ctx.token || ctx.agent) fail('forbidden', 'Share this file from the course files screen.');
    const file = await ctx.repo.getFile(fileId) ?? fail('not-found', 'File not found.');
    await canTeach(ctx, file.courseId);
    file.visibility = visibility;
    await ctx.repo.putFile(file);
    return file;
  },
  deleteFile: async (ctx, { fileId }) => {
    const f = await ctx.repo.getFile(fileId);
    if (!f) throw new ApiError('not-found', 'File not found.');
    await canTeach(ctx, f.courseId);
    await ctx.repo.deleteFile(fileId);
    if (ctx.documents) await ctx.documents.remove(f);
    return { ok: true };
  },
  getFormats: async (ctx, { fileId }) => {
    const f = await readableFile(ctx, fileId);
    const stored = await ctx.repo.listFormats(f.id, f.version);
    return FORMATS.map((format) => status(stored.find((s) => s.format === format) ?? null, format, f.id));
  },
  requestFormat: async (ctx, { fileId, format }) => {
    const f = await readableFile(ctx, fileId);
    if (!FORMATS.includes(format)) fail('invalid', 'Unknown format.');
    const engine = ctx.documents;
    if (!engine) throw new ApiError('unsupported', 'Accessible formats are generated on the server, not in demo mode.');
    const existing = await ctx.repo.getFormat(f.id, f.version, format);
    if (existing?.state === 'ready') return status(existing, format, f.id);
    await ctx.repo.putFormat({ fileId: f.id, version: f.version, format, state: 'generating', outputKey: null, generatedAt: null, error: null });
    try {
      const outputKey = await engine.generateFormat(f, format, (await ctx.repo.getInstitution()).policy.aiAuthoring);
      const done = { fileId: f.id, version: f.version, format, state: 'ready' as const, outputKey, generatedAt: ctx.now(), error: null };
      await ctx.repo.putFormat(done);
      return status(done, format, f.id);
    } catch (error) {
      const failed = { fileId: f.id, version: f.version, format, state: 'failed' as const, outputKey: null, generatedAt: null, error: error instanceof Error ? error.message : String(error) };
      await ctx.repo.putFormat(failed);
      if (user(ctx).role === 'student') throw new ApiError('ai-failed', 'This format couldn\'t be generated. Try again later.');
      throw new ApiError('ai-failed', `Format generation failed: ${failed.error}`);
    }
  },
};

// Files (D-019) and accessible formats (D-022). The bytes live in R2 and are moved
// by the Worker (`POST …/files/upload`, `GET /files/:id/content`); these handlers
// manage the records. Format generation needs the document engine (`ctx.documents`).
import { ApiError } from '../api';
import type { AccessibleFormat, FormatStatus } from '../domain';
import type { Service, ServiceContext } from './context';
import { canReachCourse, canTeach, fail, user } from './helpers';

const FORMATS: AccessibleFormat[] = ['reading', 'audio', 'epub', 'ocr'];

async function readableFile(ctx: ServiceContext, fileId: string) {
  const f = await ctx.repo.getFile(fileId);
  if (!f) throw new ApiError('not-found', 'File not found.');
  await canReachCourse(ctx, f.courseId);
  return f;
}

function status(f: { format: AccessibleFormat; state: FormatStatus['state']; outputKey: string | null; generatedAt: string | null } | null, format: AccessibleFormat, fileId: string): FormatStatus {
  return { format, state: f?.state ?? 'none', outputFileId: f?.state === 'ready' && f.outputKey ? `${fileId}:${format}` : null, generatedAt: f?.generatedAt ?? null };
}

export const files: Pick<Service, 'listFiles' | 'getFile' | 'deleteFile' | 'getFormats' | 'requestFormat'> = {
  listFiles: async (ctx, { courseId, limit, cursor }) => {
    await canReachCourse(ctx, courseId);
    const all = await ctx.repo.listFiles(courseId);
    const size = Math.min(Math.max(limit ?? 50, 1), 200);
    const start = cursor ? Math.max(0, all.findIndex((f) => f.id === cursor)) : 0;
    const items = all.slice(start, start + size);
    return { items, nextCursor: all[start + size]?.id ?? null };
  },
  getFile: async (ctx, { fileId }) => readableFile(ctx, fileId),
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
      const outputKey = await engine.generateFormat(f, format);
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

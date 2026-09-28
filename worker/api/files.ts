// Binary file routes (D-019): upload (multipart) and content (bytes, with Range for
// video). They sit outside the JSON operations in shared/api.ts but go through the same
// principal, scope, and rate-limit checks in the router.
import { ApiError, matchPath, type Route } from '../../shared/api';
import type { AccessibleFormat, FileKind, FileRecord } from '../../shared/domain';
import { canReadFile, type ServiceContext } from '../../shared/service';
import { canReachCourse, user } from '../../shared/service/helpers';
import { FORMAT_FILES, fileKeys } from '../access/engine';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

type FileHandler = (request: Request, ctx: ServiceContext, bucket: R2Bucket, params: Record<string, string>) => Promise<Response>;

const KINDS: Record<string, FileKind> = {
  pdf: 'pdf', docx: 'docx', pptx: 'pptx',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  vtt: 'captions', srt: 'captions',
};
const MIMES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  vtt: 'text/vtt', srt: 'application/x-subrip', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg',
};

export function kindOf(name: string): { kind: FileKind; mime: string } {
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();
  return { kind: KINDS[ext] ?? 'other', mime: MIMES[ext] ?? 'application/octet-stream' };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const upload: FileHandler = async (request, ctx, bucket, { courseId }) => {
  await canReachCourse(ctx, courseId);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) throw new ApiError('too-large', 'Files can be up to 25 MB.');
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')) {
    throw new ApiError('invalid', 'Send the file as multipart/form-data in a field named "file".');
  }
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') throw new ApiError('invalid', 'Send the file in a field named "file".');
  if (file.size === 0) throw new ApiError('invalid', 'The file is empty.');
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError('too-large', 'Files can be up to 25 MB.');
  const name = file.name.trim().slice(0, 200) || 'file';
  const { kind, mime } = kindOf(name);
  const now = ctx.now();
  const record: FileRecord = {
    id: ctx.newId('file'), courseId, name, kind, mime, size: file.size, key: '', version: 1,
    uploadedBy: user(ctx).id, uploadedAt: now, scan: null,
  };
  record.key = fileKeys.version(record, 1);
  await bucket.put(record.key, file.stream(), { httpMetadata: { contentType: mime } });
  await ctx.repo.putFile(record);
  await ctx.repo.putFileVersion({ fileId: record.id, version: 1, key: record.key, note: 'Uploaded', createdBy: record.uploadedBy, createdAt: now });
  return json(record, 201);
};

const content: FileHandler = async (request, ctx, bucket, { fileId: raw }) => {
  // `?format=` selects a generated format. An encoded `id%3Aformat` (FormatStatus.outputFileId) also works.
  const [fileId, pathFormat] = decodeURIComponent(raw).split(':');
  const format = (pathFormat || new URL(request.url).searchParams.get('format') || null) as AccessibleFormat | null;
  const f = await ctx.repo.getFile(fileId);
  if (!f) throw new ApiError('not-found', 'File not found.');
  await canReadFile(ctx, f);

  let key = f.key, mime = f.mime, name = f.name;
  if (format) {
    if (!(format in FORMAT_FILES)) throw new ApiError('invalid', 'Unknown format.');
    const stored = await ctx.repo.getFormat(f.id, f.version, format);
    if (stored?.state !== 'ready' || !stored.outputKey) throw new ApiError('not-found', 'That format hasn\'t been generated yet.');
    const out = FORMAT_FILES[format as keyof typeof FORMAT_FILES];
    key = stored.outputKey; mime = out.mime; name = `${f.name.replace(/\.[^.]+$/, '')}.${out.ext}`;
  }

  const range = request.headers.get('range');
  const object = await bucket.get(key, range ? { range: request.headers } : undefined);
  if (!object) throw new ApiError('not-found', 'The file\'s contents are missing from storage.');
  const headers = new Headers({
    'content-type': mime,
    'x-content-type-options': 'nosniff',
    // Uploaded content never runs as this origin's page (HTML, SVG, and so on).
    'content-security-policy': "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'; media-src 'self'",
    'cache-control': 'private, max-age=300',
    'accept-ranges': 'bytes',
    'content-disposition': `${f.kind === 'other' && !format ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`,
  });
  const body = 'body' in object ? object.body : null;
  if (range && object.range && 'offset' in object.range) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? object.size - offset;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
    return new Response(body, { status: 206, headers });
  }
  headers.set('content-length', String(object.size));
  return new Response(body, { status: 200, headers });
};

const pageImage: FileHandler = async (_request, ctx, _bucket, { fileId, page: rawPage }) => {
  const f = await ctx.repo.getFile(fileId);
  if (!f) throw new ApiError('not-found', 'File not found.');
  await canReadFile(ctx, f);
  if (user(ctx).role === 'student') throw new ApiError('forbidden', 'Staff only.');
  const page = Number(rawPage);
  if (!Number.isInteger(page) || page < 1 || f.kind !== 'pdf') throw new ApiError('invalid', 'A PDF page number is required.');
  if (!ctx.documents) throw new ApiError('unsupported', 'Page images are unavailable in demo mode.');
  const png = await ctx.documents.pageImage(f, page);
  return new Response(png, { headers: { 'content-type': 'image/png', 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=300' } });
};

export const FILE_ROUTES: { route: Route; handle: FileHandler }[] = [
  { route: { method: 'POST', path: '/courses/:courseId/files/upload', access: 'signed-in', scope: 'content:write' }, handle: upload },
  { route: { method: 'GET', path: '/files/:fileId/content', access: 'signed-in', scope: 'content:read' }, handle: content },
  { route: { method: 'GET', path: '/files/:fileId/pages/:page', access: 'signed-in', scope: 'content:read' }, handle: pageImage },
];

export function findFileRoute(method: string, relPath: string): { route: Route; handle: FileHandler; params: Record<string, string> } | null {
  for (const r of FILE_ROUTES) {
    if (r.route.method !== method) continue;
    const params = matchPath(r.route.path, relPath);
    if (params) return { ...r, params };
  }
  return null;
}

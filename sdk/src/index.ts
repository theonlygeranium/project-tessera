import { API_PREFIX, ApiError, ROUTES, fillPath, type ApiErrorBody, type ApiErrorCode, type Input, type Operation, type Output, type Page, type PageInput } from '../../shared/api';
import type { AccessibleFormat, FileRecord } from '../../shared/domain';

export interface ClientOptions { baseUrl: string; token: string; fetch?: typeof fetch; userAgent?: string }
export interface CallOptions { idempotencyKey?: string; signal?: AbortSignal }

// Keep this type in step with the browserOnly flags in ROUTES. The runtime also filters flags.
type BrowserOnlyOperation = 'signIn' | 'signOut' | 'listDemoUsers' | 'resetDemo' | 'viewAs';
export type TesseraClient = {
  [K in Exclude<Operation, BrowserOnlyOperation>]: Input<K> extends void
    ? (options?: CallOptions) => Promise<Output<K>>
    : (input: Input<K>, options?: CallOptions) => Promise<Output<K>>;
} & {
  uploadFile(courseId: string, file: Blob, name: string, options?: CallOptions): Promise<FileRecord>;
  fileUrl(fileId: string, format?: AccessibleFormat): string;
};

export class TesseraError extends ApiError {
  constructor(code: ApiErrorCode, message: string, details: unknown, private readonly httpStatus: number, public readonly requestId: string | null) {
    super(code, message, details);
    this.name = 'TesseraError';
  }
  override get status() { return this.httpStatus; }
}

/** A source client for scripts and server-side applications. */
export function createClient({ baseUrl, token, fetch: fetchImpl = fetch, userAgent }: ClientOptions): TesseraClient {
  const parsedBase = new URL(baseUrl);
  if (parsedBase.protocol !== 'http:' && parsedBase.protocol !== 'https:') throw new TypeError('baseUrl must be an absolute HTTP URL.');
  const origin = parsedBase.origin;
  const urlFor = (path: string) => `${origin}${API_PREFIX}${path}`;
  async function send(url: string, method: string, body?: BodyInit, options: CallOptions = {}, contentType?: string): Promise<unknown> {
    const headers = new Headers({ accept: 'application/json', authorization: `Bearer ${token}` });
    if (contentType) headers.set('content-type', contentType);
    if (userAgent) headers.set('user-agent', userAgent);
    if (method === 'POST' && options.idempotencyKey) headers.set('idempotency-key', options.idempotencyKey);
    const init: RequestInit = { method, headers, body, signal: options.signal };
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetchImpl(url, init);
      if (response.status === 429 && attempt === 0) {
        if (options.signal?.aborted) throw options.signal.reason;
        const seconds = Number(response.headers.get('retry-after'));
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => { clearTimeout(timer); reject(options.signal?.reason); };
          const timer = setTimeout(() => { options.signal?.removeEventListener('abort', onAbort); resolve(); }, Math.min(10, Math.max(0, Number.isFinite(seconds) ? seconds : 0)) * 1000);
          options.signal?.addEventListener('abort', onAbort, { once: true });
        });
        continue;
      }
      const raw = await response.text();
      let result: unknown = null;
      try { result = raw ? JSON.parse(raw) : null; } catch { /* A non-JSON failure still maps to TesseraError. */ }
      if (!response.ok) {
        const error = (result as ApiErrorBody | null)?.error;
        throw new TesseraError(error?.code ?? (response.status === 401 ? 'unauthenticated' : response.status === 429 ? 'rate-limited' : 'ai-failed'), error?.message ?? `Request failed (${response.status})`, error?.details, response.status, response.headers.get('x-request-id'));
      }
      return result;
    }
    throw new Error('Unreachable retry state');
  }

  const methods: Record<string, unknown> = {};
  for (const op of Object.keys(ROUTES) as Operation[]) {
    const route = ROUTES[op];
    if (route.browserOnly) continue;
    methods[op] = (input?: Record<string, unknown> | CallOptions, options?: CallOptions) => {
      const noInput = op === 'getSession' || op === 'getOverview' || op === 'whoAmI' || op === 'listCourses' || op === 'listApiTokens' || op === 'getToday' || op === 'getInstitutionAccess' || op === 'exportInstitutionAccess' || op === 'listPresets' || op === 'suggestPreset' || op === 'listAdaptations';
      const actualInput = noInput ? {} : (input ?? {}) as Record<string, unknown>;
      const actualOptions = noInput ? (input as CallOptions | undefined) : options;
      const { path, rest } = fillPath(route.path, actualInput);
      let url = urlFor(path);
      if (route.method === 'GET' || route.method === 'DELETE') {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(rest)) if (value !== undefined && value !== null) query.set(key, String(value));
        if (query.size) url += `?${query}`;
        return send(url, route.method, undefined, actualOptions);
      }
      return send(url, route.method, JSON.stringify(rest), actualOptions, 'application/json');
    };
  }
  methods.uploadFile = (courseId: string, file: Blob, name: string, options?: CallOptions) => {
    const form = new FormData();
    form.append('file', file, name);
    return send(urlFor(`/courses/${encodeURIComponent(courseId)}/files/upload`), 'POST', form, options) as Promise<FileRecord>;
  };
  methods.fileUrl = (fileId: string, format?: AccessibleFormat) => {
    const url = urlFor(`/files/${encodeURIComponent(fileId)}/content`);
    return format ? `${url}?format=${encodeURIComponent(format)}` : url;
  };
  return methods as TesseraClient;
}

/** Yields every item from a cursor-paginated operation. */
export async function* paginate<T, I extends PageInput>(fn: (input: I) => Promise<Page<T>>, input: I): AsyncGenerator<T> {
  let cursor = input.cursor;
  const seen = new Set<string>();
  do {
    const page = await fn({ ...input, cursor } as I);
    yield* page.items;
    cursor = page.nextCursor ?? undefined;
    if (cursor && seen.has(cursor)) throw new Error('Pagination cursor repeated.');
    if (cursor) seen.add(cursor);
  } while (cursor);
}

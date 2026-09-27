// Tessera Worker (D-014): /api/* is the JSON API, /app/* is the React app,
// and every other path is a static asset.
import { createAiClient } from './ai';
import { verifyAccessJwt } from './access';
import { D1Repo } from './d1-repo';
import type { Env } from './env';
import { ApiError, ROUTES, matchPath, type Operation, type SessionInfo } from '../shared/api';
import type { Repo } from '../shared/repo';
import { seedData } from '../shared/seed';
import { dispatch, service, type ServiceContext } from '../shared/service';

const SESSION_COOKIE = 'tessera_user';
/** 30 days. */
const SESSION_MAX_AGE = 2592000;

// One seed check per database object. An isolate has a single D1 binding;
// keying by that object also lets tests use a fresh database each time.
const seeding = new WeakMap<object, Promise<void>>();

function ensureSeeded(db: D1Database, repo: Repo): Promise<void> {
  const existing = seeding.get(db);
  if (existing) return existing;
  const promise = (async () => {
    if (await repo.isEmpty()) await repo.reset(seedData());
  })().catch((error: unknown) => {
    seeding.delete(db);
    throw error;
  });
  seeding.set(db, promise);
  return promise;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return handleApi(request, env);
    if (url.pathname === '/app' || url.pathname.startsWith('/app/')) return handleApp(request, env);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, env: Env): Promise<Response> {
  try {
    if (env.ENVIRONMENT !== 'local') {
      const access = await verifyAccessJwt(request, env);
      if (!access) return fail(401, 'unauthenticated', 'Missing or invalid Cloudflare Access token.');
    }

    const repo = new D1Repo(env.DB);
    await ensureSeeded(env.DB, repo);

    const url = new URL(request.url);
    const found = findRoute(request.method, url.pathname);
    if (!found) return fail(404, 'not-found', `No route matches ${request.method} ${url.pathname}.`);

    const input = await readInput(request, found.params);
    const userId = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
    const user = userId ? await repo.getUser(userId) : null;
    const ctx: ServiceContext = {
      repo,
      ai: createAiClient(env),
      user,
      now: () => new Date().toISOString(),
      newId: (prefix) => prefix + '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    };
    const output = await dispatch(service, ctx, found.op, input as never);

    const headers = new Headers();
    if (found.op === 'signIn') {
      const signedIn = (output as SessionInfo).user;
      if (signedIn) headers.set('set-cookie', sessionCookie(signedIn.id, env));
    } else if (found.op === 'signOut') {
      headers.set('set-cookie', clearSessionCookie(env));
    }
    return json(output, 200, headers);
  } catch (error) {
    if (error instanceof ApiError) return fail(error.status, error.code, error.message, error.details);
    console.error(error);
    return fail(500, 'internal', 'Something went wrong.');
  }
}

async function handleApp(request: Request, env: Env): Promise<Response> {
  const asset = await env.ASSETS.fetch(request);
  const accept = request.headers.get('accept') ?? '';
  if (asset.status !== 404 || request.method !== 'GET' || !accept.toLowerCase().includes('text/html')) return asset;
  const index = await env.ASSETS.fetch(new Request(new URL('/app/index.html', request.url), request));
  return new Response(index.body, { status: 200, headers: new Headers(index.headers) });
}

function findRoute(method: string, pathname: string): { op: Operation; params: Record<string, string> } | null {
  for (const op of Object.keys(ROUTES) as Operation[]) {
    const route = ROUTES[op];
    if (route.method !== method) continue;
    const params = matchPath(route.path, pathname);
    if (params) return { op, params };
  }
  return null;
}

async function readInput(request: Request, params: Record<string, string>): Promise<Record<string, unknown>> {
  if (request.method === 'GET' || request.method === 'DELETE') {
    const query: Record<string, string> = {};
    new URL(request.url).searchParams.forEach((value, key) => {
      query[key] = value;
    });
    return { ...query, ...params };
  }
  const text = await request.text();
  if (text.trim() === '') return { ...params };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError('invalid', 'Request body is not valid JSON.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError('invalid', 'Request body must be a JSON object.');
  }
  return { ...(parsed as Record<string, unknown>), ...params };
}

function json(body: unknown, status: number, headers = new Headers()): Response {
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}

function fail(status: number, code: string, message: string, details?: unknown): Response {
  const error: { code: string; message: string; details?: unknown } = { code, message };
  if (details !== undefined) error.details = details;
  return json({ error }, status);
}

function sessionCookie(userId: string, env: Env): string {
  return cookie(`${SESSION_COOKIE}=${userId}`, SESSION_MAX_AGE, env);
}

function clearSessionCookie(env: Env): string {
  return cookie(`${SESSION_COOKIE}=`, 0, env);
}

function cookie(pair: string, maxAge: number, env: Env): string {
  const parts = [pair, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (env.ENVIRONMENT !== 'local') parts.push('Secure');
  return parts.join('; ');
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

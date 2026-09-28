import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../shared/api';
import { seedData } from '../shared/seed';
import { service, type Service } from '../shared/service';
import { clearAccessKeyCache } from './access';
import { D1Repo } from './d1-repo';
import worker from './index';
import { createTestDb } from './test/d1-shim';
import { createTestKey, signJwt } from './test/jwt';

const DOMAIN = 'team.test.cloudflareaccess.com';
const AUD = 'aud-test';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearAccessKeyCache();
});

function assetsFor() {
  const calls: string[] = [];
  const fetcher = {
    async fetch(input: RequestInfo | URL) {
      const request = input instanceof Request ? input : new Request(input);
      const url = new URL(request.url);
      calls.push(url.pathname);
      // Like Cloudflare's assets with html_handling "auto-trailing-slash": the
      // directory URL serves index.html, and /app/index.html redirects with no body.
      if (url.pathname === '/app/') {
        return new Response('<html>app</html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      if (url.pathname === '/app/index.html') return new Response(null, { status: 307, headers: { location: '/app/' } });
      if (url.pathname === '/app/assets/app.js') {
        return new Response('js', { status: 200, headers: { 'content-type': 'text/javascript' } });
      }
      if (url.pathname === '/prototype/' || url.pathname === '/prototype/index.html') {
        return new Response('prototype', { status: 200, headers: { 'content-type': 'text/html' } });
      }
      return new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } });
    },
  };
  return { fetcher, calls };
}

function testEnv(db: object, fetcher: { fetch: (input: RequestInfo | URL) => Promise<Response> }, environment: 'local' | 'preview' | 'production' = 'local') {
  return {
    DB: db,
    ASSETS: fetcher,
    ENVIRONMENT: environment,
    ACCESS_TEAM_DOMAIN: DOMAIN,
    ACCESS_AUD: AUD,
    OWNER_EMAILS: 'jeff@jgeronimo.com',
  };
}

function call(env: ReturnType<typeof testEnv>, path: string, init: RequestInit = {}) {
  return worker.fetch(new Request(`http://localhost${path}`, init), env as never, {} as never);
}

// Service handlers are still stubs, so tests that need a success install a stand-in.
// The stand-in only echoes the context the router built.
async function withHandlers(patch: Partial<Service>, run: () => Promise<void>) {
  const saved = new Map<keyof Service, Service[keyof Service]>();
  for (const key of Object.keys(patch) as (keyof Service)[]) {
    saved.set(key, service[key]);
    service[key] = patch[key] as Service[typeof key];
  }
  try {
    await run();
  } finally {
    for (const [key, handler] of saved) service[key] = handler;
  }
}

describe('worker fetch', () => {
  it('returns JSON 404 for an unknown API route', async () => {
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    const response = await call(env, '/api/v1/nope');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ error: { code: 'not-found', message: 'No route matches GET /api/v1/nope.' } });
  });

  it('GET /api/session with no cookie returns the seeded institution and no user', async () => {
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    await withHandlers({
      getSession: async (ctx) => ({ user: ctx.user, institution: await ctx.repo.getInstitution() }),
    }, async () => {
      const response = await call(env, '/api/v1/session');
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ user: null, institution: seedData().institution });
    });
  });

  it('POST /api/session sets the persona cookie', async () => {
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    await withHandlers({
      signIn: async (ctx, input) => {
        const user = await ctx.repo.getUser(input.userId);
        if (!user) throw new ApiError('not-found', 'No such person.');
        return { user, institution: await ctx.repo.getInstitution() };
      },
    }, async () => {
      const response = await call(env, '/api/v1/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 'u-admin' }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.getSetCookie()).toEqual([
        'tessera_user=u-admin; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000',
      ]);
    });
  });

  it('returns a service ApiError as its status and JSON', async () => {
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    const response = await call(env, '/api/v1/session', { method: 'POST', body: JSON.stringify({ userId: 'u-missing' }) });
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('not-found');
  });

  it('reads the persona cookie before dispatch checks the role', async () => {
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    const student = await call(env, '/api/v1/overview', { headers: { cookie: 'tessera_user=u-priya' } });
    expect(student.status).toBe(403);
    expect(await student.json()).toEqual({ error: { code: 'forbidden', message: 'Your role can\'t do this.' } });

    const stranger = await call(env, '/api/v1/overview');
    expect(stranger.status).toBe(401);
    expect(await stranger.json()).toEqual({ error: { code: 'unauthenticated', message: 'Sign in first.' } });

    const unknown = await call(env, '/api/v1/overview', { headers: { cookie: 'tessera_user=u-missing' } });
    expect(unknown.status).toBe(401);

    const admin = await call(env, '/api/v1/overview', { headers: { cookie: 'theme=light; tessera_user=u-admin' } });
    expect(admin.status).toBe(200);
    expect(((await admin.json()) as { people: Record<string, number> }).people.student).toBe(4);
  });

  it('passes query and path fields to the handler and keeps ApiError details', async () => {
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    let seen: unknown;
    await withHandlers({
      listUsers: async (_ctx, input) => {
        seen = input;
        return [];
      },
    }, async () => {
      const response = await call(env, '/api/v1/users?role=student', { headers: { cookie: 'tessera_user=u-admin' } });
      expect(response.status).toBe(200);
      expect(seen).toEqual({ role: 'student' });
    });
    await withHandlers({
      updateUser: async (_ctx, input) => {
        seen = input;
        throw new ApiError('invalid', 'Bad', { name: 'required' });
      },
    }, async () => {
      const response = await call(env, '/api/v1/users/u-priya', {
        method: 'PATCH',
        headers: { cookie: 'tessera_user=u-admin', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Priya N.' }),
      });
      expect(response.status).toBe(400);
      expect(seen).toEqual({ userId: 'u-priya', name: 'Priya N.' });
      expect(await response.json()).toEqual({ error: { code: 'invalid', message: 'Bad', details: { name: 'required' } } });
    });
  });

  it.each([
    ['not-json', 'Request body is not valid JSON.'],
    ['[1]', 'Request body must be a JSON object.'],
    ['null', 'Request body must be a JSON object.'],
    ['"hi"', 'Request body must be a JSON object.'],
  ])('rejects a non-object body %j', async (body, message) => {
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    const response = await call(env, '/api/v1/session', { method: 'POST', body });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'invalid', message } });
  });

  it('hides unexpected errors and logs the real one', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    await withHandlers({
      getSession: async () => {
        throw new Error('database exploded');
      },
    }, async () => {
      const response = await call(env, '/api/v1/session');
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: { code: 'internal', message: 'Something went wrong.' } });
    });
    expect(spy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: 'database exploded' }));
    spy.mockRestore();
  });

  it('clears the persona cookie on sign-out', async () => {
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    await withHandlers({
      signOut: async () => ({ ok: true }),
    }, async () => {
      const response = await call(env, '/api/v1/session', { method: 'DELETE' });
      expect(response.status).toBe(200);
      expect(response.headers.getSetCookie()).toEqual([
        'tessera_user=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
        'tessera_view_as=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      ]);
    });
  });

  it('does not reset a database that already has data', async () => {
    const db = createTestDb();
    const env = testEnv(db, assetsFor().fetcher);
    await call(env, '/api/v1/demo/users');
    const repo = new D1Repo(db as never);
    const admin = await repo.getUser('u-admin');
    expect(admin).not.toBeNull();
    await repo.putUser({ ...admin!, name: 'Renamed' });
    await call(env, '/api/v1/demo/users');
    expect((await repo.getUser('u-admin'))?.name).toBe('Renamed');
  });

  it('falls back to the app entry (/app/) for an HTML app route, with a body', async () => {
    const { fetcher, calls } = assetsFor();
    const env = testEnv(createTestDb(), fetcher);
    const response = await call(env, '/app/courses/x', { headers: { accept: 'text/html,application/xhtml+xml' } });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html>app</html>');
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(calls).toEqual(['/app/courses/x', '/app/']);
  });

  it('does not rewrite an app asset that exists, or a non-HTML miss', async () => {
    const assets = assetsFor();
    const env = testEnv(createTestDb(), assets.fetcher);
    const script = await call(env, '/app/assets/app.js', { headers: { accept: 'text/html' } });
    expect(script.status).toBe(200);
    expect(await script.text()).toBe('js');

    const missed = await call(env, '/app/courses/x', { headers: { accept: '*/*' } });
    expect(missed.status).toBe(404);
    expect(await missed.text()).toBe('missing');
    expect(assets.calls).toEqual(['/app/assets/app.js', '/app/courses/x']);
  });

  it('passes other paths through to the assets', async () => {
    const { fetcher, calls } = assetsFor();
    const env = testEnv(createTestDb(), fetcher);
    const response = await call(env, '/prototype/');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('prototype');
    expect(calls).toEqual(['/prototype/']);
  });

  it('returns 401 in production when the Access token is missing', async () => {
    const env = testEnv(
      { prepare() { throw new Error('db used'); } },
      { fetch() { return Promise.reject(new Error('assets used')); } },
      'production',
    );
    const response = await call(env, '/api/v1/session');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'unauthenticated', message: 'Sign in through Cloudflare Access, or send an API token.' },
    });
  });

  it('adds Secure to the persona cookie outside local dev', async () => {
    const key = await createTestKey('router-key');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ keys: [key.jwk] }), { status: 200 }));
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(key.privateKey, key.kid, {
      aud: AUD, iss: `https://${DOMAIN}`, exp: now + 3600, email: 'jeff@jgeronimo.com',
    });
    const env = testEnv(createTestDb(), assetsFor().fetcher, 'production');
    await withHandlers({
      signIn: async (ctx, input) => ({
        user: await ctx.repo.getUser(input.userId),
        institution: await ctx.repo.getInstitution(),
      }),
    }, async () => {
      const response = await call(env, '/api/v1/session', {
        method: 'POST',
        headers: { 'cf-access-jwt-assertion': token, 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 'u-admin' }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.getSetCookie()).toEqual([
        'tessera_user=u-admin; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure',
      ]);
    });
  });
});

describe('input validation (shared/schema)', () => {
  it('rejects a body that fails the operation schema, with the field path', async () => {
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    const response = await call(env, '/api/v1/users', {
      method: 'POST',
      headers: { cookie: 'tessera_user=u-admin', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New Person', email: 'not-an-email', role: 'student' }),
    });
    expect(response.status).toBe(400);
    const body = await response.json() as { error: { code: string; details: { issues: { path: string }[] } } };
    expect(body.error.code).toBe('invalid');
    expect(body.error.details.issues[0].path).toBe('email');
  });

  it('coerces numeric query fields and rejects ones that do not parse', async () => {
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    let seen: unknown;
    await withHandlers({ listFiles: async (_ctx, input) => { seen = input; return { items: [], nextCursor: null }; } }, async () => {
      const ok = await call(env, '/api/v1/courses/c-stat110/files?limit=5', { headers: { cookie: 'tessera_user=u-admin' } });
      expect(ok.status).toBe(200);
      expect(seen).toEqual({ courseId: 'c-stat110', limit: 5 });
      const bad = await call(env, '/api/v1/courses/c-stat110/files?limit=lots', { headers: { cookie: 'tessera_user=u-admin' } });
      expect(bad.status).toBe(400);
    });
  });

  it('ignores stray query fields on an operation that takes no input', async () => {
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    const response = await call(env, '/api/v1/session?data=mock');
    expect(response.status).toBe(200);
  });
});

describe('API tokens and browser-only routes', () => {
  it('refuses session and demo operations for a token, whatever its scopes', async () => {
    const db = createTestDb();
    const env = testEnv(db, assetsFor().fetcher);
    // Seed through a browser call, then store a token with every scope.
    await call(env, '/api/v1/session');
    const repo = new D1Repo(db as never);
    const { hashSecret } = await import('../shared/tokens');
    await repo.putApiToken({ id: 'tok-all', name: 'all', prefix: 'tsk_all', scopes: ['courses:read', 'courses:write', 'content:read', 'content:write', 'people:read', 'people:write', 'access:read', 'access:write', 'grades:read', 'grades:write', 'ai:run'], ownerId: 'u-okafor', createdAt: '2026-09-27T00:00:00.000Z', expiresAt: null, lastUsedAt: null, revokedAt: null, hash: await hashSecret('tsk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') } as never);
    const auth = { authorization: 'Bearer tsk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
    expect((await call(env, '/api/v1/demo/users', { headers: auth })).status).toBe(403);
    expect((await call(env, '/api/v1/session', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'u-admin' }) })).status).toBe(403);
    expect((await call(env, '/api/v1/courses', { headers: auth })).status).toBe(200);
  });
});

describe('file routes', () => {
  async function fileEnv() {
    const { createTestBucket } = await import('./test/r2-shim');
    const FILES = createTestBucket();
    return { env: { ...testEnv(createTestDb(), assetsFor().fetcher), FILES }, FILES };
  }
  function upload(env: object, as: string, name: string, bytes: Uint8Array | string, courseId = 'c-stat110') {
    const form = new FormData();
    form.append('file', new File([bytes], name));
    return call(env as never, `/api/v1/courses/${courseId}/files/upload`, { method: 'POST', headers: { cookie: `tessera_user=${as}` }, body: form });
  }

  it('uploads to R2, records version 1, and serves the bytes back with safe headers', async () => {
    const { env, FILES } = await fileEnv();
    const res = await upload(env, 'u-okafor', 'Syllabus.pdf', '%PDF-1.7 test');
    expect(res.status).toBe(201);
    const record = await res.json() as { id: string; key: string; kind: string; version: number; mime: string };
    expect(record).toMatchObject({ kind: 'pdf', version: 1, mime: 'application/pdf' });
    expect(FILES.store.has(record.key)).toBe(true);
    const got = await call(env as never, `/api/v1/files/${record.id}/content`, { headers: { cookie: 'tessera_user=u-priya' } });
    expect(got.status).toBe(200);
    expect(await got.text()).toBe('%PDF-1.7 test');
    expect(got.headers.get('content-security-policy')).toContain('sandbox');
    expect(got.headers.get('x-content-type-options')).toBe('nosniff');
    const part = await call(env as never, `/api/v1/files/${record.id}/content`, { headers: { cookie: 'tessera_user=u-okafor', range: 'bytes=0-3' } });
    expect(part.status).toBe(206);
    expect(await part.text()).toBe('%PDF');
    expect(part.headers.get('content-range')).toBe('bytes 0-3/13');
  });

  it("never lets one student read another student's upload", async () => {
    const { env } = await fileEnv();
    const mine = await (await upload(env, 'u-priya', 'essay.docx', 'essay')).json() as { id: string };
    expect((await call(env as never, `/api/v1/files/${mine.id}/content`, { headers: { cookie: 'tessera_user=u-priya' } })).status).toBe(200);
    expect((await call(env as never, `/api/v1/files/${mine.id}/content`, { headers: { cookie: 'tessera_user=u-marcus' } })).status).toBe(404);
    expect((await call(env as never, `/api/v1/files/${mine.id}/content`, { headers: { cookie: 'tessera_user=u-okafor' } })).status).toBe(200);
  });

  it('refuses uploads to a course the person cannot reach, and files over 25 MB', async () => {
    const { env } = await fileEnv();
    expect((await upload(env, 'u-okafor', 'x.pdf', 'x', 'c-comm120')).status).toBe(403);
    const big = await upload(env, 'u-okafor', 'big.pdf', new Uint8Array(25 * 1024 * 1024 + 1));
    expect(big.status).toBe(413);
  });
});

describe('format downloads', () => {
  it('serves a generated reading version with ?format=', async () => {
    const { createTestBucket } = await import('./test/r2-shim');
    const JSZip = (await import('jszip')).default;
    const FILES = createTestBucket();
    const env = { ...testEnv(createTestDb(), assetsFor().fetcher), FILES };
    const z = new JSZip();
    z.file('word/document.xml', '<w:document xmlns:w="x"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Week one</w:t></w:r></w:p><w:p><w:r><w:t>Hello.</w:t></w:r></w:p></w:body></w:document>');
    const form = new FormData();
    form.append('file', new File([await z.generateAsync({ type: 'uint8array' })], 'notes.docx'));
    const cookie = { cookie: 'tessera_user=u-okafor' };
    const record = await (await call(env as never, '/api/v1/courses/c-stat110/files/upload', { method: 'POST', headers: cookie, body: form })).json() as { id: string };
    const status = await (await call(env as never, `/api/v1/files/${record.id}/formats`, { method: 'POST', headers: { ...cookie, 'content-type': 'application/json' }, body: JSON.stringify({ format: 'reading' }) })).json() as { state: string };
    expect(status.state).toBe('ready');
    const page = await call(env as never, `/api/v1/files/${record.id}/content?format=reading`, { headers: cookie });
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('<h2>Week one</h2>');
  });
});

describe('journey 6: API', () => {
  it('an administrator creates a token, a script imports a course, the course appears, and a revoked token gets 401', async () => {
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    const admin = { cookie: 'tessera_user=u-admin', 'content-type': 'application/json' };
    // 1. The administrator creates a token in the app (browser session).
    const created = await (await call(env, '/api/v1/tokens', { method: 'POST', headers: admin, body: JSON.stringify({ name: 'Catalog sync', scopes: ['courses:read', 'courses:write'], expiresInDays: 30 }) })).json() as { token: { id: string; scopes: string[] }; secret: string };
    expect(created.secret).toMatch(/^tsk_/);
    const script = { authorization: `Bearer ${created.secret}`, 'content-type': 'application/json' };
    // 2. A script imports a course with two modules and a lesson with blocks.
    const outline = await call(env, '/api/v1/courses/import', { method: 'POST', headers: { ...script, 'idempotency-key': 'import-1' }, body: JSON.stringify({
      course: { code: 'BIO 105', title: 'Cells and systems', term: 'Spring' },
      modules: [
        { title: 'Cells', lessons: [{ title: 'What a cell does', minutes: 15, blocks: [{ type: 'heading', level: 2, text: 'Cells' }, { type: 'text', text: 'Every living thing is made of cells.' }] }] },
        { title: 'Systems', lessons: [{ title: 'Organs working together', blocks: [] }] },
      ],
    }) });
    expect(outline.status).toBe(200);
    const body = await outline.json() as { course: { id: string; title: string }; modules: { lessons: unknown[] }[] };
    expect(body.modules.map((m) => m.lessons.length)).toEqual([1, 1]);
    // A retried request with the same key replays the first response instead of importing twice.
    const replay = await call(env, '/api/v1/courses/import', { method: 'POST', headers: { ...script, 'idempotency-key': 'import-1' }, body: '{}' });
    expect(replay.headers.get('idempotency-replayed')).toBe('true');
    // 3. The course appears in the app for the administrator.
    const courses = await (await call(env, '/api/v1/courses', { headers: admin })).json() as { id: string; title: string }[];
    expect(courses.filter((c) => c.title === 'Cells and systems')).toHaveLength(1);
    // 4. The token is revoked; the script now gets 401.
    expect((await call(env, `/api/v1/tokens/${created.token.id}`, { method: 'DELETE', headers: admin })).status).toBe(200);
    expect((await call(env, '/api/v1/courses', { headers: script })).status).toBe(401);
  });
});

describe('review 4', () => {
  it('replays a retried upload with the same Idempotency-Key instead of storing a second file', async () => {
    const { createTestBucket } = await import('./test/r2-shim');
    const FILES = createTestBucket();
    const env = { ...testEnv(createTestDb(), assetsFor().fetcher), FILES };
    const send = () => { const form = new FormData(); form.append('file', new File(['%PDF-1.7 x'], 'a.pdf')); return call(env as never, '/api/v1/courses/c-stat110/files/upload', { method: 'POST', headers: { cookie: 'tessera_user=u-okafor', 'idempotency-key': 'up-1' }, body: form }); };
    const first = await send(); const second = await send();
    expect(first.status).toBe(201);
    expect(second.headers.get('idempotency-replayed')).toBe('true');
    expect((await second.json() as { id: string }).id).toBe((await first.json() as { id: string }).id);
    expect(FILES.store.size).toBe(1);
  });
});

describe('wrangler routing', () => {
  it('runs the Worker first for every path it handles (/api, /app, /mcp)', async () => {
    const { readFileSync } = await import('node:fs');
    const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    const list = /"run_worker_first":\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';
    for (const path of ['"/api/*"', '"/app/*"', '"/mcp"']) expect(list).toContain(path);
  });
});

describe('persona picker outside local (Codex review 5)', () => {
  let key: Awaited<ReturnType<typeof createTestKey>> | null = null;
  async function jwtFor(email: string) {
    key ??= await createTestKey('owner-key');
    const k = key;
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ keys: [k.jwk] }), { status: 200 }));
    const now = Math.floor(Date.now() / 1000);
    return signJwt(k.privateKey, k.kid, { aud: AUD, iss: `https://${DOMAIN}`, exp: now + 3600, email });
  }
  it('lets an owner use a persona but not an unknown Access identity', async () => {
    const env = testEnv(createTestDb(), assetsFor().fetcher, 'production');
    const owner = await jwtFor('jeff@jgeronimo.com');
    const asOwner = await (await call(env, '/api/v1/session', { headers: { 'cf-access-jwt-assertion': owner, cookie: 'tessera_user=u-admin' } })).json() as { user: { id: string } | null };
    expect(asOwner.user?.id).toBe('u-admin');
    const stranger = await jwtFor('someone@example.org');
    const asStranger = await (await call(env, '/api/v1/session', { headers: { 'cf-access-jwt-assertion': stranger, cookie: 'tessera_user=u-admin' } })).json() as { user: { id: string } | null };
    expect(asStranger.user).toBeNull();
    expect((await call(env, '/api/v1/users', { headers: { 'cf-access-jwt-assertion': stranger, cookie: 'tessera_user=u-admin' } })).status).toBe(401);
  });
});

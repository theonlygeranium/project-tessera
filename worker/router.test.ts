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
      if (url.pathname === '/app/index.html') {
        return new Response('<html>app</html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
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
    const response = await call(env, '/api/nope');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ error: { code: 'not-found', message: 'No route matches GET /api/nope.' } });
  });

  it('GET /api/session with no cookie returns the seeded institution and no user', async () => {
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    await withHandlers({
      getSession: async (ctx) => ({ user: ctx.user, institution: await ctx.repo.getInstitution() }),
    }, async () => {
      const response = await call(env, '/api/session');
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
      const response = await call(env, '/api/session', {
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
    const response = await call(env, '/api/session', { method: 'POST', body: JSON.stringify({ userId: 'u-missing' }) });
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('not-found');
  });

  it('reads the persona cookie before dispatch checks the role', async () => {
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    const student = await call(env, '/api/overview', { headers: { cookie: 'tessera_user=u-priya' } });
    expect(student.status).toBe(403);
    expect(await student.json()).toEqual({ error: { code: 'forbidden', message: 'Your role can\'t do this.' } });

    const stranger = await call(env, '/api/overview');
    expect(stranger.status).toBe(401);
    expect(await stranger.json()).toEqual({ error: { code: 'unauthenticated', message: 'Sign in first.' } });

    const unknown = await call(env, '/api/overview', { headers: { cookie: 'tessera_user=u-missing' } });
    expect(unknown.status).toBe(401);

    const admin = await call(env, '/api/overview', { headers: { cookie: 'theme=light; tessera_user=u-admin' } });
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
      const response = await call(env, '/api/users?role=student', { headers: { cookie: 'tessera_user=u-admin' } });
      expect(response.status).toBe(200);
      expect(seen).toEqual({ role: 'student' });
    });
    await withHandlers({
      updateUser: async (_ctx, input) => {
        seen = input;
        throw new ApiError('invalid', 'Bad', { name: 'required' });
      },
    }, async () => {
      const response = await call(env, '/api/users/u-priya', {
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
    const response = await call(env, '/api/session', { method: 'POST', body });
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
      const response = await call(env, '/api/session');
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: { code: 'internal', message: 'Something went wrong.' } });
    });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ message: 'database exploded' }));
    spy.mockRestore();
  });

  it('clears the persona cookie on sign-out', async () => {
    const env = testEnv(createTestDb(), assetsFor().fetcher);
    await withHandlers({
      signOut: async () => ({ ok: true }),
    }, async () => {
      const response = await call(env, '/api/session', { method: 'DELETE' });
      expect(response.status).toBe(200);
      expect(response.headers.getSetCookie()).toEqual([
        'tessera_user=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      ]);
    });
  });

  it('does not reset a database that already has data', async () => {
    const db = createTestDb();
    const env = testEnv(db, assetsFor().fetcher);
    await call(env, '/api/demo/users');
    const repo = new D1Repo(db as never);
    const admin = await repo.getUser('u-admin');
    expect(admin).not.toBeNull();
    await repo.putUser({ ...admin!, name: 'Renamed' });
    await call(env, '/api/demo/users');
    expect((await repo.getUser('u-admin'))?.name).toBe('Renamed');
  });

  it('falls back to /app/index.html for an HTML app route', async () => {
    const { fetcher, calls } = assetsFor();
    const env = testEnv(createTestDb(), fetcher);
    const response = await call(env, '/app/courses/x', { headers: { accept: 'text/html,application/xhtml+xml' } });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html>app</html>');
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(calls).toEqual(['/app/courses/x', '/app/index.html']);
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
    const response = await call(env, '/api/session');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'unauthenticated', message: 'Missing or invalid Cloudflare Access token.' },
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
      const response = await call(env, '/api/session', {
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

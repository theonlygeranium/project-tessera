import { describe, expect, it } from 'vitest';
import worker from './index';
import { createTestDb } from './test/d1-shim';
function env() {
  return {
    DB: createTestDb(),
    ASSETS: {
      fetch: async () => new Response('missing', {
        status: 404
      })
    },
    ENVIRONMENT: 'local',
    ACCESS_TEAM_DOMAIN: 'team.test.cloudflareaccess.com',
    ACCESS_AUD: 'aud-test',
    OWNER_EMAILS: 'jeff@jgeronimo.com'
  };
}
const call = (environment: ReturnType<typeof env>, path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(`http://localhost${path}`, init), environment as never, {} as never);
const cookie = (id: string) => ({
  cookie: `tessera_user=${id}`
});
const json = (value: unknown) => ({
  method: 'POST',
  headers: {
    ...cookie('u-okafor'),
    'content-type': 'application/json'
  },
  body: JSON.stringify(value)
});
describe('gradebook routes', () => {
  it('enforces course reach and role matrix', async () => {
    const e = env();
    const path = '/api/v1/courses/stat110-04/gradebook';
    expect((await call(e, path, {
      headers: cookie('u-okafor')
    })).status).toBe(200);
    expect((await call(e, path, {
      headers: cookie('u-admin')
    })).status).toBe(200);
    expect((await call(e, path, {
      headers: cookie('u-chen')
    })).status).toBe(403);
    expect((await call(e, path, {
      headers: cookie('u-sam')
    })).status).toBe(403);
    expect((await call(e, path, {
      headers: cookie('u-priya')
    })).status).toBe(403);
    const own = await call(e, '/api/v1/courses/stat110-04/grades/me', {
      headers: cookie('u-priya')
    });
    expect(own.status).toBe(200);
    expect(((await own.json()) as {
      trace: {
        studentId: string;
      };
    }).trace.studentId).toBe('u-priya');
    expect((await call(e, '/api/v1/courses/c-ops101/grades/me', {
      headers: cookie('u-priya')
    })).status).toBe(403);
  });
  it('requires grade scopes on read and write tokens', async () => {
    const e = env();
    async function token(scopes: string[]) {
      const r = await call(e, '/api/v1/tokens', {
        method: 'POST',
        headers: {
          ...cookie('u-okafor'),
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Gradebook test',
          scopes
        })
      });
      expect(r.status).toBe(200);
      return ((await r.json()) as {
        secret: string;
      }).secret;
    }
    const narrow = await token(['courses:read']);
    const reader = await token(['grades:read']);
    const writer = await token(['grades:write']);
    const path = '/api/v1/courses/stat110-04/gradebook';
    expect((await call(e, path, {
      headers: {
        authorization: `Bearer ${narrow}`
      }
    })).status).toBe(403);
    expect((await call(e, path, {
      headers: {
        authorization: `Bearer ${reader}`
      }
    })).status).toBe(200);
    expect((await call(e, path, {
      headers: {
        authorization: `Bearer ${writer}`
      }
    })).status).toBe(403);
    const preview = '/api/v1/courses/stat110-04/gradebook/setup/preview';
    const setup = await (await call(e, '/api/v1/courses/stat110-04/gradebook/setup', {
      headers: cookie('u-okafor')
    })).json();
    expect((await call(e, preview, {
      ...json({
        setup
      }),
      headers: {
        authorization: `Bearer ${reader}`,
        'content-type': 'application/json'
      }
    })).status).toBe(200);
    expect((await call(e, preview, {
      ...json({
        setup
      }),
      headers: {
        authorization: `Bearer ${narrow}`,
        'content-type': 'application/json'
      }
    })).status).toBe(403);
    const cells = '/api/v1/courses/stat110-04/gradebook/cells';
    const body = {
      batchId: 'scope-write',
      changes: [{
        assignmentId: 'hw1',
        studentId: 'u-priya',
        op: 'score',
        value: 8,
        reason: 'Correction',
        expectedVersion: 0
      }]
    };
    expect((await call(e, cells, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${reader}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    })).status).toBe(403);
    expect((await call(e, cells, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${writer}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    })).status).toBe(200);
  });
  it('replays a gradebook batch through the service and exposes new operations', async () => {
    const e = env();
    const body = {
      batchId: 'router-gradebook',
      changes: [{
        assignmentId: 'hw1',
        studentId: 'u-priya',
        op: 'score',
        value: 8,
        reason: 'Correction',
        expectedVersion: 0
      }]
    };
    const path = '/api/v1/courses/stat110-04/gradebook/cells';
    const init = {
      method: 'PATCH',
      headers: {
        ...cookie('u-okafor'),
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    };
    const first = await call(e, path, init);
    expect(first.status).toBe(200);
    const second = await call(e, path, init);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect((await call(e, '/api/v1/courses/stat110-04/gradebook/events', {
      headers: cookie('u-okafor')
    })).status).toBe(200);
    expect((await call(e, '/api/v1/courses/stat110-04/gradebook/students/u-priya/trace', {
      headers: cookie('u-okafor')
    })).status).toBe(200);
  });
});

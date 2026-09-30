import { describe, expect, it } from 'vitest';
import worker from '../index';
import { createTestDb } from '../test/d1-shim';

function testEnv() {
  return { DB: createTestDb(), ENVIRONMENT: 'local', ASSETS: { fetch: async () => new Response('missing', { status: 404 }) } };
}
function call(env: ReturnType<typeof testEnv>, path: string, init: RequestInit = {}) {
  return worker.fetch(new Request(`http://localhost${path}`, init), env as never, {} as never);
}
const rpc = (method: string, params: unknown = {}, id = 1) => ({ jsonrpc: '2.0', id, method, params });
function post(env: ReturnType<typeof testEnv>, token: string | null, message: unknown) {
  return call(env, '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(message) });
}
async function token(env: ReturnType<typeof testEnv>, owner: 'u-admin' | 'u-okafor', scopes: string[]) {
  const response = await call(env, '/api/v1/tokens', { method: 'POST', headers: { cookie: `tessera_user=${owner}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'MCP test', scopes }) });
  expect(response.status).toBe(200);
  return (await response.json() as { secret: string }).secret;
}

describe('/mcp', () => {
  it('authenticates with an API token and negotiates both supported versions', async () => {
    const env = testEnv();
    const secret = await token(env, 'u-admin', ['courses:read']);
    for (const version of ['2025-06-18', '2025-03-26', 'unknown']) {
      const response = await post(env, secret, rpc('initialize', { protocolVersion: version }));
      expect(response.status).toBe(200);
      const body = await response.json() as { result: { protocolVersion: string; capabilities: unknown; serverInfo: unknown } };
      expect(body.result.protocolVersion).toBe(version === 'unknown' ? '2025-06-18' : version);
      expect(body.result.capabilities).toEqual({ tools: { listChanged: false } });
      expect(body.result.serverInfo).toEqual({ name: 'tessera', version: '1' });
    }
    expect((await post(env, secret, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
    expect((await post(env, secret, rpc('ping'))).status).toBe(200);
  });

  it('lists exactly the curated tools with object schemas', async () => {
    const env = testEnv();
    const secret = await token(env, 'u-admin', ['courses:read']);
    const body = await (await post(env, secret, rpc('tools/list'))).json() as { result: { tools: { name: string; inputSchema: { type: string } }[] } };
    expect(body.result.tools.map(t => t.name)).toEqual([
      'list_courses', 'get_course_outline', 'import_course', 'create_course', 'create_module', 'create_lesson', 'get_lesson', 'save_blocks',
      'get_course_access', 'get_lesson_access', 'list_files', 'get_file_access', 'generate_at_scope', 'get_generation_job', 'generate_element',
      'list_assignments', 'get_assignment', 'create_assignment', 'list_announcements', 'create_announcement', 'gradebook_get', 'gradebook_explain', 'gradebook_setup_preview',
    ]);
    expect(body.result.tools.every(t => t.inputSchema.type === 'object')).toBe(true);
  });

  it('checks grades:read for every gradebook read tool',async()=>{
    const env=testEnv();const narrow=await token(env,'u-okafor',['courses:read']);const reader=await token(env,'u-okafor',['grades:read']);
    const setup=await (await call(env,'/api/v1/courses/stat110-04/gradebook/setup',{headers:{cookie:'tessera_user=u-okafor'}})).json();
    for(const [name,args] of [['gradebook_get',{courseId:'stat110-04'}],['gradebook_explain',{courseId:'stat110-04',studentId:'u-priya'}],['gradebook_setup_preview',{courseId:'stat110-04',setup}]] as const){
      const denied=await (await post(env,narrow,rpc('tools/call',{name,arguments:args}))).json() as {result:{isError:boolean;content:{text:string}[]}};expect(denied.result.isError).toBe(true);expect(denied.result.content[0].text).toContain('grades:read');
      const allowed=await (await post(env,reader,rpc('tools/call',{name,arguments:args}))).json() as {result:{isError?:boolean;structuredContent:unknown}};expect(allowed.result.isError).not.toBe(true);expect(allowed.result.structuredContent).toBeTruthy();
    }
  });

  it('imports a course, lists it, and reports missing scopes as tool errors', async () => {
    const env = testEnv();
    const secret = await token(env, 'u-admin', ['courses:read', 'courses:write']);
    const imported = await (await post(env, secret, rpc('tools/call', { name: 'import_course', arguments: { course: { code: 'BIO 105', title: 'Cells and systems', term: 'Spring' }, modules: [] } }))).json() as { result: { structuredContent: { course: { id: string; title: string } } } };
    expect(imported.result.structuredContent.course.title).toBe('Cells and systems');
    const listed = await (await post(env, secret, rpc('tools/call', { name: 'list_courses', arguments: {} }))).json() as { result: { structuredContent: { items: { id: string }[] } } };
    expect(listed.result.structuredContent.items.some(c => c.id === imported.result.structuredContent.course.id)).toBe(true);
    const readOnly = await token(env, 'u-admin', ['courses:read']);
    const denied = await (await post(env, readOnly, rpc('tools/call', { name: 'import_course', arguments: { course: { code: 'BIO 106', title: 'Other cells', term: 'Spring' }, modules: [] } }))).json() as { result: { isError: boolean; content: { text: string }[] } };
    expect(denied.result.isError).toBe(true);
    expect(denied.result.content[0].text).toContain('forbidden');
  });

  it('requires a token and never publishes announcements', async () => {
    const env = testEnv();
    const missing = await post(env, null, rpc('ping'));
    expect(missing.status).toBe(401);
    expect(missing.headers.get('www-authenticate')).toBe('Bearer');
    const secret = await token(env, 'u-okafor', ['courses:write']);
    const result = await (await post(env, secret, rpc('tools/call', { name: 'create_announcement', arguments: { courseId: 'c-stat110', title: 'Draft update', body: 'A fictional update.', pinned: false, publish: true } }))).json() as { result: { structuredContent: { status: string; publishedAt: string | null } } };
    expect(result.result.structuredContent.status).toBe('draft');
    expect(result.result.structuredContent.publishedAt).toBeNull();
  });

  it('handles unknown tools, batches, bad JSON, and GET', async () => {
    const env = testEnv();
    const secret = await token(env, 'u-admin', ['courses:read']);
    const unknown = await (await post(env, secret, rpc('tools/call', { name: 'publish_lesson', arguments: {} }))).json() as { error: { code: number } };
    expect(unknown.error.code).toBe(-32602);
    const invalid = await (await post(env, secret, rpc('tools/call', { name: 'get_course_outline', arguments: {} }))).json() as { error: { code: number } };
    expect(invalid.error.code).toBe(-32602);
    const batch = await (await post(env, secret, [rpc('ping', {}, 1), rpc('tools/list', {}, 2)])).json() as { id: number }[];
    expect(batch.map(r => r.id)).toEqual([1, 2]);
    const bad = await call(env, '/mcp', { method: 'POST', headers: { authorization: `Bearer ${secret}` }, body: '{' });
    expect(((await bad.json()) as { error: { code: number } }).error.code).toBe(-32700);
    const get = await call(env, '/mcp');
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
  });
});

describe('/mcp and D-003', () => {
  it('saves an assistant\'s blocks as AI drafts that block publishing until a person keeps them', async () => {
    const env = testEnv();
    const secret = await token(env, 'u-okafor', ['content:read', 'content:write', 'courses:read']);
    const saved = await (await post(env, secret, rpc('tools/call', { name: 'save_blocks', arguments: { lessonId: 'l-stat-3', blocks: [{ type: 'text', text: 'Written by an assistant.' }] } }))).json() as { result: { structuredContent: { blocks: { origin: string; aiState: string | null; provenance: { model: string; task: string } | null }[] } } };
    const block = saved.result.structuredContent.blocks[0];
    expect(block).toMatchObject({ origin: 'ai', aiState: 'draft', provenance: { task: 'agent', model: 'Assistant via MCP (MCP test)' } });
    // The instructor, in the app, can't publish until the draft is kept.
    const publish = await call(env, '/api/v1/lessons/l-stat-3/publish', { method: 'POST', headers: { cookie: 'tessera_user=u-okafor' } });
    expect(publish.status).toBe(409);
  });

  it('returns list results as an object in structuredContent', async () => {
    const env = testEnv();
    const secret = await token(env, 'u-admin', ['courses:read']);
    const body = await (await post(env, secret, rpc('tools/call', { name: 'list_courses', arguments: {} }))).json() as { result: { structuredContent: { items: unknown[] } } };
    expect(Array.isArray(body.result.structuredContent.items)).toBe(true);
  });
});

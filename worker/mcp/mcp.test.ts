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
async function designTool<T>(env: ReturnType<typeof testEnv>, secret: string, name: string, args: object): Promise<T> {
  const body = await (await post(env, secret, rpc('tools/call', { name, arguments: args }))).json() as { result: { isError?: boolean; content: { text: string }[]; structuredContent: T } };
  if (body.result.isError) throw new Error(body.result.content[0]?.text);
  return body.result.structuredContent;
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
      'list_courses', 'get_course_outline', 'import_course', 'create_course', 'create_module', 'create_lesson', 'get_lesson',
      'design_session_create', 'design_session_get', 'design_session_answer', 'design_session_confirm', 'design_session_select', 'design_session_preview', 'design_session_apply', 'design_session_undo', 'save_blocks',
      'get_course_access', 'get_lesson_access', 'list_files', 'get_file_access', 'generate_at_scope', 'get_generation_job', 'generate_element',
      'list_assignments', 'get_assignment', 'create_assignment', 'list_announcements', 'create_announcement',
    ]);
    expect(body.result.tools.every(t => t.inputSchema.type === 'object')).toBe(true);
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
  it('drives the draft-only syllabus session through preview, apply, and undo', async () => {
    const env = testEnv();
    const secret = await token(env, 'u-okafor', ['ai:run', 'content:read', 'content:write']);
    const started = await designTool<{ id: string }>(env, secret, 'design_session_create', { courseId: 'c-stat110', sourceKind: 'syllabus', sample: true, consent: { syllabusOnly: true, rememberProfile: false } });
    let session: { stage: string; extraction: { outcomes: { text: string }[] }; options: { id: string }[] };
    for (let i = 0; i < 3; i++) session = await designTool(env, secret, 'design_session_get', { sessionId: started.id });
    expect(session!.stage).toBe('read');
    await designTool(env, secret, 'design_session_answer', { sessionId: started.id, answers: [], teachingNote: 'Use cases that students can discuss.' });
    await designTool(env, secret, 'design_session_confirm', { sessionId: started.id, outcomes: session!.extraction.outcomes.map((item, index) => ({ code: `O${index + 1}`, text: item.text, originalText: item.text })) });
    session = await designTool(env, secret, 'design_session_get', { sessionId: started.id });
    expect(session.options.length).toBeGreaterThanOrEqual(2);
    await designTool(env, secret, 'design_session_select', { sessionId: started.id, optionIds: [session.options[1].id], overlays: ['bookends'], rationale: 'This structure fits students who need repeated examples.' });
    const plan = await designTool<{ hash: string; modules: unknown[] }>(env, secret, 'design_session_preview', { sessionId: started.id });
    expect(plan.modules.length).toBeGreaterThan(2);
    await designTool(env, secret, 'design_session_apply', { sessionId: started.id, hash: plan.hash });
    let stage = '';
    for (let i = 0; i < 50 && stage !== 'review'; i++) stage = (await designTool<{ stage: string }>(env, secret, 'design_session_get', { sessionId: started.id })).stage;
    expect(stage).toBe('review');
    const undone = await designTool<{ session: { stage: string }; kept: unknown[] }>(env, secret, 'design_session_undo', { sessionId: started.id });
    expect(undone.session.stage).toBe('approaches');
    expect(undone.kept).toEqual([]);
  });
  it('uses the design-session service shape and enforces instructor access and token scopes', async () => {
    const env = testEnv();
    const readOnly = await token(env, 'u-okafor', ['content:read']);
    const args = { courseId: 'c-stat110', sourceKind: 'syllabus', sample: true, consent: { syllabusOnly: true, rememberProfile: false } };
    const denied = await (await post(env, readOnly, rpc('tools/call', { name: 'design_session_create', arguments: args }))).json() as { result: { isError: boolean; content: { text: string }[] } };
    expect(denied.result.isError).toBe(true);
    expect(denied.result.content[0].text).toContain('forbidden');
    const instructor = await token(env, 'u-okafor', ['ai:run', 'content:read', 'content:write']);
    const created = await (await post(env, instructor, rpc('tools/call', { name: 'design_session_create', arguments: args }))).json() as { result: { structuredContent: { id: string; stage: string } } };
    expect(created.result.structuredContent.stage).toBe('start');
    const sessionId = created.result.structuredContent.id;
    const read = await (await post(env, instructor, rpc('tools/call', { name: 'design_session_get', arguments: { sessionId } }))).json() as { result: { structuredContent: { id: string } } };
    expect(read.result.structuredContent.id).toBe(sessionId);
    const admin = await token(env, 'u-admin', ['content:read']);
    const other = await (await post(env, admin, rpc('tools/call', { name: 'design_session_get', arguments: { sessionId } }))).json() as { result: { isError: boolean } };
    expect(other.result.isError).toBe(true);
  });
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

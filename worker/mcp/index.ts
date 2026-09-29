// Stateless Streamable HTTP MCP endpoint. Every tool delegates to the same
// service operation, role check, scope check, and token rate limiter as /api/v1.
import { z } from 'zod';
import { ApiError, ROUTES, type Operation, type Route } from '../../shared/api';
import type { Repo } from '../../shared/repo';
import { dispatch, service, type ServiceContext } from '../../shared/service';
import { OPERATIONS, validateInput } from '../../shared/schema';
import { bearerToken, resolvePrincipal, type Principal, type RateLimiter } from '../api/auth';
import { D1Repo } from '../d1-repo';
import type { Env } from '../env';

type Tool = { name: string; operation: Operation; description: string; readOnly: boolean };
const TOOLS: Tool[] = [
  { name: 'list_courses', operation: 'listCourses', description: 'List courses visible to the token owner.', readOnly: true },
  { name: 'get_course_outline', operation: 'getCourseOutline', description: 'Read a course and its module and lesson outline.', readOnly: true },
  { name: 'import_course', operation: 'importCourse', description: 'Import a course outline and draft lesson content for a person to review.', readOnly: false },
  { name: 'create_course', operation: 'createCourse', description: 'Create a course for a person to develop.', readOnly: false },
  { name: 'create_module', operation: 'createModule', description: 'Add a module to a course.', readOnly: false },
  { name: 'create_lesson', operation: 'createLesson', description: 'Add an unpublished lesson to a module.', readOnly: false },
  { name: 'get_lesson', operation: 'getLesson', description: 'Read a lesson and its blocks.', readOnly: true },
  { name: 'design_session_create', operation: 'createDesignSession', description: 'Read a syllabus into a new design session after instructor consent.', readOnly: false },
  { name: 'design_session_get', operation: 'getDesignSession', description: 'Read a syllabus design session and its review stage.', readOnly: true },
  { name: 'design_session_answer', operation: 'answerDesignQuestions', description: 'Record the instructor answers for a design session.', readOnly: false },
  { name: 'design_session_confirm', operation: 'confirmOutcomes', description: 'Confirm outcomes supplied by the instructor for a design session.', readOnly: false },
  { name: 'design_session_select', operation: 'selectApproach', description: 'Select approaches and the instructor rationale.', readOnly: false },
  { name: 'design_session_preview', operation: 'previewProvisionPlan', description: 'Preview the course draft change set and hash.', readOnly: true },
  { name: 'design_session_apply', operation: 'applyProvisionPlan', description: 'Apply the confirmed plan as unpublished drafts.', readOnly: false },
  { name: 'design_session_undo', operation: 'undoProvisionPlan', description: 'Undo untouched drafts from the plan, preserving human edits.', readOnly: false },
  { name: 'save_blocks', operation: 'saveBlocks', description: 'Save lesson blocks as content a person reviews before publication.', readOnly: false },
  { name: 'get_course_access', operation: 'getCourseAccess', description: 'Read a course accessibility report.', readOnly: true },
  { name: 'get_lesson_access', operation: 'getLessonAccess', description: 'Read a lesson accessibility report.', readOnly: true },
  { name: 'list_files', operation: 'listFiles', description: 'List files in a course.', readOnly: true },
  { name: 'get_file_access', operation: 'getFileAccess', description: 'Read a file accessibility report.', readOnly: true },
  { name: 'generate_at_scope', operation: 'generateAtScope', description: 'Start AI generation of draft course content for a person to review.', readOnly: false },
  { name: 'get_generation_job', operation: 'getGenerationJob', description: 'Read the status of an AI generation job.', readOnly: true },
  { name: 'generate_element', operation: 'generateElement', description: 'Generate one AI draft lesson element for a person to review.', readOnly: false },
  { name: 'list_assignments', operation: 'listAssignments', description: 'List assignments in a course.', readOnly: true },
  { name: 'get_assignment', operation: 'getAssignment', description: 'Read an assignment.', readOnly: true },
  { name: 'create_assignment', operation: 'createAssignment', description: 'Create an unpublished assignment for a person to review.', readOnly: false },
  { name: 'list_announcements', operation: 'listAnnouncements', description: 'List announcements visible to the token owner.', readOnly: true },
  { name: 'create_announcement', operation: 'createAnnouncement', description: 'Create an unpublished announcement draft for a person to review.', readOnly: false },
];

// D-003: agents cannot publish or unpublish lessons or assignments, keep or
// revert AI blocks, grade or release grades, delete course content outside
// the bounded design-plan undo, manage tokens,
// people or institution settings, or operate the tutor. People retain those decisions.

const supported = new Set(['2025-06-18', '2025-03-26']);
const baseRoute: Route = { method: 'POST', path: '/mcp', access: 'signed-in', scope: null };
const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: unknown };
type Dependencies = {
  ensureSeeded(db: D1Database, repo: Repo): Promise<void>;
  rateLimiter: RateLimiter;
  createServiceContext(env: Env, repo: Repo, principal: Principal): ServiceContext;
};

function rpcError(id: Rpc['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}
function rpcResult(id: Rpc['id'], result: unknown) { return { jsonrpc: '2.0', id: id ?? null, result }; }
function toolError(error: ApiError) {
  return { content: [{ type: 'text', text: `${error.code}: ${error.message}` }], isError: true };
}

export async function handleMcp(request: Request, env: Env, deps: Dependencies): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  if (!bearerToken(request)) return unauthorized();
  const repo = new D1Repo(env.DB);
  try {
    await deps.ensureSeeded(env.DB, repo);
    const principal = await resolvePrincipal(request, env, repo, baseRoute, new Date().toISOString());
    if (!principal.token) return unauthorized();
    let body: unknown;
    try { body = await request.json(); } catch { return rpcResponse(rpcError(null, -32700, 'Parse error')); }
    if (Array.isArray(body)) {
      if (!body.length) return rpcResponse(rpcError(null, -32600, 'Invalid Request'));
      const results = await Promise.all(body.map(message => processMessage(message, request, env, repo, deps)));
      const replies = results.filter(result => result !== null);
      return replies.length ? rpcResponse(replies) : new Response(null, { status: 202 });
    }
    const result = await processMessage(body, request, env, repo, deps);
    return result === null ? new Response(null, { status: 202 }) : rpcResponse(result);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'unauthenticated') return unauthorized();
    console.error('MCP request failed', error);
    return rpcResponse(rpcError(null, -32603, 'Internal error'));
  }
}

async function processMessage(value: unknown, request: Request, env: Env, repo: Repo, deps: Dependencies): Promise<unknown | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return rpcError(null, -32600, 'Invalid Request');
  const message = value as Partial<Rpc>;
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string' || (message.id !== undefined && message.id !== null && typeof message.id !== 'string' && typeof message.id !== 'number')) return rpcError(null, -32600, 'Invalid Request');
  if (message.method === 'notifications/initialized') return null;
  if (message.id === undefined) return null;
  switch (message.method) {
    case 'initialize': {
      if (!message.params || typeof message.params !== 'object' || Array.isArray(message.params)) return rpcError(message.id, -32602, 'Invalid params');
      const version = (message.params as { protocolVersion?: unknown }).protocolVersion;
      if (typeof version !== 'string') return rpcError(message.id, -32602, 'Invalid params');
      return rpcResult(message.id, {
        protocolVersion: supported.has(version) ? version : '2025-06-18',
        capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'tessera', version: '1' },
        instructions: 'Use these tools to create and inspect courses and draft content. AI results are drafts that a person reviews. Publishing and other final decisions stay with people.',
      });
    }
    case 'ping': return rpcResult(message.id, {});
    case 'tools/list': return rpcResult(message.id, { tools: TOOLS.map(tool => {
      const schema = OPERATIONS[tool.operation].input;
      const inputSchema = schema.def.type === 'void' ? { type: 'object', properties: {} } : z.toJSONSchema(schema, { io: 'input' });
      const { $schema: _schema, ...shape } = inputSchema as Record<string, unknown>;
      return { name: tool.name, description: tool.description, inputSchema: shape, annotations: { readOnlyHint: tool.readOnly, destructiveHint: tool.operation === 'undoProvisionPlan' } };
    }) });
    case 'tools/call': {
      const params = message.params;
      if (!params || typeof params !== 'object' || Array.isArray(params)) return rpcError(message.id, -32602, 'Invalid params');
      const { name, arguments: args } = params as { name?: unknown; arguments?: unknown };
      if (typeof name !== 'string' || (args !== undefined && (!args || typeof args !== 'object' || Array.isArray(args)))) return rpcError(message.id, -32602, 'Invalid params');
      const tool = TOOLS.find(entry => entry.name === name);
      if (!tool) return rpcError(message.id, -32602, 'Unknown tool');
      let input: unknown;
      try {
        input = validateInput(tool.operation, tool.operation === 'createAnnouncement' ? { ...args as object, publish: false } : args ?? {});
      } catch (error) {
        if (error instanceof ApiError) return rpcError(message.id, -32602, error.message);
        throw error;
      }
      try {
        const principal = await resolvePrincipal(request, env, repo, ROUTES[tool.operation], new Date().toISOString());
        const wait = deps.rateLimiter.check(principal.rateKey);
        if (wait > 0) throw new ApiError('rate-limited', `Too many requests. Try again in ${wait} seconds.`);
        const context = { ...deps.createServiceContext(env, repo, principal), agent: { name: principal.token?.name ?? 'API token' } };
        const output = await dispatch(service, context, tool.operation, input as never);
        // structuredContent must be an object; list results are wrapped.
        return rpcResult(message.id, { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: Array.isArray(output) ? { items: output } : output });
      } catch (error) {
        if (error instanceof ApiError) return rpcResult(message.id, toolError(error));
        console.error('MCP tool failed', error);
        return rpcResult(message.id, { content: [{ type: 'text', text: 'internal: Tool failed.' }], isError: true });
      }
    }
    default: return rpcError(message.id, -32601, 'Method not found');
  }
}

function rpcResponse(body: unknown): Response { return new Response(JSON.stringify(body), { status: 200, headers: jsonHeaders }); }
function unauthorized(): Response { return new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'A valid API token is required.' } }), { status: 401, headers: { ...jsonHeaders, 'www-authenticate': 'Bearer' } }); }

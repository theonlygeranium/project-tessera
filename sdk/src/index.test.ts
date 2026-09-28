import { describe, expect, it, vi } from 'vitest';
import { createClient, paginate, TesseraError } from './index';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('Tessera SDK', () => {
  it('maps GET, POST, PATCH, and DELETE paths, query, bodies, and headers', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return json({ ok: true });
    });
    const client = createClient({ baseUrl: 'https://example.test/', token: 'tsk_test', fetch: fakeFetch as typeof fetch, userAgent: 'test-client' });
    await client.listFiles({ courseId: 'course/a', limit: 20, cursor: 'next' });
    await client.createCourse({ code: 'BIO 105', title: 'Cells', term: 'Spring' }, { idempotencyKey: 'create-1' });
    await client.updateCourse({ courseId: 'course/a', title: 'Cells 2' });
    await client.deleteModule({ moduleId: 'module/a' });
    expect(calls.map(c => [c.init.method, c.url])).toEqual([
      ['GET', 'https://example.test/api/v1/courses/course%2Fa/files?limit=20&cursor=next'],
      ['POST', 'https://example.test/api/v1/courses'],
      ['PATCH', 'https://example.test/api/v1/courses/course%2Fa'],
      ['DELETE', 'https://example.test/api/v1/modules/module%2Fa'],
    ]);
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Bearer tsk_test');
    expect(new Headers(calls[1].init.headers).get('idempotency-key')).toBe('create-1');
    expect(new Headers(calls[1].init.headers).get('user-agent')).toBe('test-client');
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ code: 'BIO 105', title: 'Cells', term: 'Spring' });
    expect(JSON.parse(calls[2].init.body as string)).toEqual({ title: 'Cells 2' });
  });

  it('maps API failures with request IDs and retries a 429 once', async () => {
    const failed = createClient({ baseUrl: 'https://example.test', token: 'tsk_test', fetch: vi.fn(async () => json({ error: { code: 'invalid', message: 'Bad course', details: { code: 'required' } } }, 400, { 'x-request-id': 'req-1' })) as typeof fetch });
    await expect(failed.listCourses()).rejects.toMatchObject({ code: 'invalid', message: 'Bad course', details: { code: 'required' }, status: 400, requestId: 'req-1' });
    const fakeFetch = vi.fn().mockResolvedValueOnce(json({ error: { code: 'rate-limited', message: 'Wait' } }, 429, { 'retry-after': '0' })).mockResolvedValueOnce(json([]));
    const client = createClient({ baseUrl: 'https://example.test', token: 'tsk_test', fetch: fakeFetch });
    expect(await client.listCourses()).toEqual([]);
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    const twice = vi.fn().mockResolvedValue(json({ error: { code: 'rate-limited', message: 'Wait' } }, 429, { 'retry-after': '0' }));
    await expect(createClient({ baseUrl: 'https://example.test', token: 'tsk_test', fetch: twice }).listCourses()).rejects.toBeInstanceOf(TesseraError);
    expect(twice).toHaveBeenCalledTimes(2);
  });

  it('iterates three pages without changing the caller input', async () => {
    const fn = vi.fn(async ({ cursor }: { courseId: string; cursor?: string; limit?: number }) => ({
      items: [cursor ?? 'first'], nextCursor: cursor === undefined ? 'second' : cursor === 'second' ? 'third' : null,
    }));
    const input = { courseId: 'c', limit: 2 };
    const values: string[] = [];
    for await (const item of paginate(fn, input)) values.push(item);
    expect(values).toEqual(['first', 'second', 'third']);
    expect(input).toEqual({ courseId: 'c', limit: 2 });
  });

  it('omits browser-only operations and provides file helpers', async () => {
    const fakeFetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      expect(init.body).toBeInstanceOf(FormData);
      expect((init.body as FormData).get('file')).toBeInstanceOf(File);
      return json({ id: 'file-1' });
    });
    const client = createClient({ baseUrl: 'https://example.test', token: 'tsk_test', fetch: fakeFetch as typeof fetch });
    expect('signIn' in client).toBe(false);
    expect('viewAs' in client).toBe(false);
    expect(client.fileUrl('file/a', 'reading')).toBe('https://example.test/api/v1/files/file%2Fa/content?format=reading');
    await client.uploadFile('course/a', new Blob(['hello']), 'hello.txt');
    expect(fakeFetch.mock.calls[0][0]).toBe('https://example.test/api/v1/courses/course%2Fa/files/upload');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessDirectory } from './access-directory';
import { AccessGroupLock, lockedDirectory } from './access-lock';

/** A fake Access group API with latency, so concurrent read-modify-writes overlap. */
function fakeAccessApi() {
  const group = { name: 'Tessera app', include: [{ email: { email: 'owner@example.test' } }], exclude: [], require: [], is_default: false };
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    await new Promise((r) => setTimeout(r, 5));
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      group.include = body.include;
      return new Response(JSON.stringify({ success: true, result: group }));
    }
    return new Response(JSON.stringify({ success: true, result: structuredClone(group) }));
  });
  return { group, fetch };
}

const env = { CF_ACCESS_API_TOKEN: 'test-token', CLOUDFLARE_ACCOUNT_ID: 'acct', ACCESS_GROUP_ID: 'grp' };
const emails = (group: { include: { email: { email: string } }[] }) => group.include.map((r) => r.email.email).sort();

afterEach(() => vi.unstubAllGlobals());

describe('Access group lock (carry-over 1)', () => {
  it('retries two unserialized grants until both emails land', async () => {
    const api = fakeAccessApi();
    const a = createAccessDirectory({ token: 't', accountId: 'a', groupId: 'g', fetch: api.fetch as unknown as typeof fetch });
    const b = createAccessDirectory({ token: 't', accountId: 'a', groupId: 'g', fetch: api.fetch as unknown as typeof fetch });
    await Promise.all([a.grant('a@example.test'), b.grant('b@example.test')]);
    expect(emails(api.group)).toEqual(['a@example.test', 'b@example.test', 'owner@example.test']);
  });

  it('serializes grants so simultaneous invitations both land', async () => {
    const api = fakeAccessApi();
    vi.stubGlobal('fetch', api.fetch);
    const lock = new AccessGroupLock({} as never, env as never);
    const results = await Promise.all([lock.grant('A@example.test'), lock.grant('b@example.test'), lock.grant('c@example.test')]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(emails(api.group)).toEqual(['a@example.test', 'b@example.test', 'c@example.test', 'owner@example.test']);
  });

  it('keeps going after a failed grant and reports the failure', async () => {
    const api = fakeAccessApi();
    let calls = 0;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ success: false, errors: [{ message: 'rate limited' }] }), { status: 429 });
      return api.fetch(url, init);
    });
    const lock = new AccessGroupLock({} as never, env as never);
    const [first, second] = await Promise.all([lock.grant('a@example.test'), lock.grant('b@example.test')]);
    expect(first).toEqual({ ok: false, message: "Access couldn't be updated: rate limited" });
    expect(second).toEqual({ ok: true });
    expect(emails(api.group)).toEqual(['b@example.test', 'owner@example.test']);
  });

  it('routes grants through one lock per group and turns failures back into ApiErrors', async () => {
    const grant = vi.fn(async (email: string) => (email.startsWith('bad') ? { ok: false as const, message: "Access couldn't be updated: nope" } : { ok: true as const }));
    const namespace = { idFromName: vi.fn((name: string) => `id:${name}`), get: vi.fn(() => ({ grant })) };
    const directory = lockedDirectory(namespace as never, 'grp');
    await directory.grant('ok@example.test');
    await expect(directory.grant('bad@example.test')).rejects.toMatchObject({ code: 'conflict', message: "Access couldn't be updated: nope" });
    expect(namespace.idFromName).toHaveBeenCalledWith('grp');
  });
});

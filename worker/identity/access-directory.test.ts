import { describe, expect, it, vi } from 'vitest';
import { createAccessDirectory } from './access-directory';

const group = { name: 'Tessera', include: [{ everyone: {} }, { email_domain: { domain: 'example.edu' } }], exclude: [{ country: { country_code: 'US' } }], require: [{ login_method: { id: 'sso' } }], is_default: true };
const ok = (result: unknown) => new Response(JSON.stringify({ success: true, result }), { status: 200 });
const directory = (request: typeof fetch) => createAccessDirectory({ token: 'test-token', accountId: 'account', groupId: 'group', fetch: request });

describe('Access directory', () => {
  it('appends a lowercased email and preserves every other rule and field', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(ok(group)).mockResolvedValueOnce(ok(group));
    await directory(request).grant('SAM@EXAMPLE.TEST');
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toBe('https://api.cloudflare.com/client/v4/accounts/account/access/groups/group');
    expect(request.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { authorization: 'Bearer test-token' } });
    expect(request.mock.calls[1][1]).toMatchObject({ method: 'PUT' });
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({ ...group, include: [...group.include, { email: { email: 'sam@example.test' } }] });
  });

  it('skips PUT when the email is already included, ignoring case', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(ok({ ...group, include: [...group.include, { email: { email: 'Sam@Example.Test' } }] }));
    await directory(request).grant('sam@example.test');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('maps Cloudflare errors from both reads and writes', async () => {
    const bad = () => new Response(JSON.stringify({ success: false, errors: [{ message: 'Permission denied' }] }), { status: 403 });
    await expect(directory(vi.fn<typeof fetch>().mockResolvedValue(bad())).grant('sam@example.test')).rejects.toMatchObject({ code: 'conflict', message: "Access couldn't be updated: Permission denied" });
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(ok(group)).mockResolvedValueOnce(bad());
    await expect(directory(request).grant('sam@example.test')).rejects.toMatchObject({ code: 'conflict', message: "Access couldn't be updated: Permission denied" });
  });
});

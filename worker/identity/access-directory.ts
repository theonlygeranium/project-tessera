import { ApiError } from '../../shared/api';
import type { Directory } from '../../shared/service';

interface AccessGroup {
  name: string;
  include: unknown[];
  exclude: unknown[];
  require: unknown[];
  is_default: boolean;
}

interface CloudflareResponse<T> {
  success: boolean;
  result?: T;
  errors?: { message?: string }[];
}

function accessError(message: string): ApiError {
  return new ApiError('conflict', `Access couldn't be updated: ${message}`);
}

export function createAccessDirectory({ token, accountId, groupId, fetch: request = fetch }: {
  token: string;
  accountId: string;
  groupId: string;
  fetch?: typeof fetch;
}): Directory {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/access/groups/${encodeURIComponent(groupId)}`;
  const hasEmail = (group: AccessGroup, normalized: string) => group.include.some((rule) => {
    if (!rule || typeof rule !== 'object' || !('email' in rule)) return false;
    const value = rule.email;
    return !!value && typeof value === 'object' && 'email' in value && typeof value.email === 'string' && value.email.toLowerCase() === normalized;
  });
  const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 50 + Math.random() * 200));
  async function call<T>(method: 'GET' | 'PUT', body?: unknown): Promise<T> {
    try {
      const response = await request(url, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const payload = await response.json() as CloudflareResponse<T>;
      if (!response.ok || !payload.success || !payload.result) {
        throw accessError(payload.errors?.[0]?.message ?? `HTTP ${response.status}`);
      }
      return payload.result;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw accessError(error instanceof Error ? error.message : String(error));
    }
  }
  return {
    async grant(email: string): Promise<void> {
      const normalized = email.toLowerCase();
      for (let attempt = 0; attempt < 4; attempt++) {
        const group = await call<AccessGroup>('GET');
        if (!Array.isArray(group.include)) throw accessError('The Access group has no include rules.');
        if (hasEmail(group, normalized)) return;
        await call<AccessGroup>('PUT', {
          name: group.name,
          include: [...group.include, { email: { email: normalized } }],
          exclude: group.exclude,
          require: group.require,
          is_default: group.is_default,
        });
        await delay();
        const verified = await call<AccessGroup>('GET');
        if (!Array.isArray(verified.include)) throw accessError('The Access group has no include rules.');
        if (hasEmail(verified, normalized)) return;
      }
      throw accessError('The Access group changed during the update.');
    },
  };
}

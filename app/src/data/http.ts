// The real API adapter: one fetch per operation, driven by ROUTES (shared/api.ts).
import { ApiError, ROUTES, fillPath, type ApiErrorBody, type Operation, type TesseraApi } from '../../../shared/api';

async function call(op: Operation, input: Record<string, unknown> | undefined): Promise<unknown> {
  const route = ROUTES[op];
  const { path, rest } = fillPath(route.path, input ?? {});
  let url = path;
  const init: RequestInit = { method: route.method, credentials: 'same-origin', headers: { accept: 'application/json' } };
  if (route.method === 'GET' || route.method === 'DELETE') {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== null) query.set(k, String(v));
    if ([...query].length) url += `?${query}`;
  } else {
    init.body = JSON.stringify(rest);
    init.headers = { ...init.headers, 'content-type': 'application/json' };
  }
  const res = await fetch(url, init);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    // Cloudflare Access answers an expired session with a redirect page, not JSON.
    throw new ApiError(err?.code ?? (res.status === 401 ? 'unauthenticated' : 'ai-failed'), err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return body;
}

export function createHttpApi(): TesseraApi {
  return Object.fromEntries(
    (Object.keys(ROUTES) as Operation[]).map((op) => [op, (input?: Record<string, unknown>) => call(op, input)]),
  ) as unknown as TesseraApi;
}

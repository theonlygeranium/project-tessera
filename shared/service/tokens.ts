// API tokens (D-020): create (secret shown once), list, revoke. Administrators manage
// their own tokens; instructors can create tokens too (their course access applies).
// A request made *with* a token can't manage tokens (no privilege bootstrapping).
import { ApiError, SCOPES } from '../api';
import type { ApiToken, Scope } from '../domain';
import { generateSecret, hashSecret, prefixOf } from '../tokens';
import type { Service, ServiceContext } from './context';
import { fail, required, user } from './helpers';

function browserOnly(ctx: ServiceContext) {
  if (ctx.token) fail('forbidden', 'Manage tokens from the app, not with a token.');
}
const publicView = ({ hash: _h, ...t }: ApiToken & { hash: string }): ApiToken => t;

export const tokens: Pick<Service, 'listApiTokens' | 'createApiToken' | 'revokeApiToken'> = {
  listApiTokens: async (ctx) => {
    browserOnly(ctx);
    return (await ctx.repo.listApiTokens(user(ctx).id)).map(publicView);
  },
  createApiToken: async (ctx, { name, scopes, expiresInDays }) => {
    browserOnly(ctx);
    const u = user(ctx);
    const known = new Set(SCOPES.map((s) => s.id));
    if (!Array.isArray(scopes) || scopes.length === 0 || scopes.some((s) => !known.has(s))) fail('invalid', 'Choose at least one valid scope.');
    // Instructors can't hold people or institution scopes.
    const staffOnly: Scope[] = ['people:read', 'people:write'];
    if (u.role !== 'administrator' && scopes.some((s) => staffOnly.includes(s))) fail('forbidden', 'Only administrators can grant people scopes.');
    if (expiresInDays !== undefined && (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365)) fail('invalid', 'expiresInDays must be 1–365.');
    const secret = generateSecret();
    const now = ctx.now();
    const expiresAt = expiresInDays ? new Date(Date.parse(now) + expiresInDays * 86_400_000).toISOString() : null;
    const token: ApiToken & { hash: string } = {
      id: ctx.newId('tok'), name: required(name, 'name'), prefix: prefixOf(secret), scopes: [...new Set(scopes)], ownerId: u.id,
      createdAt: now, expiresAt, lastUsedAt: null, revokedAt: null, hash: await hashSecret(secret),
    };
    await ctx.repo.putApiToken(token);
    return { token: publicView(token), secret };
  },
  revokeApiToken: async (ctx, { tokenId }) => {
    browserOnly(ctx);
    const u = user(ctx);
    const t = (await ctx.repo.listApiTokens(u.id)).find((x) => x.id === tokenId);
    if (!t) throw new ApiError('not-found', 'Token not found.');
    if (!t.revokedAt) await ctx.repo.putApiToken({ ...t, revokedAt: ctx.now() });
    return { ok: true };
  },
};

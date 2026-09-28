import { describe, expect, it, vi } from 'vitest';
import { ROUTES } from '../../shared/api';
import { seedData } from '../../shared/seed';
import { MemoryRepo } from '../../shared/service';
import { verifyAccessJwt } from '../access';
import type { Env } from '../env';
import { resolvePrincipal } from './auth';

vi.mock('../access', () => ({ verifyAccessJwt: vi.fn() }));

const env = { ENVIRONMENT: 'production', ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud' } as Env;
const request = new Request('https://example.test/api/v1/me', { headers: { cookie: 'tessera_user=u-admin' } });
const invitation = { userId: 'u-priya', email: 'priya@meridian.example.edu', invitedBy: 'u-admin', invitedAt: '2026-09-27T00:00:00Z', accessGranted: true, accessError: null, acceptedAt: null };

describe('invited Access principals', () => {
  it('records the first sign-in once, using the Access user role', async () => {
    const repo = new MemoryRepo(seedData());
    invitation.email = (await repo.getUser('u-priya'))!.email;
    await repo.putInvitation(invitation);
    vi.mocked(verifyAccessJwt).mockResolvedValue({ email: invitation.email.toUpperCase() });
    const first = await resolvePrincipal(request, env, repo, ROUTES.getSession, '2026-09-27T12:00:00Z');
    const second = await resolvePrincipal(request, env, repo, ROUTES.getSession, '2026-09-28T12:00:00Z');
    expect(first.user).toMatchObject({ id: 'u-priya', role: 'student' });
    expect(second.user?.id).toBe('u-priya');
    expect((await repo.getInvitation('u-priya'))?.acceptedAt).toBe('2026-09-27T12:00:00Z');
  });

  it('honors the persona cookie outside local only for owner emails, before and after invitations', async () => {
    const repo = new MemoryRepo(seedData());
    const ownerEnv = { ...env, OWNER_EMAILS: 'owner@example.test' };
    vi.mocked(verifyAccessJwt).mockResolvedValue({ email: 'unknown@example.test' });
    expect((await resolvePrincipal(request, ownerEnv, repo, ROUTES.getSession, '2026-09-27T12:00:00Z')).user).toBeNull();
    vi.mocked(verifyAccessJwt).mockResolvedValue({ email: 'Owner@Example.test' });
    expect((await resolvePrincipal(request, ownerEnv, repo, ROUTES.getSession, '2026-09-27T12:00:00Z')).user?.id).toBe('u-admin');
    await repo.putInvitation({ ...invitation, email: (await repo.getUser('u-priya'))!.email });
    expect((await resolvePrincipal(request, ownerEnv, repo, ROUTES.getSession, '2026-09-27T12:00:00Z')).user?.id).toBe('u-admin');
  });

  it('keeps serving the Access user if acceptance storage fails', async () => {
    const repo = new MemoryRepo(seedData());
    const email = (await repo.getUser('u-priya'))!.email;
    await repo.putInvitation({ ...invitation, email });
    vi.mocked(verifyAccessJwt).mockResolvedValue({ email });
    vi.spyOn(repo, 'acceptInvitation').mockRejectedValueOnce(new Error('database unavailable'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await resolvePrincipal(request, env, repo, ROUTES.getSession, '2026-09-27T12:00:00Z')).user?.id).toBe('u-priya');
      expect((await repo.getInvitation('u-priya'))?.acceptedAt).toBeNull();
    } finally { logged.mockRestore(); }
  });
});

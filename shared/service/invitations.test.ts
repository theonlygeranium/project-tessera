import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { fixtureAi } from '../ai';
import { seedData } from '../seed';
import { dispatch, MemoryRepo, service, type ServiceContext } from './index';

function harness(userId = 'u-admin') {
  const seed = seedData();
  const repo = new MemoryRepo(seed);
  const ctx: ServiceContext = { repo, ai: fixtureAi, user: seed.users.find((person) => person.id === userId)!, now: () => '2026-09-27T12:00:00Z', newId: () => 'u-invited' };
  const invite = (name = 'Sam Ibarra', email = 'SAM@example.test') => dispatch(service, ctx, 'inviteUser', { name, email, role: 'student' });
  return { repo, ctx, invite };
}

describe('invitations', () => {
  it('creates a person and a granted invitation, then lists it', async () => {
    const h = harness();
    h.ctx.directory = { grant: async (email) => { expect(email).toBe('sam@example.test'); } };
    const invitation = await h.invite();
    expect(invitation).toMatchObject({ userId: 'u-invited', email: 'sam@example.test', accessGranted: true, accessError: null, acceptedAt: null });
    expect(await h.repo.getUser('u-invited')).toMatchObject({ name: 'Sam Ibarra', role: 'student', initials: 'SI', profile: null });
    expect((await dispatch(service, h.ctx, 'listInvitations', {})).items).toEqual([invitation]);
  });

  it('refuses an existing person without an invitation', async () => {
    const h = harness();
    await expect(h.invite('Admin', 'alex.rivera@meridian.example.edu')).rejects.toMatchObject({ code: 'conflict' });
  });

  it('retries an Access failure without creating another user and then grants access', async () => {
    const h = harness();
    let attempts = 0;
    h.ctx.directory = { grant: async () => { if (++attempts === 1) throw new ApiError('conflict', 'Access unavailable'); } };
    expect(await h.invite()).toMatchObject({ accessGranted: false, accessError: 'Access unavailable' });
    expect(await h.invite()).toMatchObject({ accessGranted: true, accessError: null });
    expect((await h.repo.listUsers()).filter(x => x.email === 'sam@example.test')).toHaveLength(1);
    expect(attempts).toBe(2);
  });

  it('keeps the person pending when no directory is connected', async () => {
    const h = harness();
    expect(await h.invite()).toMatchObject({ accessGranted: false, accessError: "Access isn't connected in this environment." });
  });

  it('pages invitations newest first with the next user id as cursor', async () => {
    const h = harness();
    await h.invite();
    h.ctx.newId = () => 'u-second';
    h.ctx.now = () => '2026-09-28T12:00:00Z';
    await h.invite('Tess Ibarra', 'tess@example.test');
    const first = await dispatch(service, h.ctx, 'listInvitations', { limit: 1 });
    expect(first.items.map(item => item.userId)).toEqual(['u-second']);
    expect(first.nextCursor).toBe('u-invited');
    const second = await dispatch(service, h.ctx, 'listInvitations', { limit: 1, cursor: first.nextCursor! });
    expect(second.items.map(item => item.userId)).toEqual(['u-invited']);
    expect(second.nextCursor).toBeNull();
  });

  it('refuses students and instructors', async () => {
    for (const role of ['u-priya', 'u-okafor']) {
      const h = harness(role);
      await expect(h.invite()).rejects.toMatchObject({ code: 'forbidden' });
      await expect(dispatch(service, h.ctx, 'listInvitations', {})).rejects.toMatchObject({ code: 'forbidden' });
    }
  });
});

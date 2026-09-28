import type { Invitation } from '../domain';
import { initialsFor, isEmail, isRole } from '../policy';
import type { Service, ServiceContext } from './context';
import { fail, required, user } from './helpers';

async function grant(ctx: ServiceContext, invitation: Invitation): Promise<Invitation> {
  let updated: Invitation;
  if (!ctx.directory) {
    updated = { ...invitation, accessGranted: false, accessError: "Access isn't connected in this environment." };
  } else {
    try {
      await ctx.directory.grant(invitation.email);
      updated = { ...invitation, accessGranted: true, accessError: null };
    } catch (error) {
      updated = { ...invitation, accessGranted: false, accessError: error instanceof Error ? error.message : String(error) };
    }
  }
  await ctx.repo.putInvitation(updated);
  return updated;
}

export const invitations: Pick<Service, 'inviteUser' | 'listInvitations'> = {
  inviteUser: async (ctx, input) => {
    if (user(ctx).role !== 'administrator' || (ctx.token && !ctx.token.scopes.includes('people:write'))) fail('forbidden', 'You cannot invite people.');
    const name = required(input.name, 'name');
    const email = required(input.email, 'email').toLowerCase();
    if (!isEmail(email) || !isRole(input.role)) fail('invalid', 'Invalid email or role.');
    const existing = await ctx.repo.findUserByEmail(email);
    if (existing) {
      const invitation = await ctx.repo.getInvitation(existing.id);
      if (!invitation) return fail('conflict', 'Someone with this email already has an account.');
      return invitation.accessGranted ? invitation : grant(ctx, invitation);
    }
    const created = { id: ctx.newId('u'), name, email, role: input.role, initials: initialsFor(name), profile: null };
    await ctx.repo.putUser(created);
    const invitation: Invitation = { userId: created.id, email, invitedBy: user(ctx).id, invitedAt: ctx.now(), accessGranted: false, accessError: null, acceptedAt: null };
    await ctx.repo.putInvitation(invitation);
    return grant(ctx, invitation);
  },
  listInvitations: async (ctx, { limit, cursor }) => {
    if (user(ctx).role !== 'administrator' || (ctx.token && !ctx.token.scopes.includes('people:read'))) fail('forbidden', 'You cannot view invitations.');
    const all = await ctx.repo.listInvitations();
    const size = Math.min(Math.max(limit ?? 50, 1), 200);
    const start = cursor ? Math.max(0, all.findIndex((item) => item.userId === cursor)) : 0;
    return { items: all.slice(start, start + size), nextCursor: all[start + size]?.userId ?? null };
  },
};

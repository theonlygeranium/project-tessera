import type { Service } from './context';
import { fail } from './helpers';
import { seedData } from '../seed';

export const session: Pick<Service, 'getSession' | 'signIn' | 'signOut' | 'listDemoUsers' | 'resetDemo' | 'viewAs'> = {
  getSession: async ctx => ({ user: ctx.user, institution: await ctx.repo.getInstitution() }),
  signIn: async (ctx, { userId }) => ({ user: await ctx.repo.getUser(userId) ?? fail('not-found', 'User not found.'), institution: await ctx.repo.getInstitution() }),
  signOut: async () => ({ ok: true }),
  // Administrators see Tessera as another person (D-021). The Worker keeps the choice in a
  // cookie and runs this operation as the administrator even while viewing as someone else.
  viewAs: async (ctx, { userId }) => {
    const admin = ctx.user ?? fail('unauthenticated', 'Sign in first.');
    if (admin.role !== 'administrator') fail('forbidden', 'Only administrators can view as someone else.');
    const target = userId && userId !== admin.id ? await ctx.repo.getUser(userId) ?? fail('not-found', 'User not found.') : admin;
    return { user: target, institution: await ctx.repo.getInstitution() };
  },
  listDemoUsers: async ctx => ctx.repo.listUsers(),
  resetDemo: async ctx => { await ctx.repo.reset(seedData()); return { ok: true }; },
};

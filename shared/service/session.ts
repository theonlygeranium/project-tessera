import type { Service } from './context';
import { fail } from './helpers';
import { seedData } from '../seed';

export const session: Pick<Service, 'getSession' | 'signIn' | 'signOut' | 'listDemoUsers' | 'resetDemo'> = {
  getSession: async ctx => ({ user: ctx.user, institution: await ctx.repo.getInstitution() }),
  signIn: async (ctx, { userId }) => ({ user: await ctx.repo.getUser(userId) ?? fail('not-found', 'User not found.'), institution: await ctx.repo.getInstitution() }),
  signOut: async () => ({ ok: true }),
  listDemoUsers: async ctx => ctx.repo.listUsers(),
  resetDemo: async ctx => { await ctx.repo.reset(seedData()); return { ok: true }; },
};

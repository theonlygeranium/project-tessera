import type { Service } from '../context';
import { normalizeSsoDomains } from './sso';

export const interop: Pick<Service, 'updateSsoSettings'> = {
  updateSsoSettings: async (ctx, input) => {
    const institution = await ctx.repo.getInstitution();
    const domains = normalizeSsoDomains(input.domains);
    institution.sso = domains.length ? { domains, defaultRole: 'student' } : null;
    await ctx.repo.putInstitution(institution);
    return ctx.repo.getInstitution();
  },
};

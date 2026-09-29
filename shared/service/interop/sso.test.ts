import { describe, expect, it } from 'vitest';
import { MemoryRepo } from '../memory-repo';
import { seedData } from '../../seed';
import { jitProvisionAccessUser, normalizeSsoDomains } from './sso';

function setup() {
  const repo = new MemoryRepo(seedData()); let id = 0;
  return {repo,now:()=> '2026-09-28T00:00:00.000Z',newId:(p:string)=>`${p}-${++id}`};
}
describe('SSO JIT', () => {
  it('normalizes exact hostnames and names bad entries', () => {
    expect(normalizeSsoDomains([' Meridian.edu ','meridian.edu','X.Meridian.edu'])).toEqual(['meridian.edu','x.meridian.edu']);
    for (const invalid of ['*.edu','https://x.edu','x@edu','x.edu.','-x.edu','x-.edu','x','a'.repeat(64)+'.edu']) expect(() => normalizeSsoDomains([invalid])).toThrow(invalid);
  });
  it('creates only exact-domain students and resolves concurrent duplicates', async () => {
    const deps = setup();
    await deps.repo.putInstitution({...await deps.repo.getInstitution(),sso:{domains:['meridian.edu'],defaultRole:'student'}});
    expect(await jitProvisionAccessUser(deps,'a@evil-meridian.edu')).toBeNull();
    expect(await jitProvisionAccessUser(deps,'a@x.meridian.edu')).toBeNull();
    const [a,b] = await Promise.all([jitProvisionAccessUser(deps,'A.Person@Meridian.edu'),jitProvisionAccessUser(deps,'a.person@meridian.edu')]);
    expect(a?.id).toBe(b?.id);
    expect(a).toMatchObject({email:'a.person@meridian.edu',role:'student'});
    expect((await deps.repo.listUsers()).filter(u=>u.email==='a.person@meridian.edu')).toHaveLength(1);
  });
  it('P1 — Unicode email case-folding diverges between MemoryRepo and D1Repo: JIT rejects non-ASCII', async () => {
    const deps = setup();
    await deps.repo.putInstitution({...await deps.repo.getInstitution(),sso:{domains:['meridian.edu'],defaultRole:'student'}});
    expect(await jitProvisionAccessUser(deps,'Émile@meridian.edu')).toBeNull();
    expect(await jitProvisionAccessUser(deps,'émile@meridian.edu')).toBeNull();
  });
});

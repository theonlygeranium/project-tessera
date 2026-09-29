import { describe, expect, it } from 'vitest';
import { MemoryRepo } from '../memory-repo';
import { seedData } from '../../seed';
import { ltiIdentityKey, resolveLtiUser } from './identity';

const now = '2026-09-28T00:00:00.000Z';
function setup() {
  const repo = new MemoryRepo(seedData());
  let id = 0;
  return { repo, now: () => now, newId: (prefix: string) => `${prefix}-test-${++id}` };
}
describe('LTI identity resolution', () => {
  it('validates platform and subject', () => {
    expect(ltiIdentityKey('p','s')).toBe('p|s');
    for (const [p,s] of [['','x'],['a|b','x'],['p',''],['p','x'.repeat(256)]]) expect(() => ltiIdentityKey(p,s)).toThrow();
  });
  it('creates a synthetic user, then keeps stored role on relaunch', async () => {
    const deps = setup();
    const first = await resolveLtiUser(deps,{platformId:'p',sub:'s',name:'Learner One',roles:['Learner']});
    expect(first.created).toBe(true);
    expect(first.user).toMatchObject({role:'student',name:'Learner One'});
    expect(first.user.email).toMatch(/^lti-u-test-\d+@lti\.invalid$/);
    const second = await resolveLtiUser(deps,{platformId:'p',sub:'s',roles:['Instructor']});
    expect(second).toMatchObject({created:false,courseRole:'instructor'});
    expect(second.user.id).toBe(first.user.id);
    expect(second.user.role).toBe('student');
  });
  it('suggests an email match but never links or returns it', async () => {
    const deps = setup();
    const target = await deps.repo.getUser('u-priya');
    const result = await resolveLtiUser(deps,{platformId:'p',sub:'match',email:target!.email.toUpperCase(),roles:[]});
    expect(result.user.id).not.toBe(target!.id);
    expect(result.suggestion).toMatchObject({fromUserId:result.user.id,targetUserId:target!.id});
    expect(await deps.repo.getUser(target!.id)).toEqual(target);
    expect(await deps.repo.listUserIdentities(target!.id)).toEqual([]);
  });
  it('does not promote an institution Administrator', async () => {
    const result = await resolveLtiUser(setup(),{platformId:'p',sub:'admin',roles:['http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator']});
    expect(result.courseRole).toBeNull();
    expect(result.user.role).toBe('student');
  });
  it('converges concurrent first launches', async () => {
    const deps = setup();
    const claims = {platformId:'p',sub:'race',roles:['Learner']};
    const [a,b] = await Promise.all([resolveLtiUser(deps,claims),resolveLtiUser(deps,claims)]);
    expect([a.created,b.created].sort()).toEqual([false,true]);
    expect(a.user.id).toBe(b.user.id);
    expect((await deps.repo.listUsers()).filter(u=>u.email.endsWith('@lti.invalid'))).toHaveLength(1);
  });
});

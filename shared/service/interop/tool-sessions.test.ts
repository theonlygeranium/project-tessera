import { describe, expect, it } from 'vitest';
import { MemoryRepo } from '../memory-repo';
import { seedData } from '../../seed';
import { mintToolSession, verifyToolSession, looksLikeToolSessionToken } from './tool-sessions';

function setup() {
  const repo = new MemoryRepo(seedData());
  let clock = Date.parse('2026-09-28T00:00:00.000Z'), id = 0;
  return { repo, now: () => new Date(clock).toISOString(), newId: (p:string) => `${p}-${++id}`, advance: (ms:number) => { clock += ms; } };
}
const input = {userId:'u-priya',courseId:'c-stat110',role:'student' as const,platformId:'p',contextId:'c',returnUrl:'https://lms.example.test/return'};
describe('tool sessions', () => {
  it('stores a hash, revokes previous launches and rejects invalid parameters', async () => {
    const deps = setup();
    const first = await mintToolSession(deps,input);
    expect(looksLikeToolSessionToken(first.token)).toBe(true);
    expect(JSON.stringify(first.session)).not.toContain(first.token);
    expect(await verifyToolSession(deps,first.token)).toMatchObject({id:first.session.id});
    const second = await mintToolSession(deps,input);
    expect(await verifyToolSession(deps,first.token)).toBeNull();
    expect(await verifyToolSession(deps,second.token)).not.toBeNull();
    await expect(mintToolSession(deps,{...input,role:'administrator' as never})).rejects.toThrow();
    await expect(mintToolSession(deps,{...input,returnUrl:'http://example.test'})).rejects.toThrow();
  });
  it('slides at most eight hours and stops after expiry', async () => {
    const deps = setup();
    const {token,session} = await mintToolSession(deps,input);
    deps.advance(90*60_000);
    expect((await verifyToolSession(deps,token))?.expiresAt).toBe(new Date(Date.parse(session.createdAt)+3.5*60*60_000).toISOString());
    deps.advance(90*60_000);
    expect((await verifyToolSession(deps,token))?.expiresAt).toBe(new Date(Date.parse(session.createdAt)+5*60*60_000).toISOString());
    deps.advance(90*60_000);
    expect((await verifyToolSession(deps,token))?.expiresAt).toBe(new Date(Date.parse(session.createdAt)+6.5*60*60_000).toISOString());
    deps.advance(90*60_000);
    expect((await verifyToolSession(deps,token))?.expiresAt).toBe(new Date(Date.parse(session.createdAt)+8*60*60_000).toISOString());
    deps.advance(2*60*60_000);
    expect(await verifyToolSession(deps,token)).toBeNull();
  });
});

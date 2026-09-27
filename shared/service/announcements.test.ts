import { describe, expect, it } from 'vitest';
import { fixtureAi } from '../ai';
import { SEED_NOW, seedData } from '../seed';
import { dispatch, MemoryRepo, service, type ServiceContext } from './index';

const ctxFor = (repo: MemoryRepo, userId: string): Promise<ServiceContext> =>
  repo.getUser(userId).then((user) => ({ repo, ai: fixtureAi, user, now: () => SEED_NOW, newId: (p) => `${p}-t${Math.random().toString(36).slice(2, 8)}` }));

describe('NQ-03: AI announcement provenance never exposes the prompt', () => {
  it('drafts and publishes with a fixed summary, even if the client sends the prompt back', async () => {
    const repo = new MemoryRepo(seedData());
    const okafor = await ctxFor(repo, 'u-okafor');
    const prompt = 'SECRET: only tell them the quiz moved because I am travelling';
    const draft = await dispatch(service, okafor, 'draftAnnouncement', { courseId: 'c-stat110', prompt });
    expect(draft.provenance.summary).not.toContain('SECRET');
    const leaky = { ...draft.provenance, summary: prompt };
    const created = await dispatch(service, okafor, 'createAnnouncement', { courseId: 'c-stat110', title: draft.title, body: draft.body, pinned: false, publish: true, aiDraft: leaky });
    expect(created.provenance?.summary).not.toContain('SECRET');
    const priya = await ctxFor(repo, 'u-priya');
    const seen = await dispatch(service, priya, 'listAnnouncements', { courseId: 'c-stat110' });
    expect(JSON.stringify(seen.map((a) => a.provenance))).not.toContain('SECRET');
  });
});

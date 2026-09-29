import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { Object.defineProperty(globalThis, 'location', { value: { search: '' }, configurable: true }); });
import { fixtureAi } from '../../../../shared/ai';
import { seedData } from '../../../../shared/seed';
import type { DesignSession } from '../../../../shared/domain';
import { MemoryRepo, service } from '../../../../shared/service';
import type { ServiceContext } from '../../../../shared/service/context';
import { OptionCard } from '../../components/OptionCard/OptionCard';
import { DraftReady, Preview } from './Preview';
import { ReadConfirm } from './Session';

function attributed(markup: string, marker: string): boolean {
  const stack: { name: string; ai: boolean }[] = [];
  const voids = new Set(['br', 'hr', 'img', 'input', 'link', 'meta']);
  for (const token of markup.match(/<[^>]+>|[^<]+/g) ?? []) {
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (token.startsWith('<')) {
      const name = /^<([a-z][\w-]*)/i.exec(token)?.[1]?.toLowerCase();
      if (name && !voids.has(name) && !token.endsWith('/>')) stack.push({ name, ai: /class="[^"]*\bai\s+ai--/.test(token) });
    } else if (token.includes(marker)) return stack.some(item => item.ai);
  }
  return false;
}
async function setup() {
  const repo = new MemoryRepo(seedData()); let n = 0;
  const ctx: ServiceContext = { repo, ai: fixtureAi, user: await repo.getUser('u-okafor'), now: () => '2026-09-28T12:00:00Z', newId: prefix => `${prefix}-ui-${++n}` };
  const started = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', sample: true, consent: { syllabusOnly: true, rememberProfile: false } });
  await service.advanceDesignSession(ctx, { sessionId: started.id });
  const read = await service.advanceDesignSession(ctx, { sessionId: started.id });
  return { ctx, read };
}
const render = (element: ReturnType<typeof createElement>, client = new QueryClient()) => renderToStaticMarkup(createElement(QueryClientProvider, { client }, element));

describe('design partner Marginalia', () => {
  it('attributes the read judgments and deficiencies, while deterministic controls remain plain', async () => {
    const { read } = await setup();
    read.read!.deficiencies = [{ code: 'probe', message: 'SENTINEL_DEFICIENCY', rubricRefs: [], spans: [] }];
    read.read!.outcomeAudits[0].bloom = null;
    const markup = render(createElement(ReadConfirm, { session: read }));
    expect(attributed(markup, 'SENTINEL_DEFICIENCY')).toBe(true);
    expect(attributed(markup, 'No observable Bloom verb')).toBe(true);
    expect(attributed(markup, 'Learner-centeredness')).toBe(true);
    expect(markup).toContain('Design partner');
    expect(markup).toContain('class="ai-src"');
  });

  it('attributes approach text and proposed module and lesson titles', async () => {
    const { ctx, read } = await setup();
    await service.confirmOutcomes(ctx, { sessionId: read.id, outcomes: read.extraction!.outcomes.map((item, i) => ({ code: `O${i + 1}`, text: item.text, originalText: item.text })) });
    const session = await service.advanceDesignSession(ctx, { sessionId: read.id });
    const option = { ...session.options![0], description: 'SENTINEL_APPROACH_TEXT' };
    expect(attributed(render(createElement(OptionCard, { option, letter: 'A', selected: false, onChange: () => {} })), 'SENTINEL_APPROACH_TEXT')).toBe(true);
    await service.selectApproach(ctx, { sessionId: read.id, optionIds: [option.id], overlays: ['bookends'], rationale: 'This structure fits repeated practice.' });
    const plan = await service.previewProvisionPlan(ctx, { sessionId: read.id });
    const generated = plan.modules.find(module => module.key.startsWith('module-'))!;
    generated.title = 'SENTINEL_PREVIEW_TITLE';
    generated.lessons[0].title = 'SENTINEL_LESSON_TITLE';
    const client = new QueryClient();
    client.setQueryData(['previewProvisionPlan', { sessionId: read.id }], plan);
    const markup = render(createElement(Preview, { session: (await ctx.repo.getDesignSession(read.id))! }), client);
    expect(attributed(markup, 'SENTINEL_PREVIEW_TITLE')).toBe(true);
    expect(attributed(markup, 'SENTINEL_LESSON_TITLE')).toBe(true);
    expect(attributed(markup, 'Exactly what this plan will create')).toBe(false);
  });

  it('shows an agent-submitted outcome as a draft with a person-only keep action', async () => {
    const { read } = await setup();
    read.created.outcomeIds = ['draft-outcome'];
    read.confirmedOutcomes = [{ code: 'O1', text: 'SENTINEL_OUTCOME', originalText: '', source: 'instructor', submittedBy: { kind: 'agent', name: 'Fictional assistant' } }];
    read.plan = { counts: { lessons: 1 }, outcomes: [{ code: 'O7' }] } as DesignSession['plan'];
    const client = new QueryClient();
    client.setQueryData(['listOutcomes', { courseId: read.courseId }], [{ id: 'draft-outcome', courseId: read.courseId, code: 'O7', text: 'SENTINEL_OUTCOME', position: 6, aiState: 'draft' }]);
    const markup = render(createElement(MemoryRouter, null, createElement(DraftReady, { session: read })), client);
    expect(attributed(markup, 'SENTINEL_OUTCOME')).toBe(true);
    expect(markup).toContain('Fictional assistant');
    expect(markup).toContain('outcome supplied during this design session');
    expect(markup).toContain('Keep outcome');
  });
});

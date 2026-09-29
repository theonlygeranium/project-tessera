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
import { ReadConfirm, acceptOutcomeRewrite } from './Session';
import { ReviewOutline } from './ReviewOutline';
import { canKeepOutcome } from '../readiness/OutcomesPage';

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
function attributedInside(markup: string, marker: string, tag: string): boolean {
  const stack: { name: string; ai: boolean }[] = [];
  for (const token of markup.match(/<[^>]+>|[^<]+/g) ?? []) {
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (token.startsWith('<')) {
      const name = /^<([a-z][\w-]*)/i.exec(token)?.[1]?.toLowerCase();
      if (name && !['br', 'hr', 'img', 'input'].includes(name) && !token.endsWith('/>')) stack.push({ name, ai: /class="[^"]*\bai\s+ai--/.test(token) });
    } else if (token.includes(marker) && stack.some(item => item.name === tag)) return stack.some(item => item.ai);
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
    read.extraction!.profile.description = { value: 'SENTINEL_INFERRED_PROFILE', origin: 'inferred', confidence: 0.7, spans: [] };
    read.extraction!.profile.title = { value: 'SENTINEL_INFERRED_TITLE', origin: 'inferred', confidence: 0.7, spans: [] };
    const markup = render(createElement(ReadConfirm, { session: read }));
    expect(attributed(markup, 'SENTINEL_DEFICIENCY')).toBe(true);
    expect(attributed(markup, 'No observable Bloom verb')).toBe(true);
    expect(attributed(markup, 'Learner-centeredness')).toBe(true);
    expect(attributed(markup, 'SENTINEL_INFERRED_PROFILE')).toBe(true);
    expect(attributed(markup, 'SENTINEL_INFERRED_TITLE')).toBe(true);
    expect(markup).toContain('Design partner');
    expect(markup).toContain('class="ai-src"');
  });

  it('attributes accepted suggestion wording and generated review outline titles', async () => {
    const { read } = await setup();
    const suggested = { code: 'O9', text: 'SENTINEL_ACCEPTED_SUGGESTION', originalText: '', source: 'suggested' as const, suggestedText: 'SENTINEL_ACCEPTED_SUGGESTION' };
    read.confirmedOutcomes = [suggested];
    const markup = render(createElement(ReadConfirm, { session: read }));
    expect(markup).toMatch(/<label[^>]*>Outcome wording<\/label><div[^>]*class="[^"]*ai--note[^"]*"[\s\S]*?value="SENTINEL_ACCEPTED_SUGGESTION"/);
    const client = new QueryClient();
    client.setQueryData(['getCourseOutline', { courseId: 'c-stat110' }], { modules: [{ id: 'm-generated', title: 'SENTINEL_REVIEW_MODULE', lessons: [{ id: 'l-generated', title: 'SENTINEL_REVIEW_LESSON', status: 'draft' }] }], designSession: { id: read.id } });
    client.setQueryData(['listDesignSessions', { courseId: 'c-stat110' }], [{ ...read, planIds: { modules: { one: 'm-generated' }, lessons: { one: 'l-generated' }, assignments: {}, outcomes: {} } }]);
    const outline = render(createElement(MemoryRouter, null, createElement(ReviewOutline, { courseId: 'c-stat110', lessonId: 'l-generated' })), client);
    expect(attributed(outline, 'SENTINEL_REVIEW_MODULE')).toBe(true);
    expect(attributed(outline, 'SENTINEL_REVIEW_LESSON')).toBe(true);
  });

  it('attributes titles from two applied plans while leaving a person-created module plain', async () => {
    const { read } = await setup();
    const client = new QueryClient();
    client.setQueryData(['getCourseOutline', { courseId: read.courseId }], { modules: [
      { id: 'm-first', title: 'SENTINEL_FIRST_PLAN', lessons: [{ id: 'l-first', title: 'SENTINEL_FIRST_LESSON', status: 'draft' }] },
      { id: 'm-second', title: 'SENTINEL_SECOND_PLAN', lessons: [{ id: 'l-second', title: 'SENTINEL_SECOND_LESSON', status: 'draft' }] },
      { id: 'm-person', title: 'SENTINEL_PERSON_MODULE', lessons: [] },
    ] });
    client.setQueryData(['listDesignSessions', { courseId: read.courseId }], [
      { ...read, planIds: { modules: { first: 'm-first' }, lessons: { first: 'l-first' } } },
      { ...read, id: 'second-plan', planIds: { modules: { second: 'm-second' }, lessons: { second: 'l-second' } } },
    ]);
    const markup = render(createElement(MemoryRouter, null, createElement(ReviewOutline, { courseId: read.courseId, lessonId: 'l-second' })), client);
    for (const marker of ['SENTINEL_FIRST_PLAN', 'SENTINEL_FIRST_LESSON', 'SENTINEL_SECOND_PLAN', 'SENTINEL_SECOND_LESSON']) expect(attributed(markup, marker)).toBe(true);
    expect(attributed(markup, 'SENTINEL_PERSON_MODULE')).toBe(false);
  });

  it('keeps accepted rewrite source through the wording control and confirmation', async () => {
    const { ctx, read } = await setup();
    const original = read.extraction!.outcomes[0];
    const audit = read.read!.outcomeAudits.find(item => item.outcomeId === original.id)!;
    audit.suggestion = { text: 'Explain fictional evidence using examples.', why: 'The verb is observable.' };
    const accepted = acceptOutcomeRewrite({ code: 'O1', text: original.text, originalText: original.text, checked: true, source: 'syllabus' as 'syllabus' | 'suggested', suggestedText: undefined as string | undefined }, audit.suggestion.text);
    read.confirmedOutcomes = [accepted];
    const markup = render(createElement(ReadConfirm, { session: read }));
    expect(markup).toContain('accepted rewrite of your syllabus outcome');
    expect(markup).toMatch(/class="[^"]*ai--note[^"]*"[\s\S]*?value="Explain fictional evidence using examples\."/);
    await ctx.repo.putDesignSession(read);
    const confirmed = await service.confirmOutcomes(ctx, { sessionId: read.id, outcomes: [{ code: accepted.code, text: accepted.text, originalText: accepted.originalText, source: accepted.source, suggestedText: accepted.suggestedText }] });
    expect(confirmed.confirmedOutcomes?.[0]).toMatchObject({ source: 'suggested', suggestedText: audit.suggestion.text, originalText: original.text });
  });

  it('attributes approach text and proposed module and lesson titles', async () => {
    const { ctx, read } = await setup();
    await service.confirmOutcomes(ctx, { sessionId: read.id, outcomes: read.extraction!.outcomes.map((item, i) => ({ code: `O${i + 1}`, text: item.text, originalText: item.text })) });
    const session = await service.advanceDesignSession(ctx, { sessionId: read.id });
    const option = { ...session.options![0], description: 'SENTINEL_APPROACH_TEXT', label: 'SENTINEL_APPROACH_LABEL', tag: 'SENTINEL_APPROACH_TAG', frameworks: ['SENTINEL_FRAMEWORK'] };
    expect(attributed(render(createElement(OptionCard, { option, letter: 'A', selected: false, onChange: () => {} })), 'SENTINEL_APPROACH_TEXT')).toBe(true);
    const optionMarkup = render(createElement(OptionCard, { option, letter: 'A', selected: false, onChange: () => {} }));
    for (const marker of ['SENTINEL_APPROACH_LABEL', 'SENTINEL_APPROACH_TAG', 'SENTINEL_FRAMEWORK']) expect(attributed(optionMarkup, marker)).toBe(true);
    await service.selectApproach(ctx, { sessionId: read.id, optionIds: [option.id], overlays: ['bookends'], rationale: 'This structure fits repeated practice.' });
    const plan = await service.previewProvisionPlan(ctx, { sessionId: read.id });
    const generated = plan.modules.find(module => module.key.startsWith('module-'))!;
    generated.title = 'SENTINEL_PREVIEW_TITLE';
    generated.lessons[0].title = 'SENTINEL_LESSON_TITLE';
    const client = new QueryClient();
    client.setQueryData(['previewProvisionPlan', { sessionId: read.id }], plan);
    const markup = render(createElement(Preview, { session: (await ctx.repo.getDesignSession(read.id))! }), client);
    expect(attributed(markup, 'SENTINEL_PREVIEW_TITLE')).toBe(true);
    expect(attributedInside(markup, 'SENTINEL_PREVIEW_TITLE', 'select')).toBe(true);
    expect(attributed(markup, 'SENTINEL_LESSON_TITLE')).toBe(true);
    expect(attributed(markup, 'Exactly what this plan will create')).toBe(false);
  });

  it('requires the displayed draft wording to match the saved wording before keep', () => {
    const saved = [{ id: 'draft-one', text: 'Fictional saved outcome' }];
    expect(canKeepOutcome({ id: 'draft-one', text: 'Fictional saved outcome' }, saved)).toBe(true);
    expect(canKeepOutcome({ id: 'draft-one', text: 'Unsaved edit' }, saved)).toBe(false);
  });

  it('uses saved outcome provenance through draft, keep, and person edit', async () => {
    const { ctx, read } = await setup();
    const existing = await ctx.repo.listOutcomes(read.courseId);
    const drafted = await service.saveOutcomes({ ...ctx, agent: { name: 'Fictional assistant' } }, { courseId: read.courseId, outcomes: [...existing.map(({ id, text }) => ({ id, text })), { text: 'SENTINEL_OUTCOME' }] });
    const draft = drafted.find(item => item.text === 'SENTINEL_OUTCOME')!;
    read.created.outcomeIds = [draft.id];
    read.confirmedOutcomes = [{ code: 'O1', text: 'SENTINEL_OUTCOME', originalText: '', source: 'instructor', submittedBy: { kind: 'agent', name: 'Fictional assistant' } }];
    read.plan = { counts: { lessons: 1 }, outcomes: [{ code: draft.code }] } as DesignSession['plan'];
    const show = async () => {
      const client = new QueryClient();
      client.setQueryData(['listOutcomes', { courseId: read.courseId }], await ctx.repo.listOutcomes(read.courseId));
      return render(createElement(MemoryRouter, null, createElement(DraftReady, { session: read })), client);
    };
    const draftMarkup = await show();
    expect(attributed(draftMarkup, 'SENTINEL_OUTCOME')).toBe(true);
    expect(draftMarkup).toContain('data-state="draft"');
    expect(draftMarkup).toContain('Fictional assistant');
    expect(draftMarkup).toContain('Keep outcome');
    await service.keepOutcome(ctx, { courseId: read.courseId, outcomeId: draft.id, expectedText: draft.text });
    const keptMarkup = await show();
    expect(attributed(keptMarkup, 'SENTINEL_OUTCOME')).toBe(true);
    expect(keptMarkup).toContain('data-state="kept"');
    expect(keptMarkup).toContain(`kept by ${ctx.user!.name}`);
    const kept = await ctx.repo.listOutcomes(read.courseId);
    await service.saveOutcomes(ctx, { courseId: read.courseId, outcomes: kept.map(item => ({ id: item.id, text: item.id === draft.id ? 'PERSON_REVISED_OUTCOME' : item.text })) });
    const editedMarkup = await show();
    expect(editedMarkup).toContain('PERSON_REVISED_OUTCOME');
    expect(attributed(editedMarkup, 'PERSON_REVISED_OUTCOME')).toBe(false);
    expect(editedMarkup).not.toContain('Fictional assistant');
  });
});

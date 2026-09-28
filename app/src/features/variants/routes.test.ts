import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { seedData } from '../../../../shared/seed';
vi.stubGlobal('location', { search: '' });
const { ReadableBlock, audienceName, syncText } = await import('./routes');

describe('variant presentation', () => {
  it('names the audience and explains changed master blocks in words', () => {
    expect(audienceName('plain')).toBe('Plain language');
    expect(audienceName('micro')).toBe('15-minute version');
    const variant = { lessonId: 'v', masterLessonId: 'm', audience: 'plain' as const, title: 'Variant', minutes: 10, status: 'draft' as const, syncedAt: '2026-09-27T00:00:00.000Z', divergedBlocks: 2, uncoveredBlocks: 1 };
    expect(syncText(variant)).toBe('2 changed in the master · 1 new in the master');
    expect(syncText({ ...variant, divergedBlocks: 0, uncoveredBlocks: 0 })).toBe('In sync with the master');
  });
  it('marks AI draft content with its source on the compare page', () => {
    const block = seedData().blocks.find(b => b.id === 'b-s3-3')!;
    const html = renderToStaticMarkup(createElement(ReadableBlock, { block }));
    expect(html).toContain('data-state="draft"');
    expect(html).toContain('AI variant draft');
    expect(html).toContain(block.provenance!.model);
    expect(html).toContain(block.provenance!.summary);
  });
});

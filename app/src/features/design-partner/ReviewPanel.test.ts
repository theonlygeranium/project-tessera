import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Block } from '../../../../shared/domain';
import { AlternativeOpening, QuickDraftControls } from './ReviewPieces';

describe('design review controls', () => {
  it('keeps quick drafts disabled with a save-first message while blocks are dirty', () => {
    const dirty = renderToStaticMarkup(createElement(QuickDraftControls, { dirty: true, pending: false, onDraft: () => {} }));
    expect(dirty).toContain('Save your changes first');
    expect(dirty.match(/disabled=""/g)).toHaveLength(3);
    const saved = renderToStaticMarkup(createElement(QuickDraftControls, { dirty: false, pending: false, onDraft: () => {} }));
    expect(saved).not.toContain('Save your changes first');
    expect(saved).not.toContain('disabled=""');
  });
  it('renders alternative opening text with Marginalia state and its actual provenance', () => {
    const block = { id: 'b-alt', lessonId: 'l-one', type: 'document', title: 'Alternative opening A', sections: [{ heading: 'Opening', text: 'Compare the two cases.' }], origin: 'ai', aiState: 'draft', provenance: { model: 'fixture', task: 'module-scaffold', generatedAt: '2026-09-28T12:00:00Z', sources: [], summary: 'Drafted from this syllabus' }, previous: null, position: 0, updatedAt: '2026-09-28T12:00:00Z' } as Extract<Block, { type: 'document' }>;
    const draft = renderToStaticMarkup(createElement(AlternativeOpening, { block, onReview: () => {} }));
    expect(draft).toContain('class="ai ai--block" data-state="draft"');
    expect(draft).toContain('class="ai-src"');
    expect(draft).toContain('Drafted from this syllabus');
    expect(draft).toContain('Compare the two cases.');
    expect(renderToStaticMarkup(createElement(AlternativeOpening, { block: { ...block, aiState: 'kept' }, onReview: () => {} }))).toContain('data-state="kept"');
  });
});

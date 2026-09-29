import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { Object.defineProperty(globalThis, 'location', { value: { search: '' }, configurable: true }); });
import { AiContent } from '../../components';
import type { Outcome } from '../../../../shared/domain';
import { outcomeMarker } from './OutcomesPage';

it('renders a kept outcome with its assistant and keeper inside AiContent', () => {
  const row: Outcome = { id: 'o-fictional', courseId: 'c-fictional', code: 'O1', text: 'Compare fictional methods.', position: 0, provenance: { model: 'Fictional assistant', task: 'agent', generatedAt: '2026-09-28T12:00:00Z', sources: [], summary: 'Outcome from fictional course plan', keptBy: 'Fictional instructor', keptAt: '2026-09-28T12:01:00Z' } };
  const marker = outcomeMarker(row)!;
  const html = renderToStaticMarkup(createElement(AiContent, { kind: 'block', state: 'kept', ...marker, children: row.text }));
  expect(html).toContain('data-state="kept"');
  expect(html).toContain('Suggested by Fictional assistant');
  expect(html).toContain('kept by Fictional instructor');
  expect(html).toContain('Outcome from fictional course plan');
  expect(outcomeMarker({ ...row, provenance: undefined })).toBeNull();
});

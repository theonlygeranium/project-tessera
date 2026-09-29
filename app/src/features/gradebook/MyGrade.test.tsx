import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Output } from '../../../../shared/api';
import { GradeFeedback } from './GradeFeedback';

type Item = Output<'getMyGrade'>['items'][number];
const base = { assignmentId: 'draft', state: 'graded', score: 36, feedback: 'Clear evidence.', studentNote: null } satisfies Item;

describe('Your grade feedback', () => {
  it('attributes released AI feedback and leaves human feedback plain', () => {
    const ai = renderToStaticMarkup(<GradeFeedback item={{ ...base, feedbackOrigin: 'ai', feedbackProvenance: { model: 'fixture', task: 'feedback', generatedAt: '2026-02-01T00:00:00.000Z', sources: [], summary: 'Rubric feedback' } }} />);
    expect(ai).toContain('ai ai--note');
    expect(ai).toContain('Drafted with AI');
    expect(ai).toContain('fixture · reviewed by your instructor');
    expect(ai).toContain('Clear evidence.');
    const human = renderToStaticMarkup(<GradeFeedback item={{ ...base, feedbackOrigin: 'human' }} />);
    expect(human).toContain('Feedback: Clear evidence.');
    expect(human).not.toContain('ai--note');
    expect(renderToStaticMarkup(<GradeFeedback item={{ ...base, feedback: null }} />)).toBe('');
  });
});

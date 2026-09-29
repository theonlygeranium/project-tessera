import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Grade } from '../../../../shared/domain';
import { FeedbackSent } from './FeedbackSent';

const human: Grade = {
  score: 36,
  criteria: [],
  feedback: 'Clear evidence.',
  feedbackOrigin: 'human',
  feedbackProvenance: null,
  gradedBy: 'instructor',
  gradedAt: '2026-02-01T00:00:00.000Z',
  releasedAt: null,
};
const provenance: NonNullable<Grade['feedbackProvenance']> = { model: 'fixture', task: 'feedback', generatedAt: '2026-02-01T00:00:00.000Z', sources: [], summary: 'Rubric feedback' };

describe('Release preview feedback sent', () => {
  it('attributes kept AI feedback and leaves human feedback plain', () => {
    const ai = renderToStaticMarkup(<FeedbackSent grade={{ ...human, feedbackOrigin: 'ai', feedbackProvenance: provenance }} />);
    expect(ai).toContain('ai ai--note');
    expect(ai).toContain('Drafted with AI');
    expect(ai).toContain('fixture · reviewed by your instructor');
    expect(ai).toContain('Clear evidence.');

    const humanMarkup = renderToStaticMarkup(<FeedbackSent grade={human} />);
    expect(humanMarkup).toBe('Clear evidence.');
    expect(humanMarkup).not.toContain('ai--note');
    expect(renderToStaticMarkup(<FeedbackSent grade={{ ...human, feedbackProvenance: provenance }} />)).toContain('ai ai--note');
    expect(renderToStaticMarkup(<FeedbackSent grade={{ ...human, feedback: '' }} />)).toBe('No feedback');
  });
});

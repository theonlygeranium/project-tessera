import { describe, expect, it } from 'vitest';
import type { AiPolicy } from '../domain';
import { allowedModes, decide, defaultMode, effectiveMode, leaksAnswer, visibilityText } from './policy';

const policy: AiPolicy = { aiAuthoring: true, tutorModes: { graded: ['off', 'hints', 'explain', 'open'], practice: ['off', 'hints', 'explain', 'open'] } };

describe('tutor policy (D-005)', () => {
  it('never allows Open on graded work, even if the policy lists it', () => {
    expect(allowedModes('assignment', policy)).toEqual(['off', 'hints', 'explain']);
    expect(allowedModes('lesson', policy)).toEqual(['off', 'hints', 'explain', 'open']);
    expect(effectiveMode('assignment', policy, { mode: 'open' })).toBe('hints');
  });

  it('defaults to Hints, or the most limited allowed mode', () => {
    expect(defaultMode('lesson', policy)).toBe('hints');
    expect(defaultMode('lesson', { ...policy, tutorModes: { graded: [], practice: ['explain', 'open'] } })).toBe('explain');
    expect(defaultMode('assignment', { ...policy, tutorModes: { graded: [], practice: [] } })).toBe('off');
  });

  it('journey 10: asking for the answer on graded work gets a hint; practice in Open mode gets the answer', () => {
    expect(decide({ mode: 'explain', activityKind: 'assignment', intent: 'answer', hintsUsed: 0, maxHints: 2 })).toMatchObject({ kind: 'hint', hintNumber: 1, note: expect.stringMatching(/graded/) });
    expect(decide({ mode: 'open', activityKind: 'lesson', intent: 'answer', hintsUsed: 0, maxHints: 2 }).kind).toBe('answer');
    expect(decide({ mode: 'hints', activityKind: 'lesson', intent: 'answer', hintsUsed: 0, maxHints: 2 }).kind).toBe('hint');
  });

  it('counts hints and says plainly when they run out', () => {
    expect(decide({ mode: 'hints', activityKind: 'lesson', intent: 'hint', hintsUsed: 1, maxHints: 2 })).toMatchObject({ kind: 'hint', hintNumber: 2 });
    expect(decide({ mode: 'hints', activityKind: 'lesson', intent: 'hint', hintsUsed: 2, maxHints: 2 })).toMatchObject({ kind: 'refusal', note: expect.stringMatching(/used all 2 hints/) });
    expect(decide({ mode: 'explain', activityKind: 'assignment', intent: 'hint', hintsUsed: 2, maxHints: 2 }).kind).toBe('explain');
    expect(decide({ mode: 'off', activityKind: 'lesson', intent: 'chat', hintsUsed: 0, maxHints: 2 }).kind).toBe('refusal');
    // Free-typed chat can't get around the mode (Codex review 4).
    expect(decide({ mode: 'hints', activityKind: 'assignment', intent: 'chat', hintsUsed: 0, maxHints: 2 })).toMatchObject({ kind: 'hint', hintNumber: 1 });
    expect(decide({ mode: 'hints', activityKind: 'lesson', intent: 'chat', hintsUsed: 2, maxHints: 2 }).kind).toBe('refusal');
    expect(decide({ mode: 'explain', activityKind: 'assignment', intent: 'chat', hintsUsed: 0, maxHints: 2 }).kind).toBe('explain');
    expect(decide({ mode: 'open', activityKind: 'lesson', intent: 'chat', hintsUsed: 0, maxHints: 2 }).kind).toBe('chat');
    expect(decide({ mode: 'hints', activityKind: 'lesson', intent: 'explain', hintsUsed: 0, maxHints: 2 }).kind).toBe('hint');
  });

  it('tells the student the mode, who set it, and what the instructor sees', () => {
    const text = visibilityText('hints', 'Dr. Amara Okafor', 2);
    expect(text).toMatch(/Dr. Amara Okafor set the tutor to Hints/);
    expect(text).toMatch(/not your messages/);
  });

  it('catches replies that give away the correct option', () => {
    const key = [{ correctText: 'How long do students here sleep?', correctLabel: 'b' }];
    expect(leaksAnswer('The best choice is: how long do students here sleep?', key)).toBe(true);
    expect(leaksAnswer('The answer is B.', key)).toBe(true);
    expect(leaksAnswer('Think about which question would get many different answers.', key)).toBe(false);
    const keyA = [{ correctText: 'How many hours do students study each week?', correctLabel: 'a' }];
    for (const hint of ['Choose a question that would get different answers from different people.', 'The best answer is a question whose answers vary.', 'Pick a detail from the lesson.']) expect(leaksAnswer(hint, keyA)).toBe(false);
    for (const leak of ['Pick option A.', 'It is (a).', 'The answer is a.', 'A is correct.']) expect(leaksAnswer(leak, keyA)).toBe(true);
  });
});

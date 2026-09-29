import { describe, expect, it } from 'vitest';
import type { GradeChangeSet, GradeEvent, Submission } from '../../../../shared/domain';
import { readyForRelease, releaseCompletion, releaseConflict, releaseRequest, undoReleaseRequest } from './release-model';
import { canUndoGradeEvent } from './history-model';
import { changedReasonSentences, whatIfEligible, whatIfScores } from './what-if-input';
import { goldenInput, pendingItem } from '../../../../shared/grading/golden.fixture';
import { whatIf } from '../../../../shared/grading/what-if';

describe('M5 release and student controls', () => {
  it('keeps unreviewed drafts out of the release request and sends the preview hash', () => {
    const preview: GradeChangeSet = { kind: 'release', changes: [], unchanged: 0, letterChanges: 0, notSent: [{ submissionId: 'draft', studentId: 'u-priya', reason: 'ai-draft-not-reviewed' }], hash: 'reviewed-snapshot' };
    const base = { id: 'ready', state: 'graded', grade: { score: 9 } } as Submission;
    const submissions = [base, { ...base, id: 'draft', feedbackDraft: { text: 'Draft' } }, { ...base, id: 'released', state: 'returned' }] as Submission[];
    expect(readyForRelease(submissions, preview).map(s => s.id)).toEqual(['ready']);
    expect(releaseRequest('project', preview)).toEqual({ assignmentId: 'project', hash: 'reviewed-snapshot' });
    expect(releaseConflict({ code: 'conflict' })).toBe(true);
    expect(releaseConflict({ code: 'invalid' })).toBe(false);
  });
  it('undoes the released assignment after the picker changes', async () => {
    const preview: GradeChangeSet = { kind: 'release', changes: [], unchanged: 0, letterChanges: 0, notSent: [], hash: 'draft-hash' };
    const released = new Map([['draft', false], ['q4', true]]);
    const releaseGrades = async ({ assignmentId }: { assignmentId: string }) => { released.set(assignmentId, true); };
    const unreleaseGrades = async ({ assignmentId }: { assignmentId: string }) => { released.set(assignmentId, false); };
    let selected = 'draft';
    const request = releaseRequest(selected, preview);
    await releaseGrades(request);
    const completed = releaseCompletion(request, Date.now());
    selected = 'q4';
    await unreleaseGrades(undoReleaseRequest(completed));
    expect(selected).toBe('q4');
    expect(released.get('draft')).toBe(false);
    expect(released.get('q4')).toBe(true);
  });
  it('offers only items without released scores as what-if inputs', () => {
    const items = [
      { assignmentId: 'released', state: 'graded', score: 8 },
      { assignmentId: 'held', state: 'held', score: null },
      { assignmentId: 'future', state: 'not-due', score: null },
      { assignmentId: 'excused', state: 'excused', score: null },
    ] as Parameters<typeof whatIfEligible>[0][];
    expect(items.filter(whatIfEligible).map(i => i.assignmentId)).toEqual(['held', 'future']);
    expect(whatIfScores(items, { released: '9', held: '7', future: '20' }, new Map([['released', 10], ['held', 10], ['future', 10]]))).toEqual([{ assignmentId: 'held', score: 7 }]);
  });
  it('renders changed calculation reasons as sentences instead of engine codes', () => {
    const input = goldenInput('u-priya');
    input.items.push(pendingItem('q4', 'Quiz 4', 'quiz', 20, 13));
    const result = whatIf(input, [{ assignmentId: 'q4', score: 17 }]);
    const sentences = changedReasonSentences({ trace: result.trace, delta: result.delta, changedReasons: result.changedReasons, needed: null });
    expect(sentences).toContain('Lowest score dropped: Quiz 1, 16.');
    expect(sentences.every(sentence => sentence.endsWith('.'))).toBe(true);
  });
  it('hides Undo on undo events and already undone events', () => {
    const event = { id: 'one', kind: 'score' } as GradeEvent;
    expect(canUndoGradeEvent(event, new Set())).toBe(true);
    expect(canUndoGradeEvent(event, new Set(['one']))).toBe(false);
    expect(canUndoGradeEvent({ ...event, kind: 'undo' }, new Set())).toBe(false);
  });
});

import type { GradeEvent } from '../../../../shared/domain';

export const canUndoGradeEvent = (event: GradeEvent, undone: ReadonlySet<string>) => event.kind !== 'undo' && !undone.has(event.id);
export const gradeEventLabel = (kind: GradeEvent['kind']) => ({
  score: 'Score recorded', override: 'Score override', excuse: 'Excused', unexcuse: 'Excuse removed',
  missing: 'Missing state changed', extension: 'Due date extended', 'late-waiver': 'Late penalty waived',
  'final-override': 'Final grade override', release: 'Grades released', unrelease: 'Release undone',
  setup: 'Grade setup changed', undo: 'Change undone',
})[kind];

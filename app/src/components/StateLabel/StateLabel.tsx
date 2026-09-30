import type { CellState } from '../../../../shared/grading/types';
import styles from './StateLabel.module.css';

export type GradeState = CellState | 'feedback-draft';
export const stateWords: Record<GradeState, string> = {
  graded: 'graded', late: 'late', missing: 'missing', excused: 'excused', dropped: 'dropped',
  override: 'override', held: 'held', 'feedback-draft': 'feedback draft', 'to-grade': 'to grade',
  'extra-credit': 'extra credit', 'not-submitted': 'not submitted', 'not-due': 'not due', 'what-if': 'what-if',
};
const path: Record<GradeState, string> = {
  graded: '', late: 'M8 3a5 5 0 1 0 0 10a5 5 0 0 0 0-10m0 2v3l2 1',
  missing: 'M8 2a6 6 0 1 0 0 12a6 6 0 0 0 0-12M4 4l8 8',
  excused: 'M8 2a6 6 0 1 0 0 12a6 6 0 0 0 0-12M5 8h6',
  dropped: 'M8 2v9m-3-3l3 3 3-3M3 14h10', override: 'M3 11l8-8 2 2-8 8-3 1 1-3',
  held: 'M2 8s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4M3 3l10 10',
  'feedback-draft': 'M2 11l6-6 6 6M2 14h12', 'to-grade': 'M2 10h3l1 2h4l1-2h3M3 3h10l1 8v2H2v-2l1-8',
  'extra-credit': 'M8 3v10M3 8h10', 'not-submitted': 'M3 8h10', 'not-due': 'M8 2v6l3 2M8 2a6 6 0 1 0 0 12a6 6 0 0 0 0-12',
  'what-if': 'M2 6a6 6 0 0 1 12 0M2 10a6 6 0 0 0 12 0M8 5v3l2 1',
};
export function StateLabel({ state, label, className }: { state: GradeState; label?: string; className?: string }) {
  return <span className={[styles.label, styles[state.replaceAll('-', '')], className].filter(Boolean).join(' ')}>
    {state !== 'graded' && <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path[state]} /></svg>}
    <span>{label ?? stateWords[state]}</span>
  </span>;
}

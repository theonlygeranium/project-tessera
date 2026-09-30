import { memo } from 'react';
import type { CellState } from '../../../../shared/grading/types';
import { StateLabel, type GradeState, stateWords } from '../StateLabel/StateLabel';
import styles from './GradeCell.module.css';

export interface GradeCellProps {
  display: { state: CellState; adjusted: number | null; label: string };
  raw?: number | null; points?: number; student: string; item: string;
  active?: boolean; editing?: boolean; readOnly?: boolean; feedbackDraft?: boolean;
  'aria-label'?: string;
}
export function gradeCellText({ display, points, student, item, feedbackDraft }: GradeCellProps): string {
  const number = display.state === 'excused' ? 'EX' : display.adjusted === null ? 'no score' : `${display.adjusted}${points === undefined ? '' : ` of ${points}`}`;
  const state = display.state === 'graded' ? '' : display.label || stateWords[display.state];
  return [student, item, number, state, feedbackDraft ? 'feedback draft, not reviewed' : ''].filter(Boolean).join(', ');
}
export const GradeCell = memo(function GradeCell(props: GradeCellProps) {
  const { display, raw, active, editing, readOnly, feedbackDraft } = props;
  const state: GradeState = display.state;
  const number = state === 'excused' ? 'EX' : display.adjusted === null ? '–' : `${state === 'extra-credit' ? '+' : ''}${display.adjusted}`;
  return <span className={[styles.cell, styles[state.replaceAll('-', '')], active && styles.active, editing && styles.editing, readOnly && styles.readOnly].filter(Boolean).join(' ')} aria-label={props['aria-label'] ?? gradeCellText(props)}>
    <span className={styles.number}>{number}</span>
    {state !== 'graded' && state !== 'extra-credit' && <StateLabel state={state} label={display.label || undefined} />}
    {feedbackDraft && <StateLabel state="feedback-draft" />}
    {raw !== undefined && raw !== null && raw !== display.adjusted && <span className={styles.raw} aria-hidden="true">raw {raw}</span>}
  </span>;
});

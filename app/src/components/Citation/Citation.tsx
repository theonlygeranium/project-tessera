import { useId } from 'react';
import type { SourceSpan } from '../../../../shared/domain';
import styles from './Citation.module.css';

export function citationLabel(span: SourceSpan, full = false): string {
  if (span.page !== null) return `p. ${span.page}`;
  if (span.section) return `§ ${full || span.section.length <= 28 ? span.section : `${span.section.slice(0, 28)}…`}`;
  return 'pasted';
}

export function Citation({ span }: { span: SourceSpan }) {
  const description = useId();
  return <span className={styles.wrap}><button type="button" className={styles.chip} aria-describedby={description}>{citationLabel(span)}</button><span id={description} role="tooltip" className={styles.tooltip}>{span.section ? `${citationLabel(span, true)} · ` : ''}{span.text}</span></span>;
}

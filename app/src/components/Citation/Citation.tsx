import { useId } from 'react';
import type { SourceSpan } from '../../../../shared/domain';
import styles from './Citation.module.css';

export function Citation({ span }: { span: SourceSpan }) {
  const description = useId();
  return <span className={styles.wrap}><button type="button" className={styles.chip} aria-describedby={description}>{span.page === null ? 'Pasted text' : `p. ${span.page}`}</button><span id={description} role="tooltip" className={styles.tooltip}>{span.text}</span></span>;
}

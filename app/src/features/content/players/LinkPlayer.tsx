import type { LinkContent } from '../model';
import styles from './players.module.css';

export function LinkPlayer({ value }: { value: LinkContent }) {
  const external = /^https?:\/\//.test(value.href.trim());
  return <p className={styles.player}>
    {value.text.trim() && (external
      ? <a href={value.href} rel="noopener noreferrer">{value.text}</a>
      : <span>{value.text}</span>)}
    {value.description.trim() && <span className={styles.linkDescription}>{value.text.trim() ? ' ' : ''}{value.description}</span>}
  </p>;
}

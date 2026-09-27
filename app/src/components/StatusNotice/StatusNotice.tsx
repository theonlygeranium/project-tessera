import type { HTMLAttributes, ReactNode } from 'react';
import styles from './StatusNotice.module.css';
export type StatusNoticeProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> & {
  tone: 'info' | 'success' | 'warning' | 'error' | 'policy';
  title?: string; children: ReactNode; action?: ReactNode; onDismiss?: () => void;
  live?: 'polite' | 'assertive' | 'off';
};
const labels = { info: 'Info', success: 'Success', warning: 'Warning', error: 'Error', policy: 'Policy' };
const marks = { info: 'ⓘ', success: '✓', warning: '!', error: '×', policy: '🔒' };
export function StatusNotice({ tone, title, children, action, onDismiss, live, className, ...props }: StatusNoticeProps) {
  const announcement = live ?? (tone === 'error' ? 'assertive' : tone === 'warning' ? 'off' : 'polite');
  return <div {...props} className={[styles.notice, styles[tone], className].filter(Boolean).join(' ')} aria-live={announcement}>
    <span className={styles.icon} aria-hidden="true">{marks[tone]}</span>
    <div className={styles.content}><span className={styles.heading}>{labels[tone]}: {title && <strong>{title}</strong>}</span><div>{children}</div>{action && <div className={styles.action}>{action}</div>}</div>
    {onDismiss && <button className={styles.dismiss} type="button" onClick={onDismiss} aria-label="Dismiss notice">×</button>}
  </div>;
}

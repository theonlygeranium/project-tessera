import type { HTMLAttributes, ReactNode } from 'react';
import styles from './StatusChip.module.css';

export type StatusChipProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  tone: 'neutral' | 'accent' | 'ai' | 'success' | 'warning' | 'error';
  icon?: ReactNode;
  children: string;
};

export function StatusChip({ tone, icon, children, className, ...spanProps }: StatusChipProps) {
  return (
    <span {...spanProps} className={[styles.chip, styles[tone], className].filter(Boolean).join(' ')}>
      {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

type CardBase = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  density?: 'learner' | 'compact';
  as?: 'div' | 'section' | 'article';
  children: ReactNode;
};

export type CardProps = CardBase & (
  | { variant?: 'default' | 'quiet'; href?: never }
  | { variant: 'interactive'; href: string }
);

export function Card({ variant = 'default', density = 'learner', as: Element = 'div',
  href, children, className, ...elementProps }: CardProps) {
  const classes = [styles.card, styles[variant], styles[density], className].filter(Boolean).join(' ');
  return (
    <Element {...elementProps} className={classes}>
      {variant === 'interactive' && href
        ? <a className={styles.link} href={href}>{children}</a>
        : children}
    </Element>
  );
}

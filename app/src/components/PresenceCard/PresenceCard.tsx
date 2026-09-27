import type { HTMLAttributes, ReactNode } from 'react';
import styles from './PresenceCard.module.css';

export type PresenceCardProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'> & {
  name: string;
  role?: string;
  initials: string;
  time: string;
  dateTime?: string;
  title?: string;
  children: ReactNode;
  pinned?: boolean;
  unread?: boolean;
  actions?: ReactNode;
  headingLevel?: 2 | 3 | 4;
};

export function PresenceCard({ name, role, initials, time, dateTime, title, children, pinned, unread, actions, headingLevel = 3, className, ...articleProps }: PresenceCardProps) {
  const Heading = `h${headingLevel}` as const;
  return <article {...articleProps} className={[styles.card, className].filter(Boolean).join(' ')}>
    <div className={styles.avatar} aria-hidden="true">{initials}</div><div className={styles.body}>
      <div className={styles.byline}><strong>{name}</strong>{role && <span>{role}</span>}<time dateTime={dateTime}>{time}</time></div>
      {(pinned || unread) && <div className={styles.labels}>{pinned && <span className={styles.label}>Pinned</span>}{unread && <span className={styles.label}>New<span className={styles.srOnly}> unread message</span></span>}</div>}
      {title && <Heading className={styles.title}>{title}</Heading>}
      <div className={styles.message}>{children}</div>{actions && <div className={styles.actions}>{actions}</div>}
    </div>
  </article>;
}

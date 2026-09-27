import type { AnchorHTMLAttributes, ReactNode } from 'react';
import type { LinkRenderProps } from '../links';
import styles from './TaskCard.module.css';

export type TaskCardProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'href' | 'title'> & {
  title: string;
  context: string;
  minutes?: number;
  due?: string;
  urgency?: 'normal' | 'soon' | 'overdue';
  state?: 'todo' | 'in-progress' | 'done';
  href: string;
  actionLabel: string;
  renderLink?: (props: LinkRenderProps) => ReactNode;
};

export function TaskCard({ title, context, minutes, due, urgency = 'normal', state = 'todo', href, actionLabel, renderLink, className, ...anchorProps }: TaskCardProps) {
  const content = <><span className={styles.context}>{context}</span><span className={styles.title}>{title}</span><span className={styles.details}>
    <span className={styles.state}>{state === 'in-progress' ? 'In progress' : state === 'done' ? 'Done' : 'To do'}</span>
    {minutes !== undefined && <span>{minutes} min</span>}
    {due && <span>{due}</span>}
    {urgency !== 'normal' && <span className={[styles.urgency, styles[urgency]].filter(Boolean).join(' ')}>{urgency === 'soon' ? 'Due soon' : 'Overdue'}</span>}
  </span><span className={styles.action}>{actionLabel} <span aria-hidden="true">→</span></span></>;
  const props: LinkRenderProps = { href, className: [styles.card, className].filter(Boolean).join(' '), children: content };
  return renderLink ? renderLink(props) : <a {...anchorProps} {...props} />;
}

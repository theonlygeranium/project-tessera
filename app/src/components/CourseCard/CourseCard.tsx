import type { AnchorHTMLAttributes, ReactNode } from 'react';
import type { LinkRenderProps } from '../links';
import styles from './CourseCard.module.css';

export type CourseCardProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'href' | 'title'> & {
  title: string;
  code?: string;
  term?: string;
  instructor?: string;
  progress?: number;
  status: 'not-started' | 'active' | 'completed' | 'draft';
  href: string;
  meta?: string;
  renderLink?: (props: LinkRenderProps) => ReactNode;
};

const statusLabels = { 'not-started': 'Not started', active: 'Active', completed: 'Completed', draft: 'Draft' };

export function CourseCard({ title, code, term, instructor, progress, status, href, meta, renderLink, className, ...anchorProps }: CourseCardProps) {
  const percent = progress === undefined ? undefined : Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const content = <><span className={styles.top}><span className={styles.code}>{code}</span><span className={styles.status}>{statusLabels[status]}</span></span>
    <span className={styles.title}>{title}</span><span className={styles.details}>{term && <span>{term}</span>}{instructor && <span>{instructor}</span>}{meta && <span>{meta}</span>}</span>
    {percent !== undefined && <span className={styles.progress}><span className={styles.track}><span className={styles.fill} style={{ width: `${percent}%` }} /></span><span>{percent}% complete</span></span>}
  </>;
  const props: LinkRenderProps = { href, className: [styles.card, className].filter(Boolean).join(' '), children: content };
  return renderLink ? renderLink(props) : <a {...anchorProps} {...props} />;
}

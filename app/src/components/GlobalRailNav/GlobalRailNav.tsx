import type { HTMLAttributes, ReactNode } from 'react';
import type { LinkRenderProps } from '../links';
import styles from './GlobalRailNav.module.css';

export type GlobalRailNavProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  label: string;
  items: { id: string; label: string; href: string; icon: ReactNode; badge?: number }[];
  currentId?: string;
  header?: ReactNode;
  footer?: ReactNode;
  renderLink?: (props: LinkRenderProps) => ReactNode;
};

export function GlobalRailNav({ label, items, currentId, header, footer, renderLink, className, ...navProps }: GlobalRailNavProps) {
  return <nav {...navProps} aria-label={label} className={[styles.rail, className].filter(Boolean).join(' ')}>
    {header && <div className={styles.header}>{header}</div>}
    <ul className={styles.list}>{items.map((item) => {
      const current = item.id === currentId;
      const content = <><span aria-hidden="true" className={styles.icon}>{item.icon}</span><span>{item.label}</span>{item.badge !== undefined && <span className={styles.badge}><span aria-hidden="true">{item.badge}</span><span className={styles.srOnly}>{item.badge} unread</span></span>}</>;
      const linkProps: LinkRenderProps = { href: item.href, className: [styles.link, current && styles.current].filter(Boolean).join(' '), children: content, 'aria-current': current ? 'page' : undefined };
      return <li key={item.id}>{renderLink ? renderLink(linkProps) : <a {...linkProps} />}</li>;
    })}</ul>
    {footer && <div className={styles.footer}>{footer}</div>}
  </nav>;
}

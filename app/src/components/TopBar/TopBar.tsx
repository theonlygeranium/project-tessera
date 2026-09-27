import type { HTMLAttributes, ReactNode } from 'react';
import type { LinkRenderProps } from '../links';
import styles from './TopBar.module.css';

export type TopBarProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'> & {
  title: string;
  eyebrow?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: ReactNode;
  headingLevel?: 1 | 2;
  renderLink?: (props: LinkRenderProps) => ReactNode;
};

export function TopBar({ title, eyebrow, breadcrumbs, actions, headingLevel = 1, renderLink, className, ...headerProps }: TopBarProps) {
  const Heading = `h${headingLevel}` as const;
  return <header {...headerProps} className={[styles.bar, className].filter(Boolean).join(' ')}>
    <div className={styles.main}>
      {breadcrumbs && breadcrumbs.length > 0 && <nav aria-label="Breadcrumb"><ol className={styles.crumbs}>{breadcrumbs.map((crumb, index) => {
        const last = index === breadcrumbs.length - 1;
        const props: LinkRenderProps = { href: crumb.href ?? '', className: styles.crumbLink, children: crumb.label };
        return <li key={`${crumb.label}-${index}`} aria-current={last ? 'page' : undefined}>{!last && crumb.href ? (renderLink ? renderLink(props) : <a {...props} />) : <span>{crumb.label}</span>}</li>;
      })}</ol></nav>}
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <Heading className={styles.title}>{title}</Heading>
    </div>
    {actions && <div className={styles.actions}>{actions}</div>}
  </header>;
}

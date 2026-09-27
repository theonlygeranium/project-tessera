import type { HTMLAttributes, ReactNode } from 'react';
import type { LinkRenderProps } from '../links';
import styles from './PipelineStepper.module.css';

export type PipelineStepperProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  label: string;
  steps: { id: string; label: string; state: 'complete' | 'current' | 'upcoming'; href?: string }[];
  renderLink?: (props: LinkRenderProps) => ReactNode;
};

export function PipelineStepper({ label, steps, renderLink, className, ...navProps }: PipelineStepperProps) {
  return <nav {...navProps} aria-label={label} className={[styles.stepper, className].filter(Boolean).join(' ')}><ol className={styles.list}>
    {steps.map((step, index) => {
      const current = step.state === 'current';
      const content = <><span className={styles.mark}>{step.state === 'complete' ? <><span aria-hidden="true">✓</span><span className={styles.srOnly}>completed</span></> : index + 1}</span><span>{step.label}</span></>;
      const linkProps: LinkRenderProps = { href: step.href ?? '', className: styles.link, children: content, 'aria-current': current ? 'step' : undefined };
      return <li key={step.id} className={[styles.step, styles[step.state]].filter(Boolean).join(' ')} aria-current={current && !step.href ? 'step' : undefined}>
        {step.href ? (renderLink ? renderLink(linkProps) : <a {...linkProps} />) : <span className={styles.content}>{content}</span>}
      </li>;
    })}
  </ol></nav>;
}

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

type IconContent =
  | { iconOnly: true; icon: ReactNode; 'aria-label': string; children?: never }
  | { iconOnly?: false; icon?: ReactNode; children: ReactNode };

type SharedProps = IconContent & {
  variant?: 'primary' | 'secondary' | 'text';
  density?: 'learner' | 'compact';
  disabled?: boolean;
};

type ButtonElementProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof SharedProps | 'href'> & {
  href?: never;
};
type LinkElementProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof SharedProps | 'href'> & {
  href: string;
};

export type ButtonProps = SharedProps & (ButtonElementProps | LinkElementProps);

export function Button(props: ButtonProps) {
  const variant = props.variant ?? 'secondary';
  const density = props.density ?? 'learner';
  const className = [styles.button, styles[variant], styles[density], props.iconOnly && styles.iconOnly, props.className]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      {props.icon && <span className={styles.icon} aria-hidden="true">{props.icon}</span>}
      {!props.iconOnly && props.children}
    </>
  );

  if (typeof props.href === 'string') {
    const { variant: _variant, density: _density, icon: _icon, iconOnly: _iconOnly, children: _children,
      disabled, className: _className, onClick, ...linkProps } = props;
    return (
      <a
        {...linkProps}
        className={className}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : linkProps.tabIndex}
        onClick={(event) => {
          if (disabled) event.preventDefault();
          else onClick?.(event);
        }}
      >
        {content}
      </a>
    );
  }

  const { variant: _variant, density: _density, icon: _icon, iconOnly: _iconOnly, children: _children,
    className: _className, ...buttonProps } = props;
  return <button {...buttonProps} className={className} type={buttonProps.type ?? 'button'}>{content}</button>;
}

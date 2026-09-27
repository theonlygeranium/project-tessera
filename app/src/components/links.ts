import type { ReactNode } from 'react';

export type LinkRenderProps = {
  href: string;
  className?: string;
  children: ReactNode;
  'aria-current'?: 'page' | 'step' | 'true';
};

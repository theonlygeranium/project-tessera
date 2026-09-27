// Adapts the router's <Link> to the components' router-agnostic `renderLink` prop.
import { Link } from 'react-router';
import type { LinkRenderProps } from '../components';

export const renderRouterLink = ({ href, className, children, ...rest }: LinkRenderProps) => (
  <Link to={href} className={className} aria-current={rest['aria-current']}>{children}</Link>
);

import { Navigate, Outlet } from 'react-router';
import type { Role } from '../../../shared/domain';
import { paths } from '../paths';
import { useSession } from './session';

/** Keeps each persona inside its own area; others are sent to their home. */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useSession();
  return roles.includes(user.role) ? <Outlet /> : <Navigate to={paths.home(user.role)} replace />;
}

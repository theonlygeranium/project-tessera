// Loads the session, then shows the persona picker or the signed-in shell.
import { Navigate, Outlet, useLocation } from 'react-router';
import { useApiQuery } from '../data/hooks';
import { paths } from '../paths';
import { SessionProvider } from './session';
import { SignIn } from './SignIn';
import { ErrorNotice, Loading } from './Status';

export function Root() {
  const session = useApiQuery('getSession', undefined);
  const location = useLocation();
  if (session.isPending) return <main id="main" className="page-pad"><Loading label="Starting Tessera" /></main>;
  if (session.error) return <main id="main" className="page-pad"><ErrorNotice error={session.error} onRetry={() => session.refetch()} /></main>;
  const { user, institution } = session.data;
  if (location.pathname === paths.tokens) return <Outlet />;
  if (!user) {
    return location.pathname === paths.signIn ? <SignIn institutionName={institution.shortName} /> : <Navigate to={paths.signIn} replace />;
  }
  if (location.pathname === paths.signIn || location.pathname === '/') return <Navigate to={paths.home(user.role)} replace />;
  return (
    <SessionProvider value={{ user, institution }}>
      <Outlet />
    </SessionProvider>
  );
}

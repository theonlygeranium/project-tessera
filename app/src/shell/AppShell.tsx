// The signed-in frame: persona rail, main landmark, skip link, institution accent,
// focus management on navigation, and first-run redirects (administrator setup,
// student onboarding).
import { useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation, useMatch, useNavigate } from 'react-router';
import type { Institution } from '../../../shared/domain';
import { ROLE_LABELS } from '../../../shared/policy';
import { Button, GlobalRailNav } from '../components';
import { dataMode } from '../data/client';
import { useApiMutation, useApiQuery } from '../data/hooks';
import { paths } from '../paths';
import { currentNavId, navFor } from './nav';
import { renderRouterLink } from './RouterLink';
import { useSession } from './session';
import styles from './AppShell.module.css';

/** Applies the institution's accent (D-014 setup). Teal keeps the designed tokens. */
function useAccent(institution: Institution) {
  useEffect(() => {
    const root = document.documentElement.style;
    if (institution.accent === 'teal') {
      root.removeProperty('--accent');
      root.removeProperty('--accent-hover');
      root.removeProperty('--accent-soft');
      return;
    }
    root.setProperty('--accent', `var(--accent-option-${institution.accent})`);
    root.setProperty('--accent-hover', 'color-mix(in oklab, var(--accent) 78%, var(--ink))');
    root.setProperty('--accent-soft', 'color-mix(in oklab, var(--accent) 12%, var(--surface))');
  }, [institution.accent]);
}

export function AppShell() {
  const { user, institution } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);
  const courseMatch = useMatch('/teach/courses/:courseId/*');
  const today = useApiQuery('getToday', undefined, { enabled: user.role === 'student' && !!user.profile });
  const signOut = useApiMutation('signOut', { onSuccess: () => navigate(paths.signIn) });
  const who = useApiQuery('whoAmI', undefined);
  const stopViewing = useApiMutation('viewAs');
  useAccent(institution);

  // Move focus to the page on client-side navigation so screen readers start at the new content.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    mainRef.current?.focus();
  }, [location.pathname]);

  if (user.role === 'administrator' && !institution.setupComplete && location.pathname !== paths.admin.setup) {
    return <Navigate to={paths.admin.setup} replace />;
  }
  if (user.role === 'student' && !user.profile && location.pathname !== paths.student.onboarding) {
    return <Navigate to={paths.student.onboarding} replace />;
  }

  const visibility = useApiQuery('getMyVisibility', undefined);
  const team = useApiQuery('getManagerView', undefined);
  const hasManager = (visibility.data?.managers.length ?? 0) > 0;
  const hasReports = (team.data?.rows.length ?? 0) + (team.data?.notSharingCount ?? 0) > 0;
  const items = navFor(user.role, { courseId: courseMatch?.params.courseId, unread: today.data?.unreadCount, hasManager, hasReports });
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">Skip to main content</a>
      <GlobalRailNav
        className={styles.rail}
        layout="wide"
        label={`${ROLE_LABELS[user.role]} navigation`}
        items={items}
        currentId={currentNavId(items, location.pathname)}
        renderLink={renderRouterLink}
        header={<p className={styles.institution}>{institution.shortName}</p>}
        footer={
          <div className={styles.persona}>
            <p className={styles.who}>
              <span className={styles.avatar} aria-hidden="true">{user.initials}</span>
              <span><span className={styles.name}>{user.name}</span><span className={styles.role}>{ROLE_LABELS[user.role]}</span></span>
            </p>
            <Button density="compact" variant="text" onClick={() => signOut.mutate(undefined)}>Switch persona</Button>
          </div>
        }
      />
      <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
        {dataMode === 'mock' && <p className={styles.demo}>Demo data: changes stay in this browser tab and reset on reload.</p>}
        {who.data?.viewingAs && <div className={styles.viewing} role="status"><p>You're viewing Tessera as <strong>{who.data.viewingAs.name}</strong> ({ROLE_LABELS[who.data.viewingAs.role]}). Changes you make are made as them.</p><Button density="compact" onClick={() => stopViewing.mutate({ userId: null }, { onSuccess: () => navigate('/') })}>Stop viewing</Button></div>}
        <Outlet />
      </main>
    </div>
  );
}

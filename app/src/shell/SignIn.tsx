// Demo persona picker (D-014). Cloudflare Access already checked who you are;
// this only chooses which fictional persona to act as.
import { useNavigate } from 'react-router';
import type { Role, User } from '../../../shared/domain';
import { ROLE_LABELS } from '../../../shared/policy';
import { Button } from '../components';
import { useApiMutation, useApiQuery } from '../data/hooks';
import { paths } from '../paths';
import { ErrorNotice, Loading } from './Status';
import { usePageTitle } from './usePageTitle';
import styles from './SignIn.module.css';

const ORDER: Role[] = ['administrator', 'instructor', 'student'];
const BLURB: Record<Role, string> = {
  administrator: 'Set up the institution, people, courses, and AI policy.',
  instructor: 'Build course content by hand or with AI, and post announcements.',
  student: 'Set up a learning profile, follow Today, and work through lessons.',
};

export function SignIn({ institutionName }: { institutionName: string }) {
  usePageTitle('Choose a persona');
  const navigate = useNavigate();
  const users = useApiQuery('listDemoUsers', undefined);
  const signIn = useApiMutation('signIn', { onSuccess: (s) => s.user && navigate(paths.home(s.user.role), { replace: true }) });

  const byRole = (role: Role) => (users.data ?? []).filter((u: User) => u.role === role);
  return (
    <main id="main" className={styles.page}>
      <p className={styles.eyebrow}>{institutionName} · Tessera</p>
      <h1>Choose a persona</h1>
      <p className={styles.lede}>
        Night 1 uses fictional demo accounts. Pick who you want to be; you can switch at any time from the navigation.
      </p>
      {users.isPending && <Loading label="Loading personas" />}
      <ErrorNotice error={users.error ?? signIn.error} />
      <div className={styles.groups}>
        {ORDER.map((role) => (
          <section key={role} className={styles.group} aria-labelledby={`role-${role}`}>
            <h2 id={`role-${role}`}>{ROLE_LABELS[role]}</h2>
            <p className={styles.blurb}>{BLURB[role]}</p>
            <ul className={styles.list}>
              {byRole(role).map((u) => (
                <li key={u.id}>
                  <Button
                    className={styles.person}
                    disabled={signIn.isPending}
                    onClick={() => signIn.mutate({ userId: u.id })}
                    aria-label={`Sign in as ${u.name}, ${ROLE_LABELS[u.role]}`}
                  >
                    <span className={styles.avatar} aria-hidden="true">{u.initials}</span>
                    <span>{u.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { MyVisibility } from '../../../../shared/domain';
import { TopBar } from '../../components';
import { renderRouterLink } from '../../shell/RouterLink';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { ErrorNotice, Loading } from '../../shell/Status';
import { useSession } from '../../shell/session';
import { usePageTitle } from '../../shell/usePageTitle';
import { sharingLabel } from './copy';
import styles from './Managers.module.css';

function ManagerSwitch({ row, onAnnounce }: { row: MyVisibility['managers'][number]; onAnnounce: (message: string) => void }) {
  const save = useApiMutation('setManagerSharing');
  const [sharing, setSharing] = useState(row.sharing);
  const [since, setSince] = useState(row.since);
  const inputRef = useRef<HTMLInputElement>(null);
  const chain = useRef(Promise.resolve());
  const name = row.manager.name;
  useEffect(() => { setSharing(row.sharing); setSince(row.since); }, [row.sharing, row.since]);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.checked;
    setSharing(next);
    chain.current = chain.current.then(async () => {
      try {
        const result = await save.mutateAsync({ managerId: row.manager.id, sharing: next });
        const updated = result.managers.find((item) => item.manager.id === row.manager.id);
        if (updated) { setSharing(updated.sharing); setSince(updated.since); }
        onAnnounce(updated?.sharing ? `Now sharing your required training with ${name}.` : `Stopped sharing your required training with ${name}.`);
      } catch (error) {
        setSharing(!next);
        onAnnounce(error instanceof Error ? error.message : `Couldn't save sharing with ${name}.`);
      } finally {
        inputRef.current?.focus();
      }
    });
  }

  return <label className={styles.switchLabel}>
    <span className={styles.srOnly}>Share with </span>
    <span className={styles.avatar} aria-hidden="true">{row.manager.initials}</span>
    <span className={styles.identity}>
      <strong>{name}</strong>
      <span className={sharing ? styles.sharing : styles.private}>{sharingLabel(sharing, since)}</span>
    </span>
    <input ref={inputRef} className={styles.switch} type="checkbox" role="switch" checked={sharing} onChange={onChange} />
  </label>;
}

export function SharingPage() {
  usePageTitle('Sharing');
  const { user } = useSession();
  const visibility = useApiQuery('getMyVisibility', undefined);
  const [announcement, setAnnouncement] = useState('');
  const breadcrumbs = user.role === 'student'
    ? [{ label: 'Profile', href: paths.student.profile }, { label: 'Who sees this' }]
    : [{ label: 'Who sees this' }];
  return <div className={styles.page}>
    <TopBar title="Share your required training with a manager?" breadcrumbs={breadcrumbs} renderLink={renderRouterLink} />
    <p className={styles.lede}>Nothing is shared until you turn it on. You choose for each manager, and turning it off takes effect right away.</p>
    <p className={styles.live} role="status">{announcement}</p>
    {visibility.isPending ? <Loading label="Loading sharing" /> : visibility.error ? <ErrorNotice error={visibility.error} /> : <>
      {visibility.data.managers.length ? <form className={styles.stack} aria-label="Sharing with managers" onSubmit={(event) => event.preventDefault()}>
        {visibility.data.managers.map((row) => <ManagerSwitch key={row.manager.id} row={row} onAnnounce={setAnnouncement} />)}
      </form> : <p className={styles.empty}>You don&apos;t report to anyone yet. When an administrator adds a manager, sharing starts off.</p>}
      <section id="privacy" aria-labelledby="privacy-title">
        <h2 id="privacy-title" className={styles.srOnly}>What a manager can see</h2>
        <div className={styles.stackPanels}>
          <div className={styles.panel}>
            <h3 className={styles.kicker}>A manager you share with sees</h3>
            <ul>{visibility.data.sees.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className={styles.panel}>
            <h3 className={styles.kicker}>Never, whatever you choose</h3>
            <ul>{visibility.data.neverSees.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>
      </section>
      <p className={styles.fine}>Your administrator records who you report to. If that changes, sharing starts off again for the new manager.</p>
      <p><a className={styles.privacyLink} href="#privacy">How Tessera uses your data</a></p>
    </>}
  </div>;
}

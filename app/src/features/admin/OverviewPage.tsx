// Administrator home: counts, shortcuts, and the demo reset.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Button, Card, StatusNotice, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './Admin.module.css';

function StatTiles({ stats, className }: { stats: { label: string; value: number }[]; className: string }) {
  return (
    <div className={className}>
      {stats.map((stat) => (
        <Card key={stat.label} as="article" density="compact">
          <p className={styles.statValue}>{stat.value}</p>
          <p className={styles.statLabel}>{stat.label}</p>
        </Card>
      ))}
    </div>
  );
}

const LINKS = [
  { href: paths.admin.people, label: 'People', detail: 'Add someone, import a list, or change a role.' },
  { href: paths.admin.courses, label: 'Courses', detail: 'Create a course, then assign instructors and students.' },
  { href: paths.admin.programs, label: 'Programs', detail: 'Group courses under a shared template and brand accent.' },
  { href: paths.admin.templates, label: 'Templates', detail: 'Set the required course structure and defaults.' },
  { href: paths.admin.rubrics, label: 'Rubrics', detail: 'Review the standards used for course readiness.' },
  { href: paths.admin.policy, label: 'AI policy', detail: 'Choose who can draft with AI, and which tutor modes are allowed.' },
];

function ResetConfirm({
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { panelRef.current?.focus(); }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div ref={panelRef} id="reset-confirm" className={styles.confirm} tabIndex={-1} role="region" aria-labelledby="reset-title">
      <h3 id="reset-title">Reset demo data?</h3>
      <p className={styles.note}>
        This restores the original demo for everyone. People, courses, lessons, announcements, and AI policy go back, and setup is unfinished again.
      </p>
      {error && <StatusNotice tone="error" title="Reset didn't finish">{error}</StatusNotice>}
      <div className={styles.actions}>
        <Button variant="primary" density="compact" onClick={onConfirm} disabled={pending}>{pending ? 'Resetting…' : 'Restore demo data'}</Button>
        <Button density="compact" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export function OverviewPage() {
  const overview = useApiQuery('getOverview', undefined);
  const reset = useApiMutation('resetDemo');
  const location = useLocation();
  const arrivedFromSetup = Boolean((location.state as { setupSaved?: boolean } | null)?.setupSaved);
  const [showArrival, setShowArrival] = useState(arrivedFromSetup);
  const [open, setOpen] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const openerRef = useRef<HTMLDivElement>(null);

  usePageTitle('Overview');

  const closeReset = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => openerRef.current?.querySelector('button')?.focus());
  }, []);

  const peopleStats = overview.data && [
    { label: 'Administrators', value: overview.data.people.administrator },
    { label: 'Instructors', value: overview.data.people.instructor },
    { label: 'Students', value: overview.data.people.student },
  ];
  const contentStats = overview.data && [
    { label: 'Courses', value: overview.data.courses },
    { label: 'Published lessons', value: overview.data.publishedLessons },
    { label: 'Draft lessons', value: overview.data.draftLessons },
    { label: 'Announcements', value: overview.data.announcements },
  ];

  return (
    <div className={styles.page}>
      <TopBar title="Overview" />
      {showArrival && (
        <StatusNotice tone="success" live="polite" title="Setup is finished" onDismiss={() => setShowArrival(false)}>
          You can add people and courses next.
        </StatusNotice>
      )}
      {overview.isLoading && <Loading label="Loading overview" />}
      {overview.error && <ErrorNotice error={overview.error} onRetry={() => { void overview.refetch(); }} />}
      {peopleStats && contentStats && (
        <section className={styles.section}>
          <h2>At a glance</h2>
          <div className={styles.statGroups}>
            <section className={styles.statGroup}>
              <h3>People</h3>
              <StatTiles stats={peopleStats} className={`${styles.stats} ${styles.statsPeople}`} />
            </section>
            <section className={styles.statGroup}>
              <h3>Content</h3>
              <StatTiles stats={contentStats} className={`${styles.stats} ${styles.statsContent}`} />
            </section>
          </div>
        </section>
      )}
      <section className={styles.section}>
        <h2>Shortcuts</h2>
        <ul className={styles.links}>
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link to={link.href}>{link.label}</Link>
              <span className={styles.note}> {link.detail}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.section}>
        <h2>Demo data</h2>
        <p className={styles.note}>Resetting replaces everyone's work in this demo with the original demo data.</p>
        {resetDone && (
          <StatusNotice tone="success" live="polite" title="Demo data restored" onDismiss={() => setResetDone(false)}>
            The original demo data is restored.
          </StatusNotice>
        )}
        <div ref={openerRef} className={styles.actions}>
          <Button density="compact" aria-expanded={open} aria-controls={open ? 'reset-confirm' : undefined} onClick={() => { setResetError(null); setOpen(true); }}>
            Reset demo data
          </Button>
        </div>
        {open && (
          <ResetConfirm
            pending={reset.isPending}
            error={resetError}
            onCancel={closeReset}
            onConfirm={() => {
              setResetError(null);
              reset.mutate(undefined, {
                onSuccess: () => {
                  setResetDone(true);
                  setOpen(false);
                },
                onError: (error) => setResetError(error.message),
              });
            }}
          />
        )}
      </section>
    </div>
  );
}

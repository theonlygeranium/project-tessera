import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { CalculationTrace } from '../../components/CalculationTrace/CalculationTrace';
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl';
import { TopBar } from '../../components/TopBar/TopBar';
import { useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import { WhatIf } from './WhatIf';
import { GradeFeedback } from './GradeFeedback';
import styles from './MyGrade.module.css';

export function MyGrade() {
  const { courseId = '' } = useParams();
  const [tab, setTab] = useState<'current' | 'what-if'>('current');
  usePageTitle('Your grade');
  const mine = useApiQuery('getMyGrade', { courseId });
  const assignments = useApiQuery('listAssignments', { courseId });
  const titles = new Map(assignments.data?.map(a => [a.id, a]));
  if (mine.isPending || assignments.isPending) return <Loading />;
  if (mine.error || assignments.error) return <ErrorNotice error={mine.error ?? assignments.error!} onRetry={() => { void mine.refetch(); void assignments.refetch(); }} />;
  if (!mine.data) return <Loading />;
  return <div className={styles.page}>
    <TopBar title="Your grade" breadcrumbs={[{ label: 'Courses', href: paths.student.courses }, { label: 'Course', href: paths.student.course(courseId) }, { label: 'Your grade' }]} renderLink={renderRouterLink} />
    <SegmentedControl legend="Grade view" hideLegend name="your-grade-view" value={tab} onChange={value => setTab(value as typeof tab)} options={[{ value: 'current', label: 'Current' }, { value: 'what-if', label: 'What-if' }]} />
    {tab === 'current' ? <div className={styles.stack}><section className={styles.hero}><p>Your current grade · released work only</p><div className={styles.grade}><strong>{mine.data.trace.totals.rounded === null ? '—' : `${mine.data.trace.totals.rounded.toFixed(1)}%`}</strong><span>{mine.data.trace.totals.letter ?? 'No letter yet'}</span></div></section><section className={styles.card}><CalculationTrace trace={mine.data.trace} lines={mine.data.lines} name="you" audience="student" /></section><section className={styles.card}><h2>Your work</h2><ul className={styles.items}>{mine.data.items.map(item => <li key={item.assignmentId}><div><strong>{titles.get(item.assignmentId)?.title ?? 'Course item'}</strong><span>{item.state === 'held' ? 'Graded, not released yet' : item.state.replaceAll('-', ' ')}</span></div>{item.state !== 'held' && item.score !== null && <strong>{item.score.toFixed(1)} of {titles.get(item.assignmentId)?.points ?? '—'}</strong>}<GradeFeedback item={item} />{item.studentNote && <p>{item.studentNote}</p>}</li>)}</ul></section></div> : <WhatIf courseId={courseId} current={mine.data} assignments={assignments.data ?? []} />}
    <Link to={paths.student.course(courseId)}>← Back to course</Link>
  </div>;
}

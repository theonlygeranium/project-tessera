import { useParams } from 'react-router';
import { DataTable } from '../../components';
import { useApiQuery } from '../../data/hooks';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import { CourseBar, dateText } from './common';
import type { RosterEntry } from '../../../../shared/domain';
import styles from './instructor.module.css';
export function Roster() {
  const { courseId = '' } = useParams(); usePageTitle('Roster');
  const course = useApiQuery('getCourseOutline', { courseId }); const q = useApiQuery('getRoster', { courseId });
  return <><CourseBar title="Roster" courseId={courseId} courseTitle={course.data?.course.title} />{course.isPending ? <Loading /> : course.error ? <ErrorNotice error={course.error} onRetry={() => void course.refetch()} /> : <section><h2>Enrolled students</h2>{q.isPending ? <Loading /> : q.error ? <ErrorNotice error={q.error} onRetry={() => void q.refetch()} /> : <DataTable<RosterEntry> caption="Course roster" density="compact" rows={q.data ?? []} rowKey={r => r.user.id} empty="No students are enrolled yet." columns={[{ key: 'name', header: 'Name', render: r => r.user.name }, { key: 'email', header: 'Email', render: r => r.user.email }, { key: 'progress', header: 'Progress', render: r => <div className={styles.rosterProgress}><span>{r.completedLessons} of {r.publishedLessons} {r.publishedLessons === 1 ? 'lesson' : 'lessons'}</span><progress aria-label={`Progress for ${r.user.name}`} value={r.completedLessons} max={r.publishedLessons || 1} /></div> }, { key: 'lastActivity', header: 'Last activity', render: r => dateText(r.lastActivity) }]} />}</section>}</>;
}

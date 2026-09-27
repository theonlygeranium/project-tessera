import { useParams } from 'react-router';
import { DataTable, ProgressMeter } from '../../components';
import { useApiQuery } from '../../data/hooks';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import { CourseBar, dateText } from './common';
import type { RosterEntry } from '../../../../shared/domain';
export function Roster() {
  const { courseId = '' } = useParams(); usePageTitle('Roster');
  const course = useApiQuery('getCourseOutline', { courseId }); const q = useApiQuery('getRoster', { courseId });
  return <><CourseBar title="Roster" courseId={courseId} courseTitle={course.data?.course.title} />{course.isPending ? <Loading /> : course.error ? <ErrorNotice error={course.error} onRetry={() => void course.refetch()} /> : <section><h2>Enrolled students</h2>{q.isPending ? <Loading /> : q.error ? <ErrorNotice error={q.error} onRetry={() => void q.refetch()} /> : <DataTable<RosterEntry> caption="Course roster" density="compact" rows={q.data ?? []} rowKey={r => r.user.id} empty="No students are enrolled yet." columns={[{ key: 'name', header: 'Name', render: r => r.user.name }, { key: 'email', header: 'Email', render: r => r.user.email }, { key: 'progress', header: 'Progress', render: r => <ProgressMeter label="Lessons completed" value={r.completedLessons} max={r.publishedLessons || 1} valueText={`${r.completedLessons} of ${r.publishedLessons} lessons`} variant="thin" /> }, { key: 'lastActivity', header: 'Last activity', render: r => dateText(r.lastActivity) }]} />}</section>}</>;
}

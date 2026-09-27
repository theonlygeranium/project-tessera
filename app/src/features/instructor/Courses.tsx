import { CourseCard, TopBar } from '../../components';
import { useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './instructor.module.css';
export function Courses() {
  usePageTitle('My courses');
  const query = useApiQuery('listCourses', undefined);
  return <><TopBar title="My courses" /><section aria-label="Your courses">{query.isPending ? <Loading /> : query.error ? <ErrorNotice error={query.error} onRetry={() => void query.refetch()} /> : !query.data?.length ? <p>You have no courses yet. Ask an administrator to assign you to a course.</p> : <div className={styles.grid}>{query.data.map(course => <CourseCard key={course.id} title={course.title} code={course.code} term={course.term} status={course.status === 'archived' ? 'draft' : 'active'} meta={`${course.studentCount} ${course.studentCount === 1 ? 'student' : 'students'} · ${course.moduleCount} ${course.moduleCount === 1 ? 'module' : 'modules'} · ${course.publishedLessonCount} published ${course.publishedLessonCount === 1 ? 'lesson' : 'lessons'}`} href={paths.teach.course(course.id)} renderLink={renderRouterLink} />)}</div>}</section></>;
}

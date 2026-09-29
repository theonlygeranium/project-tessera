import { Link, Outlet, useParams } from 'react-router';
import { useApiQuery } from '../data/hooks';
import { ErrorNotice, Loading } from '../shell/Status';
import styles from './Embed.module.css';

export function EmbedRoot() {
  const session = useApiQuery('getSession',undefined);
  if (session.isPending) return <main className={styles.shell}><Loading label="Opening Tessera course" /></main>;
  if (session.error) return <main className={styles.shell}><ErrorNotice error={session.error} onRetry={() => session.refetch()} /></main>;
  if (!session.data.user) return <main className={styles.shell}><h1>Launch from your LMS</h1><p>Your LMS session is missing. Return to the course and launch Tessera again.</p></main>;
  return <div className={styles.shell}>
    <a className={styles.skip} href="#main">Skip to course</a>
    <header className={styles.header}><strong>Tessera</strong><span>{session.data.user.name}</span></header>
    <main id="main" tabIndex={-1}><Outlet /></main>
  </div>;
}

export function EmbedCourse() {
  const {courseId = ''} = useParams();
  const outline = useApiQuery('getCourseOutline',{courseId},{enabled:!!courseId});
  if (outline.isPending) return <Loading label="Loading course" />;
  if (outline.error) return <ErrorNotice error={outline.error} onRetry={() => outline.refetch()} />;
  const {course,modules} = outline.data;
  return <article className={styles.course}>
    <h1>{course.title}</h1><p>{course.description}</p>
    <h2>Modules</h2>
    {modules.length ? <ol>{modules.map(module => <li key={module.id}><h3>{module.title}</h3><ul>{module.lessons.map(lesson => <li key={lesson.id}>{lesson.title}{lesson.status !== 'published' ? ' · Draft' : ''}</li>)}</ul></li>)}</ol> : <p>No lessons have been published yet.</p>}
    <p><Link to=".">Refresh course</Link></p>
  </article>;
}

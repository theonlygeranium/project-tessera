import { Link } from 'react-router';
import { useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import styles from './Design.module.css';

export function ReviewOutline({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const outline = useApiQuery('getCourseOutline', { courseId });
  return <nav className={styles.reviewOutline} aria-label="Design course outline">
    <h2>Course outline</h2>
    {outline.data?.modules.map(module => <section key={module.id}><h3>{module.title}</h3><ul>{module.lessons.map(lesson => <li key={lesson.id}><Link aria-current={lesson.id === lessonId ? 'page' : undefined} to={paths.teach.lesson(courseId, lesson.id)}>{lesson.title}</Link><span>{lesson.status === 'draft' ? 'Draft' : 'Published'}</span></li>)}</ul></section>)}
  </nav>;
}

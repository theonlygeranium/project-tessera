import { Link } from 'react-router';
import { useApiQuery } from '../../data/hooks';
import { AiContent } from '../../components';
import { paths } from '../../paths';
import styles from './Design.module.css';

export function ReviewOutline({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const outline = useApiQuery('getCourseOutline', { courseId });
  const designs = useApiQuery('listDesignSessions', { courseId });
  const generatedModules = new Set(designs.data?.flatMap(session => Object.values(session.planIds?.modules ?? {})) ?? []);
  const generatedLessons = new Set(designs.data?.flatMap(session => Object.values(session.planIds?.lessons ?? {})) ?? []);
  if (outline.data && !designs.data) return <nav className={styles.reviewOutline} aria-label="Design course outline"><h2>Course outline</h2><p role="status">{designs.error ? 'The draft outline could not be loaded.' : 'Loading draft outline…'}</p></nav>;
  return <nav className={styles.reviewOutline} aria-label="Design course outline">
    <h2>Course outline</h2>
    {outline.data?.modules.map(module => <section key={module.id}><h3>{generatedModules.has(module.id) ? <AiContent kind="block" state="draft" who="Design partner" source="selected approach and syllabus">{module.title}</AiContent> : module.title}</h3><ul>{module.lessons.map(lesson => <li key={lesson.id}><Link aria-current={lesson.id === lessonId ? 'page' : undefined} to={paths.teach.lesson(courseId, lesson.id)}>{generatedLessons.has(lesson.id) ? <AiContent kind="block" state="draft" who="Design partner" source="selected approach and syllabus">{lesson.title}</AiContent> : lesson.title}</Link><span>{lesson.status === 'draft' ? 'Draft' : 'Published'}</span></li>)}</ul></section>)}
  </nav>;
}

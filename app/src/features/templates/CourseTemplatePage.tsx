import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, StatusNotice, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { PageHelp } from '../../help/PageHelp';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './Templates.module.css';
import { useStaffCourseBrand } from './brand';

export function CourseTemplatePage() {
  const { courseId = '' } = useParams();
  const { course, program } = useStaffCourseBrand(courseId);
  const outline = useApiQuery('getCourseOutline', { courseId }, { enabled: !!courseId });
  const preview = useApiQuery('previewTemplate', { courseId }, { enabled: !!courseId });
  const apply = useApiMutation('applyTemplate');
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  usePageTitle('Course template');
  const p = preview.data;
  const additions = p ? p.addModules.length + p.addLessons.length + p.addBlocks.length : 0;
  return <div className={styles.page}><TopBar title={p ? `Template: ${p.templateName}` : 'Course template'} eyebrow={[course?.code, program?.name].filter(Boolean).join(' · ') || undefined} breadcrumbs={[{ label: 'My courses', href: paths.teach.courses }, { label: outline.data?.course.title ?? 'Course', href: paths.teach.course(courseId) }, { label: 'Template' }]} renderLink={renderRouterLink} />
    <PageHelp topic="teach.template" courseId={courseId} />
    {outline.isPending || preview.isPending ? <Loading /> : outline.error ? <ErrorNotice error={outline.error} onRetry={() => void outline.refetch()} /> : preview.error?.code === 'not-found' ? <section className={styles.section}><h2>No template applies to this course</h2><p>A program or institution template can be assigned by an administrator.</p></section> : preview.error ? <ErrorNotice error={preview.error} onRetry={() => void preview.refetch()} /> : p && <section className={styles.section}>
      {message && <StatusNotice tone="success" live="polite">{message}</StatusNotice>}{error && <StatusNotice tone="error" live="polite">{error}</StatusNotice>}
      {additions === 0 ? <p>Your course has everything {p.templateName} requires. Applying it can fill any tutor defaults you have not set.</p> : <><h2>Changes to review</h2><p>{p.summary}</p>
        {p.addModules.length > 0 && <div><h3>Modules to add</h3><ul>{p.addModules.map(m => <li key={m.key}>{m.title} ({m.placement === 'start' ? 'at the start' : 'at the end'})</li>)}</ul></div>}
        {p.addLessons.length > 0 && <div><h3>Lessons to add</h3><ul>{p.addLessons.map(l => <li key={l.key}>{l.title} in {l.moduleTitle}</li>)}</ul></div>}
        {p.addBlocks.length > 0 && <div><h3>Required blocks to add</h3><ul>{p.addBlocks.map(b => <li key={b.key}>{b.label} in {b.lessonTitle}</li>)}</ul></div>}
      </>}
      <Button variant="primary" disabled={apply.isPending} onClick={() => { setError(''); apply.mutate({ courseId, hash: p.hash }, { onSuccess: () => { setMessage('Template applied.'); void preview.refetch(); }, onError: caught => { if (caught.code === 'conflict') { setError('The course or template changed since your preview. Review the refreshed changes before applying.'); void preview.refetch(); } else setError(caught.message); } }); }}>{additions === 0 ? 'Apply tutor defaults' : 'Apply changes'}</Button>
      <p><Link to={paths.teach.course(courseId)}>Return to course</Link></p>
    </section>}
  </div>;
}

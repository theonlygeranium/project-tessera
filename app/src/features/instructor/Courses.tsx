import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button, CourseCard, StatusNotice, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './instructor.module.css';
export function Courses() {
  usePageTitle('My courses');
  const navigate = useNavigate();
  const query = useApiQuery('listCourses', undefined), programs = useApiQuery('listPrograms', undefined);
  const create = useApiMutation('createCourse');
  const [code, setCode] = useState(''), [title, setTitle] = useState(''), [term, setTerm] = useState(''), [programId, setProgramId] = useState(''), [error, setError] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); create.mutate({ code, title, term, programId: programId || null }, { onSuccess: c => navigate(paths.teach.course(c.id)), onError: x => setError(x.message) }); };
  return <><TopBar title="My courses" /><section aria-label="Your courses">{query.isPending ? <Loading /> : query.error ? <ErrorNotice error={query.error} onRetry={() => void query.refetch()} /> : !query.data?.length ? <p>You have no courses yet. Create one below.</p> : <div className={styles.grid}>{query.data.map(course => <CourseCard key={course.id} title={course.title} code={course.code} term={course.term} status={course.status === 'archived' ? 'draft' : 'active'} meta={`${course.studentCount} ${course.studentCount === 1 ? 'student' : 'students'} · ${course.moduleCount} ${course.moduleCount === 1 ? 'module' : 'modules'} · ${course.publishedLessonCount} published ${course.publishedLessonCount === 1 ? 'lesson' : 'lessons'}`} href={paths.teach.course(course.id)} renderLink={renderRouterLink} />)}</div>}</section>
    <section className={styles.panel}><h2>New course</h2>{error && <StatusNotice tone="error">{error}</StatusNotice>}<form className={styles.inlineForm} onSubmit={submit}>
      <label>Code<input required value={code} onChange={e => setCode(e.target.value)} /></label>
      <label>Title<input required value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label>Term<input required value={term} onChange={e => setTerm(e.target.value)} /></label>
      <label>Program<select value={programId} onChange={e => setProgramId(e.target.value)}><option value="">No program</option>{programs.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <Button type="submit" variant="primary" disabled={create.isPending}>Create course</Button>
    </form></section></>;
}

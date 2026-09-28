import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button, CourseCard, FormField, Select, StatusNotice, TextArea, TextInput, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { PageHelp } from '../../help/PageHelp';
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
  const [code, setCode] = useState(''), [title, setTitle] = useState(''), [term, setTerm] = useState(''), [description, setDescription] = useState(''), [programId, setProgramId] = useState(''), [error, setError] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); create.mutate({ code: code.trim(), title: title.trim(), term: term.trim(), ...(description.trim() ? { description: description.trim() } : {}), programId: programId || null }, { onSuccess: c => navigate(paths.teach.course(c.id), { state: { created: true } }), onError: x => setError(x.message) }); };
  return <><TopBar title="My courses" /><PageHelp topic="teach.courses" /><section aria-label="Your courses">{query.isPending ? <Loading /> : query.error ? <ErrorNotice error={query.error} onRetry={() => void query.refetch()} /> : !query.data?.length ? <p>You have no courses yet. Create one below.</p> : <div className={styles.grid}>{query.data.map(course => <CourseCard key={course.id} title={course.title} code={course.code} term={course.term} status={course.status === 'archived' ? 'draft' : 'active'} meta={`${course.studentCount} ${course.studentCount === 1 ? 'student' : 'students'} · ${course.moduleCount} ${course.moduleCount === 1 ? 'module' : 'modules'} · ${course.publishedLessonCount} published ${course.publishedLessonCount === 1 ? 'lesson' : 'lessons'}`} href={paths.teach.course(course.id)} renderLink={renderRouterLink} />)}</div>}</section>
    <section className={styles.panel}><h2>New course</h2>{error && <StatusNotice tone="error">{error}</StatusNotice>}<form className={styles.inlineForm} onSubmit={submit}>
      <FormField label="Code" required hint="A short code, for example DL 101.">{control => <TextInput {...control} value={code} spellCheck={false} onChange={e => setCode(e.target.value)} />}</FormField>
      <FormField label="Title" required hint="The course name, for example Data Literacy 101.">{control => <TextInput {...control} value={title} onChange={e => setTitle(e.target.value)} />}</FormField>
      <FormField label="Term" required hint="When the course runs, for example Fall 2026.">{control => <TextInput {...control} value={term} onChange={e => setTerm(e.target.value)} />}</FormField>
      <FormField label="Description" hint="Optional.">{control => <TextArea {...control} rows={3} value={description} onChange={e => setDescription(e.target.value)} />}</FormField>
      <FormField label="Program" hint="The program's template adds its required modules and lessons to the new course.">{control => <Select {...control} value={programId} onChange={e => setProgramId(e.target.value)}><option value="">No program</option>{programs.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</FormField>
      <Button type="submit" variant="primary" disabled={create.isPending}>Create course</Button>
    </form></section></>;
}

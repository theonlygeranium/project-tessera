// Course list and the form that creates the next one.
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button, CourseCard, FormField, StatusNotice, TextArea, TextInput, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './Admin.module.css';
import { applyApiFieldError, blankErrors, countPhrase, focusInvalid, hasErrors, type FieldErrors } from './form';

export function CoursesPage() {
  const navigate = useNavigate();
  const courses = useApiQuery('listCourses', undefined);
  const programs = useApiQuery('listPrograms', undefined);
  const create = useApiMutation('createCourse');
  const formRef = useRef<HTMLFormElement>(null);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [term, setTerm] = useState('');
  const [description, setDescription] = useState('');
  const [programId, setProgramId] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  usePageTitle('Courses');

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);
    const local = blankErrors([
      { field: 'code', value: code },
      { field: 'title', value: title },
      { field: 'term', value: term },
    ]);
    setErrors(local);
    if (hasErrors(local)) {
      requestAnimationFrame(() => focusInvalid(form));
      return;
    }
    create.mutate({
      code: code.trim(),
      title: title.trim(),
      term: term.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      programId: programId || null,
    }, {
      onSuccess: (course) => navigate(paths.admin.course(course.id), { state: { created: true } }),
      onError: (error) => {
        const fields = applyApiFieldError(error);
        setErrors(fields);
        if (!hasErrors(fields)) setFormError(error.message);
        requestAnimationFrame(() => focusInvalid(formRef.current));
      },
    });
  }

  return (
    <div className={styles.page}>
      <TopBar title="Courses" />
      <section className={styles.section}>
        <h2>All courses</h2>
        {courses.isLoading && <Loading label="Loading courses" />}
        {courses.error && <ErrorNotice error={courses.error} onRetry={() => { void courses.refetch(); }} />}
        {courses.data && courses.data.length === 0 && <p className={styles.note}>No courses yet. Create the first one below.</p>}
        {courses.data && courses.data.length > 0 && (
          <ul className={styles.cards}>
            {courses.data.map((course) => (
              <li key={course.id}>
                <CourseCard
                  title={course.title}
                  code={course.code}
                  term={course.term}
                  instructor={course.instructorNames.length > 0 ? course.instructorNames.join(', ') : 'No instructor yet'}
                  status={course.status === 'archived' ? 'draft' : 'active'}
                  href={paths.admin.course(course.id)}
                  meta={course.status === 'archived'
                    ? `Archived, ${countPhrase(course.studentCount, 'student')}`
                    : countPhrase(course.studentCount, 'student')}
                  renderLink={renderRouterLink}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2>Create a course</h2>
        <form ref={formRef} className={styles.form} noValidate onSubmit={onSubmit}>
          {formError && <StatusNotice tone="error" title="Course wasn't created">{formError}</StatusNotice>}
          <FormField label="Code" required error={errors.code} hint="A short code, for example DL 101.">
            {(control) => (
              <TextInput
                {...control}
                value={code}
                spellCheck={false}
                onChange={(event) => {
                  setCode(event.target.value);
                  setErrors((current) => ({ ...current, code: undefined }));
                }}
              />
            )}
          </FormField>
          <FormField label="Title" required error={errors.title} hint="The course name, for example Data Literacy 101.">
            {(control) => (
              <TextInput
                {...control}
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setErrors((current) => ({ ...current, title: undefined }));
                }}
              />
            )}
          </FormField>
          <FormField label="Term" required error={errors.term} hint="When the course runs, for example Fall 2026.">
            {(control) => (
              <TextInput
                {...control}
                value={term}
                onChange={(event) => {
                  setTerm(event.target.value);
                  setErrors((current) => ({ ...current, term: undefined }));
                }}
              />
            )}
          </FormField>
          <FormField label="Description" error={errors.description} hint="Optional.">
            {(control) => (
              <TextArea
                {...control}
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}
          </FormField>
          <label className={styles.form}>Program
            <select value={programId} onChange={event => setProgramId(event.target.value)}><option value="">No program</option>{programs.data?.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select>
          </label>
          <div className={styles.actions}>
            <Button type="submit" variant="primary" density="compact" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create course'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

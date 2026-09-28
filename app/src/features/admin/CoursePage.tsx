// Assign instructors and enroll students on one course.
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import type { User } from '../../../../shared/domain';
import { Button, ChoiceGroup, StatusNotice, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './Admin.module.css';
import { countPhrase } from './form';

function useServerSelection(serverIds: readonly string[] | undefined, paused: boolean) {
  const key = serverIds ? [...serverIds].sort().join('\0') : null;
  const [selected, setSelected] = useState<string[]>([]);
  const [seen, setSeen] = useState<string | null>(null);
  if (!paused && serverIds && key !== null && key !== seen) {
    setSeen(key);
    setSelected([...serverIds]);
  }
  return [selected, setSelected] as const;
}

function personOptions(people: User[]) {
  return people.map((person) => ({ value: person.id, label: person.name, description: person.email }));
}

export function CoursePage() {
  const { courseId = '' } = useParams();
  const location = useLocation();
  const created = Boolean((location.state as { created?: boolean } | null)?.created);
  const ready = courseId.length > 0;
  const outline = useApiQuery('getCourseOutline', { courseId }, { enabled: ready });
  const enrollments = useApiQuery('getCourseEnrollments', { courseId }, { enabled: ready });
  const instructors = useApiQuery('listUsers', { role: 'instructor' });
  const students = useApiQuery('listUsers', { role: 'student' });
  const programs = useApiQuery('listPrograms', undefined);
  const saveProgram = useApiMutation('setCourseProgram');
  const [programError, setProgramError] = useState('');
  const [programSaved, setProgramSaved] = useState(false);
  const saveInstructors = useApiMutation('setCourseInstructors');
  const saveStudents = useApiMutation('setCourseEnrollments');
  const [instructorIds, setInstructorIds] = useServerSelection(outline.data?.course.instructorIds, saveInstructors.isPending);
  const [studentIds, setStudentIds] = useServerSelection(enrollments.data?.userIds, saveStudents.isPending);
  const [instructorSaved, setInstructorSaved] = useState(false);
  const [studentSaved, setStudentSaved] = useState(false);
  const [instructorError, setInstructorError] = useState<string | null>(null);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [dismissedCreate, setDismissedCreate] = useState<string | null>(null);
  const showCreated = created && dismissedCreate !== courseId;

  const course = outline.data?.course;
  const title = course?.title ?? 'Course';
  usePageTitle(title);

  const error = outline.error ?? enrollments.error ?? instructors.error ?? students.error;
  const loading = ready && !error && (
    outline.isLoading || enrollments.isLoading || instructors.isLoading || students.isLoading
  );

  return (
    <div className={styles.page}>
      <TopBar
        title={title}
        eyebrow={[course?.code, programs.data?.find(program => program.id === course?.programId)?.name].filter(Boolean).join(' · ') || undefined}
        breadcrumbs={[{ label: 'Courses', href: paths.admin.courses }, { label: title }]}
        renderLink={renderRouterLink}
      />
      {!ready && <StatusNotice tone="error" title="Course link is incomplete">This page needs a course.</StatusNotice>}
      {loading && <Loading label="Loading course" />}
      {error && (
        <ErrorNotice
          error={error}
          onRetry={() => {
            void outline.refetch();
            void enrollments.refetch();
            void instructors.refetch();
            void students.refetch();
          }}
        />
      )}
      {course && instructors.data && students.data && enrollments.data && (
        <>
          {showCreated && (
            <StatusNotice tone="success" live="polite" title="Course created" onDismiss={() => setDismissedCreate(courseId)}>
              Assign an instructor and enroll students below.
            </StatusNotice>
          )}
          <p className={styles.lede}>
            {course.term}
            {course.instructorNames.length > 0 ? `. Taught by ${course.instructorNames.join(', ')}` : '. No instructor yet'}
            {`. ${countPhrase(course.studentCount, 'student')}.`}
          </p>
          {course.description && <p className={styles.note}>{course.description}</p>}

          <section className={styles.section}>
            <h2>Program</h2>
            {programSaved && <StatusNotice tone="success" live="polite">Program saved.</StatusNotice>}
            {programError && <StatusNotice tone="error">{programError}</StatusNotice>}
            <label className={styles.form}>Program for this course
              <select value={course.programId ?? ''} disabled={saveProgram.isPending || programs.isPending} onChange={event => { setProgramError(''); setProgramSaved(false); saveProgram.mutate({ courseId, programId: event.target.value || null }, { onSuccess: () => setProgramSaved(true), onError: caught => setProgramError(caught.message) }); }}><option value="">No program</option>{programs.data?.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select>
            </label>
          </section>

          <section className={styles.section}>
            <h2>Instructors</h2>
            {instructorSaved && (
              <StatusNotice tone="success" live="polite" title="Instructors saved" onDismiss={() => setInstructorSaved(false)}>
                This course's instructors are updated.
              </StatusNotice>
            )}
            {instructorError && <StatusNotice tone="error" title="Instructors weren't saved">{instructorError}</StatusNotice>}
            {instructors.data.length === 0 ? (
              <p className={styles.note}>No instructors yet. Add one on the <Link to={paths.admin.people}>People</Link> page.</p>
            ) : (
              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  setInstructorSaved(false);
                  setInstructorError(null);
                  saveInstructors.mutate({ courseId, userIds: instructorIds }, {
                    onSuccess: () => setInstructorSaved(true),
                    onError: (caught) => setInstructorError(caught.message),
                  });
                }}
              >
                <ChoiceGroup
                  legend="Instructors for this course"
                  type="checkbox"
                  name={`instructors-${courseId}`}
                  options={personOptions(instructors.data)}
                  value={instructorIds}
                  disabled={saveInstructors.isPending}
                  onChange={(next) => {
                    if (!Array.isArray(next)) return;
                    setInstructorIds(next);
                    setInstructorSaved(false);
                    setInstructorError(null);
                  }}
                />
                <div className={styles.actions}>
                  <Button type="submit" variant="primary" density="compact" disabled={saveInstructors.isPending}>
                    {saveInstructors.isPending ? 'Saving…' : 'Save instructors'}
                  </Button>
                </div>
              </form>
            )}
          </section>

          <section className={styles.section}>
            <h2>Students</h2>
            {studentSaved && (
              <StatusNotice tone="success" live="polite" title="Students saved" onDismiss={() => setStudentSaved(false)}>
                This course's enrollment is updated.
              </StatusNotice>
            )}
            {studentError && <StatusNotice tone="error" title="Students weren't saved">{studentError}</StatusNotice>}
            {students.data.length === 0 ? (
              <p className={styles.note}>No students yet. Add one on the <Link to={paths.admin.people}>People</Link> page.</p>
            ) : (
              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  setStudentSaved(false);
                  setStudentError(null);
                  saveStudents.mutate({ courseId, userIds: studentIds }, {
                    onSuccess: () => setStudentSaved(true),
                    onError: (caught) => setStudentError(caught.message),
                  });
                }}
              >
                <ChoiceGroup
                  legend="Students enrolled in this course"
                  type="checkbox"
                  name={`students-${courseId}`}
                  options={personOptions(students.data)}
                  value={studentIds}
                  disabled={saveStudents.isPending}
                  onChange={(next) => {
                    if (!Array.isArray(next)) return;
                    setStudentIds(next);
                    setStudentSaved(false);
                    setStudentError(null);
                  }}
                />
                <div className={styles.actions}>
                  <Button type="submit" variant="primary" density="compact" disabled={saveStudents.isPending}>
                    {saveStudents.isPending ? 'Saving…' : 'Save students'}
                  </Button>
                </div>
              </form>
            )}
          </section>
        </>
      )}
    </div>
  );
}

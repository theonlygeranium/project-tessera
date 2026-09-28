import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Button, LessonOutline, PresenceCard, StatusNotice, TopBar, AiContent } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { useSession } from '../../shell/session';
import { usePageTitle } from '../../shell/usePageTitle';
import { AnnouncementCards } from './StudentPages';
import { BlockPlayer } from '../content';
import { TutorPanel } from '../tutor/TutorPanel';
import styles from './Student.module.css';

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(-2).map(part => part[0]?.toUpperCase()).join(''); }

export function CoursePage() {
  const { courseId = '' } = useParams();
  const outline = useApiQuery('getCourseOutline', { courseId }, { enabled: !!courseId });
  const announcements = useApiQuery('listAnnouncements', { courseId }, { enabled: !!courseId });
  const assignments = useApiQuery('listAssignments', { courseId }, { enabled: !!courseId });
  usePageTitle(outline.data?.course.title ?? 'Course');
  const course = outline.data?.course;
  const modules = outline.data?.modules ?? [];
  const lessons = modules.flatMap(module => module.lessons);
  const next = lessons.find(lesson => lesson.progress !== 'completed');
  const current = next?.progress === 'in-progress' ? next.id : undefined;
  return <div className={styles.page}><TopBar title={course?.title ?? 'Course'} breadcrumbs={[{ label: 'Courses', href: paths.student.courses }, { label: course?.title ?? 'Course' }]} renderLink={renderRouterLink} />
    {outline.isPending || announcements.isPending ? <Loading label="Loading course" /> : outline.error ? <ErrorNotice error={outline.error} onRetry={() => outline.refetch()} /> : announcements.error ? <ErrorNotice error={announcements.error} onRetry={() => announcements.refetch()} /> : course && <>
      <p className={styles.intro}>{course.description}</p>
      <section><h2>Welcome from your instructor</h2><PresenceCard name={course.instructorNames.join(', ') || 'Your instructor'} initials={initials(course.instructorNames[0] ?? '') || 'I'} role="Instructor" time="Course welcome">{course.welcome.split(/\n\s*\n/).map((line, i) => <p key={i}>{line}</p>)}</PresenceCard></section>
      <section><h2>What you'll learn</h2>{course.outcomes.length ? <ul>{course.outcomes.map((outcome, i) => <li key={i}>{outcome}</li>)}</ul> : <p className={styles.empty}>Outcomes will be added soon.</p>}</section>
      <section><div className={styles.sectionHead}><h2>Module map</h2>{next && <Link className={styles.primaryLink} to={paths.student.lesson(courseId, next.id)}>{next.progress === 'in-progress' ? 'Resume lesson' : 'Start lesson'}</Link>}</div>
        {modules.length ? <LessonOutline mode="student" currentLessonId={current} renderLink={renderRouterLink} modules={modules.map(module => ({ id: module.id, title: module.title, lessons: module.lessons.map(lesson => ({ id: lesson.id, title: lesson.title, minutes: lesson.minutes, state: lesson.progress === 'completed' ? 'done' : lesson.id === next?.id ? 'current' : 'todo', href: paths.student.lesson(courseId, lesson.id) })) }))} /> : <p className={styles.empty}>No lessons have been published yet.</p>}
        {!next && lessons.length > 0 && <p className={styles.empty}>You've completed every published lesson.</p>}
      </section>
      <section><h2>Assignments</h2>{assignments.isPending ? <Loading label="Loading assignments" /> : assignments.error ? <ErrorNotice error={assignments.error} onRetry={() => assignments.refetch()} /> : assignments.data?.length ? <ul className={styles.assignments}>{assignments.data.map(a => <li key={a.id}><Link to={paths.student.assignment(courseId, a.id)}>{a.title}</Link> <span className={styles.meta}>{a.points} points · {a.dueAt ? `Due ${new Date(a.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'No due date'}</span></li>)}</ul> : <p className={styles.empty}>No assignments yet.</p>}</section>
      <section><h2>Announcements</h2><AnnouncementCards announcements={[...announcements.data].sort((a,b) => Number(b.pinned) - Number(a.pinned) || Number(a.read) - Number(b.read))} /></section>
    </>}
  </div>;
}

/** Published AI blocks tell learners who reviewed them. */
function ContentBlock({ block, lessonId }: { block: import('../../../../shared/domain').StudentBlock; lessonId: string }) {
  const player = <BlockPlayer block={block} lessonId={lessonId} />;
  return block.origin === 'ai' ? <AiContent kind="note" who="Drafted with AI" source={`${block.provenance?.model ?? 'AI'} · ${block.provenance?.summary ?? 'Reviewed by your instructor'}`}>{player}</AiContent> : player;
}

export function LessonPage() {
  const { courseId = '', lessonId = '' } = useParams();
  const [search] = useSearchParams();
  const version = search.get('version') === 'full' ? 'full' : 'auto';
  const { user } = useSession();
  const lesson = useApiQuery('getStudentLesson', { lessonId, version }, { enabled: !!lessonId });
  const progress = useApiMutation('setLessonProgress');
  const started = useRef<string | null>(null);
  const [completed, setCompleted] = useState(false);
  usePageTitle(lesson.data?.lesson.title ?? 'Lesson');
  useEffect(() => { setCompleted(false); }, [lessonId]);
  useEffect(() => {
    if (lesson.data?.progress.state === 'not-started' && started.current !== lessonId) {
      started.current = lessonId;
      progress.mutate({ lessonId, state: 'in-progress' });
    }
  }, [lesson.data?.progress.state, lessonId]);
  const data = lesson.data;
  const isComplete = completed || data?.progress.state === 'completed';
  return <div className={[styles.page, styles.reading, user.profile?.accessibility.largerText && styles.largerText, user.profile?.accessibility.reducedMotion && styles.reducedMotion].filter(Boolean).join(' ')}>
    <TopBar title={data?.lesson.title ?? 'Lesson'} eyebrow={data ? `${data.lesson.minutes} min lesson` : undefined} breadcrumbs={[{ label: 'Courses', href: paths.student.courses }, { label: data?.courseTitle ?? 'Course', href: paths.student.course(courseId) }, { label: data?.moduleTitle ?? 'Module' }]} renderLink={renderRouterLink} />
    {lesson.isPending ? <Loading label="Loading lesson" /> : lesson.error ? <ErrorNotice error={lesson.error} onRetry={() => lesson.refetch()} /> : data && <>
      <p className={styles.intro}>{data.courseTitle} · {data.moduleTitle} · {data.lesson.minutes} minutes</p>
      {data.variant && <aside className={styles.variantNotice}><strong>You're reading the {data.variant.audience === 'plain' ? 'plain-language' : '15-minute'} version.</strong> {data.variant.why} <Link to={`${paths.student.lesson(courseId, data.variant.fullLessonId)}?version=full`}>Read the full lesson</Link></aside>}
      {data.variantAvailable && <p className={styles.variantOffer}>{data.variantAvailable.why} <Link to={paths.student.lesson(courseId, data.variantAvailable.lessonId)}>Read the {data.variantAvailable.audience === 'plain' ? 'plain-language' : '15-minute'} version</Link></p>}
      <ErrorNotice error={progress.error} onRetry={progress.error && data.progress.state === 'not-started' && !completed ? () => progress.mutate({ lessonId, state: 'in-progress' }) : undefined} />
      <article className={styles.lessonBody}>{[...data.blocks].sort((a,b) => a.position - b.position).map(block => <ContentBlock key={block.id} block={block} lessonId={data.lesson.id} />)}</article>
      <TutorPanel key={lessonId} activityKind="lesson" activityId={lessonId} />
      <div className={styles.lessonFinish}>{isComplete ? <StatusNotice tone="success" live="polite">Lesson complete.</StatusNotice> : <Button variant="primary" disabled={progress.isPending} onClick={() => progress.mutate({ lessonId, state: 'completed' }, { onSuccess: () => setCompleted(true) })}>Mark lesson complete</Button>}
        {isComplete && <Link className={styles.primaryLink} to={data.nextLessonId ? paths.student.lesson(courseId, data.nextLessonId) : paths.student.course(courseId)}>{data.nextLessonId ? 'Next lesson' : 'Back to course'}</Link>}
      </div>
      <nav aria-label="Lessons" className={styles.lessonNav}>{data.previousLessonId && <Link to={paths.student.lesson(courseId, data.previousLessonId)}>← Previous lesson</Link>}<Link to={paths.student.course(courseId)}>Course home</Link>{data.nextLessonId && <Link to={paths.student.lesson(courseId, data.nextLessonId)}>Next lesson →</Link>}</nav>
    </>}
  </div>;
}

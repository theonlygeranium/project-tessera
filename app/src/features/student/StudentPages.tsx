import { useState } from 'react';
import { Link } from 'react-router';
import type { Announcement, CourseSummary } from '../../../../shared/domain';
import { AiContent, Button, CourseCard, PresenceCard, ProgressMeter, Select, StatusNotice, TaskCard, TopBar, FormField } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { useSession } from '../../shell/session';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './Student.module.css';

export function courseStatus(course: CourseSummary) {
  return course.publishedLessonCount > 0 && course.progress === 1 ? 'completed' :
    (course.startedLessonCount ?? 0) > 0 ? 'active' : 'not-started';
}
function StudentCourseCard({ course }: { course: CourseSummary }) {
  const status = courseStatus(course);
  return <CourseCard title={course.title} code={course.code} term={course.term} instructor={course.instructorNames.join(', ')} progress={course.progress ?? undefined} status={status} meta={status === 'active' ? 'In progress' : undefined} href={paths.student.course(course.id)} renderLink={renderRouterLink} />;
}
export function CourseCards({ courses }: { courses: CourseSummary[] }) {
  if (!courses.length) return <p className={styles.empty}>No courses yet.</p>;
  return <div className={styles.cards}>{courses.map(course => <StudentCourseCard key={course.id} course={course} />)}</div>;
}

function previewBody(body: string) {
  const text = body.replace(/\s+/g, ' ').trim();
  if (text.length <= 160) return text;
  const previousSpace = text.lastIndexOf(' ', 160);
  const nextSpace = text.indexOf(' ', 160);
  const boundary = previousSpace > 0 ? previousSpace : nextSpace >= 0 ? nextSpace : text.length;
  return `${text.slice(0, boundary)}…`;
}

function AnnouncementCard({ announcement, showCourse = false, preview = false }: { announcement: Announcement; showCourse?: boolean; preview?: boolean }) {
  const mark = useApiMutation('markAnnouncementRead');
  const body = preview ? previewBody(announcement.body) : announcement.body;
  return <div>
    <PresenceCard name={announcement.authorName} initials={announcement.authorInitials} role={showCourse ? announcement.courseTitle : 'Instructor'} time={announcement.publishedAt ? new Date(announcement.publishedAt).toLocaleDateString() : ''} dateTime={announcement.publishedAt ?? undefined} title={announcement.title} pinned={announcement.pinned} unread={!announcement.read} actions={preview || !announcement.read ? <div className={styles.announcementActions}>{preview && <Link className={styles.readLink} to={paths.student.announcements}>Read</Link>}{!announcement.read && <Button density="compact" disabled={mark.isPending} onClick={() => mark.mutate({ announcementId: announcement.id })}>Mark as read</Button>}</div> : undefined}>
      {announcement.origin === 'ai' ? <AiContent kind="note" who="Drafted with AI" source={`edited by ${announcement.authorName}`}>{body.split(/\n\s*\n/).map((text, index) => <p key={index}>{text}</p>)}</AiContent> : body.split(/\n\s*\n/).map((text, index) => <p key={index}>{text}</p>)}
    </PresenceCard>
    <ErrorNotice error={mark.error} />
  </div>;
}
export function AnnouncementCards({ announcements, showCourse = false, preview = false }: { announcements: Announcement[]; showCourse?: boolean; preview?: boolean }) {
  if (!announcements.length) return <p className={styles.empty}>No announcements yet.</p>;
  return <div className={styles.stack}>{announcements.map(announcement => <AnnouncementCard key={announcement.id} announcement={announcement} showCourse={showCourse} preview={preview} />)}</div>;
}

export function TodayPage() {
  usePageTitle('Today');
  const { user } = useSession();
  const today = useApiQuery('getToday', undefined);
  return <div className={styles.page}><TopBar title="Today" eyebrow={`Hello, ${user.name.split(' ')[0]}`} />
    {today.isPending ? <Loading label="Loading Today" /> : today.error ? <ErrorNotice error={today.error} onRetry={() => today.refetch()} /> : <>
      <section><h2>Do next</h2>{today.data.doNext.length ? <div className={styles.cards}>{today.data.doNext.map(task => <TaskCard key={task.id} title={task.title} context={task.context} minutes={task.minutes} state={task.state === 'completed' ? 'done' : task.state === 'in-progress' ? 'in-progress' : 'todo'} href={paths.student.lesson(task.courseId, task.lessonId)} actionLabel={task.kind === 'resume' ? 'Resume' : task.kind === 'start' ? 'Start' : 'Continue'} renderLink={renderRouterLink} />)}</div> : <p className={styles.empty}>You're all caught up.</p>}</section>
      <section><h2>This week</h2><div className={styles.meter}><ProgressMeter label="Study time" variant="ring" value={today.data.week.minutesDone} max={today.data.week.minutesGoal} valueText={`${today.data.week.minutesDone} of ${today.data.week.minutesGoal} minutes`} /></div></section>
      <section><div className={styles.sectionHead}><h2>Announcements</h2><Link to={paths.student.announcements}>All announcements</Link></div><AnnouncementCards announcements={[...today.data.announcements].sort((a,b) => Number(a.read) - Number(b.read))} showCourse preview /></section>
      <section><div className={styles.sectionHead}><h2>Your courses</h2><Link to={paths.student.courses}>All courses</Link></div><CourseCards courses={today.data.courses} /></section>
    </>}
  </div>;
}

export function CoursesPage() {
  usePageTitle('Courses');
  const courses = useApiQuery('listCourses', undefined);
  return <div className={styles.page}><TopBar title="Courses" />{courses.isPending ? <Loading label="Loading courses" /> : courses.error ? <ErrorNotice error={courses.error} onRetry={() => courses.refetch()} /> : <section><h2>Your courses</h2><CourseCards courses={courses.data} /></section>}</div>;
}

export function AnnouncementsPage() {
  usePageTitle('Announcements');
  const [courseId, setCourseId] = useState('all');
  const [done, setDone] = useState(false);
  const courses = useApiQuery('listCourses', undefined);
  const announcements = useApiQuery('listAnnouncements', {});
  const mark = useApiMutation('markAnnouncementRead');
  const all = announcements.data ?? [];
  const visible = all.filter(a => courseId === 'all' || a.courseId === courseId).sort((a,b) => Number(a.read) - Number(b.read) || Number(b.pinned) - Number(a.pinned) || (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt));
  async function markAll() {
    setDone(false);
    try { for (const item of all.filter(a => !a.read)) await mark.mutateAsync({ announcementId: item.id }); setDone(true); } catch { /* mutation error is displayed below */ }
  }
  return <div className={styles.page}><TopBar title="Announcements" />
    {done && <StatusNotice tone="success" live="polite">All announcements marked as read.</StatusNotice>}
    <ErrorNotice error={mark.error} />
    {courses.isPending || announcements.isPending ? <Loading label="Loading announcements" /> : courses.error ? <ErrorNotice error={courses.error} onRetry={() => courses.refetch()} /> : announcements.error ? <ErrorNotice error={announcements.error} onRetry={() => announcements.refetch()} /> : <>
      <div className={styles.filters}><FormField label="Filter by course">{control => <Select {...control} value={courseId} onChange={event => setCourseId(event.target.value)}><option value="all">All courses</option>{courses.data.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</Select>}</FormField><Button disabled={mark.isPending || !all.some(a => !a.read)} onClick={markAll}>Mark all as read</Button></div>
      <section><h2>{courseId === 'all' ? 'All announcements' : 'Course announcements'}</h2><AnnouncementCards announcements={visible} showCourse={courseId === 'all'} /></section>
    </>}
  </div>;
}

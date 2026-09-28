import { Link } from 'react-router';
import type { ManagerTrainingRow, ManagerView } from '../../../../shared/domain';
import { Button, StatusChip, TopBar } from '../../components';
import { useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import { TEAM_NEVER_SEES, TEAM_SEES, dueLabel, notSharingNote, sharingCaption, statusLabel, statusTone } from './copy';
import styles from './Managers.module.css';

function CourseCells({ person, course }: { person: string; course: ManagerTrainingRow }) {
  return <>
    <td>{course.courseTitle}</td>
    <td>{dueLabel(course.dueAt)}</td>
    <td><StatusChip tone={statusTone(course.status)}>{statusLabel(course.status, course.completedAt)}</StatusChip></td>
    <td>{course.certificate
      ? <><Link to={paths.me.certificate(course.certificate.id)}>View<span className={styles.srOnly}> {person}&apos;s {course.courseTitle} certificate</span></Link> <span className={styles.code}>{course.certificate.code}</span></>
      : <span className={styles.muted}>Not yet</span>}</td>
  </>;
}

function TeamTable({ view }: { view: ManagerView }) {
  if (!view.rows.length) {
    const reports = view.notSharingCount > 0;
    return <p className={styles.empty}>{reports ? 'No one is sharing their training with you yet.' : 'No one reports to you yet.'}</p>;
  }
  return <div className={styles.tableWrap}>
    <table className={styles.table}>
      <caption>{sharingCaption(view.rows.length)}</caption>
      <thead>
        <tr>
          <th scope="col">Person</th>
          <th scope="col">Required course</th>
          <th scope="col">Due</th>
          <th scope="col">Status</th>
          <th scope="col">Certificate</th>
        </tr>
      </thead>
      <tbody>
        {view.rows.map((row) => {
          const courses = row.training.length ? row.training : [null];
          return courses.map((course, index) => <tr key={course ? `${row.person.id}:${course.courseId}` : row.person.id}>
            {index === 0 && <th scope={courses.length > 1 ? 'rowgroup' : 'row'} rowSpan={courses.length}>
              <span className={styles.person}><span className={styles.avatar} aria-hidden="true">{row.person.initials}</span>{row.person.name}</span>
            </th>}
            {course ? <CourseCells person={row.person.name} course={course} /> : <>
              <td>No required training</td>
              <td>None</td>
              <td>None</td>
              <td><span className={styles.muted}>Not yet</span></td>
            </>}
          </tr>);
        })}
      </tbody>
    </table>
  </div>;
}

export function TeamPage() {
  usePageTitle('Team');
  const view = useApiQuery('getManagerView', undefined);
  return <div className={styles.page}>
    <TopBar title="Your team's required training" actions={<Button href="#what-you-see">What you can see</Button>} />
    <p className={styles.lede}>You see completion for people who chose to share it with you. Scores, attempts, and tutor conversations stay private.</p>
    {view.isPending ? <Loading label="Loading your team" /> : view.error ? <ErrorNotice error={view.error} /> : <>
      <section aria-label="People sharing with you"><TeamTable view={view.data} /></section>
      {view.data.notSharingCount > 0 && <section className={styles.note} aria-label="People not sharing">
        <span className={styles.count} aria-hidden="true">{view.data.notSharingCount}</span>
        <p><strong>{notSharingNote(view.data.notSharingCount)}</strong> Tessera doesn&apos;t show their names or their training. They can turn sharing on in their profile at any time.</p>
      </section>}
    </>}
    <section id="what-you-see" aria-labelledby="mv-sees-title">
      <h2 id="mv-sees-title" className={styles.srOnly}>What managers can and can&apos;t see</h2>
      <div className={styles.panels}>
        <div className={styles.panel}>
          <h3 className={styles.kicker}>You see, when someone shares</h3>
          <ul>{TEAM_SEES.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        <div className={styles.panel}>
          <h3 className={styles.kicker}>You never see</h3>
          <ul>{TEAM_NEVER_SEES.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </div>
    </section>
  </div>;
}

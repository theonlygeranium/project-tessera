import { useParams } from 'react-router';
import { AiContent, Card, TopBar } from '../../components';
import { useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './tutor.module.css';

export function TutorSummariesPage() {
  const { courseId = '' } = useParams();
  usePageTitle('Tutor summaries');
  const summaries = useApiQuery('getTutorSummaries',{ courseId },{ enabled:!!courseId });
  return <div className={styles.page}>
    <TopBar title="Tutor summaries" breadcrumbs={[{ label:'My courses',href:paths.teach.courses },{ label:'Course',href:paths.teach.course(courseId) },{ label:'Tutor summaries' }]} renderLink={renderRouterLink} />
    <p>Instructors see summaries of topics and hint use, not student transcripts.</p>
    {summaries.isPending ? <Loading label="Loading tutor summaries" /> : summaries.error ? <ErrorNotice error={summaries.error} onRetry={() => void summaries.refetch()} />
      : !summaries.data?.length ? <p>No students have used the tutor in this course yet.</p>
      : <section aria-label="Student tutor summaries" className={styles.cards}>{summaries.data.map(row => <Card key={row.studentId}>
        <h2>{row.studentName}</h2>
        <p>{row.sessions} {row.sessions === 1 ? 'session' : 'sessions'} · {row.hintsUsed} hints used · {row.answerRequests} answer requests</p>
        <AiContent kind="note" who="Summary by AI" source={`${row.provenance?.model ?? 'AI'} · from this student's questions`}><p>{row.summary}</p></AiContent>
      </Card>)}</section>}
  </div>;
}

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import type { GradeEvent, GradeEventKind } from '../../../../shared/domain';
import { StatusNotice } from '../../components/StatusNotice/StatusNotice';
import { TopBar } from '../../components/TopBar/TopBar';
import { api, useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import { canUndoGradeEvent, gradeEventLabel } from './history-model';
import styles from './HistoryPage.module.css';

const kinds: GradeEventKind[] = ['score','override','excuse','unexcuse','missing','extension','late-waiver','final-override','release','unrelease','setup','undo'];

export function HistoryPage() {
  const { courseId = '' } = useParams();
  const [search] = useSearchParams();
  usePageTitle('Grade history');
  const [studentId, setStudentId] = useState(search.get('studentId') ?? '');
  const [assignmentId, setAssignmentId] = useState('');
  const [kind, setKind] = useState<GradeEventKind | ''>('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<GradeEvent[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [undone, setUndone] = useState<Set<string>>(new Set());
  const roster = useApiQuery('getGradebook', { courseId, view: 'student' });
  const assignments = useApiQuery('listAssignments', { courseId });
  const events = useApiQuery('listGradeEvents', { courseId, studentId: studentId || undefined, assignmentId: assignmentId || undefined, kind: kind || undefined, cursor, limit: 30 });
  const allUndos = useQuery({ queryKey: ['gradebook-undo-ids', courseId], queryFn: async () => {
    const ids = new Set<string>();
    let pageCursor: string | undefined;
    do { const page = await api.listGradeEvents({ courseId, kind: 'undo', cursor: pageCursor, limit: 100 });
      for (const event of page.items) if (event.undoOf) ids.add(event.undoOf);
      pageCursor = page.nextCursor ?? undefined;
    } while (pageCursor);
    return ids;
  } });
  const undo = useApiMutation('undoGradeEvent');
  useEffect(() => { if (events.data) setPages(previous => cursor ? [...previous, ...events.data!.items.filter(e => !previous.some(p => p.id === e.id))] : events.data!.items); }, [events.data, cursor]);
  const reset = () => { setCursor(undefined); setPages([]); setError(''); };
  const all = pages.length ? pages : events.data?.items ?? [];
  const reversed = new Set([...undone, ...(allUndos.data ?? []), ...all.filter(e => e.kind === 'undo' && e.undoOf).map(e => e.undoOf!)]);
  const students = new Map(roster.data?.rows.map(r => [r.student.id, r.student.name]));
  const titles = new Map(assignments.data?.map(a => [a.id, a.title]));
  const who = (id: string) => id === 'u-okafor' ? 'Dr. Adaeze Okafor' : students.get(id) ?? id;
  async function undoEvent(event: GradeEvent) {
    try { setError(''); await undo.mutateAsync({ eventId: event.id }); setUndone(previous => new Set(previous).add(event.id)); setMessage(`${gradeEventLabel(event.kind)} undone.`); reset(); void events.refetch(); void allUndos.refetch(); }
    catch (cause) { setError((cause as { code?: string }).code === 'conflict' ? 'This change was updated or already undone. Refresh history to review it.' : cause instanceof Error ? cause.message : 'Could not undo this change.'); }
  }
  if (roster.isPending || assignments.isPending) return <Loading />;
  if (roster.error || assignments.error) return <ErrorNotice error={roster.error ?? assignments.error!} />;
  return <div className={styles.page}>
    <TopBar title="Grade history" breadcrumbs={[{ label: 'Grades', href: paths.teach.gradebook(courseId) }, { label: 'History' }]} renderLink={renderRouterLink} />
    <p>Grade changes for this course. Undo is available while the recorded state still matches.</p>
    <div className={styles.filters}><label>Student<select value={studentId} onChange={e => { setStudentId(e.target.value); reset(); }}><option value="">All students</option>{roster.data?.rows.map(r => <option key={r.student.id} value={r.student.id}>{r.student.name}</option>)}</select></label><label>Assignment<select value={assignmentId} onChange={e => { setAssignmentId(e.target.value); reset(); }}><option value="">All assignments</option>{assignments.data?.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label><label>Kind<select value={kind} onChange={e => { setKind(e.target.value as GradeEventKind | ''); reset(); }}><option value="">All changes</option>{kinds.map(k => <option key={k} value={k}>{gradeEventLabel(k)}</option>)}</select></label></div>
    {error && <StatusNotice tone="error" live="assertive">{error} <button type="button" onClick={() => { reset(); void events.refetch(); }}>Refresh</button></StatusNotice>}
    {allUndos.error && <StatusNotice tone="warning">Undo status could not be checked. <button type="button" onClick={() => void allUndos.refetch()}>Retry</button></StatusNotice>}
    {message && <StatusNotice tone="success">{message}</StatusNotice>}
    {events.isPending && !all.length ? <Loading /> : events.error ? <ErrorNotice error={events.error} onRetry={() => void events.refetch()} /> : !all.length ? <p>No grade events match these filters.</p> : <ol className={styles.list}>{all.map(event => <li key={event.id} className={styles.card}><div><strong>{gradeEventLabel(event.kind)}</strong><span>{new Date(event.at).toLocaleString()}</span></div><p>By {who(event.by)}{event.studentId ? ` · ${students.get(event.studentId) ?? event.studentId}` : ''}{event.assignmentId ? ` · ${titles.get(event.assignmentId) ?? event.assignmentId}` : ''}</p>{event.reason && <p>Reason: {event.reason}</p>}{event.kind === 'undo' && <p>Undid an earlier change.</p>}{allUndos.isPending || allUndos.error ? <span>Undo unavailable until status is checked.</span> : canUndoGradeEvent(event, reversed) ? <button type="button" disabled={undo.isPending} onClick={() => void undoEvent(event)}>Undo change</button> : event.kind !== 'undo' ? <span>Already undone</span> : null}</li>)}</ol>}
    {events.data?.nextCursor && <button type="button" className={styles.more} disabled={events.isFetching} onClick={() => setCursor(events.data!.nextCursor!)}>Load more history</button>}
    <Link to={paths.teach.gradebook(courseId)}>← Back to grades</Link>
  </div>;
}

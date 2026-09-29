import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { Assignment, GradebookRow } from '../../../../shared/domain';
import { StatusNotice } from '../../components/StatusNotice/StatusNotice';
import { api, useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import styles from './ReleaseDialog.module.css';
import { FeedbackSent } from './FeedbackSent';
import { readyForRelease, releaseCompletion, releaseConflict, releaseRequest, undoReleaseRequest } from './release-model';

const grade = (value: { percent: number | null; letter: string | null }) =>
  value.percent === null ? '—' : `${value.percent.toFixed(1)}% ${value.letter ?? ''}`;
export function ReleaseDialog({ courseId, assignments, initialId, rows, onClose }: {
  courseId: string; assignments: Assignment[]; initialId: string; rows: GradebookRow[]; onClose: () => void;
}) {
  const [assignmentId, setAssignmentId] = useState(initialId);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [released, setReleased] = useState<{ assignmentId: string; at: number } | null>(null);
  const [undone, setUndone] = useState(false);
  const [now, setNow] = useState(Date.now());
  const opener = useRef(document.activeElement as HTMLElement | null);
  const dialog = useRef<HTMLDivElement>(null);
  const title = assignments.find(a => a.id === assignmentId)?.title ?? 'assignment';
  const preview = useApiQuery('previewRelease', { assignmentId });
  const submissions = useQuery({ queryKey: ['release-submissions', assignmentId], queryFn: async () => {
    const items: Awaited<ReturnType<typeof api.listSubmissions>>['items'] = [];
    let cursor: string | undefined;
    do { const page = await api.listSubmissions({ assignmentId, cursor, limit: 100 }); items.push(...page.items); cursor = page.nextCursor ?? undefined; } while (cursor);
    return items;
  } });
  const release = useApiMutation('releaseGrades');
  const unrelease = useApiMutation('unreleaseGrades');
  useEffect(() => { dialog.current?.focus(); return () => opener.current?.focus(); }, []);
  useEffect(() => { if (released === null) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [released]);
  const ready = preview.data && submissions.data ? readyForRelease(submissions.data, preview.data) : [];
  const change = new Map(preview.data?.changes.map(item => [item.studentId, item]));
  async function refresh() { setConflict(false); setError(''); await Promise.all([preview.refetch(), submissions.refetch()]); }
  async function send() {
    if (!preview.data || preview.isFetching || !ready.length || release.isPending || unrelease.isPending) return;
    const request = releaseRequest(assignmentId, preview.data);
    try { setError(''); setConflict(false); await release.mutateAsync(request); setUndone(false); setReleased(releaseCompletion(request, Date.now())); setNow(Date.now()); await refresh(); }
    catch (cause) { if (releaseConflict(cause)) { setConflict(true); void refresh().then(() => setConflict(true)); } else setError(cause instanceof Error ? cause.message : 'Could not release grades.'); }
  }
  async function undo() {
    if (!released || release.isPending || unrelease.isPending) return;
    try { await unrelease.mutateAsync(undoReleaseRequest(released)); setReleased(null); setUndone(true); await refresh(); }
    catch (cause) { setError((cause as { code?: string }).code === 'conflict' ? 'A released grade changed. Review the current grades before undoing.' : cause instanceof Error ? cause.message : 'Could not undo release.'); }
  }
  function keyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled])') ?? [])];
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0], last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <div className={styles.backdrop}><div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="release-title" tabIndex={-1} onKeyDown={keyDown}>
    <header><div><p>What students will see</p><h2 id="release-title">Release {title} to {ready.length} {ready.length === 1 ? 'student' : 'students'}</h2></div><button type="button" onClick={onClose} aria-label="Close release dialog">×</button></header>
    {assignments.length > 1 && <label className={styles.picker}>Assignment<select value={assignmentId} disabled={release.isPending || unrelease.isPending} onChange={event => { setAssignmentId(event.target.value); setUndone(false); setConflict(false); }}>{assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>}
    {preview.isPending || submissions.isPending ? <p>Preparing release preview…</p> : preview.error || submissions.error ? <StatusNotice tone="error">Could not prepare release preview. <button type="button" onClick={() => void refresh()}>Retry</button></StatusNotice> : <>
      {conflict && <StatusNotice tone="warning">Grades changed since this preview. Review the refreshed rows before releasing.</StatusNotice>}
      {error && <StatusNotice tone="error" live="assertive">{error}</StatusNotice>}
      {released !== null && <StatusNotice tone="success" action={<button type="button" onClick={() => void undo()} disabled={release.isPending || unrelease.isPending}>Undo release</button>}>Grades released. {now - released.at >= 60000 && 'Students may have seen them.'}</StatusNotice>}
      {undone && <StatusNotice tone="success">Release undone. Grades are held again.</StatusNotice>}
      {ready.length ? <div className={styles.scroll}><table><thead><tr><th scope="col">Student</th><th scope="col">Current grade now → after</th><th scope="col">Feedback sent</th></tr></thead><tbody>{ready.map(s => {
        const changed = change.get(s.studentId);
        const current = rows.find(r => r.student.id === s.studentId)?.result ?? { percent: null, letter: null };
        return <tr key={s.id}><th scope="row">{rows.find(r => r.student.id === s.studentId)?.student.name ?? 'Student'}</th><td>{grade(changed?.from ?? current)} → {grade(changed?.to ?? current)}</td><td><FeedbackSent grade={s.grade} /></td></tr>;
      })}</tbody></table></div> : <p>No graded submissions are ready to release for this assignment.</p>}
      <section className={styles.notSent}><h3>Not sent: {preview.data?.notSent.length ?? 0} AI feedback {preview.data?.notSent.length === 1 ? 'draft' : 'drafts'} not reviewed</h3>{preview.data?.notSent.length ? <ul>{preview.data.notSent.map(item => <li key={item.submissionId}>{rows.find(r => r.student.id === item.studentId)?.student.name ?? 'Student'} · <Link to={paths.teach.assignment(courseId, assignmentId)}>Open grader to review feedback draft</Link></li>)}</ul> : <p>All ready feedback has been reviewed.</p>}</section>
      <footer><button type="button" onClick={onClose}>Close</button><button type="button" className={styles.primary} disabled={!ready.length || !preview.data || preview.isFetching || release.isPending || unrelease.isPending || released !== null} onClick={() => void send()}>Release {ready.length} {ready.length === 1 ? 'grade' : 'grades'}</button></footer>
    </>}
  </div></div>;
}

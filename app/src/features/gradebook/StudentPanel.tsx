import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { Assignment, GradebookRow, Submission } from '../../../../shared/domain';
import { AiContent, CalculationTrace, SegmentedControl, StatusChip, StatusNotice } from '../../components';
import { api, useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { parseGradeValue } from './grid-model';
import styles from './StudentPanel.module.css';

export function StudentPanel({ courseId, row, assignments, onClose, onNavigate }: {
  courseId: string; row: GradebookRow; assignments: Assignment[]; onClose: () => void; onNavigate: (delta: number) => void;
}) {
  const [view, setView] = useState<'student' | 'held'>('student');
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [row.student.id]);
  const explanation = useApiQuery('explainGrade', { courseId, studentId: row.student.id, view });
  const events = useApiQuery('listGradeEvents', { courseId, studentId: row.student.id, limit: 3 });
  const drafts = useQuery({ queryKey: ['student-feedback-drafts', courseId, row.student.id], queryFn: async () => {
    const found: { assignment: Assignment; submission: Submission }[] = [];
    for (const assignment of assignments) {
      let cursor: string | undefined;
      do {
        const page = await api.listSubmissions({ assignmentId: assignment.id, cursor, limit: 100 });
        for (const submission of page.items) if (submission.studentId === row.student.id && submission.feedbackDraft) found.push({ assignment, submission });
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
    }
    return found;
  } });
  const update = useApiMutation('updateGradeCells');
  const first = row.student.name.split(' ')[0];
  async function edit(op: 'excuse' | 'override') {
    const label = window.prompt(`Which item for ${row.student.name}? Enter its title.`, assignments[0]?.title ?? '');
    if (!label) return;
    const assignment = assignments.find(a => a.title.toLowerCase() === label.trim().toLowerCase());
    if (!assignment) { setError('Choose an item title from the gradebook.'); return; }
    const cell = row.cells.find(c => c.assignmentId === assignment.id);
    let value: number | undefined;
    if (op === 'override') {
      const raw = window.prompt(`New score for ${assignment.title}`, cell?.display?.raw?.toString() ?? '');
      if (raw === null) return;
      const parsed = parseGradeValue(raw, assignment.points);
      if (!parsed || parsed.kind !== 'score') { setError('Enter a valid score.'); return; }
      value = parsed.value;
    }
    const reason = window.prompt(`Reason for ${op === 'excuse' ? 'excusing' : 'overriding'} ${assignment.title}`);
    if (!reason?.trim()) return;
    try {
      const response = await update.mutateAsync({ courseId, batchId: crypto.randomUUID(), changes: [{ assignmentId: assignment.id, studentId: row.student.id, op, value, reason: reason.trim(), expectedVersion: cell?.itemStateVersion ?? 0 }] });
      if (response.cells.some(c => 'conflict' in c)) setError('That item changed while you were editing. Close and reopen this panel to review the current score.');
      else setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the change.'); }
  }
  return <aside className={styles.panel} aria-label={`${row.student.name} grade details`} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (!['INPUT', 'TEXTAREA', 'BUTTON', 'A'].includes((event.target as HTMLElement).tagName) && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (event.key.toLowerCase() === 'j') onNavigate(1);
      if (event.key.toLowerCase() === 'k') onNavigate(-1);
    }
  }}>
    <header className={styles.header}><div><p>Student detail</p><h2 ref={heading} tabIndex={-1}>{row.student.name}</h2></div><div className={styles.controls}><button type="button" onClick={() => onNavigate(-1)} aria-label="Previous student (K)">↑ <span>K</span></button><button type="button" onClick={() => onNavigate(1)} aria-label="Next student (J)">↓ <span>J</span></button><button type="button" onClick={onClose} aria-label="Close student panel">×</button></div></header>
    <SegmentedControl legend="Grade view" name="student-panel-view" density="compact" value={view} onChange={value => setView(value as typeof view)} options={[{ value: 'student', label: `As ${first} sees it` }, { value: 'held', label: 'With held' }]} />
    {explanation.isPending ? <p>Calculating grade…</p> : explanation.error ? <StatusNotice tone="error">Could not load the explanation. <button type="button" onClick={() => void explanation.refetch()}>Retry</button></StatusNotice> : explanation.data && <><div className={styles.grade}><strong>{explanation.data.trace.totals.rounded === null ? '—' : `${explanation.data.trace.totals.rounded.toFixed(1)}%`}</strong>{explanation.data.trace.totals.letter && <StatusChip tone="neutral">{explanation.data.trace.totals.letter}</StatusChip>}</div><CalculationTrace trace={explanation.data.trace} lines={explanation.data.lines} name={row.student.name} provenance={view === 'student' ? `${row.student.name} sees this same breakdown of released work. One engine powers it and the CSV export; AI never calculates grades.` : 'This breakdown includes held work for instructor review. The same engine powers it and the CSV export; AI never calculates grades.'} /></>}
    {drafts.data?.map(({ assignment, submission }) => <AiContent key={submission.id} kind="note" who="AI feedback draft" source={`${assignment.title} · not reviewed`} actions={<Link to={paths.teach.assignment(courseId, assignment.id)}>Open grader for {assignment.title}</Link>}>{submission.feedbackDraft!.text}</AiContent>)}
    <section className={styles.actions}><h3>Actions</h3><button type="button" disabled>Preview {first}’s view — next</button><button type="button" onClick={() => void edit('excuse')}>Excuse an item</button><button type="button" onClick={() => void edit('override')}>Override a score</button></section>
    {error && <StatusNotice tone="error" live="assertive">{error}</StatusNotice>}
    <section className={styles.history}><h3>Recent history</h3>{events.isPending ? <p>Loading history…</p> : events.error ? <p>History could not be loaded.</p> : events.data?.items.length ? <ul>{events.data.items.map(event => <li key={event.id}>{event.kind.replaceAll('-', ' ')} · {new Date(event.at).toLocaleString()}{event.reason ? ` · ${event.reason}` : ''}</li>)}</ul> : <p>No recent changes.</p>}<span>History — next</span></section>
  </aside>;
}

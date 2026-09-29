import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { GradebookRow, Submission } from '../../../../shared/domain';
import type { Input, Output } from '../../../../shared/api';
import { DataGrid, type GridColumn } from '../../components/DataGrid/DataGrid';
import { GradeCell, gradeCellText } from '../../components/GradeCell/GradeCell';
import { StateLabel, type GradeState } from '../../components/StateLabel/StateLabel';
import { SegmentedControl, StatusChip, StatusNotice } from '../../components';
import { api, useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { ErrorNotice, Loading } from '../../shell/Status';
import { cellMatches, filterCounts, filters, parseGradeValue, type Filter } from './grid-model';
import styles from './GradebookGridPage.module.css';
import { StudentPanel } from './StudentPanel';

type Change = Input<'updateGradeCells'>['changes'][number];
type Target = { row: GradebookRow; assignmentId: string };
const densityKey = 'tessera.gradebook.density';
const legend: GradeState[] = ['late', 'missing', 'excused', 'dropped', 'override', 'held', 'feedback-draft', 'to-grade', 'extra-credit'];
const filename = (courseId: string) => `${courseId}-gradebook.csv`;
const shortDate = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No due date';
const cellEditText = (cell: GradebookRow['cells'][number] | undefined) => {
  if (!cell?.display) return '';
  const value = cell.display.raw ?? cell.display.adjusted;
  return value === null || value === undefined ? '' : String(value);
};
const cellRawNumber = (cell: GradebookRow['cells'][number] | undefined) => {
  if (!cell?.display) return null;
  const value = cell.display.raw ?? cell.display.adjusted;
  return value === null || value === undefined ? null : value;
};

export function GradebookGridPage({ courseId }: { courseId: string }) {
  const [view, setView] = useState<'student' | 'held'>('student');
  const [density, setDensity] = useState<'compact' | 'comfortable'>(() => { try { return localStorage.getItem(densityKey) === 'comfortable' ? 'comfortable' : 'compact'; } catch { return 'compact'; } });
  const [find, setFind] = useState(''); const [filter, setFilter] = useState<Filter | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState({ row: 0, col: 0, fromRow: 0, fromCol: 0 });
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [conflict, setConflict] = useState<{ changes: Change[]; current: { value: unknown; by: string | null; at: string | null } } | null>(null);
  const [lastBatch, setLastBatch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [shortcuts, setShortcuts] = useState(false);
  const shortcutOpener = useRef<HTMLElement | null>(null);
  const panelOpener = useRef<HTMLElement | null>(null);
  const [panelStudentId, setPanelStudentId] = useState<string | null>(null);
  const book = useApiQuery('getGradebook', { courseId, view });
  const queryClient = useQueryClient();
  const setup = useApiQuery('getGradebookSetup', { courseId });
  const assignments = useApiQuery('listAssignments', { courseId });
  const drafts = useQuery({ queryKey: ['gradebook-feedback-drafts', courseId, book.data?.assignments.map(a => a.id)], enabled: !!book.data, queryFn: async () => {
    const keys = new Set<string>();
    for (const item of book.data?.assignments ?? []) {
      let cursor: string | undefined;
      do { const page = await api.listSubmissions({ assignmentId: item.id, cursor, limit: 100 });
        for (const s of page.items) if ((s as Submission).feedbackDraft) keys.add(`${s.studentId}:${item.id}`);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
    }
    return keys;
  } });
  const mutation = useApiMutation('updateGradeCells'); const undoMutation = useApiMutation('undoGradeEvent'); const exporting = useApiMutation('exportGradebook');
  const itemMap = useMemo(() => new Map(assignments.data?.map(a => [a.id, a])), [assignments.data]);
  const ordered = useMemo(() => [...(book.data?.assignments ?? [])].sort((a, b) => {
    const ca = setup.data?.categories.find(c => c.id === itemMap.get(a.id)?.categoryId)?.position ?? 999;
    const cb = setup.data?.categories.find(c => c.id === itemMap.get(b.id)?.categoryId)?.position ?? 999;
    return ca - cb || (itemMap.get(a.id)?.position ?? 0) - (itemMap.get(b.id)?.position ?? 0);
  }), [book.data?.assignments, itemMap, setup.data]);
  const rows = book.data?.rows ?? [];
  const matchesFilter = (row: GradebookRow, kind: Filter) => kind === 'feedback-draft' ? ordered.some(a => drafts.data?.has(`${row.student.id}:${a.id}`)) : ordered.some(a => cellMatches(row, a.id, kind));
  const counts = useMemo(() => { const next = filterCounts(rows, ordered.map(a => a.id)); next['feedback-draft'] = rows.filter(r => matchesFilter(r, 'feedback-draft')).length; return next; }, [rows, ordered, drafts.data]);
  const visibleRows = useMemo(() => rows.filter(r => r.student.name.toLowerCase().includes(find.trim().toLowerCase()) && (!filter || matchesFilter(r, filter))), [rows, find, filter, ordered, drafts.data]);
  const panelRow = visibleRows.find(r => r.student.id === panelStudentId);
  function openPanel(studentId: string, opener: HTMLElement | null) { panelOpener.current = opener; setPanelStudentId(studentId); }
  function closePanel() { setPanelStudentId(null); requestAnimationFrame(() => panelOpener.current?.focus()); }
  function movePanel(delta: number) { const at = visibleRows.findIndex(r => r.student.id === panelStudentId); const next = visibleRows[Math.max(0, Math.min(visibleRows.length - 1, at + delta))]; if (next) setPanelStudentId(next.student.id); }
  const target = (row: GradebookRow, assignmentId: string): Target => ({ row, assignmentId });
  const cellOf = (t: Target) => t.row.cells.find(c => c.assignmentId === t.assignmentId);
  const changeFor = (t: Target, op: Change['op'], value?: number, reason?: string): Change => {
    const cell = cellOf(t);
    const stateOp = !['score', 'clear'].includes(op) || !!cell?.released;
    return { assignmentId: t.assignmentId, studentId: t.row.student.id, op, value, reason, expectedVersion: stateOp ? cell?.itemStateVersion ?? 0 : cell?.submissionVersion ?? 0 };
  };
  async function send(changes: Change[], description: string): Promise<boolean> {
    if (!changes.length) return false;
    setError(''); setConflict(null); setBusy(true);
    const batchId = crypto.randomUUID();
    const key = ['getGradebook', { courseId, view }];
    const before = queryClient.getQueryData<Output<'getGradebook'>>(key);
    queryClient.setQueryData<Output<'getGradebook'>>(key, previous => previous && ({ ...previous, rows: previous.rows.map(row => ({ ...row, cells: row.cells.map(cell => {
      const change = changes.find(c => c.studentId === row.student.id && c.assignmentId === cell.assignmentId);
      if (!change?.op || !['score', 'override', 'clear', 'excuse', 'mark-missing', 'clear-missing'].includes(change.op)) return cell;
      // Released-only view must not flash held scores as graded numbers (Astra P2).
      if (view === 'student' && (cell.display?.state === 'held' || (!cell.released && cell.display?.adjusted === null && cell.submissionVersion))) {
        return cell;
      }
      const state = change.op === 'mark-missing' ? 'missing' : change.op === 'excuse' ? 'excused' : change.op === 'override' ? 'override' : change.op === 'score' ? 'graded' : 'to-grade';
      const adjusted = change.op === 'mark-missing' ? 0 : typeof change.value === 'number' ? change.value : null;
      return { ...cell, score: adjusted, display: { state, adjusted, raw: typeof change.value === 'number' ? change.value : cell.display?.raw ?? null, label: state.replaceAll('-', ' ') } };
    }) })) }));
    try {
      const response = await mutation.mutateAsync({ courseId, batchId, changes });
      const failed = response.cells.find(c => 'conflict' in c);
      if (failed && 'current' in failed) { if (before) queryClient.setQueryData(key, before); void book.refetch(); setConflict({ changes, current: failed.current }); setError('A cell changed while you were editing.'); return false; }
      setLastBatch(batchId); setMessage(description); return true;
    } catch (e) { if (before) queryClient.setQueryData(key, before); setError(e instanceof Error ? e.message : 'Could not save changes.'); return false; }
    finally { setBusy(false); }
  }
  async function score(t: Target, text: string) {
    const a = ordered.find(x => x.id === t.assignmentId); if (!a) return false;
    const parsed = parseGradeValue(text, a.points);
    if (!parsed) { setError('Enter a nonnegative score, a fraction, a percentage, EX, or -.'); return false; }
    if (parsed.kind === 'excuse') { const reason = window.prompt(`Reason to excuse ${t.row.student.name} from ${a.title}`); return reason?.trim() ? send([changeFor(t, 'excuse', undefined, reason.trim())], `${t.row.student.name}: ${a.title} excused.`) : false; }
    if (parsed.kind === 'clear') {
      const cell = cellOf(t);
      if (view === 'student' && cell?.display?.state === 'held') { setError('Switch to Include held to clear a held score.'); return false; }
      if (cell?.display?.adjusted === null && cell?.display?.raw == null && !cell?.released && cell?.display?.state !== 'held') { setError('There is no score to clear.'); return false; }
      const reason = cell?.released ? window.prompt('Reason to clear the released override') : undefined;
      if (cell?.released && !reason?.trim()) return false;
      return send([changeFor(t, 'clear', undefined, reason?.trim())], `${t.row.student.name}: ${a.title} cleared.`);
    }
    const released = cellOf(t)?.released; const reason = released ? window.prompt('Reason to override this released score') : undefined;
    if (released && !reason?.trim()) return false;
    return send([changeFor(t, released ? 'override' : 'score', parsed.value, reason?.trim())], `${t.row.student.name}: ${a.title} saved as ${parsed.value}.`);
  }
  const rangeTargets = (range = selection) => { const result: Target[] = []; for (let r = Math.min(range.row, range.fromRow); r <= Math.max(range.row, range.fromRow); r++) for (let c = Math.min(range.col, range.fromCol); c <= Math.max(range.col, range.fromCol); c++) if (visibleRows[r] && ordered[c]) result.push(target(visibleRows[r], ordered[c].id)); return result; };
  const chosenTargets = () => selected.size ? visibleRows.filter(r => selected.has(r.student.id)).flatMap(r => ordered.map(a => target(r, a.id))) : rangeTargets();
  async function bulk(op: 'score' | 'excuse' | 'mark-missing' | 'clear-missing' | 'clear') {
    const targets = chosenTargets(); if (!targets.length) return;
    const raw = op === 'score' ? window.prompt('Score for selected cells. Use a number, fraction, or percent.') : null;
    if (op === 'score' && raw === null) return;
    const reason = op === 'excuse' ? window.prompt('Reason for excusing the selected cells') : op === 'clear' && targets.some(t => cellOf(t)?.released) ? window.prompt('Reason for clearing released overrides') : null;
    if ((op === 'excuse' || op === 'clear' && targets.some(t => cellOf(t)?.released)) && !reason?.trim()) return;
    const overrideReason = op === 'score' && targets.some(t => cellOf(t)?.released) ? window.prompt('Reason for changing released scores') : null;
    if (op === 'score' && targets.some(t => cellOf(t)?.released) && !overrideReason?.trim()) return;
    const changes: Change[] = [];
    for (const t of targets) {
      if (op === 'score') { const a = ordered.find(x => x.id === t.assignmentId)!; const parsed = parseGradeValue(raw!, a.points); if (!parsed || parsed.kind !== 'score') { setError(`Invalid score for ${a.title}. No changes saved.`); return; } changes.push(changeFor(t, cellOf(t)?.released ? 'override' : 'score', parsed.value, cellOf(t)?.released ? overrideReason?.trim() : undefined)); }
      else if (op === 'clear') {
        const cell = cellOf(t);
        if (view === 'student' && cell?.display?.state === 'held') { setError('Switch to Include held to clear held scores.'); return; }
        if ((cell?.display?.adjusted === null && cell?.display?.raw == null && !cell?.released) || (cell?.score === null && !cell?.released && cell?.display?.state !== 'held')) continue;
        changes.push(changeFor(t, op, undefined, reason?.trim()));
        continue;
      }
      else changes.push(changeFor(t, op, undefined, reason?.trim()));
    }
    if (changes.length) await send(changes, `${changes.length} gradebook ${changes.length === 1 ? 'cell' : 'cells'} changed.`);
  }
  async function undo() {
    if (!lastBatch) return;
    setBusy(true);
    try { const events = await api.listGradeEvents({ courseId, limit: 100 }); const event = events.items.find(e => e.batchId === lastBatch); if (!event) throw new Error('The latest change was not found in history.'); await undoMutation.mutateAsync({ eventId: event.id }); setLastBatch(null); setError(''); setMessage('Last change undone.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Undo failed.'); }
    finally { setBusy(false); }
  }
  async function exportCsv() { try { const result = await exporting.mutateAsync({ courseId, view, format: 'csv' }); if (!('csv' in result)) throw new Error('CSV not returned.'); const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv' })); const link = document.createElement('a'); link.href = url; link.download = filename(courseId); link.click(); URL.revokeObjectURL(url); setMessage('CSV downloaded.'); } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.'); } }
  const columns = useMemo(() => { const columns: GridColumn<GradebookRow>[] = ordered.map(a => {
    const details = itemMap.get(a.id); const category = setup.data?.categories.find(c => c.id === details?.categoryId);
    const drop = category?.drop.lowest ? ` · drop lowest ${category.drop.lowest}` : category?.drop.highest ? ` · drop highest ${category.drop.highest}` : '';
    const graded = rows.map(r => r.cells.find(c => c.assignmentId === a.id)).filter(c => c?.display && c.display.adjusted !== null && !['excused', 'missing', 'held', 'to-grade', 'not-submitted', 'not-due'].includes(c.display.state));
    const average = graded.length ? (graded.reduce((n, c) => n + (c?.display?.adjusted ?? 0), 0) / graded.length).toFixed(1) : '—';
    const hasHeld = rows.some(r => r.cells.find(c => c.assignmentId === a.id)?.display?.state === 'held');
    return { key: a.id, band: category?.id ?? 'uncategorized', bandLabel: `${category?.name ?? 'Other'} ${category ? `${category.weight}%` : ''}${drop}`, tint: !!(category && category.position % 2), header: <span className={styles.itemHead}><strong>{a.title}</strong><small>{a.points} pts · {shortDate(a.dueAt)}</small><small>{details?.extraCredit ? 'Extra credit · ' : details?.countsTowardGrade === false ? 'Not counted · ' : hasHeld ? 'Held · ' : ''}avg {average}</small></span>, ariaLabel: row => { const cell = row.cells.find(c => c.assignmentId === a.id); return cell?.display ? gradeCellText({ display: cell.display, student: row.student.name, item: a.title, points: a.points, feedbackDraft: drafts.data?.has(`${row.student.id}:${a.id}`) }) : `${row.student.name}, ${a.title}, no score`; }, editValue: row => cellEditText(row.cells.find(c => c.assignmentId === a.id)), render: (row, active, editing) => { const cell = row.cells.find(c => c.assignmentId === a.id); return cell?.display ? <GradeCell display={cell.display} student={row.student.name} item={a.title} points={a.points} active={active} editing={editing} feedbackDraft={drafts.data?.has(`${row.student.id}:${a.id}`)} /> : <span>–</span>; } };
  });
  columns.push({ key: 'current', band: 'course', bandLabel: 'Course', header: <span className={styles.itemHead}><strong>Current</strong><small>{view === 'student' ? 'released only' : 'including held'}</small></span>, readOnly: true, ariaLabel: row => `${row.student.name}, Current ${row.result?.percent === null || row.result?.percent === undefined ? 'not calculated' : `${row.result.percent.toFixed(1)} percent`}, ${row.result?.letter ?? 'no letter'}, ${view === 'student' ? 'released only' : 'including held'}`, render: row => <span className={styles.currentValue}><strong>{row.result?.percent === null || row.result?.percent === undefined ? '—' : `${row.result.percent.toFixed(1)}%`}</strong>{row.result?.letter && <StatusChip tone={/^[DF]/.test(row.result.letter) ? 'warning' : 'neutral'}>{row.result.letter}</StatusChip>}</span> });
  return columns; }, [ordered, itemMap, setup.data, rows, view, drafts.data]);
  function gridAction(action: 'excuse' | 'missing' | 'override' | 'fill' | 'select' | 'shortcuts' | 'undo', at: typeof selection) {
    if (action === 'shortcuts') { shortcutOpener.current = document.activeElement as HTMLElement; setShortcuts(true); return; } if (action === 'undo') { void undo(); return; }
    const row = visibleRows[at.row], a = ordered[at.col]; if (!row) return;
    if (action === 'select') { openPanel(row.student.id, document.activeElement as HTMLElement); return; }
    if (!a) return;
    const t = target(row, a.id);
    if (action === 'excuse') { const reason = window.prompt(`Reason to excuse ${row.student.name} from ${a.title}`); if (reason?.trim()) void send([changeFor(t, 'excuse', undefined, reason.trim())], `${row.student.name}: ${a.title} excused.`); }
    if (action === 'missing') void send([changeFor(t, 'mark-missing')], `${row.student.name}: ${a.title} marked missing.`);
    if (action === 'override') { const value = window.prompt('Override score'); if (value === null) return; const parsed = parseGradeValue(value, a.points); if (!parsed || parsed.kind !== 'score') { setError('Enter a valid score.'); return; } const reason = window.prompt('Reason for override'); if (reason?.trim()) void send([changeFor(t, 'override', parsed.value, reason.trim())], `${row.student.name}: ${a.title} overridden.`); }
    if (action === 'fill') {
      const source = visibleRows[Math.min(at.row, at.fromRow)];
      const sourceTarget = target(source, a.id);
      const value = cellRawNumber(cellOf(sourceTarget));
      if (value === null) { setError('Select a scored source cell to fill down.'); return; }
      const targets = rangeTargets(at).filter(x => x.assignmentId === a.id && x.row.student.id !== source.student.id);
      if (!targets.length) return;
      const hasReleased = targets.some(x => cellOf(x)?.released);
      let overrideReason: string | undefined;
      if (hasReleased) {
        const reason = window.prompt('Reason for overriding released scores in this fill-down');
        if (!reason?.trim()) return;
        overrideReason = reason.trim();
      }
      const changes = targets.map(x => changeFor(x, cellOf(x)?.released ? 'override' : 'score', value, cellOf(x)?.released ? overrideReason : undefined));
      void send(changes, `Filled ${changes.length} cells from ${source.student.name}.`);
    }
  }
  const loading = book.isPending || setup.isPending || assignments.isPending;
  if (loading) return <Loading />;
  if (book.error || setup.error || assignments.error) return <ErrorNotice error={book.error ?? setup.error ?? assignments.error!} onRetry={() => { void book.refetch(); void setup.refetch(); void assignments.refetch(); }} />;
  return <div className={styles.page}>
    <header className={styles.heading}><div><h2>Gradebook</h2><p>{courseId === 'stat110-04' ? 'Section 04 · ' : ''}{rows.length} students · Meridian State</p></div><div className={styles.pageActions}><Link className={styles.next} to={paths.teach.gradebookSetup(courseId)}>Setup check</Link><button type="button" onClick={() => void exportCsv()} disabled={exporting.isPending}>↓ Export CSV</button><button type="button" className={styles.primary} disabled title="Release preview arrives in M5">Release — next</button></div></header>
    <div className={styles.toolbar}><label className={styles.search}>Find a student<input type="search" value={find} placeholder="Find a student" onChange={e => setFind(e.target.value)} /></label><div className={styles.filters}><span>Show only</span>{filters.map(f => <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(filter === f.key ? null : f.key)}><StateLabel state={f.key} label={`${f.label} ${counts[f.key]}`} /></button>)}</div><SegmentedControl legend="Grade visibility" hideLegend name="gradebook-view" density="compact" value={view} onChange={value => setView(value as typeof view)} options={[{ value: 'student', label: 'Released only' }, { value: 'held', label: 'Include held' }]} /><SegmentedControl legend="Grid density" hideLegend name="gradebook-density" density="compact" value={density} onChange={value => { setDensity(value as typeof density); try { localStorage.setItem(densityKey, value); } catch { /* storage blocked */ } }} options={[{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }]} /></div>
    {(selected.size > 0 || selection.row !== selection.fromRow || selection.col !== selection.fromCol) && <div className={styles.bulk} aria-label="Selected grade actions"><strong>{selected.size ? `${selected.size} students selected` : 'Cell range selected'}</strong><button onClick={() => void bulk('score')} disabled={busy}>Set score</button><button onClick={() => void bulk('excuse')} disabled={busy}>Excuse</button><button onClick={() => void bulk('mark-missing')} disabled={busy}>Mark missing</button><button onClick={() => void bulk('clear-missing')} disabled={busy}>Clear missing</button><button onClick={() => void bulk('clear')} disabled={busy}>Clear score</button><button onClick={() => setSelected(new Set())}>Clear selection</button></div>}
    {error && <StatusNotice tone="error" live="assertive">{error}</StatusNotice>}{conflict && <div className={styles.conflict} role="alert"><p>Changed by {conflict.current.by ?? 'another editor'}{conflict.current.at ? ` at ${new Date(conflict.current.at).toLocaleTimeString()}` : ''}. Keep theirs or use yours.</p><button onClick={() => { setConflict(null); void book.refetch(); }}>Keep theirs</button><button onClick={async () => { const pending = conflict.changes; setConflict(null); const fresh = await book.refetch(); if (!fresh.data) return; const rebased = pending.map(c => { const current = fresh.data.rows.find(r => r.student.id === c.studentId)?.cells.find(cell => cell.assignmentId === c.assignmentId); return { ...c, expectedVersion: ['score', 'clear'].includes(c.op) && !current?.released ? current?.submissionVersion ?? 0 : current?.itemStateVersion ?? 0 }; }); void send(rebased, 'Your change saved after review.'); }}>Use yours</button></div>}
    <div className={panelRow ? styles.withPanel : styles.gridOnly}><DataGrid caption="Faculty gradebook" rows={visibleRows} columns={columns} rowKey={row => row.student.id} rowName={row => row.student.name} density={density} selectedRows={selected} onSelectRow={id => setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })} onOpenRow={(id, opener) => openPanel(id, opener)} onSelectionChange={setSelection} onCommit={(row, col, text) => score(target(row, col.key), text)} onAction={gridAction} />{panelRow && <StudentPanel courseId={courseId} row={panelRow} assignments={assignments.data ?? []} onClose={closePanel} onNavigate={movePanel} />}</div>
    <div className={styles.mobile}>{visibleRows.map(row => <article key={row.student.id} className={styles.studentCard}><label><input type="checkbox" checked={selected.has(row.student.id)} onChange={() => setSelected(prev => { const next = new Set(prev); next.has(row.student.id) ? next.delete(row.student.id) : next.add(row.student.id); return next; })} /> <button type="button" onClick={event => openPanel(row.student.id, event.currentTarget)}>Open {row.student.name} grade details</button></label><p>Current {row.result?.percent === null || row.result?.percent === undefined ? '—' : `${row.result.percent}%`} {row.result?.letter}</p><dl>{ordered.map(a => { const cell = row.cells.find(c => c.assignmentId === a.id); return <div key={a.id}><dt>{a.title}</dt><dd>{cell?.display && <GradeCell display={cell.display} student={row.student.name} item={a.title} points={a.points} feedbackDraft={drafts.data?.has(`${row.student.id}:${a.id}`)} />}</dd><button type="button" onClick={() => { const value = window.prompt(`Score or EX for ${row.student.name}, ${a.title}`, cellEditText(cell)); if (value !== null) void score(target(row, a.id), value); }}>Edit {a.title}</button></div>; })}</dl></article>)}</div>
    <footer className={styles.status}><div className={styles.legend}>{legend.map(state => <StateLabel key={state} state={state} />)}</div><div className={styles.last} aria-live="polite">{message}{lastBatch && <button type="button" disabled={busy} onClick={() => void undo()}>Undo (⌘Z)</button>}</div></footer>
    {shortcuts && <div className={styles.modalBackdrop}><div className={styles.modal} role="dialog" aria-modal="true" aria-label="Gradebook shortcuts" onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); (e.currentTarget.querySelector('button') as HTMLButtonElement | null)?.focus(); } if (e.key === 'Escape') { setShortcuts(false); requestAnimationFrame(() => shortcutOpener.current?.focus()); } }}><h3>Gradebook shortcuts</h3><p>Arrows move · Shift+arrows select · Enter edit/save · Tab save/right · Esc cancel · E excuse · M missing · O override · Space open student panel · ⌘/Ctrl+D fill down · ⌘/Ctrl+Z undo</p><button autoFocus onClick={() => { setShortcuts(false); requestAnimationFrame(() => shortcutOpener.current?.focus()); }}>Close shortcuts</button></div></div>}
  </div>;
}

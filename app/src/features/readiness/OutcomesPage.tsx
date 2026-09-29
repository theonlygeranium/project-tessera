import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AiContent, Button, StatusNotice, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import type { Outcome } from '../../../../shared/domain';

export function outcomeMarker(row: Outcome) {
  if (!row.provenance) return null;
  return { who: `Suggested by ${row.provenance.model}`, source: `${row.provenance.keptBy ? `kept by ${row.provenance.keptBy} · ` : ''}${row.provenance.summary}` };
}

export function canKeepOutcome(row: { id?: string; text: string }, saved: { id: string; text: string }[] | undefined): boolean {
  return !!row.id && saved?.find(item => item.id === row.id)?.text === row.text;
}

export function OutcomesPage() {
  const { courseId = '' } = useParams(); usePageTitle('Course outcomes');
  const query = useApiQuery('listOutcomes', { courseId }); const save = useApiMutation('saveOutcomes'); const keep = useApiMutation('keepOutcome');
  const [rows, setRows] = useState<{ id?: string; text: string; aiState?: 'draft' | 'kept'; provenance?: Outcome['provenance'] }[]>([]); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [conflict, setConflict] = useState(false);
  useEffect(() => { if (query.data) setRows(query.data.map(({ id, text, aiState, provenance }) => ({ id, text, aiState, provenance }))); }, [query.data]);
  const swap = (i: number, j: number) => { const next = [...rows]; [next[i], next[j]] = [next[j], next[i]]; setRows(next); };
  return <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}><TopBar title="Course outcomes" /><p>Outcomes describe what learners will be able to do. Add them in the order you want them shown.</p>
    {query.isPending ? <Loading /> : query.error ? <ErrorNotice error={query.error} onRetry={() => void query.refetch()} /> : <form onSubmit={e => { e.preventDefault(); void (async () => { try { await save.mutateAsync({ courseId, outcomes: rows }); setError(''); setConflict(false); setMessage('Outcomes saved.'); } catch (err) { setMessage(''); setConflict(!!err && typeof err === 'object' && 'code' in err && err.code === 'conflict'); setError(err && typeof err === 'object' && 'code' in err && err.code === 'conflict' ? 'Outcomes changed while you were editing. Reload to see the latest.' : err instanceof Error ? err.message : 'Could not save outcomes.'); } })(); }}>
      {rows.map((row, i) => { const editor = <><label htmlFor={`outcome-${i}`}>O{i + 1}</label> <input id={`outcome-${i}`} required maxLength={500} value={row.text} onChange={e => setRows(rows.map((r, j) => i === j ? { ...r, text: e.target.value } : r))} style={{ width: 'min(100%, 35rem)' }} /> <Button type="button" disabled={i === 0} onClick={() => swap(i, i - 1)}>Move up</Button> <Button type="button" disabled={i === rows.length - 1} onClick={() => swap(i, i + 1)}>Move down</Button> <Button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</Button></>; const marker = row.id ? outcomeMarker(row as Outcome) : null; return <div key={row.id ?? `new-${i}`} style={{ marginBlock: '1rem' }}>{row.aiState === 'draft' && row.id ? <AiContent kind="block" state="draft" who={marker?.who ?? 'Assistant'} source={marker?.source ?? 'added through an API token or assistant'} actions={<>{!canKeepOutcome(row, query.data) && <span>Save your edit before keeping this outcome.</span>}<Button type="button" disabled={keep.isPending || !canKeepOutcome(row, query.data)} onClick={() => void keep.mutateAsync({ courseId, outcomeId: row.id!, expectedText: row.text }).then(() => query.refetch()).catch(err => { setError(err instanceof Error ? err.message : 'Could not keep outcome.'); void query.refetch(); })}>Keep outcome</Button></>}>{editor}</AiContent> : marker ? <AiContent kind="block" state="kept" {...marker}>{editor}</AiContent> : editor}</div>; })}
      <Button id="add-outcome" type="button" onClick={() => setRows([...rows, { text: '' }])}>Add outcome</Button> <Button type="submit" variant="primary" disabled={save.isPending}>Save outcomes</Button><p role="status">{message}</p>{error && <StatusNotice tone="error" live="assertive" action={conflict ? <Button type="button" onClick={() => { void query.refetch().then(result => { if (result.error) { setError(result.error.message); return; } setConflict(false); setError(''); requestAnimationFrame(() => (document.getElementById('outcome-0') ?? document.getElementById('add-outcome'))?.focus()); }); }}>Reload latest outcomes</Button> : undefined}>{error}</StatusNotice>}
    </form>}<p><Link to={paths.teach.readiness(courseId)}>View course readiness</Link></p></div>;
}

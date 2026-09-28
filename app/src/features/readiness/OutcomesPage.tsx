import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { PageHelp } from '../../help/PageHelp';
import { paths } from '../../paths';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';

export function OutcomesPage() {
  const { courseId = '' } = useParams(); usePageTitle('Course outcomes');
  const query = useApiQuery('listOutcomes', { courseId }); const save = useApiMutation('saveOutcomes');
  const [rows, setRows] = useState<{ id?: string; text: string }[]>([]); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { if (query.data) setRows(query.data.map(({ id, text }) => ({ id, text }))); }, [query.data]);
  const swap = (i: number, j: number) => { const next = [...rows]; [next[i], next[j]] = [next[j], next[i]]; setRows(next); };
  return <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}><TopBar title="Course outcomes" /><PageHelp topic="teach.outcomes" courseId={courseId} /><p>Outcomes describe what learners will be able to do. Add them in the order you want them shown.</p>
    {query.isPending ? <Loading /> : query.error ? <ErrorNotice error={query.error} onRetry={() => void query.refetch()} /> : <form onSubmit={e => { e.preventDefault(); void (async () => { try { await save.mutateAsync({ courseId, outcomes: rows }); setError(''); setMessage('Outcomes saved.'); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save outcomes.'); } })(); }}>
      {rows.map((row, i) => <div key={row.id ?? `new-${i}`} style={{ marginBlock: '1rem' }}><label htmlFor={`outcome-${i}`}>O{i + 1}</label> <input id={`outcome-${i}`} required maxLength={500} value={row.text} onChange={e => setRows(rows.map((r, j) => i === j ? { ...r, text: e.target.value } : r))} style={{ width: 'min(100%, 35rem)' }} /> <Button type="button" disabled={i === 0} onClick={() => swap(i, i - 1)}>Move up</Button> <Button type="button" disabled={i === rows.length - 1} onClick={() => swap(i, i + 1)}>Move down</Button> <Button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</Button></div>)}
      <Button type="button" onClick={() => setRows([...rows, { text: '' }])}>Add outcome</Button> <Button type="submit" variant="primary" disabled={save.isPending}>Save outcomes</Button><p role="status">{message}</p>{error && <p role="alert">{error}</p>}
    </form>}<p><Link to={paths.teach.readiness(courseId)}>View course readiness</Link></p></div>;
}

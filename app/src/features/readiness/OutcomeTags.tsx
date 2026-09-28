import { useState } from 'react';
import { useApiMutation, useApiQuery } from '../../data/hooks';

export function OutcomeTags({ courseId, targetKind, targetId }: { courseId: string; targetKind: 'block' | 'assignment'; targetId: string }) {
  const outcomes = useApiQuery('listOutcomes', { courseId }); const links = useApiQuery('listOutcomeLinks', { courseId }); const save = useApiMutation('setOutcomeLinks'); const [error, setError] = useState('');
  const selected = links.data?.filter(link => link.targetKind === targetKind && link.targetId === targetId).map(link => link.outcomeId) ?? [];
  const toggle = async (id: string) => { const outcomeIds = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]; try { await save.mutateAsync({ courseId, targetKind, targetId, outcomeIds }); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save outcome tags.'); } };
  return <details><summary>Assesses {selected.length ? `(${selected.length})` : ''}</summary>{outcomes.data?.length ? <fieldset><legend>Assessed outcomes</legend>{outcomes.data.map(outcome => <label key={outcome.id} style={{ display: 'block', padding: '.5rem' }}><input type="checkbox" checked={selected.includes(outcome.id)} onChange={() => void toggle(outcome.id)} /> {outcome.code}: {outcome.text}</label>)}</fieldset> : <p>Add course outcomes first.</p>}{error && <p role="alert">{error}</p>}</details>;
}

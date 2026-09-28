import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { RubricInput } from '../../../../shared/api';
import type { AutomaticCheck, RubricCheckKind } from '../../../../shared/domain';
import { AUTOMATIC_CHECKS } from '../../../../shared/quality';
import { Button, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';

const empty: RubricInput = { name: '', version: '1.0', attribution: null, standards: [] };
export function RubricsPage() {
  usePageTitle('Readiness rubrics'); const list = useApiQuery('listRubrics', undefined);
  return <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}><TopBar title="Readiness rubrics" /><p><Link to={paths.admin.rubric('new')}>Create custom rubric</Link></p>{list.isPending ? <Loading /> : list.error ? <ErrorNotice error={list.error} onRetry={() => void list.refetch()} /> : <ul>{list.data?.map(r => <li key={r.id}><Link to={paths.admin.rubric(r.id)}>{r.name}</Link> · {r.builtIn ? 'Built-in' : 'Custom'} · {r.standards.length} standards</li>)}</ul>}</div>;
}
export function RubricPage() {
  const { rubricId = '' } = useParams(); const isNew = rubricId === 'new'; const navigate = useNavigate(); usePageTitle(isNew ? 'Create rubric' : 'Rubric');
  const query = useApiQuery('getRubric', { rubricId }, { enabled: !isNew });
  const create = useApiMutation('createRubric'); const update = useApiMutation('updateRubric'); const remove = useApiMutation('deleteRubric');
  const [form, setForm] = useState<RubricInput>(empty); const [error, setError] = useState('');
  useEffect(() => { if (query.data) setForm({ name: query.data.name, version: query.data.version, attribution: query.data.attribution, standards: query.data.standards.map(s => ({ number: s.number, title: s.title, description: s.description, items: s.items.map(i => ({ number: i.number, text: i.text, kind: i.kind, check: i.check, criteria: i.criteria })) })) }); }, [query.data]);
  const builtIn = query.data?.builtIn ?? false;
  const changeStandard = (index: number, patch: Partial<RubricInput['standards'][number]>) => setForm({ ...form, standards: form.standards.map((s, i) => i === index ? { ...s, ...patch } : s) });
  const changeItem = (si: number, ii: number, patch: Partial<RubricInput['standards'][number]['items'][number]>) => changeStandard(si, { items: form.standards[si].items.map((item, i) => i === ii ? { ...item, ...patch } : item) });
  const save = async () => { try { setError(''); const r = isNew ? await create.mutateAsync(form) : await update.mutateAsync({ rubricId, ...form }); navigate(paths.admin.rubric(r.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save rubric.'); } };
  return <div style={{ maxWidth: 1000, margin: '0 auto', padding: '1.5rem' }}><TopBar title={isNew ? 'Create rubric' : query.data?.name ?? 'Rubric'} /><p><Link to={paths.admin.rubrics}>All rubrics</Link></p>
    {!isNew && query.isPending ? <Loading /> : !isNew && query.error ? <ErrorNotice error={query.error} onRetry={() => void query.refetch()} /> : <form onSubmit={e => { e.preventDefault(); void save(); }}>
      <p><label htmlFor="rubric-name">Name</label> <input id="rubric-name" required disabled={builtIn} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></p>
      <p><label htmlFor="rubric-version">Version</label> <input id="rubric-version" disabled={builtIn} value={form.version ?? ''} onChange={e => setForm({ ...form, version: e.target.value })} /></p>
      <p><label htmlFor="rubric-attribution">Attribution</label> <textarea id="rubric-attribution" disabled={builtIn} value={form.attribution ?? ''} onChange={e => setForm({ ...form, attribution: e.target.value })} /></p>
      {form.standards.map((s, si) => <section key={si} style={{ padding: '1rem', marginBlock: '1.5rem', border: '1px solid currentColor', borderRadius: 8 }}><h2>Standard {s.number}</h2>
        <p><label htmlFor={`standard-number-${si}`}>Number</label> <input id={`standard-number-${si}`} required disabled={builtIn} value={s.number} onChange={e => changeStandard(si, { number: e.target.value })} /></p>
        <p><label htmlFor={`standard-title-${si}`}>Title</label> <input id={`standard-title-${si}`} required disabled={builtIn} value={s.title} onChange={e => changeStandard(si, { title: e.target.value })} /></p>
        <p><label htmlFor={`standard-description-${si}`}>Description</label> <textarea id={`standard-description-${si}`} disabled={builtIn} value={s.description ?? ''} onChange={e => changeStandard(si, { description: e.target.value })} /></p>
        {s.items.map((item, ii) => <fieldset key={ii} style={{ marginBlock: '1rem' }}><legend>Item {item.number}</legend>
          <p><label htmlFor={`item-number-${si}-${ii}`}>Number</label> <input id={`item-number-${si}-${ii}`} required disabled={builtIn} value={item.number} onChange={e => changeItem(si, ii, { number: e.target.value })} /></p>
          <p><label htmlFor={`item-text-${si}-${ii}`}>Text</label> <textarea id={`item-text-${si}-${ii}`} required disabled={builtIn} value={item.text} onChange={e => changeItem(si, ii, { text: e.target.value })} /></p>
          <p><label htmlFor={`item-kind-${si}-${ii}`}>Kind</label> <select id={`item-kind-${si}-${ii}`} disabled={builtIn} value={item.kind} onChange={e => changeItem(si, ii, { kind: e.target.value as RubricCheckKind, check: null })}><option value="automatic">Automatic</option><option value="ai">AI-assisted</option><option value="attestation">Attestation</option></select></p>
          {item.kind === 'automatic' ? <p><label htmlFor={`item-check-${si}-${ii}`}>Check</label> <select id={`item-check-${si}-${ii}`} required disabled={builtIn} value={item.check ?? ''} onChange={e => changeItem(si, ii, { check: e.target.value as AutomaticCheck })}><option value="">Choose a check</option>{Object.keys(AUTOMATIC_CHECKS).map(check => <option key={check} value={check}>{check.replaceAll('-', ' ')}</option>)}</select></p> : <p><label htmlFor={`item-criteria-${si}-${ii}`}>Criteria</label> <textarea id={`item-criteria-${si}-${ii}`} disabled={builtIn} value={item.criteria ?? ''} onChange={e => changeItem(si, ii, { criteria: e.target.value })} /></p>}
          {!builtIn && <Button type="button" onClick={() => changeStandard(si, { items: s.items.filter((_, i) => i !== ii) })}>Remove item</Button>}
        </fieldset>)}{!builtIn && <><Button type="button" onClick={() => changeStandard(si, { items: [...s.items, { number: `${s.number}.${s.items.length + 1}`, text: '', kind: 'attestation', criteria: '' }] })}>Add item</Button> <Button type="button" onClick={() => setForm({ ...form, standards: form.standards.filter((_, i) => i !== si) })}>Remove standard</Button></>}
      </section>)}
      {!builtIn && <><Button type="button" onClick={() => setForm({ ...form, standards: [...form.standards, { number: String(form.standards.length + 1), title: '', description: '', items: [] }] })}>Add standard</Button> <Button type="submit" variant="primary">Save rubric</Button> {!isNew && <Button type="button" onClick={() => { if (window.confirm('Delete this rubric?')) void remove.mutateAsync({ rubricId }).then(() => navigate(paths.admin.rubrics)).catch(e => setError(e.message)); }}>Delete rubric</Button>}</>}
      {error && <p role="alert">{error}</p>}{query.data?.source === 'oscqr' && <footer><h2>Attribution</h2><p>{query.data.attribution}</p></footer>}
    </form>}
  </div>;
}

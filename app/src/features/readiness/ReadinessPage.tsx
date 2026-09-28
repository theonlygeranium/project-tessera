import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { FixLink, ItemResult } from '../../../../shared/domain';
import { AiContent, Button, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { fixHref } from './fixHref';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import { useSession } from '../../shell/session';

const itemWords: Record<ItemResult['status'], string> = { met: 'Met', 'not-met': 'Not met', 'needs-review': 'Needs review', attested: 'Attested', 'not-applicable': 'Not applicable' };
const standardWords = { met: 'Met', 'partly-met': 'Partly met', 'not-met': 'Not met', 'not-applicable': 'Not applicable' };
export function Fixes({ courseId, fixes }: { courseId: string; fixes: FixLink[] }) {
  return fixes.length ? <ul>{fixes.map((fix, i) => <li key={i}><Link to={fixHref(courseId, fix)}>{fix.label}</Link></li>)}</ul> : null;
}
export function ReadinessPage({ admin = false }: { admin?: boolean }) {
  const { courseId = '' } = useParams(); const { institution } = useSession();
  const [rubricId, setRubricId] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  const [form, setForm] = useState<{ itemId: string; status: 'attested' | 'not-applicable'; note: string } | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const rubrics = useApiQuery('listRubrics', undefined); const report = useApiQuery('getCourseReadiness', { courseId, rubricId: rubricId || undefined });
  const runAi = useApiMutation('runReadinessAi'); const review = useApiMutation('reviewFinding'); const attest = useApiMutation('attestItem'); const clear = useApiMutation('clearAttestation');
  usePageTitle('Course readiness');
  const result = report.data, minimum = institution.readinessPolicy?.rubricId === result?.rubricId ? institution.readinessPolicy?.minimumPercent ?? null : null;
  const run = async (name: string, task: () => Promise<unknown>) => { setBusy(name); setError(''); try { await task(); } catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); } finally { setBusy(''); } };
  const close = () => { setForm(null); requestAnimationFrame(() => opener.current?.focus()); };
  return <div style={{ maxWidth: 1000, margin: '0 auto', padding: '1.5rem' }}><TopBar title="Course readiness" />
    {report.isPending || rubrics.isPending ? <Loading /> : report.error ? <ErrorNotice error={report.error} onRetry={() => void report.refetch()} /> : rubrics.error ? <ErrorNotice error={rubrics.error} onRetry={() => void rubrics.refetch()} /> : result && <>
      <label htmlFor="readiness-rubric">Rubric</label> <select id="readiness-rubric" value={result.rubricId} onChange={e => setRubricId(e.target.value)}>{rubrics.data?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      <h2>{result.rubricName}</h2><p><strong>{result.met} of {result.applicable} met · {result.percent}%</strong> · {minimum === null ? 'Advisory' : `Publishing needs ${minimum}%`}</p><p>{result.needsReview} items need review</p>
      <Button disabled={!!busy} onClick={() => void run('Checking AI-assisted items…', () => runAi.mutateAsync({ courseId, rubricId: result.rubricId }))}>Check AI-assisted items</Button>
      <p role="status">{busy}</p>{error && <p role="alert">{error}</p>}
      {result.standards.map(standard => <section key={standard.standardId} aria-labelledby={`standard-${standard.standardId}`} style={{ marginBlock: '2rem' }}><h2 id={`standard-${standard.standardId}`}>{standard.number}. {standard.title} · {standardWords[standard.status]} · {standard.met} of {standard.applicable} met</h2>
        {standard.items.map(item => <article key={item.itemId} style={{ padding: '1rem', marginBlock: '.75rem', background: item.status === 'not-applicable' ? 'var(--surface-alt)' : 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8 }}><h3>{item.number}. {item.text}</h3><p><strong>{itemWords[item.status]}</strong></p><ul>{(item.evidence.length ? item.evidence : [item.kind === 'ai' ? 'No AI finding has been reviewed for this item yet.' : 'No reviewer attestation has been recorded for this item yet.']).map((e, i) => <li key={i}>{e}</li>)}</ul>{!admin && <Fixes courseId={courseId} fixes={item.fixes} />}
          {item.finding && <AiContent kind="note" who={`AI finding · ${item.finding.provenance.model}`} source={item.finding.provenance.summary} actions={item.finding.state === 'draft' ? <><Button onClick={() => void run('Accepting…', () => review.mutateAsync({ courseId, rubricId: result.rubricId, itemId: item.itemId, decision: 'accept' }))}>Accept</Button> <Button onClick={() => void run('Dismissing…', () => review.mutateAsync({ courseId, rubricId: result.rubricId, itemId: item.itemId, decision: 'dismiss' }))}>Dismiss</Button></> : undefined}><p>Verdict: {item.finding.verdict.replaceAll('-', ' ')}</p><p>Evidence: {item.finding.evidence}</p><p>Suggestion: {item.finding.suggestion}</p><p>{item.finding.state === 'draft' ? 'Draft · needs a person to review' : `${item.finding.state === 'accepted' ? 'Accepted' : 'Dismissed'} by ${item.finding.reviewedBy ?? 'reviewer'}`}</p></AiContent>}
          {item.attestation && <p>{item.attestation.status === 'attested' ? 'Attested' : 'Not applicable'} by {item.attestation.byName} · {item.attestation.note} <Button onClick={() => void run('Clearing…', () => clear.mutateAsync({ courseId, rubricId: result.rubricId, itemId: item.itemId }))}>Clear</Button></p>}
          {!item.attestation && <div>{item.kind !== 'automatic' && <Button onClick={e => { opener.current = e.currentTarget; setForm({ itemId: item.itemId, status: 'attested', note: '' }); }}>Attest</Button>} <Button onClick={e => { opener.current = e.currentTarget; setForm({ itemId: item.itemId, status: 'not-applicable', note: '' }); }}>Not applicable</Button></div>}
          {form?.itemId === item.itemId && <form onSubmit={e => { e.preventDefault(); void run('Saving attestation…', async () => { await attest.mutateAsync({ courseId, rubricId: result.rubricId, itemId: item.itemId, status: form.status, note: form.note }); close(); }); }}><h4>{form.status === 'attested' ? 'Attest item' : 'Mark not applicable'}</h4><label htmlFor={`note-${item.itemId}`}>Reviewer note</label><textarea id={`note-${item.itemId}`} maxLength={2000} required={form.status === 'not-applicable'} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /><Button type="submit">Save</Button> <Button type="button" onClick={close}>Cancel</Button></form>}
        </article>)}
      </section>)}{result.attribution && <footer><h2>Attribution</h2><p>{result.attribution}</p></footer>}
    </>}</div>;
}

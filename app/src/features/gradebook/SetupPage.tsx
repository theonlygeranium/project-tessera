import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { GradebookSetup, SetupCheck } from '../../../../shared/grading/types';
import { draftSetupFromSyllabusAssessments } from '../../../../shared/grading/syllabus-prefill';
import { ChangeSetTable, SetupCheckList, StatusNotice, TopBar, WeightMeter } from '../../components';
import { api, useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './SetupPage.module.css';
import { reconcileDismissedSetup } from './reconcile-dismissed-setup';

const demoAssessments = [
  { name: 'Homework', weightPercent: 15, page: 4 }, { name: 'Quizzes', weightPercent: 20, page: 4 },
  { name: 'Midterm', weightPercent: 20, page: 4 }, { name: 'Project', weightPercent: 40, page: 4 },
  { name: 'Participation', weightPercent: 5, page: 4 },
];
type Patch = SetupCheck['fixes'][number]['patch'];
export function SetupPage() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  usePageTitle('Grade setup');
  const saved = useApiQuery('getGradebookSetup', { courseId });
  const assignments = useApiQuery('listAssignments', { courseId });
  const [draft, setDraft] = useState<GradebookSetup | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [previewDraft, setPreviewDraft] = useState<GradebookSetup | null>(null);
  const [pageHint, setPageHint] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  useEffect(() => { if (saved.data) setDraft(current => current ?? saved.data!); }, [saved.data]);
  useEffect(() => { if (!draft) return; const timer = window.setTimeout(() => setPreviewDraft(draft), 250); return () => window.clearTimeout(timer); }, [draft]);
  const preview = useQuery({ queryKey: ['previewGradebookSetup', courseId, previewDraft], queryFn: () => api.previewGradebookSetup({ courseId, setup: previewDraft! }), enabled: !!previewDraft });
  const save = useApiMutation('saveGradebookSetup');
  const dismiss = useApiMutation('dismissSetupCheck');
  function patchCategory(id: string, update: Partial<GradebookSetup['categories'][number]>) {
    setDraft(current => current && ({ ...current, categories: current.categories.map(c => c.id === id ? { ...c, ...update } : c) }));
  }
  function applyFix(patch: Patch) {
    if ('kind' in patch && patch.kind === 'open-item') { navigate(paths.teach.assignment(courseId, patch.assignmentId)); return; }
    setDraft(current => current && ({ ...current, ...patch }));
  }
  async function dismissCheck(check: SetupCheck) {
    try {
      const next = await dismiss.mutateAsync({ courseId, code: check.code, target: check.target });
      const reconciled = reconcileDismissedSetup(draftRef.current, next);
      if ('stale' in reconciled) {
        setConflict(true); setMessage(''); setError('');
        return;
      }
      setDraft(reconciled.setup); setConflict(false); setMessage('Review check dismissed.'); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not dismiss check.'); }
  }
  function useDemo() {
    if (!draft) return;
    const proposed = draftSetupFromSyllabusAssessments(courseId, demoAssessments, 'demo-syllabus-stat110-04');
    const byName = new Map(draft.categories.map(c => [c.name.toLowerCase(), c]));
    setDraft({ ...draft, categories: proposed.categories.map(c => {
      const existing = byName.get(c.name.toLowerCase());
      return existing ? { ...existing, weight: c.weight, position: c.position } : c;
    }), source: proposed.source });
    setPageHint(proposed.pageHint);
    setMessage('Syllabus weights are in the draft. Review the setup check before saving.');
  }
  async function saveDraft() {
    if (conflict || !draft || !preview.data || previewDraft !== draft) return;
    try {
      const next = await save.mutateAsync({ courseId, setup: draft, expectedVersion: draft.version, hash: preview.data.changeSet.hash });
      setDraft(next); setConflict(false); setError(''); setMessage('Grade setup saved.');
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : 'Could not save setup.';
      setConflict(/conflict|changed since/i.test(text)); setError(text);
    }
  }
  if (saved.isPending || assignments.isPending) return <Loading />;
  if (saved.error || assignments.error) return <ErrorNotice error={saved.error ?? assignments.error!} onRetry={() => { void saved.refetch(); void assignments.refetch(); }} />;
  if (!draft) return <Loading />;
  const ready = previewDraft === draft && !!preview.data && !preview.isFetching;
  const checks = ready ? preview.data!.checks.filter(c => c.severity !== 'review' || !draft.dismissedChecks.some(d => d.code === c.code && d.target === c.target)) : [];
  const blocking = conflict || !ready || checks.some(c => c.severity === 'fix');
  const changes = ready ? preview.data!.changeSet.changes.filter(c => c.from.percent !== c.to.percent || c.from.letter !== c.to.letter).length : null;
  const unsaved = saved.data ? draft.categories.filter(category => JSON.stringify(category) !== JSON.stringify(saved.data!.categories.find(c => c.id === category.id))).length + Number(JSON.stringify({ late: draft.late, missing: draft.missing, extraCredit: draft.extraCredit, source: draft.source }) !== JSON.stringify({ late: saved.data.late, missing: saved.data.missing, extraCredit: saved.data.extraCredit, source: saved.data.source })) : 0;
  return <div className={styles.page}>
    <TopBar title="Grade setup" breadcrumbs={[{ label: 'Grades', href: paths.teach.gradebook(courseId) }, { label: 'Setup' }]} renderLink={renderRouterLink} />
    <header className={styles.heading}><p>Adjust how current grades are calculated for this course.</p><div>{unsaved > 0 && <span>{unsaved} unsaved {unsaved === 1 ? 'change' : 'changes'}</span>} <button type="button" onClick={() => { setDraft(saved.data!); setPageHint(null); setMessage('Draft discarded.'); }}>Discard draft</button> <Link to={paths.teach.gradebook(courseId)}>← Back to grades</Link></div></header>
    {draft.source.kind === 'syllabus' && <div className={styles.banner}><strong>From your syllabus</strong>{pageHint !== null && `, p. ${pageHint}`}. Review the proposed weights before saving.</div>}
    {courseId === 'stat110-04' && <button type="button" className={styles.demo} onClick={useDemo}>Use syllabus weights (demo)</button>}
    <div className={styles.layout}><main className={styles.main}>
      <section className={styles.card}><h2>Categories and weights</h2><p>Weights apply to the released grade. Changes stay in this draft until you save.</p><div className={styles.scroll}><table><thead><tr><th scope="col">Category</th><th scope="col">Weight</th><th scope="col">Items</th><th scope="col">Drop lowest</th><th scope="col">Keep at least</th><th scope="col">Late applies</th></tr></thead><tbody>{draft.categories.map(category => {
        const original = saved.data?.categories.find(c => c.id === category.id);
        const count = assignments.data?.filter(a => a.categoryId === category.id).length ?? 0;
        return <tr key={category.id}><th scope="row">{category.name}</th><td><label className={styles.number}><span className={styles.sr}>{category.name} weight percent</span><input type="number" min="0" max="100" step="0.01" value={category.weight} onChange={e => patchCategory(category.id, { weight: Number(e.target.value) })} />%</label>{original && original.weight !== category.weight && <small>was {original.weight}%</small>}</td><td>{count} {count === 1 ? 'item' : 'items'}</td><td><label className={styles.number}><span className={styles.sr}>{category.name} drop lowest</span><input type="number" min="0" step="1" value={category.drop.lowest} onChange={e => patchCategory(category.id, { drop: { ...category.drop, lowest: Number(e.target.value) } })} /></label></td><td><label className={styles.number}><span className={styles.sr}>{category.name} keep at least</span><input type="number" min="1" step="1" value={category.drop.keepAtLeast} onChange={e => patchCategory(category.id, { drop: { ...category.drop, keepAtLeast: Number(e.target.value) } })} /></label></td><td><label><input type="checkbox" checked={category.lateApplies} onChange={e => patchCategory(category.id, { lateApplies: e.target.checked })} /><span className={styles.sr}>Late applies to {category.name}</span></label></td></tr>;
      })}</tbody></table></div><WeightMeter categories={draft.categories} /></section>
      <div className={styles.cards}><section className={styles.card}><h2>Late, missing and excused</h2><label><input type="checkbox" checked={draft.late.enabled} onChange={e => setDraft({ ...draft, late: { ...draft.late, enabled: e.target.checked } })} /> Apply late penalty</label><div className={styles.fields}><label>Deduct % per {draft.late.period}<input type="number" min="0" max="100" step="0.1" value={draft.late.percentPerPeriod} onChange={e => setDraft({ ...draft, late: { ...draft.late, percentPerPeriod: Number(e.target.value) } })} /></label><label>Maximum periods<input type="number" min="0" step="1" value={draft.late.maxPeriods ?? ''} placeholder="No limit" onChange={e => setDraft({ ...draft, late: { ...draft.late, maxPeriods: e.target.value === '' ? null : Number(e.target.value) } })} /></label></div><fieldset><legend>Missing work</legend><label><input type="radio" name="missing-treatment" checked={draft.missing.treatAs === 'zero-after-due'} onChange={() => setDraft({ ...draft, missing: { ...draft.missing, treatAs: 'zero-after-due' } })} /> Zero after due</label><label><input type="radio" name="missing-treatment" checked={draft.missing.treatAs === 'exclude-until-graded'} onChange={() => setDraft({ ...draft, missing: { ...draft.missing, treatAs: 'exclude-until-graded' } })} /> Exclude until graded</label></fieldset><label><input type="checkbox" checked={draft.missing.droppable} onChange={e => setDraft({ ...draft, missing: { ...draft.missing, droppable: e.target.checked } })} /> Missing zeros can be dropped</label><p>Excused work is left out of both earned and possible points. Reasons stay private to instructors.</p></section>
        <section className={styles.card}><h2>Extra credit</h2><p>Extra credit adds earned points without adding possible points.</p><label className={styles.fields}>Cap each category at %<input type="number" min="0" step="0.1" value={draft.extraCredit.categoryCapPercent ?? ''} placeholder="No cap" onChange={e => setDraft({ ...draft, extraCredit: { ...draft.extraCredit, categoryCapPercent: e.target.value === '' ? null : Number(e.target.value) } })} /></label><p>Course cap: {draft.extraCredit.courseCapPoints === null ? 'none' : `${draft.extraCredit.courseCapPoints} points`}.</p></section>
        <section className={styles.card}><h2>Letter grades</h2><p>{draft.scheme.bands.map(b => `${b.letter} ${b.min}%+`).join(' · ')}</p><p>Round half up to one decimal place, then choose the letter from the rounded grade.</p></section></div>
    </main><aside className={styles.side}>{preview.isError && <StatusNotice tone="error">Could not preview this setup. Check the values and try again.</StatusNotice>}{!ready && <p role="status">Checking setup and calculating impact…</p>}{ready && <><div className={styles.card}><SetupCheckList checks={checks} setup={draft} onApplyFix={applyFix} onDismiss={check => void dismissCheck(check)} /></div><div className={styles.card}><ChangeSetTable changeSet={preview.data!.changeSet} /></div></>}</aside></div>
    {conflict && <StatusNotice tone="warning">Grades changed since this preview. Refresh the setup, review the new impact, then save again. <button type="button" onClick={() => { void saved.refetch().then(result => { if (result.data) { setDraft(result.data); setConflict(false); setPageHint(null); setMessage(''); setError(''); } }); }}>Refresh setup</button></StatusNotice>}
    {error && !conflict && <StatusNotice tone="error" live="assertive">{error}</StatusNotice>}{message && <StatusNotice tone="success" live="polite">{message}</StatusNotice>}
    <footer className={styles.footer}><button type="button" disabled={blocking || save.isPending} onClick={() => void saveDraft()}>{changes === null ? 'Save setup' : `Save setup · ${changes} ${changes === 1 ? 'grade' : 'grades'} change`}</button>{blocking && <span>{conflict ? 'Refresh setup before saving' : !ready ? 'Waiting for setup check' : 'Resolve items to fix before saving'}</span>}</footer>
  </div>;
}

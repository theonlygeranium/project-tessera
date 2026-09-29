import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Assignment } from '../../../../shared/domain';
import type { Output } from '../../../../shared/api';
import { CalculationTrace } from '../../components/CalculationTrace/CalculationTrace';
import { StatusNotice } from '../../components/StatusNotice/StatusNotice';
import { api } from '../../data/hooks';
import { changedReasonSentences, whatIfEligible, whatIfScores } from './what-if-input';
import styles from './MyGrade.module.css';

export function WhatIf({ courseId, current, assignments }: { courseId: string; current: Output<'getMyGrade'>; assignments: Assignment[] }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [letter, setLetter] = useState('');
  const [solveFor, setSolveFor] = useState('');
  const [calculation, setCalculation] = useState(false);
  const [draft, setDraft] = useState({ values, letter, solveFor });
  useEffect(() => { const timer = window.setTimeout(() => setDraft({ values, letter, solveFor }), 300); return () => window.clearTimeout(timer); }, [values, letter, solveFor]);
  const available = current.items.filter(whatIfEligible);
  const assignmentMap = useMemo(() => new Map(assignments.map(a => [a.id, a])), [assignments]);
  const points = useMemo(() => new Map(assignments.map(a => [a.id, a.points])), [assignments]);
  const invalid = available.find(item => { const raw = values[item.assignmentId]?.trim(); const max = points.get(item.assignmentId); return !!raw && (!Number.isFinite(Number(raw)) || Number(raw) < 0 || max === undefined || Number(raw) > max); });
  const pendingInput = JSON.stringify(values) !== JSON.stringify(draft.values) || letter !== draft.letter || solveFor !== draft.solveFor;
  const scores = whatIfScores(available, draft.values, points);
  const plan = useQuery({ queryKey: ['whatIfMyGrade', courseId, scores, draft.letter, draft.solveFor], queryFn: () => api.whatIfMyGrade({ courseId, scores, ...(draft.letter && draft.solveFor ? { target: { letter: draft.letter }, solveFor: draft.solveFor } : {}) }), enabled: !invalid });
  const result = plan.data;
  const name = (id: string) => assignmentMap.get(id)?.title ?? 'this item';
  const needed = result?.needed;
  const reasons = result ? changedReasonSentences(result) : [];
  return <div className={styles.stack}>
    <section className={styles.card} aria-live="polite"><h2>Your what-if grade</h2>{invalid ? <p>Fix the score below to calculate.</p> : pendingInput || plan.isPending || plan.isFetching ? <p>Calculating…</p> : plan.error ? <StatusNotice tone={(plan.error as { code?: string }).code === 'rate-limited' ? 'warning' : 'error'}>{(plan.error as { code?: string }).code === 'rate-limited' ? 'Try again in a minute.' : 'Could not calculate this what-if grade.'}</StatusNotice> : result && <><div className={styles.grade}><strong>{result.trace.totals.rounded === null ? '—' : `${result.trace.totals.rounded.toFixed(1)}%`}</strong><span>{result.trace.totals.letter ?? 'No letter yet'}</span></div><p>Now: {current.trace.totals.rounded === null ? '—' : `${current.trace.totals.rounded.toFixed(1)}%`} {current.trace.totals.letter ?? ''}{result.delta !== null && ` · ${result.delta >= 0 ? '+' : ''}${result.delta.toFixed(1)} points`}</p>{reasons.length > 0 && <ul>{reasons.map((reason, i) => <li key={`${i}-${reason}`}>{reason}</li>)}</ul>}<button type="button" aria-expanded={calculation} onClick={() => setCalculation(value => !value)}>{calculation ? 'Hide' : 'See'} the full calculation</button>{calculation && <CalculationTrace trace={result.trace} name="you" audience="student" />}</>}</section>
    <section className={styles.card}><div className={styles.cardHead}><h2>Try scores</h2><button type="button" onClick={() => { setValues({}); setLetter(''); setSolveFor(''); }}>Reset</button></div><p>Enter scores you might earn. A held grade stays hidden; your entry is only a hypothetical.</p>{available.length ? <div className={styles.inputs}>{available.map(item => <label key={item.assignmentId}>{name(item.assignmentId)} <span>{item.state === 'held' ? 'Graded, not released yet' : item.state.replaceAll('-', ' ')}</span><div><input type="number" min="0" max={points.get(item.assignmentId)} step="0.1" inputMode="decimal" value={values[item.assignmentId] ?? ''} onChange={e => setValues(previous => ({ ...previous, [item.assignmentId]: e.target.value }))} aria-label={`What-if score for ${name(item.assignmentId)}`} /> <span>of {points.get(item.assignmentId) ?? '—'}</span></div></label>)}</div> : <p>Every available item already has a released score.</p>}{invalid && <StatusNotice tone="warning">Enter a score from 0 to {points.get(invalid.assignmentId)} for {name(invalid.assignmentId)}.</StatusNotice>}</section>
    <section className={styles.card}><h2>Aim for</h2><div className={styles.aim}><label>Letter<select value={letter} onChange={e => setLetter(e.target.value)}><option value="">Choose a letter</option>{['A','A-','B+','B','B-','C+','C','C-','D','F'].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>On this item<select value={solveFor} onChange={e => setSolveFor(e.target.value)}><option value="">Choose an item</option>{available.map(item => <option key={item.assignmentId} value={item.assignmentId}>{name(item.assignmentId)}</option>)}</select></label></div>{letter && solveFor && !pendingInput && !invalid && !plan.isFetching && result && (needed && 'unreachable' in needed ? <p>That letter is not reachable with the remaining points.</p> : needed && 'score' in needed ? <p>You’d need {needed.score.toFixed(1)} of {points.get(solveFor)} on {name(solveFor)}, with your other what-if scores as they are.</p> : <p>That target is already within reach with your current what-if scores.</p>)}</section>
    <p className={styles.private}>What-if scores are private to you and never saved. They use the same rules as your official grade.</p>
  </div>;
}

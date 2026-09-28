import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { DesignSession } from '../../../../shared/domain';
import { AiContent, Button, StatusNotice } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import styles from './Design.module.css';

export function Preview({ session }: { session: DesignSession }) {
  const planQuery = useApiQuery('previewProvisionPlan', { sessionId: session.id }, { staleTime: 5000, retry: false });
  const apply = useApiMutation('applyProvisionPlan');
  const back = useApiMutation('undoProvisionPlan');
  const [leastSure, setLeastSure] = useState('');
  const plan = planQuery.data;
  useEffect(() => { if (plan && !leastSure) setLeastSure(plan.modules.find(m => m.leastSure)?.key ?? ''); }, [plan, leastSure]);
  if (planQuery.isPending) return <section className={styles.card} role="status"><h1>Preparing your change set</h1></section>;
  if (planQuery.error || !plan) return <StatusNotice tone="error">{planQuery.error?.message ?? 'The preview could not be created.'}</StatusNotice>;
  return <div className={styles.previewGrid}>
    <main className={styles.stack}>
      <header><p className={styles.muted}>Nothing is written until you apply · plan {plan.hash.slice(0, 8)}</p><h1>Preview the draft course</h1><p>{plan.summary} Your existing modules and lessons stay where they are. Everything lands as a draft.</p></header>
      <div className={styles.previewTableWrap}><table className={styles.previewTable}><caption>Exactly what this plan will create</caption><thead><tr><th>Module and objective</th><th>Weeks and lessons</th><th>Assignment</th><th>Outcomes</th><th>Hours</th></tr></thead><tbody>{plan.modules.map(module => <tr key={module.key}><th scope="row"><strong>{module.title}</strong><br /><span className={styles.muted}>{module.objective}</span>{module.overlaps && <p className={styles.overlap}>Overlaps your module “{module.overlaps.title}” · Move it in during review</p>}</th><td>{module.lessons.length} lessons · {module.lessons.map(l => l.week).filter((v): v is number => v !== null).filter((v, i, a) => a.indexOf(v) === i).map(v => `Week ${v}`).join(', ') || 'Orientation'}<ul>{module.lessons.map(lesson => <li key={lesson.key}>{lesson.title} · {lesson.minutes} min</li>)}</ul></td><td>{(module.assignments?.length ? module.assignments : module.assignment ? [module.assignment] : []).length ? <ul>{(module.assignments?.length ? module.assignments : [module.assignment!]).map(item => <li key={item.key}>{item.title} · {item.points} points{item.dueAt && ` · due ${item.dueAt.slice(0, 10)}`}{item.replaces && ` · replaces ${item.replaces}`}</li>)}</ul> : 'Ungraded'}</td><td>{module.outcomeCodes.join(', ') || '—'}</td><td>{module.hours}</td></tr>)}</tbody></table></div>
      <div className={styles.previewNotes}><section className={styles.card}><h2>Readings</h2><p>{plan.readings.length} cited schedule readings. {plan.placeholders} “[Reading to select]” placeholders. No uncited reading is added.</p></section><section className={styles.card}><h2>Existing content</h2><p>{plan.modules.filter(m => m.overlaps).length} topic overlaps are marked above. You can move lessons in during review.</p></section></div>
    </main>
    <aside className={styles.card} aria-labelledby="before-apply"><h2 id="before-apply">Before you apply</h2><p>{plan.template ? `${plan.template.name} template: ${plan.template.satisfied.length} items satisfied, ${plan.template.missing.length} still need attention.` : 'No course template applies.'}</p>{plan.template && <ul>{plan.template.satisfied.map(item => <li key={item}>Satisfied · {item}</li>)}{plan.template.missing.map(item => <li key={item}>Needs review · {item}</li>)}</ul>}<h3>Readiness forecast</h3><ul>{plan.readinessForecast.map(item => <li key={item.check}>{item.check.replaceAll('-', ' ')} · {item.expected === 'met' ? 'Expected to meet' : 'Needs review'}</li>)}</ul><AiContent kind="note" who="Design partner" source="your selected approach and cited syllabus"><p>These are drafts for you to review. You decide what to keep and publish.</p></AiContent><label htmlFor="least-sure">Which module are you least sure about?</label><p className={styles.muted}>I’ll flag it for extra review and draft two alternative openings for its first lesson.</p><select id="least-sure" value={leastSure} onChange={event => setLeastSure(event.target.value)}><option value="">None</option>{plan.modules.filter(m => m.key.startsWith('module-')).map(m => <option key={m.key} value={m.key}>{m.title}</option>)}</select><p className={styles.muted}>Runs in the background. One action can undo the drafts this plan adds.</p><div className={styles.actions}><Button variant="primary" onClick={() => { void apply.mutateAsync({ sessionId: session.id, hash: plan.hash, leastSureModuleKey: leastSure || undefined }).catch(() => {}); }} disabled={apply.isPending}>Apply and draft the course</Button><Button onClick={() => { void back.mutateAsync({ sessionId: session.id }).catch(() => {}); }} disabled={back.isPending}>Back to approaches</Button></div>{apply.error && <StatusNotice tone="error">{apply.error.message}</StatusNotice>}{back.error && <StatusNotice tone="error">{back.error.message}</StatusNotice>}</aside>
  </div>;
}

export function Provisioning({ session }: { session: DesignSession }) {
  const modules = session.plan?.modules ?? [];
  return <section className={styles.card} role="status"><h1>Drafting your course</h1><p>You can leave this page while lessons are drafted.</p><progress value={session.provisioning?.done ?? 0} max={session.provisioning?.total ?? 1} aria-label="Course drafting progress" /><ul>{modules.map(module => { const progress = session.provisioning?.modules?.find(item => item.key === module.key); return <li key={module.key}>{module.title} · {progress?.done ?? 0} of {progress?.total ?? module.lessons.length} lessons</li>; })}</ul>{session.provisioning?.error && <StatusNotice tone="error">{session.provisioning.error}</StatusNotice>}</section>;
}

export function DraftReady({ session }: { session: DesignSession }) {
  const undo = useApiMutation('undoProvisionPlan');
  const [confirm, setConfirm] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const cancel = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (confirm) cancel.current?.focus(); else opener.current?.focus(); }, [confirm]);
  return <section className={styles.card}><h1>Your draft course is ready: open the course outline</h1><p>{session.plan?.counts.lessons ?? 0} lessons were added as drafts. Review each before publishing.</p><Link to={paths.teach.course(session.courseId)}>Open the course outline</Link>{session.provisioning?.error && <StatusNotice tone="error">{session.provisioning.error}</StatusNotice>}<div><Button onClick={event => { opener.current = event.currentTarget; setConfirm(true); }}>Undo everything this plan added</Button></div>{confirm && <div role="dialog" aria-modal="true" aria-labelledby="undo-title" className={styles.panel}><h2 id="undo-title">Undo this plan?</h2><p>Unedited drafts will be removed. Anything you kept or edited stays in the course and will be listed.</p><div className={styles.actions}><Button onClick={() => { void undo.mutateAsync({ sessionId: session.id }).then(() => setConfirm(false)).catch(() => {}); }} disabled={undo.isPending}>Undo the plan</Button><button type="button" ref={cancel} className={styles.dialogButton} onClick={() => setConfirm(false)}>Cancel</button></div>{undo.error && <StatusNotice tone="error">{undo.error.message}</StatusNotice>}</div>}{undo.data?.kept.length ? <StatusNotice tone="info">Kept {undo.data.kept.map(item => item.title).join(', ')}.</StatusNotice> : null}</section>;
}

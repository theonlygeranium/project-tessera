import { useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { DesignQuestion, DesignSession, Extracted, WorkloadRates } from '../../../../shared/domain';
import { AiContent, AlignmentMatrix, Button, Citation, StatusNotice, TopBar, WorkloadChart } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import { DesignStepper } from './Stepper';
import styles from './Design.module.css';

const plain = (field: Extracted<unknown>): string => {
  const value = field.value;
  if (value === null) return 'Not stated';
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : item && typeof item === 'object' && 'title' in item ? String(item.title) : '').filter(Boolean).join(', ') || 'None stated';
  if (typeof value === 'object') {
    if ('days' in value && 'minutes' in value) return `${(value.days as string[]).join(' / ')} · ${value.minutes} min`;
    if ('name' in value) return [value.name, 'email' in value ? value.email : '', 'officeHours' in value ? value.officeHours : ''].filter(Boolean).join(' · ');
    if ('goal' in value) return [value.goal, 'metric' in value ? value.metric : '', 'audienceRole' in value ? value.audienceRole : ''].filter(Boolean).join(' · ');
    return 'Details in source';
  }
  return String(value);
};
const profileLabels: Record<string, string> = { code: 'Code', title: 'Title', credits: 'Credits', termWeeks: 'Term weeks', termStart: 'Term start', termEnd: 'Term end', meeting: 'Meets', modality: 'Modality', level: 'Level', prerequisites: 'Prerequisites', enrolment: 'Enrolment', instructor: 'Instructor', description: 'Description', materials: 'Materials', business: 'Business goal' };
const rateLabels: Record<keyof WorkloadRates, string> = { readingPagesPerHour: 'Reading pages per hour', problemSetHours: 'Problem set hours', writingHoursPerPage: 'Writing hours per page', projectHours: 'Project hours', quizMinutes: 'Quiz minutes', discussionMinutes: 'Discussion minutes' };

type Answer = { optionId?: string; value?: string; skipped: boolean };
function ReadConfirm({ session }: { session: DesignSession }) {
  const { extraction, read } = session;
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [outcomes, setOutcomes] = useState(() => extraction!.outcomes.map((item, index) => ({ code: `O${index + 1}`, text: item.text, originalText: item.text, checked: true })));
  const [rewrite, setRewrite] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const rewriteOpener = useRef<HTMLButtonElement | null>(null);
  const [contestField, setContestField] = useState<string | null>(null);
  const [correction, setCorrection] = useState('');
  const contestOpener = useRef<HTMLButtonElement | null>(null);
  const [rates, setRates] = useState<WorkloadRates>(read!.workload.rates);
  const save = useApiMutation('answerDesignQuestions');
  const confirm = useApiMutation('confirmOutcomes');
  const contest = useApiMutation('contestDesignField');
  const saveRates = useApiMutation('updateDesignRates');
  const openQuestion = session.questions.find(item => item.id === 'question-teaching-approach');
  const currentAnswer = (q: DesignQuestion): Answer => answers[q.id] ?? { optionId: q.answer?.optionId ?? undefined, value: q.answer?.value ?? undefined, skipped: q.answer?.skipped ?? false };
  const answerPayload = () => session.questions.map(question => ({ questionId: question.id, ...currentAnswer(question) }));
  const teachingNote = openQuestion ? currentAnswer(openQuestion).value ?? '' : '';
  const submitAnswers = async (event: FormEvent) => { event.preventDefault(); await save.mutateAsync({ sessionId: session.id, answers: answerPayload(), teachingNote }); };
  const submitConfirm = async () => {
    try {
      await save.mutateAsync({ sessionId: session.id, answers: answerPayload(), teachingNote });
      await confirm.mutateAsync({ sessionId: session.id, outcomes: outcomes.filter(item => item.checked).map(({ code, text, originalText }) => ({ code, text, originalText })) });
    } catch { /* The notices beside the controls show the failed step. */ }
  };
  const move = (index: number, direction: number) => setOutcomes(current => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const closeRewrite = () => { setRewrite(null); setEditing(false); requestAnimationFrame(() => rewriteOpener.current?.focus()); };
  const closeContest = () => { setContestField(null); setCorrection(''); requestAnimationFrame(() => contestOpener.current?.focus()); };
  const exportRead = () => { const blob = new Blob([JSON.stringify(read, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `instructional-read-${session.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const summaryCites = read!.cites.map((span, index) => <a href={`#read-passage-${index}`} key={index}>{span.page === null ? 'Pasted text' : `p. ${span.page}`} · “{span.text.slice(0, 75)}”</a>);
  return <>
    <div className={styles.readToolbar}><div><h1>Read and confirm</h1><p>{extraction!.profile.title.value ?? session.source.name} · {session.source.name}</p></div><Button onClick={exportRead} density="compact">Export read</Button></div>
    <div className={styles.columns}>
      <main className={styles.stack} aria-label="Instructional read">
        <AiContent kind="note" who="Design partner" source={`read of your ${session.source.kind}, ${session.source.sections.length} ${session.source.sections.length === 1 ? 'page' : 'pages'}`} cites={summaryCites}><p>{read!.summary}</p></AiContent>
        <div className={styles.readSplit}>
          <section className={styles.card} aria-labelledby="profile-heading"><h2 id="profile-heading">Course profile</h2><dl className={styles.profileList}>
            {Object.entries(extraction!.profile).filter(([key]) => key !== 'weeklyHoursBudget' && (session.source.kind === 'brief' || key !== 'business')).map(([key, field]) => {
              const value = field as Extracted<unknown>;
              const asked = session.questions.some(q => q.fromProblem === 'missing-field' && q.text.toLowerCase().includes(key.toLowerCase()));
              return <div key={key}><dt>{profileLabels[key] ?? key}</dt><dd>{plain(value)} <span className={styles.fieldState}>{value.origin === 'missing' ? (asked ? 'missing · asked' : 'missing') : asked ? 'conflict · asked' : value.origin.replace('_', ' ')}</span> {value.spans[0] && <Citation span={value.spans[0]} />}</dd><dd><button type="button" className={styles.smallAction} onClick={event => { contestOpener.current = event.currentTarget; setContestField(key); setCorrection(''); }}>That's not right</button></dd></div>;
            })}
            <div><dt>Workload budget</dt><dd>{read!.workload.weeklyBudgetHours} h/week · <span className={styles.fieldState}>{session.source.kind === 'brief' ? 'from seat time' : 'from credits'}</span></dd></div>
            <div><dt>Schedule</dt><dd>{extraction!.schedule.filter(row => !row.empty).length} topics in {extraction!.schedule.length} rows · <span className={styles.fieldState}>{extraction!.problems.some(problem => problem.code === 'week-count-mismatch' || problem.code === 'empty-week') ? 'conflict · asked' : 'extracted'}</span> {extraction!.schedule[0]?.span && <Citation span={extraction!.schedule[0].span} />}</dd></div>
          </dl>
          {contestField && <form className={styles.panel} onSubmit={async event => { event.preventDefault(); try { await contest.mutateAsync({ sessionId: session.id, field: contestField, correction }); closeContest(); } catch { /* Notice below. */ } }}><label>Correction for {profileLabels[contestField] ?? contestField}<input autoFocus value={correction} onChange={event => setCorrection(event.target.value)} maxLength={1000} required /></label><div className={styles.actions}><Button type="submit" density="compact" disabled={contest.isPending}>Add question</Button><Button type="button" density="compact" onClick={closeContest}>Cancel</Button></div>{contest.error && <StatusNotice tone="error">{contest.error.message}</StatusNotice>}</form>}
          {read!.learnerCenteredness && <section aria-labelledby="learner-heading"><h3 id="learner-heading">Learner-centeredness</h3><p>{read!.learnerCenteredness.palmer.score} / 46 · {read!.learnerCenteredness.palmer.band}</p><details><summary>See each score and its passage</summary><ul>{read!.learnerCenteredness.palmer.components.map((part, index) => <li key={index}>{part.name}: {part.score} / {part.max} {part.evidence ? <Citation span={part.evidence} /> : ' · no supporting passage found'}</li>)}</ul><p>Community {read!.learnerCenteredness.cullenHarris.community} · Control {read!.learnerCenteredness.cullenHarris.powerAndControl} · Evaluation {read!.learnerCenteredness.cullenHarris.evaluation}</p><ul>{read!.learnerCenteredness.cullenHarris.evidence.map((item, index) => <li key={index}>{item.factor} <Citation span={item.quote} /></li>)}</ul></details></section>}
          {session.source.kind === 'brief' && <p>Objective audit uses performance, condition and criterion from the training brief.</p>}
          </section>
          <section className={styles.card} aria-labelledby="alignment-heading"><h2 id="alignment-heading">Outcomes and how they're assessed</h2><p>Verbatim from the cited page · Bloom level is my reading.</p><ul className={styles.auditList}>{read!.outcomeAudits.map(audit => { const outcome = extraction!.outcomes.find(item => item.id === audit.outcomeId); return <li key={audit.outcomeId}><strong>{audit.outcomeId}</strong> {outcome?.text} {outcome?.span && <Citation span={outcome.span} />}<br /><span className={styles.muted}>{audit.bloom ?? 'No observable Bloom verb'} · {audit.fink ?? 'Fink category unclear'} · {audit.assessedBy.length} assessment links</span>{audit.mager && <span className={styles.muted}> · Performance {audit.mager.performance ? 'present' : 'missing'}, condition {audit.mager.condition ? 'present' : 'missing'}, criterion {audit.mager.criterion ? 'present' : 'missing'}</span>}</li>; })}</ul><AlignmentMatrix outcomes={extraction!.outcomes} assessments={extraction!.assessments} alignment={read!.alignment} /></section>
        </div>
        <section className={styles.card} aria-labelledby="deficiency-heading"><h2 id="deficiency-heading">Questions raised by this read</h2>{read!.deficiencies.length ? <ul>{read!.deficiencies.map(item => <li key={item.code}>{item.message} {item.spans.map((span, index) => <Citation span={span} key={index} />)} <span className={styles.muted}>{item.rubricRefs.map(ref => `${ref.rubric === 'tessera' ? 'Tessera standard' : ref.rubric.toUpperCase()} ${ref.item}`).join(' · ')}</span></li>)}</ul> : <p>No additional deficiencies identified in the cited source.</p>}</section>
        <section className={styles.card} aria-labelledby="workload-heading"><h2 id="workload-heading">Estimated student hours per week</h2><p>{read!.workload.averageHours} h average against a {read!.workload.weeklyBudgetHours} h budget. {read!.workload.weeks.filter(week => week.overBudget).map(week => `Week ${week.week}: ${week.hours} h`).join(' · ')}</p><WorkloadChart estimate={read!.workload} /><p>Rates: {read!.workload.rates.readingPagesPerHour} pages/h reading · {read!.workload.rates.problemSetHours} h/problem set · {read!.workload.rates.projectHours} h/project</p><details><summary>Edit assumptions</summary><form className={styles.rateForm} onSubmit={async event => { event.preventDefault(); await saveRates.mutateAsync({ sessionId: session.id, rates }); }}><div className={styles.rateGrid}>{(Object.keys(rateLabels) as (keyof WorkloadRates)[]).map(key => <label key={key}>{rateLabels[key]}<input type="number" min="0.1" max="1000" step="0.1" required value={rates[key]} onChange={event => setRates(current => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div><Button type="submit" density="compact" disabled={saveRates.isPending}>Save rates and recalculate</Button>{saveRates.isSuccess && <StatusNotice tone="success">Estimate updated for this session.</StatusNotice>}{saveRates.error && <StatusNotice tone="error">{saveRates.error.message}</StatusNotice>}</form></details><ul className={styles.assumptions}>{read!.workload.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
        <section className={styles.card} aria-labelledby="passages-heading"><h2 id="passages-heading">Cited passages</h2>{read!.cites.map((span, index) => <p id={`read-passage-${index}`} key={index}><strong>{index + 1}.</strong> {span.page === null ? 'Pasted text' : `Page ${span.page}`}: “{span.text}”</p>)}</section>
      </main>
      <aside className={styles.card} aria-labelledby="questions-heading"><h2 id="questions-heading">What I need from you</h2><p>These details guide the next draft. Skip any question.</p><form onSubmit={submitAnswers} className={styles.stack}>{session.questions.map((question, index) => <fieldset key={question.id} className={styles.question}><legend>{index + 1}. {question.text} {question.spans.map((span, i) => <Citation span={span} key={i} />)}</legend>{question.kind === 'choice' ? question.options.map(option => <label key={option.id} className={styles.check}><input type="radio" name={question.id} checked={currentAnswer(question).optionId === option.id && !currentAnswer(question).skipped} onChange={() => setAnswers(current => ({ ...current, [question.id]: { optionId: option.id, skipped: false } }))} />{option.text}</label>) : question.id === 'question-teaching-approach' ? <textarea aria-label="Teaching approach and goals" rows={3} maxLength={2000} value={currentAnswer(question).value ?? ''} onChange={event => setAnswers(current => ({ ...current, [question.id]: { value: event.target.value, skipped: !event.target.value } }))} /> : <input aria-label={question.text} type={question.kind === 'number' ? 'number' : 'text'} value={currentAnswer(question).value ?? ''} onChange={event => setAnswers(current => ({ ...current, [question.id]: { value: event.target.value, skipped: !event.target.value } }))} />}<label className={styles.check}><input type="checkbox" checked={currentAnswer(question).skipped} onChange={event => setAnswers(current => ({ ...current, [question.id]: { ...currentAnswer(question), skipped: event.target.checked } }))} />Skip this question</label></fieldset>)}<Button type="submit" density="compact" disabled={save.isPending}>Save answers</Button>{save.isSuccess && <StatusNotice tone="success">Answers saved to your record.</StatusNotice>}{save.error && <StatusNotice tone="error">{save.error.message}</StatusNotice>}</form>
        <section className={styles.confirmSection} aria-labelledby="confirm-heading"><h3 id="confirm-heading">Confirm your outcomes</h3><p>Your words stay; rewrites are labelled suggestions. Select at least one, edit if needed, and arrange their order.</p>{outcomes.map((item, index) => { const original = extraction!.outcomes.find(outcome => outcome.text === item.originalText); const audit = read!.outcomeAudits.find(a => a.outcomeId === original?.id); return <div className={styles.outcomeRow} key={item.originalText}><label className={styles.check}><input type="checkbox" checked={item.checked} onChange={event => setOutcomes(current => current.map((row, i) => i === index ? { ...row, checked: event.target.checked } : row))} /><span>{item.code} {item.text}</span></label><div className={styles.actions}><Button density="compact" onClick={() => move(index, -1)} disabled={index === 0}>Move up</Button><Button density="compact" onClick={() => move(index, 1)} disabled={index === outcomes.length - 1}>Move down</Button>{audit?.suggestion && <button type="button" className={styles.smallAction} onClick={event => { rewriteOpener.current = event.currentTarget; setRewrite(item.originalText); setEditing(false); }}>See suggested rewrite</button>}</div>{rewrite === item.originalText && audit?.suggestion && <div className={styles.panel}><AiContent kind="note" who={`Design partner · suggested rewrite of ${item.code}`} source={`from your outcome, ${original?.span?.page ? `p. ${original.span.page}` : 'pasted text'}`}><p>{audit.suggestion.text}</p><p>{audit.suggestion.why}</p></AiContent>{editing && <label>Edit outcome wording<input autoFocus value={item.text} onChange={event => setOutcomes(current => current.map(row => row.originalText === item.originalText ? { ...row, text: event.target.value } : row))} /></label>}<div className={styles.actions}><Button density="compact" onClick={() => { setOutcomes(current => current.map(row => row.originalText === item.originalText ? { ...row, text: audit.suggestion!.text, checked: true } : row)); closeRewrite(); }}>Use this</Button><Button density="compact" onClick={() => setEditing(true)}>Edit</Button><Button density="compact" onClick={closeRewrite}>Keep mine</Button></div></div>}</div>; })}<Button variant="primary" onClick={() => void submitConfirm()} disabled={!outcomes.some(item => item.checked) || outcomes.some(item => item.checked && !item.text.trim()) || confirm.isPending || save.isPending}>Confirm and show approaches</Button>{confirm.error && <StatusNotice tone="error">{confirm.error.message}</StatusNotice>}</section>
      </aside>
    </div>
  </>;
}

export function DesignSessionPage() {
  usePageTitle('Read and confirm');
  const { courseId = '', sessionId = '' } = useParams();
  const query = useApiQuery('getDesignSession', { sessionId }, { enabled: !!sessionId, refetchInterval: current => current.state.data?.stage === 'start' && !current.state.data?.provisioning?.error ? 1200 : false });
  const session = query.data;
  return <div className={styles.page}><TopBar title="Read and confirm" breadcrumbs={[{ label: 'Course', href: paths.teach.course(courseId) }, { label: 'Start from a syllabus', href: paths.teach.design(courseId) }, { label: 'Read' }]} renderLink={renderRouterLink} />
    {query.isPending ? <Loading label="Loading syllabus read" /> : query.error ? <ErrorNotice error={query.error} onRetry={() => void query.refetch()} /> : !session ? <p>Session not found.</p> : session.courseId !== courseId ? <StatusNotice tone="error">This session belongs to another course.</StatusNotice> : <><DesignStepper stage={session.stage} />{session.stage === 'start' && <section className={styles.card} role="status"><h1>Reading {session.source.name}</h1><p>Reading · {Math.round((session.provisioning?.done ?? 0) / Math.max(session.provisioning?.total ?? 2, 1) * 100)}%</p><progress value={session.provisioning?.done ?? 0} max={session.provisioning?.total ?? 2} aria-label="Reading the syllabus" />{session.provisioning?.error && <StatusNotice tone="error">{session.provisioning.error}</StatusNotice>}</section>}{session.stage === 'read' && session.read && session.extraction && <ReadConfirm key={session.id} session={session} />}{session.stage === 'approaches' && <section className={styles.card}><h1>Outcomes confirmed</h1><p>{session.confirmedOutcomes?.length} outcomes are saved to your design record. Approaches come next.</p></section>}<p><Link to={paths.teach.design(courseId)}>Start another syllabus read</Link></p></>}
  </div>;
}

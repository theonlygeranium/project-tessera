import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { DesignQuestion, Extracted, SyllabusExtraction } from '../../../../shared/domain';
import { AiContent, Button, StatusNotice, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import { DesignStepper } from './Stepper';
import styles from './Design.module.css';

const shown = (field: Extracted<unknown>) => field.value === null ? 'Not stated' : Array.isArray(field.value) ? field.value.join(', ') || 'None stated' : typeof field.value === 'object' ? JSON.stringify(field.value) : String(field.value);
const state = (field: Extracted<unknown>) => field.origin.replace('_', ' ');
const cite = (page: number | null | undefined) => page === null || page === undefined ? 'Pasted text' : `p. ${page}`;

function Summary({ extraction, name }: { extraction: SyllabusExtraction; name: string }) {
  const fields: { label: string; value: Extracted<unknown> }[] = [
    ['Code', extraction.profile.code], ['Title', extraction.profile.title], ['Credits', extraction.profile.credits], ['Term weeks', extraction.profile.termWeeks], ['Term start', extraction.profile.termStart], ['Term end', extraction.profile.termEnd], ['Meeting', extraction.profile.meeting], ['Modality', extraction.profile.modality], ['Level', extraction.profile.level], ['Prerequisites', extraction.profile.prerequisites], ['Enrolment', extraction.profile.enrolment], ['Instructor', extraction.profile.instructor], ['Description', extraction.profile.description], ['Materials', extraction.profile.materials],
  ].map(([label, value]) => ({ label: label as string, value: value as Extracted<unknown> }));
  return <AiContent kind="note" who="Design partner" source={`Instructional read draft from ${name}`}>
    <div className={styles.summary}>
      <p>Here is what I understood, and here is what I need from you. Please check each detail against your syllabus.</p>
      <section aria-labelledby="profile-heading"><h2 id="profile-heading">Course profile</h2><dl>{fields.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{shown(value)} · {state(value)}{value.spans[0] && ` · ${cite(value.spans[0].page)}`}</dd></div>)}</dl></section>
      <section aria-labelledby="outcomes-heading"><h2 id="outcomes-heading">Learning outcomes</h2><ol>{extraction.outcomes.map(outcome => <li key={outcome.id}>{outcome.text} · {outcome.origin.replace('_', ' ')} · {cite(outcome.span?.page)}</li>)}</ol></section>
      <section aria-labelledby="grading-heading"><h2 id="grading-heading">Grading</h2><ul>{extraction.assessments.map(item => <li key={item.id}>{item.title} · {item.weightPercent === null ? 'Weight not stated' : `${item.weightPercent}%`} · {cite(item.span?.page)}</li>)}</ul></section>
      <section aria-labelledby="schedule-heading"><h2 id="schedule-heading">Schedule</h2><ol>{extraction.schedule.map(row => <li key={row.week}>Week {row.week} · {row.dates} · {row.empty ? 'No topic listed' : row.topic} · {cite(row.span?.page)}</li>)}</ol></section>
      <section aria-labelledby="policies-heading"><h2 id="policies-heading">Policies</h2><ul>{extraction.policies.map((item, index) => <li key={`${item.kind}-${index}`}>{item.kind.replace('-', ' ')}: {item.text} · {cite(item.span.page)}</li>)}</ul></section>
    </div>
  </AiContent>;
}

function Questions({ questions, sessionId, initialNote }: { questions: DesignQuestion[]; sessionId: string; initialNote: string }) {
  const [answers, setAnswers] = useState<Record<string, { optionId?: string; value?: string; skipped: boolean }>>({});
  const [note, setNote] = useState(initialNote);
  const save = useApiMutation('answerDesignQuestions');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({ sessionId, answers: questions.map(question => ({ questionId: question.id, ...answers[question.id] ?? { optionId: question.answer?.optionId ?? undefined, value: question.answer?.value ?? undefined, skipped: question.answer?.skipped ?? true } })), teachingNote: note });
  };
  return <section className={styles.card} aria-labelledby="questions-heading"><h2 id="questions-heading">A few questions before I suggest a structure</h2><p>Skip any question. Your answers guide the next draft.</p><form onSubmit={submit} className={styles.stack}>
    {questions.map(question => <fieldset key={question.id}><legend>{question.text}{question.spans[0] && ` · ${cite(question.spans[0].page)}`}</legend>
      {question.kind === 'choice' ? question.options.map(option => <label key={option.id} className={styles.check}><input type="radio" name={question.id} checked={(answers[question.id]?.optionId ?? question.answer?.optionId) === option.id && !answers[question.id]?.skipped} onChange={() => setAnswers(current => ({ ...current, [question.id]: { optionId: option.id, skipped: false } }))} />{option.text}</label>) : <input aria-label={question.text} type={question.kind === 'number' ? 'number' : 'text'} value={answers[question.id]?.value ?? question.answer?.value ?? ''} onChange={event => setAnswers(current => ({ ...current, [question.id]: { value: event.target.value, skipped: !event.target.value } }))} />}
      <label className={styles.check}><input type="checkbox" checked={answers[question.id]?.skipped ?? question.answer?.skipped ?? false} onChange={event => setAnswers(current => ({ ...current, [question.id]: { skipped: event.target.checked } }))} />Skip this question</label>
    </fieldset>)}
    <label className={styles.stack}>Teaching note for this course<textarea rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></label>
    <Button type="submit" disabled={save.isPending}>Save answers</Button>
    {save.isSuccess && <StatusNotice tone="success">Answers saved. You can revise them here.</StatusNotice>}{save.error && <StatusNotice tone="error">{save.error.message}</StatusNotice>}
  </form></section>;
}

export function DesignSessionPage() {
  usePageTitle('Syllabus read');
  const { courseId = '', sessionId = '' } = useParams();
  const query = useApiQuery('getDesignSession', { sessionId }, { enabled: !!sessionId, refetchInterval: current => current.state.data?.stage === 'start' && !current.state.data?.provisioning?.error ? 1200 : false });
  const session = query.data;
  return <div className={styles.page}><TopBar title="Syllabus read" breadcrumbs={[{ label: 'Course', href: paths.teach.course(courseId) }, { label: 'Start from a syllabus', href: paths.teach.design(courseId) }, { label: 'Read' }]} renderLink={renderRouterLink} />
    {query.isPending ? <Loading label="Loading syllabus read" /> : query.error ? <ErrorNotice error={query.error} onRetry={() => void query.refetch()} /> : !session ? <p>Session not found.</p> : session.courseId !== courseId ? <StatusNotice tone="error">This session belongs to another course.</StatusNotice> : <>
      <DesignStepper stage={session.stage} />
      {session.stage === 'start' && <section className={styles.card} role="status"><h1>Reading {session.source.name}</h1><p>Reading · {Math.round((session.provisioning?.done ?? 0) / Math.max(session.provisioning?.total ?? 2, 1) * 100)}%</p><progress value={session.provisioning?.done ?? 0} max={session.provisioning?.total ?? 2} aria-label="Reading the syllabus" />{session.provisioning?.error && <StatusNotice tone="error">{session.provisioning.error}</StatusNotice>}</section>}
      {session.extraction && <Summary extraction={session.extraction} name={session.source.name} />}
      {session.stage === 'read' && <Questions key={session.id} questions={session.questions} sessionId={session.id} initialNote={session.teachingNote} />}
      <p><Link to={paths.teach.design(courseId)}>Start another syllabus read</Link></p>
    </>}
  </div>;
}

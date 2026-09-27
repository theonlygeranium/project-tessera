import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { BlockType, LessonDetail } from '../../../../shared/domain';
import { AiContent, Button, FormField, ProgressMeter, Select, StatusNotice, TextArea, TopBar } from '../../components';
import { api, useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './Generate.module.css';

type Choice = { label: string; type: BlockType; description: string; prefix?: string };
const CHOICES: Choice[] = [
  { label: 'Text', type: 'text', description: 'A short explanation' },
  { label: 'Callout', type: 'callout', description: 'A focused tip or note' },
  { label: 'Knowledge check', type: 'check', description: 'A question with feedback' },
  { label: 'Document', type: 'document', description: 'A structured handout' },
  { label: 'Table', type: 'table', description: 'A comparison with column headings' },
  { label: 'Scenario', type: 'scenario', description: 'A branching decision practice' },
  { label: 'Video script', type: 'document', description: 'Scenes with narration, saved as a document', prefix: 'Write a video script. Title it "Video script: …" and make each section a scene with narration.' },
];
const keyFor = (choice: Choice) => choice.label;
type Job = { jobId: string; state: 'running' | 'done' | 'failed'; done: number; total: number; lessonIds: string[]; error: string | null; failures?: { lessonId: string; type: BlockType; message: string }[] };

export function GeneratePage() {
  usePageTitle('Generate lesson drafts');
  const { courseId = '' } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const jobId = search.get('job') ?? '';
  const freshParams = new URLSearchParams(search); freshParams.delete('job');
  const freshUrl = `${paths.teach.generate(courseId)}${freshParams.size ? `?${freshParams}` : ''}`;
  const course = useApiQuery('getCourseOutline', { courseId }, { enabled: !!courseId });
  const jobQuery = useApiQuery('getGenerationJob', { jobId }, { enabled: !!jobId, refetchInterval: query => query.state.data?.state === 'running' ? 1500 : false });
  const start = useApiMutation('generateAtScope', { onSuccess: result => {
    const params = new URLSearchParams(search);
    params.set('job', result.jobId);
    navigate(`${paths.teach.generate(courseId)}?${params}`);
  } });
  const [whole, setWhole] = useState(true);
  const [selectedLessons, setSelectedLessons] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['Text', 'Knowledge check']);
  const [instruction, setInstruction] = useState('');
  const [formError, setFormError] = useState('');
  const [retryNotice, setRetryNotice] = useState('');
  const retry = useApiMutation('generateAtScope');
  const modules = course.data?.modules ?? [];
  const lessons = modules.flatMap(module => module.lessons);
  const chosen = whole ? lessons : lessons.filter(lesson => selectedLessons.includes(lesson.id));
  const count = chosen.length * new Set(selectedTypes.map(label => CHOICES.find(choice => choice.label === label)!.type)).size;
  const job = jobQuery.data as Job | undefined;
  const choiceTypes = [...new Set(selectedTypes.map(label => CHOICES.find(choice => choice.label === label)!.type))];
  const script = selectedTypes.includes('Video script');
  const effectiveInstruction = [script ? `For document blocks only: ${CHOICES.at(-1)!.prefix}` : '', instruction.trim()].filter(Boolean).join(' ');
  const toggleLesson = (id: string) => setSelectedLessons(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!chosen.length || !selectedTypes.length || count > 60) { setFormError(count > 60 ? `${count} elements exceed the limit of 60.` : 'Choose at least one lesson and element type.'); return; }
    setFormError('');
    start.mutate({ courseId, scope: { wholeCourse: whole, lessonIds: whole ? undefined : selectedLessons, elementTypes: choiceTypes }, instruction: effectiveInstruction });
  };
  const retryFailures = async () => {
    if (!job?.failures?.length) return;
    setRetryNotice('');
    let succeeded = 0;
    for (const failure of job.failures) {
      try {
        const result = await retry.mutateAsync({ courseId, scope: { lessonIds: [failure.lessonId], elementTypes: [failure.type] }, instruction });
        const outcome = await api.getGenerationJob({ jobId: result.jobId });
        if (outcome.state === 'done' && outcome.lessonIds.includes(failure.lessonId)) succeeded++;
      }
      catch { /* Keep retrying the remaining elements. */ }
    }
    await queryClient.invalidateQueries();
    setRetryNotice(`${succeeded} of ${job.failures.length} failed elements drafted. Review them in their lessons.`);
  };
  return <div className={styles.page}>
    <TopBar title="Generate lesson drafts" breadcrumbs={[{ label: 'My courses', href: paths.teach.courses }, { label: course.data?.course.title ?? 'Course', href: paths.teach.course(courseId) }, { label: 'Generate lesson drafts' }]} renderLink={renderRouterLink} />
    {course.isPending ? <Loading label="Loading course" /> : course.error ? <ErrorNotice error={course.error} onRetry={() => course.refetch()} /> : <>
      <p>Choose where drafts go and what to draft. Each element stays an AI draft until you review and keep it.</p>
      {!jobId && <form onSubmit={submit} className={styles.stack}>
        <section aria-labelledby="scope-heading" className={styles.stack}><h2 id="scope-heading">Scope</h2>
          <fieldset className={styles.fieldset}><legend>Choose lessons</legend>
            <label className={styles.choice}><input type="radio" name="scope" checked={whole} onChange={() => setWhole(true)} /> Whole course</label>
            <label className={styles.choice}><input type="radio" name="scope" checked={!whole} onChange={() => setWhole(false)} /> Pick modules and lessons</label>
            {!whole && modules.map(module => {
              const ids = module.lessons.map(lesson => lesson.id);
              const all = ids.length > 0 && ids.every(id => selectedLessons.includes(id));
              return <div className={styles.module} key={module.id}><label className={styles.choice}><input type="checkbox" checked={all} onChange={() => setSelectedLessons(current => all ? current.filter(id => !ids.includes(id)) : [...new Set([...current, ...ids])])} /> {module.title}</label>
                <div className={styles.lessons}>{module.lessons.map(lesson => <label className={styles.choice} key={lesson.id}><input type="checkbox" checked={selectedLessons.includes(lesson.id)} onChange={() => toggleLesson(lesson.id)} /> {lesson.title}</label>)}</div>
              </div>;
            })}
          </fieldset>
        </section>
        <section aria-labelledby="types-heading" className={styles.stack}><h2 id="types-heading">Element types</h2><fieldset className={styles.fieldset}><legend>Choose what to draft</legend>
          {CHOICES.map(choice => <label className={styles.choice} key={keyFor(choice)}><input type="checkbox" checked={selectedTypes.includes(choice.label)} onChange={() => setSelectedTypes(current => current.includes(choice.label) ? current.filter(x => x !== choice.label) : [...current.filter(x => !(choice.label === 'Document' && x === 'Video script' || choice.label === 'Video script' && x === 'Document')), choice.label])} /><span><strong>{choice.label}</strong> — {choice.description}</span></label>)}
        </fieldset></section>
        <FormField label="Instruction (optional)" hint="For example: Use examples from nursing.">{control => <TextArea {...control} rows={3} value={instruction} onChange={event => setInstruction(event.target.value)} />}</FormField>
        <p className={styles.summary}>{count} {count === 1 ? 'element' : 'elements'} across {chosen.length} {chosen.length === 1 ? 'lesson' : 'lessons'}</p>
        {formError && <StatusNotice tone="error">{formError}</StatusNotice>}
        {start.error && <StatusNotice tone="error">{start.error.message}</StatusNotice>}
        <Button type="submit" variant="primary" disabled={start.isPending || count === 0 || count > 60}>{start.isPending ? 'Starting…' : 'Generate'}</Button>
      </form>}
      {jobId && <section className={styles.stack} aria-labelledby="progress-heading"><h2 id="progress-heading">Drafting progress</h2>
        {jobQuery.isPending ? <Loading label="Loading generation job" /> : jobQuery.error ? <ErrorNotice error={jobQuery.error} onRetry={() => jobQuery.refetch()} /> : job && <>
          <div aria-live="polite"><ProgressMeter label="Elements processed" value={job.done} max={job.total} valueText={`${job.done - (job.failures?.length ?? 0)} of ${job.total} drafted`} /></div>
          {job.state === 'running' && <p>Drafting up to two elements at a time. You can leave this page and return using this URL.</p>}
          {job.state !== 'running' && <><AiContent kind="note" who="AI lesson drafts" source="Generated for this course; review each draft before keeping it"><p>{job.total - (job.failures?.length ?? 0)} drafts were added to lessons. Nothing was published.</p></AiContent>
            <h3>Review drafts</h3>{job.lessonIds.length ? <ul>{job.lessonIds.map(id => <ReviewLesson key={id} lessonId={id} courseId={courseId} title={lessons.find(lesson => lesson.id === id)?.title ?? 'Lesson'} />)}</ul> : <p>No drafts were added.</p>}
            {!!job.failures?.length && <><h3>Could not draft</h3><ul>{job.failures.map((failure, index) => <li key={`${failure.lessonId}-${failure.type}-${index}`}>{lessons.find(lesson => lesson.id === failure.lessonId)?.title ?? 'Lesson'}: {failure.type}. {failure.message}</li>)}</ul><Button onClick={() => void retryFailures()} disabled={retry.isPending}>Try these again</Button></>}
            {retryNotice && <StatusNotice tone="success" live="polite">{retryNotice}</StatusNotice>}
            <Link to={freshUrl}>Start another generation</Link>
          </>}
        </>}
      </section>}
    </>}
  </div>;
}

function ReviewLesson({ lessonId, courseId, title }: { lessonId: string; courseId: string; title: string }) {
  const query = useApiQuery('getLesson', { lessonId });
  const count = query.data?.blocks.filter(block => block.origin === 'ai' && block.aiState === 'draft').length;
  return <li><Link to={paths.teach.lesson(courseId, lessonId)}>{title}</Link> — {query.isPending ? 'Loading drafts…' : query.error ? 'Draft count unavailable' : `Review ${count} ${count === 1 ? 'draft' : 'drafts'}`}</li>;
}

export function GenerateElementPanel({ lessonId, position, onDone }: { lessonId: string; position?: number; onDone(detail: LessonDetail): void }) {
  const [choice, setChoice] = useState('Text');
  const [instruction, setInstruction] = useState('');
  const generate = useApiMutation('generateElement', { onSuccess: onDone });
  const selected = CHOICES.find(item => item.label === choice)!;
  return <section className={styles.stack} aria-label="Add with AI"><h2>Add with AI</h2>
    <FormField label="Element type">{control => <Select {...control} value={choice} onChange={event => setChoice(event.target.value)}>{CHOICES.map(item => <option key={item.label} value={item.label}>{item.label}</option>)}</Select>}</FormField>
    <FormField label="Instruction (optional)">{control => <TextArea {...control} value={instruction} rows={3} onChange={event => setInstruction(event.target.value)} />}</FormField>
    {generate.error && <StatusNotice tone="error">{generate.error.message}</StatusNotice>}
    <Button variant="primary" onClick={() => generate.mutate({ lessonId, type: selected.type, position, instruction: [selected.prefix, instruction.trim()].filter(Boolean).join(' ') })} disabled={generate.isPending}>{generate.isPending ? 'Drafting…' : 'Draft it'}</Button>
  </section>;
}

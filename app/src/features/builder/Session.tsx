import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { BuilderSession, CourseBrief, OutlineDraft } from '../../../../shared/domain';
import { AiContent, Button, FormField, PipelineStepper, ProgressMeter, StatusChip, StatusNotice, TextArea, TextInput, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './Builder.module.css';

type Errors = Record<string, string>;
const stages = ['brief', 'outline', 'draft', 'review'] as const;
const sourceLine = (session: BuilderSession, task: 'brief' | 'outline' | 'lesson drafts') => {
  const count = `${session.sources.length} ${session.sources.length === 1 ? 'source' : 'sources'}`;
  if (task === 'brief') return `Drafted by ${session.provenance?.model ?? 'AI'} from your prompt and ${count}`;
  if (task === 'outline') return `Drafted from your saved brief and ${count}`;
  return `Drafted from your accepted outline and ${count}`;
};
const validNumber = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;

export function BuilderSessionPage() {
  usePageTitle('Build with AI');
  const { courseId = '', sessionId = '' } = useParams();
  const course = useApiQuery('getCourseOutline', { courseId }, { enabled: !!courseId });
  const query = useApiQuery('getBuilderSession', { sessionId }, { enabled: !!sessionId });
  const session = query.data;
  const courseName = course.data?.course.title ?? 'Course';
  return <div className={styles.page}>
    <TopBar title="Build with AI" breadcrumbs={[{ label: 'My courses', href: paths.teach.courses }, { label: courseName, href: paths.teach.course(courseId) }, { label: 'Build with AI', href: paths.teach.build(courseId) }, { label: 'Session' }]} renderLink={renderRouterLink} />
    {course.isPending || query.isPending ? <Loading label="Loading builder session" /> : course.error ? <ErrorNotice error={course.error} onRetry={() => course.refetch()} /> : query.error ? <ErrorNotice error={query.error} onRetry={() => query.refetch()} /> : !session ? <p>Session not found.</p> : session.courseId !== courseId ? <StatusNotice tone="error">This session does not belong to this course.</StatusNotice> : <>
      <PipelineStepper label="Builder progress" steps={stages.map((stage, index) => ({ id: stage, label: stage[0].toUpperCase() + stage.slice(1), state: index < stages.indexOf(session.stage) ? 'complete' : stage === session.stage ? 'current' : 'upcoming' }))} />
      <div className={styles.columns}>
        <div className={styles.mainColumn}>
          <SessionContent key={session.id} session={session} courseId={courseId} />
        </div>
        <aside className={styles.sidePanel} aria-labelledby="source-panel-heading"><h2 id="source-panel-heading">Sources</h2><p className={styles.muted}>The prompt and source names used for this draft.</p><details open><summary>Show {session.sources.length} {session.sources.length === 1 ? 'source' : 'sources'}</summary><ul>{session.sources.map(source => <li key={source.id}>{source.name}</li>)}</ul></details></aside>
      </div>
    </>}
  </div>;
}

function SessionContent({ session, courseId }: { session: BuilderSession; courseId: string }) {
  const [brief, setBrief] = useState<CourseBrief | null>(session.brief);
  const [outline, setOutline] = useState<OutlineDraft | null>(session.outline);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState('');
  const save = useApiMutation('updateBuilderSession');
  const generateOutline = useApiMutation('generateOutline', { onSuccess: data => { setOutline(data.outline); setNotice('Outline drafted. Review it before drafting lessons.'); } });
  const generateDrafts = useApiMutation('generateDrafts', { onSuccess: () => setNotice('Draft lessons created. Review each lesson before publishing.') });
  const pending = save.isPending || generateOutline.isPending || generateDrafts.isPending;
  const operationError = save.error ?? generateOutline.error ?? generateDrafts.error;
  const validateBrief = (): Errors => {
    if (!brief) return { brief: 'A brief is required.' };
    const next: Errors = {};
    if (!brief.audience.trim()) next.audience = 'Enter an audience.';
    brief.outcomes.forEach((value, i) => { if (!value.trim()) next[`outcome-${i}`] = 'Enter an outcome or remove it.'; });
    if (!validNumber(brief.moduleCount, 8)) next.moduleCount = 'Enter 1–8 modules.';
    if (!validNumber(brief.lessonsPerModule, 8)) next.lessonsPerModule = 'Enter 1–8 lessons.';
    if (!validNumber(brief.lessonMinutes, 240)) next.lessonMinutes = 'Enter 1–240 minutes.';
    return next;
  };
  const validateOutline = (): Errors => {
    const next: Errors = {};
    if (!outline || outline.modules.length < 1 || outline.modules.length > 8) next.outline = 'Add 1–8 modules.';
    outline?.modules.forEach((module, m) => {
      if (!module.title.trim()) next[`module-${m}`] = 'Enter a module title.';
      if (module.lessons.length < 1 || module.lessons.length > 8) next[`lessons-${m}`] = 'Add 1–8 lessons.';
      module.lessons.forEach((lesson, l) => {
        if (!lesson.title.trim()) next[`title-${m}-${l}`] = 'Enter a lesson title.';
        if (!lesson.objective.trim()) next[`objective-${m}-${l}`] = 'Enter an objective.';
        if (!validNumber(lesson.minutes, 240)) next[`minutes-${m}-${l}`] = 'Enter 1–240 minutes.';
      });
    });
    return next;
  };
  const saveBrief = async (advance: boolean) => {
    const next = validateBrief(); setErrors(next);
    if (Object.keys(next).length || !brief || pending) return;
    try {
      await save.mutateAsync({ sessionId: session.id, brief: { ...brief, audience: brief.audience.trim(), outcomes: brief.outcomes.map(s => s.trim()) } });
      setNotice('Brief saved.');
      if (advance) await generateOutline.mutateAsync({ sessionId: session.id });
    } catch { /* Mutation error is shown below. */ }
  };
  const saveOutline = async (advance: boolean) => {
    const next = validateOutline(); setErrors(next);
    if (Object.keys(next).length || !outline || pending) return;
    try {
      await save.mutateAsync({ sessionId: session.id, outline });
      setNotice('Outline saved.');
      if (advance) await generateDrafts.mutateAsync({ sessionId: session.id });
    } catch { /* Mutation error is shown below. */ }
  };
  const changeBrief = (change: Partial<CourseBrief>) => setBrief(current => current && { ...current, ...change });
  const changeModules = (modules: OutlineDraft['modules']) => setOutline({ modules });
  const changeModule = (index: number, change: Partial<OutlineDraft['modules'][number]>) => changeModules(outline!.modules.map((module, i) => i === index ? { ...module, ...change } : module));
  const changeLesson = (m: number, l: number, change: Partial<OutlineDraft['modules'][number]['lessons'][number]>) => changeModule(m, { lessons: outline!.modules[m].lessons.map((lesson, i) => i === l ? { ...lesson, ...change } : lesson) });
  const move = <T,>(items: T[], from: number, to: number) => { const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; };
  return <div className={styles.stack}>
    {notice && <StatusNotice tone="success" live="polite" onDismiss={() => setNotice('')}>{notice}</StatusNotice>}
    {operationError && <StatusNotice tone="error" title={operationError.code === 'ai-disabled' ? 'AI authoring is off' : 'Could not complete the step'}>{operationError.code === 'ai-disabled' ? 'Your administrator has turned off AI authoring.' : operationError.message}</StatusNotice>}
    {brief && <section className={styles.stack} aria-labelledby="brief-heading"><h2 id="brief-heading">Brief</h2>
      <AiContent kind="block" state="draft" who="AI course brief" source={sourceLine(session, 'brief')}>
        <div className={styles.formGrid}>
          <FormField label="Audience" required error={errors.audience}>{control => <TextInput {...control} value={brief.audience} onChange={event => changeBrief({ audience: event.target.value })} />}</FormField>
          <div className={styles.full}><h3>Outcomes</h3><div className={styles.stack}>{brief.outcomes.map((outcome, i) => <div className={styles.row} key={i}><FormField label={`Outcome ${i + 1}`} required error={errors[`outcome-${i}`]}>{control => <TextInput {...control} value={outcome} onChange={event => changeBrief({ outcomes: brief.outcomes.map((value, j) => j === i ? event.target.value : value) })} />}</FormField><Button density="compact" disabled={pending} onClick={() => { if (window.confirm(`Remove outcome ${i + 1}?`)) changeBrief({ outcomes: brief.outcomes.filter((_, j) => j !== i) }); }}>Remove outcome {i + 1}</Button></div>)}<Button density="compact" disabled={pending} onClick={() => changeBrief({ outcomes: [...brief.outcomes, ''] })}>Add outcome</Button></div></div>
          <FormField label="Module count" required error={errors.moduleCount}>{control => <TextInput {...control} type="number" min={1} max={8} value={brief.moduleCount} onChange={event => changeBrief({ moduleCount: Number(event.target.value) })} />}</FormField>
          <FormField label="Lessons per module" required error={errors.lessonsPerModule}>{control => <TextInput {...control} type="number" min={1} max={8} value={brief.lessonsPerModule} onChange={event => changeBrief({ lessonsPerModule: Number(event.target.value) })} />}</FormField>
          <FormField label="Lesson minutes" required error={errors.lessonMinutes}>{control => <TextInput {...control} type="number" min={1} max={240} value={brief.lessonMinutes} onChange={event => changeBrief({ lessonMinutes: Number(event.target.value) })} />}</FormField>
          <FormField label="Tone">{control => <TextInput {...control} value={brief.tone} onChange={event => changeBrief({ tone: event.target.value })} />}</FormField>
          <FormField label="Notes" className={styles.full}>{control => <TextArea {...control} rows={4} value={brief.notes} onChange={event => changeBrief({ notes: event.target.value })} />}</FormField>
        </div>
      </AiContent>
      <div className={styles.actions}><Button disabled={pending} onClick={() => saveBrief(false)}>Save brief</Button>{session.stage === 'brief' && <Button variant="primary" disabled={pending} onClick={() => saveBrief(true)}>{generateOutline.isPending ? 'Drafting the outline…' : 'Draft the outline'}</Button>}</div>
      {generateOutline.isPending && <p role="status">Drafting the outline… this usually takes under 20 seconds.</p>}
    </section>}
    {outline && session.stage !== 'review' && <section className={styles.stack} aria-labelledby="outline-heading"><h2 id="outline-heading">Outline</h2><p>Review the modules and lessons before creating drafts.</p>
      <AiContent kind="block" state="draft" who="AI course outline" source={sourceLine(session, 'outline')}>
        <div className={styles.stack}>{outline.modules.map((module, m) => <div className={styles.module} key={m}>
          <div className={styles.row}><FormField label={`Module ${m + 1} title`} required error={errors[`module-${m}`]}>{control => <TextInput {...control} value={module.title} onChange={event => changeModule(m, { title: event.target.value })} />}</FormField><div className={styles.actions}><Button density="compact" disabled={m === 0 || pending} onClick={() => changeModules(move(outline.modules, m, m - 1))}>Move module up</Button><Button density="compact" disabled={m === outline.modules.length - 1 || pending} onClick={() => changeModules(move(outline.modules, m, m + 1))}>Move module down</Button><Button density="compact" disabled={pending} onClick={() => { if (window.confirm(`Remove module ${m + 1} and its lessons?`)) changeModules(outline.modules.filter((_, i) => i !== m)); }}>Remove module</Button></div></div>
          {errors[`lessons-${m}`] && <p className={styles.error}>Error: {errors[`lessons-${m}`]}</p>}
          <ol className={styles.lessonList}>{module.lessons.map((lesson, l) => <li key={l}><div className={styles.formGrid}>
            <FormField label={`Lesson ${l + 1} title`} required error={errors[`title-${m}-${l}`]}>{control => <TextInput {...control} value={lesson.title} onChange={event => changeLesson(m, l, { title: event.target.value })} />}</FormField>
            <FormField label="Minutes" required error={errors[`minutes-${m}-${l}`]}>{control => <TextInput {...control} type="number" min={1} max={240} value={lesson.minutes} onChange={event => changeLesson(m, l, { minutes: Number(event.target.value) })} />}</FormField>
            <FormField label="Objective" required error={errors[`objective-${m}-${l}`]} className={styles.full}>{control => <TextArea {...control} value={lesson.objective} onChange={event => changeLesson(m, l, { objective: event.target.value })} />}</FormField>
          </div><div className={styles.actions}><Button density="compact" disabled={l === 0 || pending} onClick={() => changeModule(m, { lessons: move(module.lessons, l, l - 1) })}>Move lesson up</Button><Button density="compact" disabled={l === module.lessons.length - 1 || pending} onClick={() => changeModule(m, { lessons: move(module.lessons, l, l + 1) })}>Move lesson down</Button><Button density="compact" disabled={pending} onClick={() => { if (window.confirm(`Remove lesson ${l + 1}?`)) changeModule(m, { lessons: module.lessons.filter((_, i) => i !== l) }); }}>Remove lesson</Button></div></li>)}</ol>
          <Button density="compact" disabled={module.lessons.length >= 8 || pending} onClick={() => changeModule(m, { lessons: [...module.lessons, { title: '', minutes: brief?.lessonMinutes ?? 15, objective: '' }] })}>Add lesson to module {m + 1}</Button>
        </div>)}{errors.outline && <p className={styles.error}>Error: {errors.outline}</p>}<Button density="compact" disabled={outline.modules.length >= 8 || pending} onClick={() => changeModules([...outline.modules, { title: '', lessons: [{ title: '', minutes: brief?.lessonMinutes ?? 15, objective: '' }] }])}>Add module</Button></div>
      </AiContent>
      <div className={styles.actions}><Button disabled={pending} onClick={() => saveOutline(false)}>Save outline</Button>{session.stage === 'outline' && <Button variant="primary" disabled={pending} onClick={() => saveOutline(true)}>{generateDrafts.isPending ? 'Drafting lessons…' : 'Draft the lessons'}</Button>}</div>
      {session.stage === 'draft' && <p role="status">Drafting lessons is in progress. Refresh this page to check for completed drafts.</p>}
      {session.stage === 'outline' && <StatusNotice tone="info">Drafting creates draft lessons in this course. It can take about 20 seconds per lesson; none will be published.</StatusNotice>}
      {generateDrafts.isPending && <p role="status">Drafting lessons… this can take about 20 seconds per lesson. Keep this page open.</p>}
    </section>}
    {session.stage === 'review' && <Review session={session} courseId={courseId} />}
  </div>;
}

function Review({ session, courseId }: { session: BuilderSession; courseId: string }) {
  const course = useApiQuery('getCourseOutline', { courseId });
  const [counts, setCounts] = useState<Record<string, { total: number; kept: number }>>({});
  const total = Object.values(counts).reduce((sum, value) => sum + value.total, 0);
  const kept = Object.values(counts).reduce((sum, value) => sum + value.kept, 0);
  const lessons = course.data?.modules.flatMap(module => module.lessons) ?? [];
  return <section className={styles.stack} aria-labelledby="review-heading"><h2 id="review-heading">Review drafts</h2>
    <p>Open each lesson to keep, revert, or regenerate its AI blocks. Nothing publishes from this page.</p>
    <ProgressMeter label="AI blocks kept" value={kept} max={Math.max(total, 1)} valueText={`${kept} of ${total} AI blocks kept`} />
    {course.isPending ? <Loading label="Loading lessons" /> : course.error ? <ErrorNotice error={course.error} onRetry={() => course.refetch()} /> : <AiContent kind="note" who="AI draft lessons" source={sourceLine(session, 'lesson drafts')}><ul className={styles.reviewList}>{session.lessonIds.map(id => { const lesson = lessons.find(item => item.id === id); return <ReviewLesson key={id} courseId={courseId} lessonId={id} title={lesson?.title ?? 'Draft lesson'} status={lesson?.status ?? 'draft'} onCount={count => setCounts(current => { const previous = current[id]; return previous?.total === count.total && previous.kept === count.kept ? current : { ...current, [id]: count }; })} />; })}</ul></AiContent>}
    <Link to={paths.teach.course(courseId)}>Back to course workspace</Link>
  </section>;
}

function ReviewLesson({ courseId, lessonId, title, status, onCount }: { courseId: string; lessonId: string; title: string; status: 'draft' | 'published'; onCount: (count: { total: number; kept: number }) => void }) {
  const query = useApiQuery('getLesson', { lessonId });
  const ai = query.data?.blocks.filter(block => block.origin === 'ai') ?? [];
  const draft = ai.filter(block => block.aiState === 'draft').length;
  const kept = ai.filter(block => block.aiState === 'kept').length;
  useEffect(() => { if (query.data) onCount({ total: ai.length, kept }); }, [query.data, ai.length, kept, onCount]);
  return <li className={styles.reviewItem}><div><Link to={paths.teach.lesson(courseId, lessonId)}>{title}</Link><div className={styles.actions}><StatusChip tone={status === 'published' ? 'success' : 'warning'}>{status}</StatusChip>{query.isPending ? <span>Loading draft count…</span> : query.error ? <span>Draft count unavailable</span> : <span>{draft} AI {draft === 1 ? 'draft' : 'drafts'} to review</span>}</div></div>{query.error && <ErrorNotice error={query.error} onRetry={() => query.refetch()} />}</li>;
}

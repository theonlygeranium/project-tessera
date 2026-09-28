import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, FormField, StatusNotice, TextArea, TextInput, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { PageHelp } from '../../help/PageHelp';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './Builder.module.css';

type Source = { name: string; text: string };
const MAX_SOURCES = 5;
const MAX_CHARS = 20_000;
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export function BuilderStart() {
  usePageTitle('Build with AI');
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const course = useApiQuery('getCourseOutline', { courseId }, { enabled: !!courseId });
  const sessions = useApiQuery('listBuilderSessions', { courseId }, { enabled: !!courseId });
  const create = useApiMutation('createBuilderSession', { onSuccess: result => navigate(paths.teach.buildSession(courseId, result.id)) });
  const [prompt, setPrompt] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fileBusy, setFileBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addPaste = () => {
    const next: Record<string, string> = {};
    if (sources.length >= MAX_SOURCES) next.source = 'You can add at most five sources.';
    if (!sourceName.trim()) next.sourceName = 'Name the source.';
    if (!sourceText.trim()) next.sourceText = 'Paste source text.';
    if (sourceText.length > MAX_CHARS) next.sourceText = 'Keep each source to 20,000 characters or fewer.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSources(list => [...list, { name: sourceName.trim(), text: sourceText }]);
    setSourceName(''); setSourceText('');
  };
  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setFileBusy(true);
    const accepted: Source[] = [];
    const messages: string[] = [];
    for (const file of files) {
      if (sources.length + accepted.length >= MAX_SOURCES) { messages.push('You can add at most five sources.'); break; }
      if (!/\.(txt|md)$/i.test(file.name)) { messages.push(`${file.name}: upload a .txt or .md file.`); continue; }
      try {
        const text = await file.text();
        if (!text.trim()) messages.push(`${file.name}: the file is empty.`);
        else if (text.length > MAX_CHARS) messages.push(`${file.name}: keep each source to 20,000 characters or fewer.`);
        else accepted.push({ name: file.name, text });
      } catch { messages.push(`${file.name}: the file could not be read.`); }
    }
    setSources(list => [...list, ...accepted]);
    setErrors(current => ({ ...current, source: messages.join(' ') }));
    setFileBusy(false);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending || fileBusy) return;
    if (!prompt.trim()) { setErrors(current => ({ ...current, prompt: 'Describe what to teach.' })); return; }
    setErrors(current => ({ ...current, prompt: '' }));
    create.mutate({ courseId, prompt: prompt.trim(), sources });
  };
  const courseName = course.data?.course.title ?? 'Course';
  return <div className={styles.page}>
    <TopBar title="Build with AI" breadcrumbs={[{ label: 'My courses', href: paths.teach.courses }, { label: courseName, href: paths.teach.course(courseId) }, { label: 'Build with AI' }]} renderLink={renderRouterLink} />
    <PageHelp topic="teach.build" courseId={courseId} />
    {course.isPending ? <Loading label="Loading course" /> : course.error ? <ErrorNotice error={course.error} onRetry={() => course.refetch()} /> : <>
      <p className={styles.intro}>The AI drafts; you decide. Nothing reaches students until you keep the drafts and publish the lessons.</p>
      <Link to={paths.teach.generate(courseId)}>Or add drafts to existing lessons →</Link>
      <form onSubmit={submit} className={styles.stack} noValidate>
        <h2>Start a draft</h2>
        <FormField label="What should this course or unit cover, and for whom?" required error={errors.prompt}>{control => <TextArea {...control} value={prompt} rows={5} onChange={event => setPrompt(event.target.value)} />}</FormField>
        <section className={styles.stack} aria-labelledby="sources-heading">
          <h3 id="sources-heading">Sources</h3>
          <p className={styles.muted}>Add up to five sources. Each can be up to 20,000 characters.</p>
          {sources.length > 0 && <ul className={styles.sourceList}>{sources.map((source, index) => <li key={`${source.name}-${index}`}><span><strong>{source.name}</strong> · {source.text.length.toLocaleString()} characters</span><Button density="compact" onClick={() => { if (window.confirm(`Remove ${source.name}?`)) { setSources(list => list.filter((_, i) => i !== index)); queueMicrotask(() => fileRef.current?.focus()); } }}>Remove {source.name}</Button></li>)}</ul>}
          <FormField label="Source name" error={errors.sourceName}>{control => <TextInput {...control} value={sourceName} onChange={event => setSourceName(event.target.value)} />}</FormField>
          <FormField label="Paste source text" error={errors.sourceText}>{control => <TextArea {...control} value={sourceText} rows={5} onChange={event => setSourceText(event.target.value)} />}</FormField>
          <div className={styles.actions}><Button onClick={addPaste} disabled={sources.length >= MAX_SOURCES || create.isPending}>Add pasted source</Button></div>
          <FormField label="Upload .txt or .md files" hint="Files are read in your browser." error={errors.source}>{control => <input {...control} ref={fileRef} type="file" accept=".txt,.md" multiple disabled={sources.length >= MAX_SOURCES || fileBusy || create.isPending} onChange={addFiles} />}</FormField>
        </section>
        {create.error && <StatusNotice tone="error" title={create.error.code === 'ai-disabled' ? 'AI authoring is off' : 'Brief could not be drafted'} action={create.error.code === 'ai-failed' ? <Button density="compact" onClick={() => create.mutate({ courseId, prompt: prompt.trim(), sources })} disabled={create.isPending}>Try again</Button> : undefined}>{create.error.code === 'ai-disabled' ? 'Your administrator has turned off AI authoring.' : create.error.message}</StatusNotice>}
        <div className={styles.actions}><Button variant="primary" type="submit" disabled={create.isPending || fileBusy}>{create.isPending ? 'Drafting the brief…' : 'Draft the brief'}</Button></div>
        {create.isPending && <p role="status">Drafting the brief… this usually takes under 20 seconds.</p>}
      </form>
      <section className={styles.stack} aria-labelledby="earlier-heading"><h2 id="earlier-heading">Earlier sessions</h2>
        {sessions.isPending ? <Loading label="Loading sessions" /> : sessions.error ? <ErrorNotice error={sessions.error} onRetry={() => sessions.refetch()} /> : sessions.data.length === 0 ? <p>No earlier sessions for this course.</p> : <ul className={styles.sessionList}>{sessions.data.map(session => <li key={session.id}><Link to={paths.teach.buildSession(courseId, session.id)}>{session.prompt.length > 90 ? `${session.prompt.slice(0, 90)}…` : session.prompt}</Link><span>{session.stage} · {date(session.createdAt)}</span></li>)}</ul>}
      </section>
    </>}
  </div>;
}

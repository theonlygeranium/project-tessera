import { useBeforeUnload, useBlocker, useParams } from 'react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BlockInput } from '../../../../shared/api';
import type { Block, BlockContent, ReadinessReport } from '../../../../shared/domain';
import { lessonReadiness } from '../../../../shared/policy';
import { AiContent, Button, Card, FormField, ProgressMeter, Select, StatusChip } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import { ActionLink, CourseBar, Field, Message, SaveButton } from './common';
import styles from './instructor.module.css';

function fresh(type: BlockContent['type']): BlockInput {
  switch (type) {
    case 'heading': return { type, level: 2, text: '' };
    case 'text': return { type, text: '' };
    case 'callout': return { type, tone: 'info', title: '', text: '' };
    case 'image': return { type, src: '', alt: '', decorative: false, caption: '' };
    case 'check': return { type, question: '', options: [{ id: crypto.randomUUID(), text: '' }, { id: crypto.randomUUID(), text: '' }], correctOptionId: '', feedbackCorrect: '', feedbackIncorrect: '' };
  }
}
function contentText(block: BlockContent): string {
  switch (block.type) {
    case 'heading': case 'text': return block.text;
    case 'callout': return `${block.title}\n${block.text}`;
    case 'image': return `${block.src}\n${block.alt}\n${block.caption}`;
    case 'check': return `${block.question}\n${block.options.map(o => o.text).join('\n')}`;
  }
}
function BlockFields({ block, onChange }: { block: BlockInput; onChange: (value: BlockInput) => void }) {
  const set = (value: Partial<BlockInput>) => onChange({ ...block, ...value } as BlockInput);
  if (block.type === 'heading') return <><FormField label="Heading level">{control => <Select {...control} value={block.level} onChange={e => set({ level: Number(e.target.value) as 2 | 3 })}><option value="2">Level 2</option><option value="3">Level 3</option></Select>}</FormField><Field label="Heading text" value={block.text} onChange={text => set({ text })} required /></>;
  if (block.type === 'text') return <Field label="Text" value={block.text} onChange={text => set({ text })} multiline required />;
  if (block.type === 'callout') return <><FormField label="Tone">{control => <Select {...control} value={block.tone} onChange={e => set({ tone: e.target.value as 'info' | 'tip' | 'warning' })}><option value="info">Info</option><option value="tip">Tip</option><option value="warning">Warning</option></Select>}</FormField><Field label="Callout title" value={block.title} onChange={title => set({ title })} /><Field label="Callout text" value={block.text} onChange={text => set({ text })} multiline /></>;
  if (block.type === 'image') return <><Field label="Image URL" type="url" value={block.src} onChange={src => set({ src })} required /><label className={styles.row}><input type="checkbox" checked={block.decorative} onChange={e => set({ decorative: e.target.checked, alt: e.target.checked ? '' : block.alt })} /> Decorative image</label><Field label="Alt text" value={block.alt} onChange={alt => set({ alt })} required={!block.decorative} hint="Describe the image, or mark it decorative." /><Field label="Caption" value={block.caption} onChange={caption => set({ caption })} /></>;
  return <><Field label="Question" value={block.question} onChange={question => set({ question })} required />{block.options.map((option, i) => <div className={styles.row} key={option.id}><Field label={`Option ${i + 1}`} value={option.text} onChange={text => set({ options: block.options.map(o => o.id === option.id ? { ...o, text } : o) })} required /><label><input type="radio" name={`correct-${block.id ?? block.options[0].id}`} checked={block.correctOptionId === option.id} onChange={() => set({ correctOptionId: option.id })} /> Correct</label><Button density="compact" disabled={block.options.length <= 2} onClick={() => set({ options: block.options.filter(o => o.id !== option.id), correctOptionId: block.correctOptionId === option.id ? '' : block.correctOptionId })}>Remove option</Button></div>)}<Button density="compact" disabled={block.options.length >= 6} onClick={() => set({ options: [...block.options, { id: crypto.randomUUID(), text: '' }] })}>Add option</Button><Field label="Feedback for correct answer" value={block.feedbackCorrect} onChange={feedbackCorrect => set({ feedbackCorrect })} multiline /><Field label="Feedback for incorrect answer" value={block.feedbackIncorrect} onChange={feedbackIncorrect => set({ feedbackIncorrect })} multiline /></>;
}
function StudentBlock({ block }: { block: BlockInput }) {
  switch (block.type) {
    case 'heading': return block.level === 2 ? <h2>{block.text}</h2> : <h3>{block.text}</h3>;
    case 'text': return <p className={styles.preview}>{block.text}</p>;
    case 'callout': return <aside className={styles.panel}><strong>{block.title}</strong><p className={styles.preview}>{block.text}</p></aside>;
    case 'image': return <figure><img className={styles.media} src={block.src} alt={block.decorative ? '' : block.alt} /><figcaption>{block.caption}</figcaption></figure>;
    case 'check': return <fieldset><legend>{block.question}</legend>{block.options.map(o => <label key={o.id} className={styles.row}><input type="radio" disabled name={`preview-${block.id ?? block.options[0].id}`} />{o.text}</label>)}</fieldset>;
  }
}
export function LessonEditor() {
  const { courseId = '', lessonId = '' } = useParams(); const q = useApiQuery('getLesson', { lessonId });
  usePageTitle(q.data?.lesson.title ?? 'Lesson editor');
  const update = useApiMutation('updateLesson'); const save = useApiMutation('saveBlocks'); const keep = useApiMutation('keepBlock'); const revert = useApiMutation('revertBlock'); const regenerate = useApiMutation('regenerateBlock'); const publish = useApiMutation('publishLesson'); const unpublish = useApiMutation('unpublishLesson');
  const [title, setTitle] = useState(''); const [minutes, setMinutes] = useState('15'); const [blocks, setBlocks] = useState<BlockInput[]>([]); const [base, setBase] = useState('[]'); const [editing, setEditing] = useState<number | null>(null); const [preview, setPreview] = useState(false); const [instruction, setInstruction] = useState<Record<string, string>>({}); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [report, setReport] = useState<ReadinessReport | null>(null);
  const loadedLesson = useRef('');
  const dirty = JSON.stringify(blocks) !== base;
  useEffect(() => {
    if (!q.data || (loadedLesson.current === q.data.lesson.id && dirty)) return;
    const list = q.data.blocks.map(b => ({ ...b }));
    setBlocks(list); setBase(JSON.stringify(list)); setTitle(q.data.lesson.title); setMinutes(String(q.data.lesson.minutes));
    loadedLesson.current = q.data.lesson.id;
  }, [q.data]);
  useEffect(() => {
    if (editing === null) return;
    const panel = document.getElementById(`block-${blocks[editing]?.id ?? editing}`);
    panel?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input:not([type=hidden]),textarea,select')?.focus();
  }, [editing]);
  useBeforeUnload(useCallback(e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }, [dirty]));
  const blocker = useBlocker(dirty);
  useEffect(() => { if (blocker.state === 'blocked') { if (window.confirm('Leave this lesson? Unsaved block changes will be lost.')) blocker.proceed(); else blocker.reset(); } }, [blocker]);
  const mutate = async (task: () => Promise<unknown>, success: string) => { try { setError(''); await task(); setMessage(success); } catch (e) { setError(e instanceof Error ? e.message : 'Could not complete the action.'); } };
  const aiAction = async (task: () => Promise<unknown>, success: string) => { if (dirty) { setError('Save changes before reviewing AI blocks.'); return; } await mutate(task, success); };
  const replace = (i: number, b: BlockInput) => setBlocks(blocks.map((x, index) => index === i ? b : x));
  const move = (i: number, offset: number) => { const list = [...blocks]; [list[i], list[i + offset]] = [list[i + offset], list[i]]; setBlocks(list); };
  const authoritative = q.data?.blocks ?? [];
  const current = blocks.map((b, position) => ({ ...(authoritative.find(x => x.id === b.id) ?? { origin: 'human', aiState: null, lessonId, position, provenance: null, previous: null, updatedAt: '' }), ...b, id: b.id ?? `local-${position}`, position } as Block));
  const readiness = dirty ? lessonReadiness(current) : q.data?.readiness;
  return <><CourseBar title={q.data?.lesson.title ?? 'Lesson editor'} courseId={courseId} courseTitle={q.data?.courseTitle} actions={<ActionLink to={paths.teach.course(courseId)}>Course workspace</ActionLink>} />
    {q.isPending ? <Loading /> : q.error ? <ErrorNotice error={q.error} onRetry={() => void q.refetch()} /> : <div className={styles.stack}><Message text={message} /><Message text={error} error />
      <section><h2>Lesson details</h2><form className={styles.inlineForm} onSubmit={e => { e.preventDefault(); void mutate(() => update.mutateAsync({ lessonId, title, minutes: Number(minutes) }), 'Lesson details saved.'); }}><Field label="Title" value={title} onChange={setTitle} required /><Field label="Estimated minutes" value={minutes} type="number" onChange={setMinutes} required /><SaveButton pending={update.isPending}>Save details</SaveButton></form></section>
      <section><h2>Blocks</h2><div className={styles.row}><Button density="compact" onClick={() => setPreview(!preview)} aria-pressed={preview}>{preview ? 'Return to editor' : 'Preview as student'}</Button>{dirty && <span role="status">Unsaved block changes</span>}</div>
        {preview ? <div className={styles.stack}>{blocks.filter(b => { const source = authoritative.find(x => x.id === b.id); return source?.aiState !== 'draft'; }).map((b, i) => <div key={b.id ?? i}><StudentBlock block={b} /></div>)}</div> : <div className={styles.stack}>{blocks.map((b, i) => { const source = authoritative.find(x => x.id === b.id); const previous = source?.previous; return <Card key={b.id ?? `new-${i}`} className={styles.block} id={`block-${b.id ?? i}`} tabIndex={-1} density="compact"><div className={styles.row}><strong>{i + 1}. {b.type === 'check' ? 'Knowledge check' : b.type}</strong><Button density="compact" onClick={() => setEditing(editing === i ? null : i)}>{editing === i ? 'Close edit' : 'Edit'}</Button><Button density="compact" disabled={i === 0} onClick={() => move(i, -1)}>Move up</Button><Button density="compact" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>Move down</Button><Button density="compact" onClick={() => { if (window.confirm('Delete this block?')) setBlocks(blocks.filter((_, index) => index !== i)); }}>Delete</Button></div>
          {source?.origin === 'ai' ? <AiContent kind="block" state={source.aiState === 'kept' ? 'kept' : 'draft'} who="AI lesson draft" source={`${source.provenance?.summary ?? 'Generated lesson content'} · ${source.provenance?.model ?? 'Unknown model'}`} actions={source.aiState === 'draft' && source.id ? <div className={styles.stack}><div className={styles.row}><Button density="compact" variant="primary" onClick={() => void aiAction(() => keep.mutateAsync({ blockId: source.id }), 'AI block kept.')}>Keep</Button><Button density="compact" onClick={() => void aiAction(() => revert.mutateAsync({ blockId: source.id }), 'AI block reverted.')}>Revert</Button><Button density="compact" onClick={() => void aiAction(() => regenerate.mutateAsync({ blockId: source.id, instruction: instruction[source.id] }), 'AI block regenerated.')}>Regenerate</Button></div><Field label="Regeneration instruction (optional)" value={instruction[source.id] ?? ''} onChange={v => setInstruction({ ...instruction, [source.id]: v })} /></div> : undefined}><p className={styles.preview}>{contentText(b)}</p></AiContent> : <StudentBlock block={b} />}
          {previous && <div className={styles.panel}><h3>Before and after</h3><p><strong>Previous</strong></p><AiContent kind="note" who="Previous AI version" source={`${source?.provenance?.summary ?? 'Generated lesson content'} · ${source?.provenance?.model ?? 'Unknown model'}`}><p className={styles.preview}>{contentText(previous)}</p></AiContent><p><strong>Current</strong></p><p className={styles.preview}>{contentText(b)}</p></div>}
          {editing === i && <div className={styles.inlineForm}><BlockFields block={b} onChange={v => replace(i, v)} /></div>}</Card>; })}
          <div className={styles.row}>{(['heading', 'text', 'callout', 'image', 'check'] as const).map(type => <Button key={type} density="compact" onClick={() => { setBlocks([...blocks, fresh(type)]); setEditing(blocks.length); }}>{`Add ${type === 'check' ? 'knowledge check' : type}`}</Button>)}</div><Button variant="primary" density="compact" disabled={!dirty || save.isPending} onClick={() => void (async () => { try { const result = await save.mutateAsync({ lessonId, blocks }); const list = result.blocks.map(b => ({ ...b })); setBlocks(list); setBase(JSON.stringify(list)); setEditing(null); setReport(null); setError(''); setMessage('Blocks saved.'); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save blocks.'); } })()}>Save changes</Button></div>}</section>
      <section className={styles.panel}><h2>Publish readiness</h2><StatusChip tone={q.data?.lesson.status === 'published' ? 'success' : 'neutral'}>{q.data?.lesson.status === 'published' ? 'Published' : 'Draft'}</StatusChip><ProgressMeter label="AI blocks kept" value={readiness?.keptAiBlocks ?? 0} max={readiness?.aiBlocks || 1} valueText={`${readiness?.keptAiBlocks ?? 0} of ${readiness?.aiBlocks ?? 0} AI blocks kept`} />{(report ?? readiness)?.issues.length ? <ul className={styles.list}>{(report ?? readiness)?.issues.map((issue, i) => <li key={i}>{issue.blockId ? <a href={`#block-${issue.blockId}`} onClick={e => { e.preventDefault(); setPreview(false); requestAnimationFrame(() => document.getElementById(`block-${issue.blockId}`)?.focus()); }}>{issue.message}</a> : issue.message}</li>)}</ul> : <p>Ready to publish.</p>}
        {q.data?.lesson.status === 'published' ? <Button density="compact" onClick={() => void mutate(() => unpublish.mutateAsync({ lessonId }), 'Lesson unpublished.')}>Unpublish</Button> : <><Button variant="primary" density="compact" disabled={dirty || !readiness?.ready || publish.isPending} onClick={() => void (async () => { try { await publish.mutateAsync({ lessonId }); setReport(null); setMessage('Lesson published.'); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not publish.'); const detail = (e as { details?: unknown }).details; if (detail && typeof detail === 'object' && 'issues' in detail) setReport(detail as ReadinessReport); } })()}>Publish</Button>{(dirty || !readiness?.ready) && <p>{dirty ? 'Save block changes before publishing.' : readiness?.issues[0]?.message}</p>}</>}
      </section></div>}</>;
}

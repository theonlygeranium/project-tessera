import { useBeforeUnload, useBlocker, useParams } from 'react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BlockInput } from '../../../../shared/api';
import type { AccessIssue, Block, BlockContent, ReadinessReport } from '../../../../shared/domain';
import { lessonReadiness } from '../../../../shared/policy';
import { AiContent, Button, Card, StatusChip } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import { ActionLink, CourseBar, Field, Message, SaveButton } from './common';
import styles from './instructor.module.css';
import { BlockEditor, BlockPlayer } from '../content';
import { Suggestion } from '../access/Suggestion';
import { GenerateElementPanel } from '../builder';
import { TutorSettingsPanel } from '../tutor/TutorSettingsPanel';
import { severityTone, scoreText } from '../access/utils';
import { itemsForLesson } from '../../../../shared/quality';
import { OutcomeTags } from '../readiness/OutcomeTags';
import { Fixes } from '../readiness/ReadinessPage';
import { Link } from 'react-router';
import { ReviewPanel } from '../design-partner/ReviewPanel';
import { ReviewOutline } from '../design-partner/ReviewOutline';

function fresh(type: BlockContent['type']): BlockInput {
  switch (type) {
    case 'heading': return { type, level: 2, text: '' };
    case 'text': return { type, text: '' };
    case 'callout': return { type, tone: 'info', title: '', text: '' };
    case 'image': return { type, src: '', alt: '', decorative: false, caption: '' };
    case 'check': return { type, question: '', options: [{ id: crypto.randomUUID(), text: '' }, { id: crypto.randomUUID(), text: '' }], correctOptionId: '', feedbackCorrect: '', feedbackIncorrect: '' };
    // Night 2 block types get their editors in lane C; these are valid empty starts.
    case 'document': return { type, title: '', sections: [{ heading: '', text: '' }] };
    case 'file': return { type, fileId: '', title: '', description: '' };
    case 'video': return { type, src: '', provider: 'youtube', title: '', captionsFileId: null, transcript: '', minutes: 0 };
    case 'table': return { type, caption: '', headerRow: true, rows: [['', ''], ['', '']] };
    case 'scenario': return { type, title: '', setting: '', nodes: [{ id: 'start', text: '', choices: [], outcome: '' }], startNodeId: 'start' };
    case 'link': return { type, href: '', text: '', description: '' };
  }
}
function contentText(block: BlockContent): string {
  switch (block.type) {
    case 'heading': case 'text': return block.text;
    case 'callout': return `${block.title}\n${block.text}`;
    case 'image': return `${block.src}\n${block.alt}\n${block.caption}`;
    case 'check': return `${block.question}\n${block.options.map(o => o.text).join('\n')}`;
    case 'document': return `${block.title}\n${block.sections.map(s => s.heading).join('\n')}`;
    case 'file': return `${block.title}\n${block.description}`;
    case 'video': return `${block.title}\n${block.src}`;
    case 'table': return `${block.caption}\n${block.rows.map(r => r.join(' | ')).join('\n')}`;
    case 'scenario': return `${block.title}\n${block.setting}`;
    case 'link': return `${block.text}\n${block.href}`;
  }
}
export function LessonEditor() {
  const { courseId = '', lessonId = '' } = useParams(); const courseReadiness = useApiQuery('getCourseReadiness', { courseId }, { enabled: !!courseId }); const q = useApiQuery('getLesson', { lessonId }); const access = useApiQuery('getLessonAccess', { lessonId }, { enabled: !!lessonId });
  const masterId = q.data?.lesson.variantOf?.lessonId ?? lessonId;
  const variants = useApiQuery('listVariants', { lessonId: masterId }, { enabled: !!q.data });
  usePageTitle(q.data?.lesson.title ?? 'Lesson editor');
  const update = useApiMutation('updateLesson'); const save = useApiMutation('saveBlocks'); const keep = useApiMutation('keepBlock'); const revert = useApiMutation('revertBlock'); const regenerate = useApiMutation('regenerateBlock'); const publish = useApiMutation('publishLesson'); const unpublish = useApiMutation('unpublishLesson');
  const [title, setTitle] = useState(''); const [minutes, setMinutes] = useState('15'); const [blocks, setBlocks] = useState<BlockInput[]>([]); const [base, setBase] = useState('[]'); const [editing, setEditing] = useState<number | null>(null); const [preview, setPreview] = useState(false); const [instruction, setInstruction] = useState<Record<string, string>>({}); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [report, setReport] = useState<ReadinessReport | null>(null); const [policyReasons, setPolicyReasons] = useState<string[]>([]);
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
  useEffect(() => { if (!q.data?.blocks.length || !window.location.hash.startsWith('#block-')) return; const id = decodeURIComponent(window.location.hash.slice(1)); requestAnimationFrame(() => { const block = document.getElementById(id); block?.scrollIntoView({ block: 'start' }); block?.focus(); }); }, [q.data?.blocks, lessonId]);
  useBeforeUnload(useCallback(e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }, [dirty]));
  const blocker = useBlocker(dirty);
  useEffect(() => { if (blocker.state === 'blocked') { if (window.confirm('Leave this lesson? Unsaved block changes will be lost.')) blocker.proceed(); else blocker.reset(); } }, [blocker]);
  const mutate = async (task: () => Promise<unknown>, success: string) => { try { setError(''); await task(); setMessage(success); } catch (e) { setError(e instanceof Error ? e.message : 'Could not complete the action.'); } };
  const aiAction = async (task: () => Promise<unknown>, success: string) => { if (dirty) { setError('Save changes before reviewing AI blocks.'); return; } await mutate(task, success); };
  const replace = (i: number, b: BlockInput) => setBlocks(blocks.map((x, index) => index === i ? b : x));
  const goToBlock = (blockId: string) => { setPreview(false); requestAnimationFrame(() => { const block = document.getElementById(`block-${blockId}`); block?.scrollIntoView({ block: 'start' }); block?.focus(); }); };
  const applySuggestion = (issue: AccessIssue, text: string, edit: boolean) => { const i = blocks.findIndex(b => b.id === issue.location.blockId); if (i < 0) return; const block = blocks[i]; let next: BlockInput = block; if (issue.fix === 'alt-text' && block.type === 'image') next = { ...block, alt: text, decorative: false }; if (issue.fix === 'link-text' && block.type === 'link') next = { ...block, text }; if (issue.fix === 'rewrite' && block.type === 'text') next = { ...block, text }; if (issue.fix === 'rewrite' && block.type === 'callout') next = { ...block, text }; if (issue.fix === 'rewrite' && block.type === 'scenario') next = { ...block, setting: text }; if (issue.fix === 'rewrite' && block.type === 'document') next = { ...block, sections: block.sections.map((section, index) => index === 0 ? { ...section, text } : section) }; replace(i, next); setPreview(false); if (edit) { setEditing(i); goToBlock(block.id ?? String(i)); } };
  const move = (i: number, offset: number) => { const list = [...blocks]; [list[i], list[i + offset]] = [list[i + offset], list[i]]; setBlocks(list); };
  const authoritative = q.data?.blocks ?? [];
  const current = blocks.map((b, position) => ({ ...(authoritative.find(x => x.id === b.id) ?? { origin: 'human', aiState: null, lessonId, position, provenance: null, previous: null, updatedAt: '' }), ...b, id: b.id ?? `local-${position}`, position } as Block));
  const readiness = dirty ? lessonReadiness(current) : q.data?.readiness;
  return <><CourseBar title={q.data?.lesson.title ?? 'Lesson editor'} courseId={courseId} courseTitle={q.data?.courseTitle} actions={<ActionLink to={paths.teach.course(courseId)}>Course workspace</ActionLink>} />
    {q.isPending ? <Loading /> : q.error ? <ErrorNotice error={q.error} onRetry={() => void q.refetch()} /> : <div className={styles.stack}><Message text={message} /><Message text={error} error /><div className={`${styles.editorLayout} ${q.data?.design ? styles.editorLayoutDesign : ''}`}>{q.data?.design && <ReviewOutline courseId={courseId} lessonId={lessonId} />}<div className={styles.editorMain}>
      <section><h2>Lesson details</h2><form className={styles.inlineForm} onSubmit={e => { e.preventDefault(); void mutate(() => update.mutateAsync({ lessonId, title, minutes: Number(minutes) }), 'Lesson details saved.'); }}><Field label="Title" value={title} onChange={setTitle} required /><Field label="Estimated minutes" value={minutes} type="number" onChange={setMinutes} required /><SaveButton pending={update.isPending}>Save details</SaveButton></form></section>
      <section className={styles.panel}><h2>Variants</h2><p>{q.data?.lesson.variantOf ? 'This is a variant of the master lesson.' : `${variants.data?.length ?? 0} versions`}</p>{!q.data?.lesson.variantOf && variants.data?.map(v => <p key={v.lessonId}>{v.audience === 'plain' ? 'Plain language' : '15-minute version'} · {v.divergedBlocks + v.uncoveredBlocks ? `${v.divergedBlocks + v.uncoveredBlocks} blocks changed in the master` : 'In sync'}</p>)}<ActionLink to={paths.teach.variants(courseId, masterId)}>{q.data?.lesson.variantOf ? 'Compare with master' : 'Manage variants'}</ActionLink></section>
      <section><h2>Blocks</h2><div className={styles.row}><Button density="compact" onClick={() => setPreview(!preview)} aria-pressed={preview}>{preview ? 'Return to editor' : 'Preview as student'}</Button>{dirty && <span role="status">Unsaved block changes</span>}</div>
        {preview ? <div className={styles.stack}>{blocks.filter(b => { const source = authoritative.find(x => x.id === b.id); return source?.aiState !== 'draft'; }).map((b, i) => <div key={b.id ?? i}><BlockPlayer block={b as import('../../../../shared/domain').StudentBlock} lessonId={lessonId} readOnly /></div>)}</div> : <div className={styles.stack}>{blocks.map((b, i) => { const source = authoritative.find(x => x.id === b.id); const previous = source?.previous; return <Card key={b.id ?? `new-${i}`} className={styles.block} id={`block-${b.id ?? i}`} tabIndex={-1} density="compact"><div className={styles.row}><strong>{i + 1}. {b.type === 'check' ? 'Knowledge check' : b.type}</strong><Button density="compact" onClick={() => setEditing(editing === i ? null : i)}>{editing === i ? 'Close edit' : 'Edit'}</Button><Button density="compact" disabled={i === 0} onClick={() => move(i, -1)}>Move up</Button><Button density="compact" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>Move down</Button><Button density="compact" onClick={() => { if (window.confirm('Delete this block?')) setBlocks(blocks.filter((_, index) => index !== i)); }}>Delete</Button></div>
          {source?.origin === 'ai' ? <AiContent kind="block" state={source.aiState === 'kept' ? 'kept' : 'draft'} who="AI lesson draft" source={`${source.provenance?.summary ?? 'Generated lesson content'} · ${source.provenance?.model ?? 'Unknown model'}`} actions={source.aiState === 'draft' && source.id ? <div className={styles.stack}><div className={styles.row}><Button density="compact" variant="primary" onClick={() => void aiAction(() => keep.mutateAsync({ blockId: source.id }), 'AI block approved.')}>Keep</Button><Button density="compact" onClick={() => void aiAction(() => revert.mutateAsync({ blockId: source.id }), 'AI block reverted.')}>Revert</Button><Button density="compact" onClick={() => void aiAction(() => regenerate.mutateAsync({ blockId: source.id, instruction: instruction[source.id] }), 'AI block regenerated.')}>Regenerate</Button></div><Field label="Regeneration instruction (optional)" value={instruction[source.id] ?? ''} onChange={v => setInstruction({ ...instruction, [source.id]: v })} /></div> : undefined}><p className={styles.preview}>{contentText(b)}</p></AiContent> : <BlockPlayer block={b as import('../../../../shared/domain').StudentBlock} lessonId={lessonId} readOnly />}
          {previous && <div className={styles.panel}><h3>Before and after</h3><p><strong>Previous</strong></p><AiContent kind="note" who="Previous AI version" source={`${source?.provenance?.summary ?? 'Generated lesson content'} · ${source?.provenance?.model ?? 'Unknown model'}`}><p className={styles.preview}>{contentText(previous)}</p></AiContent><p><strong>Current</strong></p><p className={styles.preview}>{contentText(b)}</p></div>}
          {editing === i && <div className={styles.inlineForm}><BlockEditor value={b} courseId={courseId} onChange={v => replace(i, v)} /></div>}{(b.type === 'check' || b.type === 'scenario') && b.id && <OutcomeTags courseId={courseId} targetKind="block" targetId={b.id} />}</Card>; })}
          <div className={styles.row}>{(['heading', 'text', 'callout', 'image', 'check', 'document', 'table', 'scenario', 'link', 'video', 'file'] as const).map(type => <Button key={type} density="compact" onClick={() => { setBlocks([...blocks, fresh(type)]); setEditing(blocks.length); }}>{`Add ${type === 'check' ? 'knowledge check' : type}`}</Button>)}</div><Button variant="primary" density="compact" disabled={!dirty || save.isPending} onClick={() => void (async () => { try { const result = await save.mutateAsync({ lessonId, blocks }); const list = result.blocks.map(b => ({ ...b })); setBlocks(list); setBase(JSON.stringify(list)); setEditing(null); setReport(null); setPolicyReasons([]); setError(''); setMessage('Blocks saved.'); void access.refetch(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save blocks.'); } })()}>Save changes</Button><section className={styles.panel} aria-labelledby="add-with-ai"><h3 id="add-with-ai">Add with AI</h3>{dirty ? <p>Save your block changes first; the AI draft is added to the saved lesson.</p> : <GenerateElementPanel lessonId={lessonId} onDone={detail => { const list = detail.blocks.map(b => ({ ...b })); setBlocks(list); setBase(JSON.stringify(list)); setError(''); setMessage('AI draft added at the end of the lesson. Review it before publishing.'); void access.refetch(); }} />}</section></div>}</section>
      </div><section className={`${styles.panel} ${styles.readiness}`}><>{q.data?.design && <ReviewPanel courseId={courseId} lessonId={lessonId} moduleId={q.data.lesson.moduleId} detail={q.data} dirty={dirty} onEditBlock={blockId => { const index = blocks.findIndex(block => block.id === blockId); if (index >= 0) { setEditing(index); goToBlock(blockId); } }} onChanged={() => { void q.refetch(); void courseReadiness.refetch(); }} />}</><TutorSettingsPanel activityKind="lesson" activityId={lessonId} /><h2>Publish readiness</h2><section><h3>Course readiness</h3><p><Link to={paths.teach.readiness(courseId)}>Full course report</Link></p>{courseReadiness.data && itemsForLesson(courseReadiness.data, lessonId).map(item => <div key={item.itemId}><p>{item.number}. {item.text} · {item.status.replaceAll('-', ' ')}</p><Fixes courseId={courseId} fixes={item.fixes} /></div>)}</section><StatusChip tone={q.data?.lesson.status === 'published' ? 'success' : 'neutral'}>{q.data?.lesson.status === 'published' ? 'Published' : 'Draft'}</StatusChip><p>{readiness?.keptAiBlocks ?? 0} of {readiness?.aiBlocks ?? 0} AI {readiness?.aiBlocks === 1 ? 'block' : 'blocks'} reviewed</p>{(report ?? readiness)?.issues.length ? <ul className={styles.list}>{(report ?? readiness)?.issues.map((issue, i) => <li key={i}>{issue.blockId ? <a href={`#block-${issue.blockId}`} onClick={e => { e.preventDefault(); setPreview(false); requestAnimationFrame(() => { const block = document.getElementById(`block-${issue.blockId}`); block?.scrollIntoView({ block: 'start' }); block?.focus(); }); }}>{issue.code === 'draft-block' ? 'Review this AI draft before publishing.' : issue.message}</a> : issue.code === 'draft-block' ? 'Review this AI draft before publishing.' : issue.message}</li>)}</ul> : <p>Ready to publish.</p>}{report?.rubric && <p role="alert">{report.rubric.rubricName}: {report.rubric.percent}% readiness; publishing needs {report.rubric.minimum}%. <Link to={paths.teach.readiness(courseId)}>Open the course report</Link></p>}
        {q.data?.lesson.status === 'published' ? <Button density="compact" onClick={() => void mutate(() => unpublish.mutateAsync({ lessonId }), 'Lesson unpublished.')}>Unpublish</Button> : <><Button variant="primary" density="compact" disabled={dirty || !readiness?.ready || publish.isPending} onClick={() => void (async () => { try { await publish.mutateAsync({ lessonId }); setReport(null); setPolicyReasons([]); setMessage('Lesson published.'); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not publish.'); const detail = (e as { details?: unknown }).details; if (detail && typeof detail === 'object') { if ('issues' in detail) setReport(detail as ReadinessReport); if ('accessPolicy' in detail) { const policy = (detail as { accessPolicy?: { reasons?: string[] } }).accessPolicy; setPolicyReasons(policy?.reasons ?? []); } } } })()}>Publish</Button>{(dirty || !readiness?.ready) && <p>{dirty ? 'Save block changes before publishing.' : readiness?.issues[0]?.code === 'draft-block' ? 'Review AI drafts before publishing.' : readiness?.issues[0]?.message}</p>}</>}
      {policyReasons.length > 0 && <div><h3>Accessibility policy</h3><ul className={styles.list}>{policyReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}<div><h3>Accessibility</h3>{access.isPending ? <p role="status">Loading accessibility report…</p> : access.error ? <p role="alert">{access.error.message}</p> : access.data && <><p>{scoreText(access.data)} accessibility score</p><ul className={styles.list}>{access.data.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><StatusChip tone={severityTone(issue.severity)}>{issue.severity}</StatusChip> {issue.wcag.sc} {issue.wcag.title}: {issue.title} {issue.location.blockId && <><a href={`#block-${issue.location.blockId}`} onClick={event => { event.preventDefault(); goToBlock(issue.location.blockId!); }}>Go to block</a>{['alt-text', 'link-text', 'rewrite'].includes(issue.fix) && <Suggestion target={{ lessonId, blockId: issue.location.blockId }} kind={issue.fix as 'alt-text' | 'link-text' | 'rewrite'} onUse={text => applySuggestion(issue, text, false)} onEdit={text => applySuggestion(issue, text, true)} onDecorative={issue.fix === 'alt-text' ? () => { const i = blocks.findIndex(b => b.id === issue.location.blockId); const b = blocks[i]; if (b?.type === 'image') replace(i, { ...b, alt: '', decorative: true }); } : undefined} />}</>}</li>)}</ul>{access.data.issues.length === 0 && <p>No accessibility issues.</p>}</>}</div></section></div></div>}</>;
}

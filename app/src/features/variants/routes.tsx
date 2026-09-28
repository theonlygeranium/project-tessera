import { Link, useNavigate, useParams } from 'react-router';
import { useState } from 'react';
import type { Block, LessonVariant, VariantAudience } from '../../../../shared/domain';
import { AiContent, Button, StatusChip } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import { CourseBar, Message } from '../instructor/common';
import styles from './variants.module.css';

export const audienceName = (audience: VariantAudience) => audience === 'plain' ? 'Plain language' : '15-minute version';
export const syncText = (variant: LessonVariant) => {
  const count = variant.divergedBlocks + variant.uncoveredBlocks;
  return count ? `${variant.divergedBlocks} changed in the master · ${variant.uncoveredBlocks} new in the master` : 'In sync with the master';
};
function blockText(block: Block) {
  switch (block.type) {
    case 'heading': case 'text': return block.text;
    case 'callout': return `${block.title}\n${block.text}`;
    case 'check': return `${block.question}\n${block.options.map(o => `• ${o.text}`).join('\n')}`;
    case 'image': return `${block.alt || 'Decorative image'}\n${block.caption}`;
    case 'video': return `${block.title}\n${block.transcript}`;
    case 'file': return `${block.title}\n${block.description}`;
    case 'document': return `${block.title}\n${block.sections.map(s => `${s.heading}\n${s.text}`).join('\n')}`;
    case 'table': return `${block.caption}\n${block.rows.map(r => r.join(' | ')).join('\n')}`;
    case 'scenario': return `${block.title}\n${block.setting}`;
    case 'link': return `${block.text}\n${block.description}`;
  }
}
export function ReadableBlock({ block }: { block: Block | null }) {
  if (!block) return <p className={styles.empty}>No block</p>;
  const body = <p className={styles.blockText}>{blockText(block)}</p>;
  return block.origin === 'ai' ? <AiContent kind="block" state={block.aiState === 'kept' ? 'kept' : 'draft'} who="AI variant draft" source={`${block.provenance?.summary ?? 'Derived from the master lesson'} · ${block.provenance?.model ?? 'AI'}`}>{body}</AiContent> : body;
}
export function VariantsPage() {
  const { courseId = '', lessonId = '' } = useParams();
  const navigate = useNavigate();
  const lesson = useApiQuery('getLesson', { lessonId });
  const q = useApiQuery('listVariants', { lessonId });
  const create = useApiMutation('createVariant');
  const [working, setWorking] = useState<VariantAudience | null>(null);
  const [error, setError] = useState('');
  usePageTitle('Lesson variants');
  const list = q.data ?? [];
  const createOne = async (audience: VariantAudience) => {
    setError(''); setWorking(audience);
    try { const result = await create.mutateAsync({ lessonId, audience }); navigate(paths.teach.lesson(courseId, result.lesson.id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create the variant.'); }
    finally { setWorking(null); }
  };
  return <div className={styles.page}><CourseBar title="Variants" courseId={courseId} courseTitle={lesson.data?.courseTitle} actions={<Link to={paths.teach.lesson(courseId, lessonId)}>Back to master lesson</Link>} />
    {q.isPending || lesson.isPending ? <Loading /> : q.error ? <ErrorNotice error={q.error} onRetry={() => void q.refetch()} /> : lesson.error ? <ErrorNotice error={lesson.error} onRetry={() => void lesson.refetch()} /> : <>
      <p>Adapted versions of {lesson.data.lesson.title}. Review AI drafts in the editor before publishing.</p><Message text={error} error />
      <div className={styles.actions}>{(['plain', 'micro'] as const).filter(a => !list.some(v => v.audience === a)).map(a => <Button key={a} onClick={() => void createOne(a)} disabled={working !== null}>{working === a ? 'Creating with AI…' : a === 'plain' ? 'Create plain-language version' : 'Create 15-minute version'}</Button>)}</div>
      {working && <p role="status">AI is drafting the {audienceName(working).toLowerCase()} version…</p>}
      {list.length ? <ul className={styles.list}>{list.map(v => <li key={v.lessonId} className={styles.card}><h2>{audienceName(v.audience)}</h2><p>{v.title} · {v.minutes} minutes</p><p><StatusChip tone={v.status === 'published' ? 'success' : 'neutral'}>{v.status === 'published' ? 'Published' : 'Draft'}</StatusChip></p><p>{syncText(v)}</p><div className={styles.actions}><Link to={paths.teach.lesson(courseId, v.lessonId)}>Open in editor</Link><Link to={paths.teach.variant(courseId, lessonId, v.lessonId)}>Compare</Link></div></li>)}</ul> : <p>No variants yet.</p>}
    </>}</div>;
}
const rowName = { 'in-sync': 'In sync', diverged: 'Master changed', 'master-removed': 'Removed from master', 'variant-only': 'Only in variant', 'new-in-master': 'New in master' } as const;
export function ComparePage() {
  const { courseId = '', lessonId = '', variantId = '' } = useParams();
  const q = useApiQuery('getVariantDiff', { variantId });
  const resync = useApiMutation('resyncVariant'); const keep = useApiMutation('keepVariant');
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  usePageTitle('Compare variant');
  const act = async (name: string, task: () => Promise<unknown>) => { setError(''); setMessage(''); setBusy(name); try { await task(); setMessage(name === 'keep' ? 'Variant content kept.' : 'AI drafts added. Review and keep them in the editor.'); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update the variant.'); } finally { setBusy(''); } };
  const rows = q.data?.rows ?? []; const changed = rows.some(r => r.state === 'diverged' || r.state === 'new-in-master');
  return <div className={styles.page}><CourseBar title="Compare variant" courseId={courseId} actions={<Link to={paths.teach.variants(courseId, lessonId)}>All variants</Link>} />
    {q.isPending ? <Loading /> : q.error ? <ErrorNotice error={q.error} onRetry={() => void q.refetch()} /> : q.data && <>
      <h2>{audienceName(q.data.variant.audience)} · {q.data.variant.title}</h2><p>{syncText(q.data.variant)}</p><Message text={error} error /><Message text={message} />
      <div className={styles.actions}><Button disabled={!changed || !!busy} onClick={() => void act('all', () => resync.mutateAsync({ variantId }))}>{busy === 'all' ? 'Resyncing with AI…' : 'Resync all'}</Button><Link to={paths.teach.lesson(courseId, variantId)}>Open in editor</Link></div>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">Master</th><th scope="col">Variant</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.variant?.id ?? row.master?.id}-${index}`}><td><strong>{rowName[row.state]}</strong><ReadableBlock block={row.master} /></td><td><ReadableBlock block={row.variant} /><div className={styles.actions}>{row.state === 'diverged' && row.variant && <><Button disabled={!!busy} onClick={() => void act(row.variant!.id, () => resync.mutateAsync({ variantId, blockIds: [row.variant!.id] }))}>Resync</Button><Button disabled={!!busy} onClick={() => void act('keep', () => keep.mutateAsync({ variantId, blockIds: [row.variant!.id] }))}>Keep variant</Button></>}{row.state === 'new-in-master' && <Button disabled={!!busy} onClick={() => void act('all', () => resync.mutateAsync({ variantId }))}>Resync</Button>}</div></td></tr>)}</tbody></table></div>
    </>}</div>;
}
export const instructorVariantRoutes = [
  { path: 'teach/courses/:courseId/lessons/:lessonId/variants', element: <VariantsPage /> },
  { path: 'teach/courses/:courseId/lessons/:lessonId/variants/:variantId', element: <ComparePage /> },
];

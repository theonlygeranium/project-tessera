import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Block, LessonDetail } from '../../../../shared/domain';
import { AiContent, Button, Citation, StatusNotice } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import styles from './Design.module.css';

/** Review guidance appears only for lessons in an applied syllabus plan. */
export function ReviewPanel({ courseId, lessonId, moduleId, detail, onEditBlock, onChanged }: {
  courseId: string; lessonId: string; moduleId: string; detail: LessonDetail;
  onEditBlock: (blockId: string) => void; onChanged: () => void;
}) {
  const navigate = useNavigate();
  const outline = useApiQuery('getCourseOutline', { courseId });
  const design = detail.design;
  const sourceModuleId = design?.nextSteps.find(step => step.action === 'move-lesson' && step.target?.kind === 'module')?.target;
  const sourceModule = sourceModuleId?.kind === 'module' ? outline.data?.modules.find(module => module.id === sourceModuleId.moduleId) : null;
  const [moveId, setMoveId] = useState('');
  const [jobId, setJobId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const move = useApiMutation('updateLesson');
  const generate = useApiMutation('generateAtScope');
  const variant = useApiMutation('createVariant');
  const job = useApiQuery('getGenerationJob', { jobId }, { enabled: !!jobId, refetchInterval: query => query.state.data?.state === 'running' ? 1200 : false });
  useEffect(() => { if (job.data?.state === 'done' || job.data?.state === 'failed') onChanged(); }, [job.data?.state, jobId]);
  if (!design) return null;
  const run = async (task: () => Promise<unknown>, done: string) => {
    try { setError(''); await task(); setMessage(done); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not complete the action.'); }
  };
  const draft = (kind: 'scenario' | 'worked-example' | 'video-script') => run(async () => {
    const scope = kind === 'video-script' ? { lessonIds: [lessonId], elementTypes: [] as ('scenario' | 'document')[], videoScript: true } : { lessonIds: [lessonId], elementTypes: [kind === 'scenario' ? 'scenario' as const : 'document' as const] };
    const result = await generate.mutateAsync({ courseId, scope, instruction: kind === 'worked-example' ? 'Draft a worked example as a document for the instructor to review.' : kind === 'scenario' ? 'Draft a scenario aligned to this lesson objective.' : 'Draft a video script for the instructor to review.' });
    setJobId(result.jobId);
  }, 'Drafting started. Review the result before keeping it.');
  const alternatives = detail.blocks.filter((block): block is Extract<Block, { type: 'document' }> => block.type === 'document' && /^Alternative opening [AB]$/.test(block.title));
  const cited = design.moduleWhy.cites.map((span, index) => <Citation key={index} span={span} />);
  return <section className={`${styles.card} ${styles.reviewPanel}`} aria-labelledby="design-review-heading">
    <h2 id="design-review-heading">Review with Design partner</h2>
    <p>You are the subject-matter expert and instructor of record. I handle sequencing, alignment, scaffolding and quality checks. These are drafts; you decide what to keep and publish.</p>
    <AiContent kind="note" who="Design partner" source="your syllabus, confirmed outcomes and selected approaches" cites={cited}>
      <h3>Why this module</h3><p>{design.moduleWhy.text}</p>{design.moduleWhy.frameworks.length > 0 && <p>Teaching frameworks: {design.moduleWhy.frameworks.join(', ')}.</p>}
    <h3>Next for this lesson</h3>
    {design.nextSteps.length ? <ol className={styles.reviewSteps}>{design.nextSteps.map((step, index) => { const target = step.target; return <li key={`${step.action}-${index}`}><span>{step.text}</span>
      {target?.kind === 'block' && <Button density="compact" onClick={() => onEditBlock(target.blockId)}>{step.action === 'choose-reading' ? 'Choose the reading' : 'Add your example'}</Button>}
      {step.action === 'confirm-weight' && target?.kind === 'assignment' && <Button density="compact" onClick={() => navigate(paths.teach.assignment(courseId, target.assignmentId))}>Confirm the weight</Button>}
      {step.action === 'move-lesson' && sourceModule && <div className={styles.reviewMove}><label htmlFor="move-source-lesson">Lesson from “{sourceModule.title}”</label><select id="move-source-lesson" value={moveId} onChange={event => setMoveId(event.target.value)}><option value="">Choose a lesson</option>{sourceModule.lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select><Button density="compact" disabled={!moveId || move.isPending} onClick={() => void run(() => move.mutateAsync({ lessonId: moveId, moduleId }), 'Lesson moved in unchanged.')}>Move it in</Button></div>}
    </li>; })}</ol> : <p>No next steps identified for this lesson.</p>}</AiContent>
    {alternatives.length > 0 && <section className={styles.reviewAlternatives}><h3>Alternative openings</h3><p>This is the least-sure module. Compare A and B, keep one draft opening, and revert the other in the block editor.</p><ul>{alternatives.map(block => <li key={block.id}><strong>{block.title}</strong><p>{block.sections[0]?.text}</p><Button density="compact" onClick={() => onEditBlock(block.id)}>Review {block.title.slice(-1)}</Button></li>)}</ul></section>}
    <h3>Quick drafts for this lesson</h3><div className={styles.actions}><Button density="compact" disabled={generate.isPending} onClick={() => void draft('scenario')}>Draft scenario</Button><Button density="compact" disabled={generate.isPending} onClick={() => void draft('worked-example')}>Draft worked example</Button><Button density="compact" disabled={generate.isPending} onClick={() => void draft('video-script')}>Draft video script</Button></div>
    <h3>Alternate versions</h3><div className={styles.actions}><Button density="compact" disabled={variant.isPending} onClick={() => void run(async () => { const result = await variant.mutateAsync({ lessonId, audience: 'micro' }); navigate(paths.teach.lesson(courseId, result.lesson.id)); }, '15-minute version drafted.')}>Draft 15-minute version</Button><Button density="compact" disabled={variant.isPending} onClick={() => void run(async () => { const result = await variant.mutateAsync({ lessonId, audience: 'plain' }); navigate(paths.teach.lesson(courseId, result.lesson.id)); }, 'Plain-language version drafted.')}>Draft plain-language version</Button></div>
    {job.data?.state === 'running' && <p role="status">Drafting {job.data.done} of {job.data.total} items…</p>}
    {job.data?.state === 'failed' && <StatusNotice tone="error">{job.data.error ?? 'Drafting failed.'}</StatusNotice>}
    {message && <p role="status">{message}</p>}{error && <StatusNotice tone="error">{error}</StatusNotice>}
  </section>;
}

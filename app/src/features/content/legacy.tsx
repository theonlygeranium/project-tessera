import { useState } from 'react';
import type { BlockInput } from '../../../../shared/api';
import type { StudentBlock } from '../../../../shared/domain';
import { Button, FormField, KnowledgeCheck, Select, TextArea, TextInput } from '../../components';
import { useApiMutation } from '../../data/hooks';
import { ErrorNotice } from '../../shell/Status';
import styles from './legacy.module.css';

function Field({ label, value, onChange, multiline = false, type = 'text', required = false, hint }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: 'text' | 'number' | 'url';
  required?: boolean;
  hint?: string;
}) {
  return <FormField label={label} required={required} hint={hint}>{control => multiline
    ? <TextArea {...control} value={value} onChange={e => onChange(e.target.value)} />
    : <TextInput {...control} type={type} value={value} onChange={e => onChange(e.target.value)} />}</FormField>;
}

/**
 * The instructor lesson editor's block fields, copied so the content dispatcher
 * can edit heading, text, callout, image, and check. The original stays in the
 * lesson editor until that screen switches over.
 */
export function LegacyBlockFields({ block, onChange }: { block: BlockInput; onChange: (value: BlockInput) => void }) {
  const set = (value: Partial<BlockInput>) => onChange({ ...block, ...value } as BlockInput);
  if (block.type === 'heading') return <>
    <FormField label="Heading level">{control => <Select {...control} value={block.level} onChange={e => set({ level: Number(e.target.value) as 2 | 3 })}><option value="2">Level 2</option><option value="3">Level 3</option></Select>}</FormField>
    <Field label="Heading text" value={block.text} onChange={text => set({ text })} required />
  </>;
  if (block.type === 'text') return <Field label="Text" value={block.text} onChange={text => set({ text })} multiline required />;
  if (block.type === 'callout') return <>
    <FormField label="Tone">{control => <Select {...control} value={block.tone} onChange={e => set({ tone: e.target.value as 'info' | 'tip' | 'warning' })}><option value="info">Info</option><option value="tip">Tip</option><option value="warning">Warning</option></Select>}</FormField>
    <Field label="Callout title" value={block.title} onChange={title => set({ title })} />
    <Field label="Callout text" value={block.text} onChange={text => set({ text })} multiline />
  </>;
  if (block.type === 'image') return <>
    <Field label="Image URL" type="url" value={block.src} onChange={src => set({ src })} required />
    <label className={styles.row}><input type="checkbox" checked={block.decorative} onChange={e => set({ decorative: e.target.checked, alt: e.target.checked ? '' : block.alt })} /> Decorative image</label>
    <Field label="Alt text" value={block.alt} onChange={alt => set({ alt })} required={!block.decorative} hint="Describe the image, or mark it decorative." />
    <Field label="Caption" value={block.caption} onChange={caption => set({ caption })} />
  </>;
  if (block.type !== 'check') return <p className={styles.note}>This block type is edited in the content editor.</p>;
  return <>
    <Field label="Question" value={block.question} onChange={question => set({ question })} required />
    {block.options.map((option, i) => <div className={styles.row} key={option.id}>
      <Field label={`Option ${i + 1}`} value={option.text} onChange={text => set({ options: block.options.map(o => o.id === option.id ? { ...o, text } : o) })} required />
      <label><input type="radio" name={`correct-${block.id ?? block.options[0].id}`} checked={block.correctOptionId === option.id} onChange={() => set({ correctOptionId: option.id })} /> Correct</label>
      <Button density="compact" disabled={block.options.length <= 2} onClick={() => set({ options: block.options.filter(o => o.id !== option.id), correctOptionId: block.correctOptionId === option.id ? '' : block.correctOptionId })}>Remove option</Button>
    </div>)}
    <Button density="compact" disabled={block.options.length >= 6} onClick={() => set({ options: [...block.options, { id: crypto.randomUUID(), text: '' }] })}>Add option</Button>
    <Field label="Feedback for correct answer" value={block.feedbackCorrect} onChange={feedbackCorrect => set({ feedbackCorrect })} multiline />
    <Field label="Feedback for incorrect answer" value={block.feedbackIncorrect} onChange={feedbackIncorrect => set({ feedbackIncorrect })} multiline />
  </>;
}

function CheckBlock({ block, lessonId }: { block: Extract<StudentBlock, { type: 'check' }>; lessonId: string }) {
  const [feedback, setFeedback] = useState<{ correct: boolean; text: string }>();
  const answer = useApiMutation('answerCheck', { onSuccess: result => setFeedback({ correct: result.correct, text: result.feedback }) });
  return <div className={styles.check}>
    <KnowledgeCheck question={block.question} options={block.options} feedback={feedback} onSubmit={optionId => answer.mutate({ lessonId, blockId: block.id, optionId })} onRetry={() => setFeedback(undefined)} />
    {answer.isPending && <p role="status">Checking answer…</p>}
    <ErrorNotice error={answer.error} />
  </div>;
}

/**
 * The student lesson player's plain blocks, copied for heading, text, callout,
 * image, and check. Document, table, scenario, link, and video have their own players.
 */
/** `readOnly` renders a knowledge check as a disabled preview (staff can't answer checks). */
export function LegacyBlockPlayer({ block, lessonId, readOnly = false }: { block: StudentBlock; lessonId: string; readOnly?: boolean }) {
  if (block.type === 'heading') return block.level === 2 ? <h2>{block.text}</h2> : <h3>{block.text}</h3>;
  if (block.type === 'text') return <div className={styles.paragraphs}>{block.text.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>;
  if (block.type === 'callout') return <aside className={styles.callout}><p className={styles.tone}>{block.tone}</p><h3>{block.title}</h3><p>{block.text}</p></aside>;
  if (block.type === 'image') return <figure className={styles.figure}><img className={styles.media} src={block.src} alt={block.decorative ? '' : block.alt} />{block.caption && <figcaption>{block.caption}</figcaption>}</figure>;
  if (block.type === 'check') return readOnly
    ? <fieldset className={styles.check} disabled><legend>{block.question}</legend>{block.options.map((o) => <label key={o.id}><input type="radio" name={`preview-${block.id}`} /> {o.text}</label>)}<p className={styles.note}>Preview: students answer this check.</p></fieldset>
    : <CheckBlock block={block} lessonId={lessonId} />;
  if (block.type === 'document') return <section>{block.sections.map((section, index) => <div key={index}><h3>{section.heading}</h3>{section.text.split(/\n\s*\n/).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}</div>)}</section>;
  if (block.type === 'table') return <table><caption>{block.caption}</caption>{block.headerRow && <thead><tr>{block.rows[0].map((cell, index) => <th scope="col" key={index}>{cell}</th>)}</tr></thead>}<tbody>{block.rows.slice(block.headerRow ? 1 : 0).map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>;
  if (block.type === 'link') return <p><a href={block.href} rel="noopener noreferrer">{block.text}</a>{block.description && <> · {block.description}</>}</p>;
  return <p className={styles.note}>{'title' in block ? block.title : 'Content'} (coming in this release)</p>;
}

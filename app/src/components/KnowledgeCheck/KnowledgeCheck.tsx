import { useId, useState, type HTMLAttributes } from 'react';
import styles from './KnowledgeCheck.module.css';
export type KnowledgeCheckProps = Omit<HTMLAttributes<HTMLElement>, 'onSubmit'> & {
  question: string; options: { id: string; text: string }[];
  onSubmit: (optionId: string) => void;
  feedback?: { correct: boolean; text: string };
  onRetry?: () => void; submitLabel?: string;
};
export function KnowledgeCheck({ question, options, onSubmit, feedback, onRetry, submitLabel = 'Check answer', className, ...props }: KnowledgeCheckProps) {
  const id = useId();
  const [selected, setSelected] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const finished = submitted && !!feedback;
  return <section {...props} className={[styles.check, className].filter(Boolean).join(' ')}>
    <fieldset className={styles.fieldset} disabled={finished}><legend className={styles.question}>{question}</legend>
      <div className={styles.options}>{options.map((option) => <label key={option.id} className={styles.option}><input type="radio" name={id} value={option.id} checked={selected === option.id} onChange={() => setSelected(option.id)} />{option.text}</label>)}</div>
    </fieldset>
    {finished && <div className={[styles.feedback, feedback.correct ? styles.correct : styles.incorrect].join(' ')} role="status"><strong>{feedback.correct ? 'Correct:' : 'Not quite:'}</strong> {feedback.text}</div>}
    {!finished && <button type="button" className={styles.button} disabled={!selected} onClick={() => { setSubmitted(true); onSubmit(selected); }}>{submitLabel}</button>}
    {finished && !feedback.correct && onRetry && <button type="button" className={styles.button} onClick={() => { setSelected(''); setSubmitted(false); onRetry(); }}>Try again</button>}
  </section>;
}

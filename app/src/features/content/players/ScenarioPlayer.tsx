import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Button } from '../../../components';
import { paragraphList, qualityText, type ScenarioChoice, type ScenarioContent } from '../model';
import styles from './players.module.css';

function StepHeading({ id, headingRef, label, text }: { id: string; headingRef: RefObject<HTMLHeadingElement | null>; label: string; text: string }) {
  const paragraphs = paragraphList(text);
  return <>
    <h3 id={id} ref={headingRef} tabIndex={-1}>{label}. {paragraphs[0] ?? ''}</h3>
    {paragraphs.slice(1).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
  </>;
}

export function ScenarioPlayer({ value }: { value: ScenarioContent }) {
  const [nodeId, setNodeId] = useState(value.startNodeId);
  const [feedback, setFeedback] = useState<Pick<ScenarioChoice, 'feedback' | 'quality'> | null>(null);
  const [focusTarget, setFocusTarget] = useState<'situation' | null>(null);
  const situationRef = useRef<HTMLHeadingElement>(null);
  const choiceGroupId = useId();
  const node = value.nodes.find((item) => item.id === nodeId);
  const ending = !node || node.choices.length === 0;
  const announcement = feedback ? [qualityText(feedback.quality), feedback.feedback.trim()].filter(Boolean).join(' ') : '';

  useEffect(() => {
    if (focusTarget === 'situation') situationRef.current?.focus();
  }, [focusTarget, nodeId]);

  const choose = (choice: ScenarioChoice) => {
    setFeedback({ feedback: choice.feedback, quality: choice.quality });
    setNodeId(choice.nextNodeId);
    setFocusTarget('situation');
  };

  const restart = () => {
    setFeedback(null);
    setNodeId(value.startNodeId);
    setFocusTarget('situation');
  };

  return <article className={styles.player}>
    <h2>{value.title}</h2>
    {value.setting.trim() && <div className={styles.setting}>{paragraphList(value.setting).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
    <p className={announcement ? styles.feedback : styles.live} role="status">{announcement}</p>
    {!node ? <section className={styles.situation}>
      <h3 ref={situationRef} tabIndex={-1}>This step is missing. That choice does not lead to a step in this scenario.</h3>
      <Button onClick={restart}>Start over</Button>
    </section> : <section className={styles.situation} aria-labelledby={choiceGroupId}>
      <StepHeading id={choiceGroupId} headingRef={situationRef} label={ending ? 'Outcome' : 'Situation'} text={node.text} />
      {ending ? <>
        {node.outcome.trim() && paragraphList(node.outcome).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        <Button onClick={restart}>Start over</Button>
      </> : <div className={styles.choices} role="group" aria-label="Choices">
        {node.choices.map((choice) => <Button key={choice.id} className={styles.choice} onClick={() => choose(choice)}>{choice.text}</Button>)}
      </div>}
    </section>}
  </article>;
}

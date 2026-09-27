import { useRef, useState } from 'react';
import type { Adaptation } from '../../../../shared/domain';
import { Button, StatusNotice } from '../../components';
import { useApiMutation } from '../../data/hooks';
import { ErrorNotice } from '../../shell/Status';
import styles from './Presets.module.css';

const valueText = (kind: Adaptation['kind'], value: unknown): string => {
  if (value === undefined || value === null) return 'not set';
  if (kind === 'session-length') return `${value} minutes`;
  if (kind === 'reading-level') return value === 'plain' ? 'plain language' : 'standard';
  return String(value);
};

export const changeText = (change: Adaptation) => {
  const label = change.kind === 'session-length' ? 'Session length' : change.kind === 'reading-level' ? 'Reading level' : 'Reminders';
  return `${label}: ${valueText(change.kind, change.after)}, was ${valueText(change.kind, change.before)}`;
};

export function AdaptationChanges({ changes, title, onUndo }: { changes: Adaptation[]; title: string; onUndo?: (change: Adaptation) => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [undone, setUndone] = useState<string[]>([]);
  const [notice, setNotice] = useState(false);
  const undo = useApiMutation('undoAdaptation', { onSuccess: result => {
    setUndone(ids => [...ids, result.id]);
    setNotice(true);
    onUndo?.(result);
    requestAnimationFrame(() => heading.current?.focus());
  } });
  const visible = changes.filter(change => !change.undoneAt && !undone.includes(change.id));
  if (!visible.length && !notice) return null;
  return <section className={styles.section} aria-labelledby="adaptation-changes-heading">
    <h2 id="adaptation-changes-heading" ref={heading} tabIndex={-1}>{title}</h2>
    {notice && <StatusNotice tone="success" live="polite">Change undone. Your profile has been restored for that setting.</StatusNotice>}
    <ErrorNotice error={undo.error} />
    {visible.length > 0 && <ul className={styles.list}>{visible.map(change => <li key={change.id} className={styles.item}>
      <p><strong>{changeText(change)}</strong></p><p>{change.why}</p>
      <Button variant="text" disabled={undo.isPending} onClick={() => { setNotice(false); undo.mutate({ adaptationId: change.id }); }}>Undo</Button>
    </li>)}</ul>}
  </section>;
}

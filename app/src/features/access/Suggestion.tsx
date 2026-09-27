import { useEffect, useRef, useState } from 'react';
import type { Provenance } from '../../../../shared/domain';
import { AiContent, Button, StatusNotice } from '../../components';
import { useApiMutation } from '../../data/hooks';
import { errorText } from './errors';
import styles from './access.module.css';

type Target = { lessonId: string; blockId: string } | { fileId: string; element: number };
type Kind = 'alt-text' | 'link-text' | 'rewrite';
export function Suggestion({ target, kind, onUse, onEdit, onDecorative }: { target: Target; kind: Kind; onUse: (text: string) => void | Promise<void>; onEdit: (text: string) => void | Promise<void>; onDecorative?: () => void | Promise<void> }) {
  const suggest = useApiMutation('suggestFix');
  const [draft, setDraft] = useState<{ suggestion: string; provenance: Provenance } | null>(null);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (draft) panel.current?.focus(); }, [draft]);
  const label = kind === 'alt-text' ? 'Suggest alt text' : kind === 'link-text' ? 'Suggest link text' : 'Suggest plain language';
  function close() { setDraft(null); requestAnimationFrame(() => trigger.current?.querySelector('button')?.focus()); }
  async function act(task: () => void | Promise<void>) { try { await task(); close(); } catch (cause) { setError(errorText(cause)); } }
  return <div className={styles.stack}><div ref={trigger} className={styles.row}><Button density="compact" disabled={suggest.isPending} onClick={() => { setError(''); suggest.mutate({ target, kind }, { onSuccess: setDraft, onError: cause => setError(errorText(cause)) }); }}>{label}</Button>{onDecorative && <Button density="compact" onClick={() => void act(onDecorative)}>Mark decorative</Button>}</div>
    {suggest.isPending && <p role="status">Preparing suggestion…</p>}{error && <StatusNotice tone="error" live="assertive">{error}</StatusNotice>}
    {draft && <div ref={panel} tabIndex={-1} className={styles.focusPanel}><AiContent kind="note" who="Suggested by AI" source={`${draft.provenance.model} · ${draft.provenance.summary}`} actions={<div className={styles.row}><Button density="compact" variant="primary" onClick={() => void act(() => onUse(draft.suggestion))}>Use</Button><Button density="compact" onClick={() => void act(() => onEdit(draft.suggestion))}>Edit</Button><Button density="compact" onClick={close}>Dismiss</Button></div>}><p>Draft suggestion: {draft.suggestion}</p></AiContent></div>}
  </div>;
}

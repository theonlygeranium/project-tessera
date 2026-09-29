import type { Block } from '../../../../shared/domain';
import { AiContent, Button } from '../../components';
import styles from './Design.module.css';

export function AlternativeOpening({ block, onReview }: { block: Extract<Block, { type: 'document' }>; onReview: () => void }) {
  return <AiContent kind="block" state={block.aiState === 'kept' ? 'kept' : 'draft'} who={block.title} source={`${block.provenance?.summary ?? 'Drafted from your syllabus'} · ${block.provenance?.model ?? 'Unknown model'}`}><strong>{block.title}</strong><p>{block.sections[0]?.text}</p><Button density="compact" onClick={onReview}>Review {block.title.slice(-1)}</Button></AiContent>;
}

export function QuickDraftControls({ dirty, pending, onDraft }: { dirty: boolean; pending: boolean; onDraft: (kind: 'scenario' | 'worked-example' | 'video-script') => void }) {
  return <>{dirty && <p role="status">Save your changes first before making a quick draft.</p>}<div className={styles.actions}><Button density="compact" disabled={dirty || pending} onClick={() => onDraft('scenario')}>Draft scenario</Button><Button density="compact" disabled={dirty || pending} onClick={() => onDraft('worked-example')}>Draft worked example</Button><Button density="compact" disabled={dirty || pending} onClick={() => onDraft('video-script')}>Draft video script</Button></div></>;
}

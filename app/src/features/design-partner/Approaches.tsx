import { useState, type FormEvent } from 'react';
import type { ArchitectureId, DesignSession, OverlayId } from '../../../../shared/domain';
import { combinationNote } from '../../../../shared/design/options';
import { AiContent, Button, OptionCard, StatusNotice } from '../../components';
import { useApiMutation } from '../../data/hooks';
import { TeachingPreferences } from './TeachingPreferences';
import styles from './Design.module.css';

const overlays: { id: OverlayId; label: string; explanation: string }[] = [
  { id: 'bookends', label: 'Bookends', explanation: 'Start-here and wrap-up modules orient students and connect the course.' },
  { id: 'spaced-review', label: 'Spaced review', explanation: 'Checks revisit earlier ideas after two and five modules.' },
  { id: 'udl-choice', label: 'UDL choice points', explanation: 'Students may choose how to show their work at milestones.' },
  { id: 'teaching-presence', label: 'Teaching-presence plan', explanation: 'Draft module overviews and facilitation prompts for your review.' },
];

export function Approaches({ session }: { session: DesignSession }) {
  const retry = useApiMutation('retryDesignOptions');
  const select = useApiMutation('selectApproach');
  const [ids, setIds] = useState<ArchitectureId[]>([]);
  const [chosen, setChosen] = useState<OverlayId[]>(() => ['bookends', 'spaced-review', ...((['online-async', 'online-sync', 'hybrid', 'hyflex'].includes(session.extraction?.profile.modality.value ?? '')) ? ['teaching-presence' as const] : [])]);
  const [rationale, setRationale] = useState('');
  const submit = async (event: FormEvent) => { event.preventDefault(); try { await select.mutateAsync({ sessionId: session.id, optionIds: ids, overlays: chosen, rationale }); } catch { /* The notice beside the field shows the error. */ } };
  if (!session.options) return <section className={styles.card} role="status"><h1>Preparing three approaches</h1><p>Your {session.confirmedOutcomes?.length} confirmed outcomes are saved. I’m drafting three structures for you to compare.</p><progress value={session.provisioning?.done ?? 0} max={session.provisioning?.total ?? 1} aria-label="Approach drafting progress" />{session.provisioning?.error && <><StatusNotice tone="error">{session.provisioning.error}</StatusNotice><Button onClick={() => { void retry.mutateAsync({ sessionId: session.id }).catch(() => {}); }} disabled={retry.isPending}>Try again</Button>{retry.error && <StatusNotice tone="error">{retry.error.message}</StatusNotice>}</>}</section>;
  const note = combinationNote(ids);
  return <div className={styles.stack}><header><h1>Three ways to structure this course</h1><AiContent kind="chat" who="Design partner" source="from your confirmed outcomes, syllabus and answers"><p>Here are three draft structures. Choose one or combine approaches. I’ll show exactly what would be created in the next step.</p></AiContent></header>
    <div className={styles.optionGrid}>{session.options.map((option, index) => <OptionCard key={option.id} option={option} letter={'ABC'[index]} selected={ids.includes(option.id)} onChange={checked => setIds(current => checked ? [...current, option.id] : current.filter(id => id !== option.id))} />)}</div>
    <fieldset className={styles.card}><legend>Overlays · apply to any approach</legend><div className={styles.overlayGrid}>{overlays.map(item => <label className={styles.choice} key={item.id}><input type="checkbox" checked={chosen.includes(item.id)} onChange={event => setChosen(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} /><span><strong>{item.label}</strong><br />{item.explanation}</span></label>)}</div></fieldset>
    <div className={styles.columns}><div className={styles.stack}>{note && <AiContent kind="note" who="Design partner" source="your selection"><p>{note}. The first approach supplies the module spine; each added approach contributes its practice pattern.</p></AiContent>}<TeachingPreferences /></div><form className={styles.card} onSubmit={event => void submit(event)}><label htmlFor="approach-why"><strong>Why does this fit your students?</strong> One sentence, saved to your design record. Required.</label><textarea id="approach-why" required minLength={12} value={rationale} onChange={event => setRationale(event.target.value)} /><Button variant="primary" type="submit" disabled={!ids.length || rationale.trim().length < 12 || select.isPending}>Use this approach</Button>{select.error && <StatusNotice tone="error">{select.error.message}</StatusNotice>}</form></div>
  </div>;
}

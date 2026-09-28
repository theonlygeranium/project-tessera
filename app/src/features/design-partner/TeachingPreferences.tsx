import { useRef, useState, type FormEvent } from 'react';
import type { InstructorProfile } from '../../../../shared/domain';
import { DEFAULT_AI_DISCLOSURE } from '../../../../shared/policy';
import { Button, StatusNotice } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import styles from './Design.module.css';

const prefers = ['project', 'exam', 'case', 'discussion', 'quiz'] as const;
type ProfileInput = Omit<InstructorProfile, 'userId' | 'updatedAt'>;
export function TeachingPreferences() {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const query = useApiQuery('getInstructorProfile', undefined);
  const save = useApiMutation('updateInstructorProfile');
  const [draft, setDraft] = useState<ProfileInput | null>(null);
  const value = draft ?? { teachingApproach: query.data?.teachingApproach ?? '', voice: query.data?.voice ?? '', assessmentPreferences: query.data?.assessmentPreferences ?? { formativeEveryModule: false, prefers: [] }, disclosureText: query.data?.disclosureText ?? DEFAULT_AI_DISCLOSURE };
  const close = () => { setOpen(false); requestAnimationFrame(() => opener.current?.focus()); };
  const submit = async (event: FormEvent) => { event.preventDefault(); try { await save.mutateAsync(value); close(); } catch { /* The notice stays in the panel. */ } };
  return <section id="teaching-preferences" className={styles.card} aria-label="Teaching preferences"><Button type="button" onClick={event => { opener.current = event.currentTarget; setOpen(true); }}>Your teaching preferences</Button><p>These preferences guide approach and starter-content drafts. You can edit them before choosing a structure.</p>
    {open && <form className={styles.stack} onSubmit={event => void submit(event)}><label>Teaching approach<textarea autoFocus value={value.teachingApproach} onChange={event => setDraft({ ...value, teachingApproach: event.target.value })} /></label><label>Voice<input value={value.voice} onChange={event => setDraft({ ...value, voice: event.target.value })} /></label><fieldset><legend>Assessment preferences</legend><label className={styles.check}><input type="checkbox" checked={value.assessmentPreferences.formativeEveryModule} onChange={event => setDraft({ ...value, assessmentPreferences: { ...value.assessmentPreferences, formativeEveryModule: event.target.checked } })} />Formative check in every module</label>{prefers.map(kind => <label className={styles.check} key={kind}><input type="checkbox" checked={value.assessmentPreferences.prefers.includes(kind)} onChange={event => setDraft({ ...value, assessmentPreferences: { ...value.assessmentPreferences, prefers: event.target.checked ? [...value.assessmentPreferences.prefers, kind] : value.assessmentPreferences.prefers.filter(item => item !== kind) } })} />{kind}</label>)}</fieldset><label>AI-use disclosure text<textarea value={value.disclosureText} onChange={event => setDraft({ ...value, disclosureText: event.target.value })} /></label><div className={styles.actions}><Button type="submit" variant="primary" disabled={save.isPending}>Save</Button><Button type="button" onClick={close}>Cancel</Button></div>{save.error && <StatusNotice tone="error">{save.error.message}</StatusNotice>}</form>}
  </section>;
}

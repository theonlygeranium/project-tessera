import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { LearningGoal, LearningProfile } from '../../../../shared/domain';
import { Button, ChoiceGroup, FormField, SegmentedControl, Select, StatusNotice, TextArea, TopBar } from '../../components';
import { useApiMutation } from '../../data/hooks';
import { paths } from '../../paths';
import { ErrorNotice } from '../../shell/Status';
import { useSession } from '../../shell/session';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './Student.module.css';
import { PresetSetup } from './PresetSetup';
import type { Adaptation } from '../../../../shared/domain';

type ProfileInput = Omit<LearningProfile, 'completedAt'>;
const emptyProfile: ProfileInput = { goals: [], goalNote: '', weeklyMinutes: 120, language: 'en', readingLevel: 'standard', accessibility: { captions: false, reducedMotion: false, largerText: false, screenReader: false }, reminders: 'off' };
const goals: { value: LearningGoal; label: string }[] = [
  { value: 'finish-degree', label: 'Finish my degree' }, { value: 'career-change', label: 'Change careers' },
  { value: 'upskill', label: 'Build skills for my work' }, { value: 'compliance', label: 'Complete required training' },
  { value: 'curiosity', label: 'Explore a topic' },
];
const access = [
  { value: 'captions', label: 'Captions' }, { value: 'reducedMotion', label: 'Reduced motion' },
  { value: 'largerText', label: 'Larger text' }, { value: 'screenReader', label: 'Screen reader' },
] as const;

export function ProfilePage({ onboarding = false }: { onboarding?: boolean }) {
  usePageTitle(onboarding ? 'Set up your learning profile' : 'Profile');
  const { user } = useSession();
  const [form, setForm] = useState<ProfileInput>(() => user.profile ? { goals: user.profile.goals, goalNote: user.profile.goalNote, weeklyMinutes: user.profile.weeklyMinutes, language: user.profile.language, readingLevel: user.profile.readingLevel, accessibility: { ...user.profile.accessibility }, reminders: user.profile.reminders, sessionMinutes: user.profile.sessionMinutes } : emptyProfile);
  const [saved, setSaved] = useState(false);
  const [hasProfile, setHasProfile] = useState(!!user.profile);
  const save = useApiMutation('saveProfile', { onSuccess: () => { setSaved(true); setHasProfile(true); } });
  const onPresetChange = (changes: Adaptation[], undo: boolean) => {
    setForm(current => {
      const next = { ...current };
      for (const change of changes) {
        const value = undo ? change.before : change.after;
        if (change.kind === 'session-length') next.sessionMinutes = value as number | undefined;
        if (change.kind === 'reminders') next.reminders = value as ProfileInput['reminders'];
        if (change.kind === 'reading-level') next.readingLevel = value as ProfileInput['readingLevel'];
      }
      return next;
    });
  };
  const update = (patch: Partial<ProfileInput>) => { setSaved(false); setForm(current => ({ ...current, ...patch })); };
  const onSubmit = (event: FormEvent) => { event.preventDefault(); save.mutate(form); };
  const selectedAccess = access.filter(item => form.accessibility[item.value]).map(item => item.value);
  return <div className={styles.page}>
    <TopBar title={onboarding ? 'Set up your learning profile' : 'Profile'} eyebrow={onboarding ? 'Welcome · about 2 minutes' : undefined} />
    <p className={styles.intro}>Tell us your goals and preferences. You can change these answers later. Every course format stays available to everyone.</p>
    {saved && <StatusNotice tone="success" live="polite">Your learning profile was saved.</StatusNotice>}
    <ErrorNotice error={save.error} />
    <form onSubmit={onSubmit} className={styles.form}>
      <section className={styles.panel}><h2>Goals</h2>
        <ChoiceGroup legend="What are you here for?" type="checkbox" name="goals" options={goals} value={form.goals} onChange={value => update({ goals: value as LearningGoal[] })} />
        <FormField label="Anything else about your goal?" hint="Optional">{control => <TextArea {...control} value={form.goalNote} onChange={event => update({ goalNote: event.target.value })} rows={3} />}</FormField>
      </section>
      <section className={styles.panel}><h2>Time and language</h2>
        <SegmentedControl legend="How much time can you study each week?" name="weekly-time" options={[1, 2, 4, 6].map(n => ({ value: String(n * 60), label: `${n} ${n === 1 ? 'hour' : 'hours'}` }))} value={String(form.weeklyMinutes)} onChange={value => update({ weeklyMinutes: Number(value) })} />
        <FormField label="Language">{control => <Select {...control} value={form.language} onChange={event => update({ language: event.target.value })}><option value="en">English</option><option value="es">Español</option><option value="zh">中文</option><option value="vi">Tiếng Việt</option></Select>}</FormField>
        <SegmentedControl legend="Reading level" name="reading-level" options={[{ value: 'standard', label: 'Standard' }, { value: 'plain', label: 'Plain language' }]} value={form.readingLevel} onChange={value => update({ readingLevel: value as ProfileInput['readingLevel'] })} />
      </section>
      <section className={styles.panel}><h2>Accessibility and reminders</h2>
        <ChoiceGroup legend="Accessibility preferences" type="checkbox" name="accessibility" options={[...access]} value={selectedAccess} onChange={value => { const values = value as string[]; update({ accessibility: { captions: values.includes('captions'), reducedMotion: values.includes('reducedMotion'), largerText: values.includes('largerText'), screenReader: values.includes('screenReader') } }); }} />
        <SegmentedControl legend="Reminders" name="reminders" options={[{ value: 'off', label: 'Off' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]} value={form.reminders} onChange={value => update({ reminders: value as ProfileInput['reminders'] })} />
      </section>
      <aside className={styles.panel}><h2>Who sees this</h2><p>Instructors see your progress, not your profile answers. A manager sees your required training only if you choose to share it.</p><p><Link className={styles.readLink} to={paths.me.sharing}>Who sees this</Link></p></aside>
      <div className={styles.actions}><Button type="submit" variant="primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save profile'}</Button></div>
    </form>
    {hasProfile && <PresetSetup onChange={onPresetChange} />}
    {onboarding && saved && <Link className={styles.primaryLink} to={paths.student.today}>Continue to Today</Link>}
  </div>;
}

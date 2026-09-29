// Institution AI policy: authoring, and tutor modes for graded and practice work.
import { useState, type FormEvent } from 'react';
import { Button, StatusNotice, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { useSession } from '../../shell/session';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './Admin.module.css';
import { policyValueFrom, toAiPolicy, type PolicyValue } from './form';
import { PolicyFields } from './PolicyFields';
import { DEFAULT_READINESS_POLICY } from '../../../../shared/quality';
import { MAX_WORKLOAD_RATE, RICE_DEFAULTS, validWorkloadRates } from '../../../../shared/policy';
import type { ArchitectureId, WorkloadRates } from '../../../../shared/domain';

const architectures: { id: ArchitectureId; label: string }[] = [
  { id: 'weekly', label: 'Weekly cadence' }, { id: 'thematic', label: 'Thematic' }, { id: 'case', label: 'Case based' },
  { id: 'project', label: 'Project' }, { id: 'competency', label: 'Competency' }, { id: 'flipped', label: 'Flipped' },
  { id: 'scaffolded', label: 'Scaffolded' }, { id: 'performance', label: 'Performance' }, { id: 'micro', label: 'Short sessions' }, { id: 'hyflex', label: 'Hyflex' },
];
const rateLabels: { key: keyof WorkloadRates; label: string; unit: string }[] = [
  { key: 'readingPagesPerHour', label: 'Textbook reading', unit: 'pages per hour' },
  { key: 'problemSetHours', label: 'Problem set', unit: 'hours each' },
  { key: 'writingHoursPerPage', label: 'Writing', unit: 'hours per page' },
  { key: 'projectHours', label: 'Project', unit: 'hours each' },
  { key: 'quizMinutes', label: 'Quiz', unit: 'minutes each' },
  { key: 'discussionMinutes', label: 'Discussion', unit: 'minutes each' },
];

export function PolicyPage() {
  const { institution } = useSession();
  const [policy, setPolicy] = useState<PolicyValue>(() => policyValueFrom(institution.policy));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useApiMutation('updatePolicy');
  const rubrics = useApiQuery('listRubrics', undefined);
  const saveReadiness = useApiMutation('updateReadinessPolicy');
  const [readinessRubric, setReadinessRubric] = useState(() => (institution.readinessPolicy ?? DEFAULT_READINESS_POLICY).rubricId);
  const [minimum, setMinimum] = useState(() => String((institution.readinessPolicy ?? DEFAULT_READINESS_POLICY).minimumPercent ?? ''));
  const [readinessMessage, setReadinessMessage] = useState('');

  usePageTitle('Policy');

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    setError(null);
    if (!validWorkloadRates(policy.workloadRates)) { setError(`Each workload rate must be greater than 0 and at most ${MAX_WORKLOAD_RATE}.`); return; }
    save.mutate(toAiPolicy(policy), {
      onSuccess: () => setSaved(true),
      onError: (caught) => setError(caught.message),
    });
  }

  return (
    <div className={styles.page}>
      <TopBar title="Policy" />
      <p className={styles.lede}>These limits apply to every course. Instructors choose a tutor mode inside what you allow here.</p>
      <form className={styles.form} noValidate onSubmit={onSubmit}>
        {saved && (
          <StatusNotice tone="success" live="polite" title="Policy saved" onDismiss={() => setSaved(false)}>
            AI policy is updated for the institution.
          </StatusNotice>
        )}
        {error && <StatusNotice tone="error" title="Policy wasn't saved">{error}</StatusNotice>}
        <PolicyFields
          headings
          value={policy}
          onChange={(next) => {
            setPolicy(next);
            setSaved(false);
          }}
        />
        <section className={styles.section} aria-labelledby="design-policy-heading">
          <h2 id="design-policy-heading">Design partner</h2>
          <p>Allows instructors to read a syllabus, review suggested course structures, and apply drafts to their courses. Instructors still decide what to keep and publish.</p>
          <label className={styles.policyChoice}><input type="checkbox" checked={policy.designEnabled} onChange={event => setPolicy({ ...policy, designEnabled: event.target.checked })} /> Allow Start from a syllabus</label>
          <fieldset className={styles.policyFieldset}><legend>Allowed approaches</legend><p>These are the structures the partner may suggest. Keep at least one available.</p>
            <label className={styles.policyChoice}><input type="checkbox" checked={policy.allowedArchitectures === null} onChange={event => setPolicy({ ...policy, allowedArchitectures: event.target.checked ? null : architectures.map(item => item.id) })} /> Allow all approaches</label>
            <div className={styles.policyGrid}>{architectures.map(item => <label className={styles.policyChoice} key={item.id}><input type="checkbox" disabled={policy.allowedArchitectures === null} checked={policy.allowedArchitectures === null || policy.allowedArchitectures.includes(item.id)} onChange={event => { const current = policy.allowedArchitectures ?? architectures.map(option => option.id); const next = event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id); if (next.length) setPolicy({ ...policy, allowedArchitectures: next }); }} /> {item.label}</label>)}</div>
          </fieldset>
          <fieldset className={styles.policyFieldset}><legend>Workload estimates</legend><p>Default time assumptions for the weekly workload chart. Instructors can change them for a session.</p><div className={styles.policyGrid}>{rateLabels.map(item => <label key={item.key}>{item.label} <span>({item.unit})</span><input type="number" min="0" max={MAX_WORKLOAD_RATE} step="any" required value={policy.workloadRates[item.key]} onChange={event => setPolicy({ ...policy, workloadRates: { ...policy.workloadRates, [item.key]: Number(event.target.value) } })} /></label>)}</div><Button type="button" onClick={() => setPolicy({ ...policy, workloadRates: { ...RICE_DEFAULTS } })}>Reset to Rice CTE defaults</Button></fieldset>
          <label className={styles.policyDisclosure}>Default AI-use disclosure <span>Starts in the draft “Start here” lesson. The instructor can edit it before keeping the block.</span><textarea required value={policy.defaultAiDisclosure} onChange={event => setPolicy({ ...policy, defaultAiDisclosure: event.target.value })} /></label>
        </section>
        <div className={styles.actions}>
          <Button type="submit" variant="primary" density="compact" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save policy'}
          </Button>
        </div>
      </form>
      <section className={styles.form} aria-labelledby="readiness-heading">
        <h2 id="readiness-heading">Readiness</h2>
        <p>Select the rubric used when a course team checks whether a lesson is ready to publish.</p>
        <form onSubmit={event => { event.preventDefault(); void saveReadiness.mutateAsync({ rubricId: readinessRubric, minimumPercent: minimum === '' ? null : Number(minimum) }).then(() => setReadinessMessage('Readiness policy saved.')).catch(e => setReadinessMessage(e.message)); }}>
          <p><label htmlFor="readiness-rubric-policy">Rubric</label> <select id="readiness-rubric-policy" value={readinessRubric} onChange={event => setReadinessRubric(event.target.value)}>{rubrics.data?.map(rubric => <option key={rubric.id} value={rubric.id}>{rubric.name}</option>)}</select></p>
          <p><label htmlFor="readiness-minimum">Publishing threshold</label> <select id="readiness-minimum" value={minimum === '' ? 'advisory' : 'required'} onChange={event => setMinimum(event.target.value === 'advisory' ? '' : '80')}><option value="advisory">Advisory only</option><option value="required">Require a minimum</option></select></p>
          {minimum !== '' && <p><label htmlFor="readiness-percent">Minimum percent</label> <input id="readiness-percent" type="number" min="0" max="100" required value={minimum} onChange={event => setMinimum(event.target.value)} /></p>}
          <Button type="submit" disabled={saveReadiness.isPending || rubrics.isPending}>Save readiness policy</Button><p role="status">{readinessMessage}</p>
        </form>
      </section>
    </div>
  );
}

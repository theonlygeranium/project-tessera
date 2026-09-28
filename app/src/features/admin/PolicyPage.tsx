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

// Institution AI policy: authoring, and tutor modes for graded and practice work.
import { useState, type FormEvent } from 'react';
import { Button, StatusNotice, TopBar } from '../../components';
import { useApiMutation } from '../../data/hooks';
import { useSession } from '../../shell/session';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './Admin.module.css';
import { policyValueFrom, toAiPolicy, type PolicyValue } from './form';
import { PolicyFields } from './PolicyFields';

export function PolicyPage() {
  const { institution } = useSession();
  const [policy, setPolicy] = useState<PolicyValue>(() => policyValueFrom(institution.policy));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useApiMutation('updatePolicy');

  usePageTitle('AI policy');

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
      <TopBar title="AI policy" />
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
    </div>
  );
}

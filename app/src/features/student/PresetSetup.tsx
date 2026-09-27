import { useState } from 'react';
import type { Adaptation, Preset } from '../../../../shared/domain';
import { Button, StatusNotice } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { ErrorNotice, Loading } from '../../shell/Status';
import { useSession } from '../../shell/session';
import { AdaptationChanges } from './AdaptationChanges';
import styles from './Presets.module.css';

export function PresetSetup({ onChange }: { onChange?: (changes: Adaptation[], undo: boolean) => void }) {
  const { user } = useSession();
  const dismissKey = `tessera-preset-dismissed-${user.id}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(dismissKey) === 'yes'; } catch { return false; }
  });
  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(dismissKey, 'yes'); } catch { /* Page state still dismisses it. */ }
  };
  const [changes, setChanges] = useState<Adaptation[]>([]);
  const [applied, setApplied] = useState(false);
  const presets = useApiQuery('listPresets', undefined);
  const suggestion = useApiQuery('suggestPreset', undefined);
  const apply = useApiMutation('applyPreset', { onSuccess: result => { setChanges(result); setApplied(true); onChange?.(result, false); } });
  return <div className={styles.setup}>
    {suggestion.isPending ? <Loading label="Loading suggested setup" /> : suggestion.error ? <ErrorNotice error={suggestion.error} onRetry={() => suggestion.refetch()} /> : !dismissed && !applied && <section className={styles.section}>
      <h2>Suggested setup</h2>
      <h3>{suggestion.data.preset.title}</h3>
      <p>{suggestion.data.preset.description}</p>
      <p>{suggestion.data.why}</p>
      <div className={styles.actions}>
        <Button variant="primary" disabled={apply.isPending} onClick={() => apply.mutate({ presetId: suggestion.data.preset.id })}>Use this setup</Button>
        <Button variant="text" onClick={dismiss}>Not now</Button>
      </div>
    </section>}
    {applied && <StatusNotice tone="success" live="polite">{changes.length ? 'Setup applied. You can undo each change below.' : 'This setup already matches your profile.'}</StatusNotice>}
    <ErrorNotice error={apply.error} />
    <AdaptationChanges changes={changes} title="What changed" onUndo={change => onChange?.([change], true)} />
    <section className={styles.section}>
      <h2>Other setups</h2>
      {presets.isPending ? <Loading label="Loading setups" /> : presets.error ? <ErrorNotice error={presets.error} onRetry={() => presets.refetch()} /> : <ul className={styles.list}>
        {presets.data.map(preset => <li className={styles.item} key={preset.id}>
          <h3>{preset.title}</h3><p>{preset.description}</p>
          <Button disabled={apply.isPending} onClick={() => apply.mutate({ presetId: preset.id })}>Use this setup</Button>
        </li>)}
      </ul>}
    </section>
  </div>;
}

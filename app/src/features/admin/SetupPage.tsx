// First-run setup, and later edits from the rail. All three steps stay on this page.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../../../../shared/api';
import type { AccentId } from '../../../../shared/domain';
import { ACCENTS } from '../../../../shared/policy';
import { Button, ChoiceGroup, FormField, StatusNotice, TextInput, TopBar } from '../../components';
import { useApiMutation } from '../../data/hooks';
import { paths } from '../../paths';
import { useSession } from '../../shell/session';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './Admin.module.css';
import { applyApiFieldError, blankErrors, focusInvalid, hasErrors, policyValueFrom, toAiPolicy, type FieldErrors, type PolicyValue } from './form';
import { PolicyFields } from './PolicyFields';

function isAccent(value: string): value is AccentId {
  return ACCENTS.some((accent) => accent.id === value);
}

export function SetupPage() {
  const { institution } = useSession();
  const navigate = useNavigate();
  const firstRun = !institution.setupComplete;
  const [name, setName] = useState(institution.name);
  const [shortName, setShortName] = useState(institution.shortName);
  const [accent, setAccent] = useState<AccentId>(institution.accent);
  const [policy, setPolicy] = useState<PolicyValue>(() => policyValueFrom(institution.policy));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [leave, setLeave] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const savePolicy = useApiMutation('updatePolicy');
  const saveInstitution = useApiMutation('updateInstitution');
  const pending = savePolicy.isPending || saveInstitution.isPending;

  usePageTitle('Setup');

  useEffect(() => {
    if (leave && institution.setupComplete) navigate(paths.admin.overview, { state: { setupSaved: true } });
  }, [leave, institution.setupComplete, navigate]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    setFormError(null);
    const local = blankErrors([
      { field: 'name', value: name, message: 'Enter the institution name.' },
      { field: 'shortName', value: shortName },
    ]);
    setErrors(local);
    if (hasErrors(local)) {
      requestAnimationFrame(() => focusInvalid(formRef.current));
      return;
    }

    const finishing = !institution.setupComplete;
    void (async () => {
      try {
        await savePolicy.mutateAsync(toAiPolicy(policy));
        await saveInstitution.mutateAsync({
          name: name.trim(),
          shortName: shortName.trim(),
          accent,
          setupComplete: true,
        });
        if (finishing) setLeave(true);
        else setSaved(true);
      } catch (caught) {
        if (caught instanceof ApiError) {
          const fields = applyApiFieldError(caught);
          if (fields.name) fields.name = 'Enter the institution name.';
          setErrors(fields);
          if (!hasErrors(fields)) setFormError(caught.message);
        } else {
          setFormError('Something went wrong. Try again.');
        }
        requestAnimationFrame(() => focusInvalid(formRef.current));
      }
    })();
  }

  return (
    <div className={styles.page}>
      <TopBar title="Setup" eyebrow={firstRun ? 'First-run setup' : 'Institution'} />
      <p className={styles.lede}>These three steps are all on this page. You can change them later from Setup in the navigation.</p>
      <form ref={formRef} className={styles.form} noValidate onSubmit={onSubmit}>
        {saved && (
          <StatusNotice tone="success" live="polite" title="Setup saved" onDismiss={() => setSaved(false)}>
            Institution name, accent, and AI policy are saved.
          </StatusNotice>
        )}
        {formError && <StatusNotice tone="error" title="Setup wasn't saved">{formError}</StatusNotice>}

        <section className={styles.section}>
          <h2>1. Institution</h2>
          <FormField label="Name" required error={errors.name} hint="The full institution name.">
            {(control) => (
              <TextInput
                {...control}
                autoComplete="organization"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setErrors((current) => ({ ...current, name: undefined }));
                }}
              />
            )}
          </FormField>
          <FormField label="Short name" required error={errors.shortName} hint="Shown in the navigation, for example Meridian State.">
            {(control) => (
              <TextInput
                {...control}
                value={shortName}
                onChange={(event) => {
                  setShortName(event.target.value);
                  setErrors((current) => ({ ...current, shortName: undefined }));
                }}
              />
            )}
          </FormField>
        </section>

        <section className={styles.section}>
          <h2>2. Brand accent</h2>
          <p className={styles.note}>The accent colors buttons, links, and progress. Every option meets contrast requirements.</p>
          <ChoiceGroup
            className={styles.accents}
            legend="Accent"
            type="radio"
            name="accent"
            variant="card"
            error={errors.accent}
            options={ACCENTS.map((item) => ({ value: item.id, label: item.label }))}
            value={accent}
            onChange={(next) => {
              if (typeof next === 'string' && isAccent(next)) {
                setAccent(next);
                setErrors((current) => ({ ...current, accent: undefined }));
              }
            }}
          />
        </section>

        <section className={styles.section}>
          <h2>3. AI policy</h2>
          <PolicyFields value={policy} onChange={setPolicy} />
        </section>

        <div className={styles.actions}>
          <Button type="submit" variant="primary" density="compact" disabled={pending}>
            {pending ? 'Saving…' : firstRun ? 'Finish setup' : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}

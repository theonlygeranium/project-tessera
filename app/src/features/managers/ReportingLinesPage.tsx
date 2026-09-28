import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ReportingLine, User } from '../../../../shared/domain';
import { Button, FormField, Select, StatusNotice, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './Managers.module.css';

function nameOf(people: User[], id: string): string {
  return people.find((person) => person.id === id)?.name ?? 'Unknown person';
}

export function ReportingLinesPage() {
  usePageTitle('Reporting lines');
  const lines = useApiQuery('listReportingLines', {});
  const people = useApiQuery('listUsers', {});
  const add = useApiMutation('addReportingLine');
  const remove = useApiMutation('removeReportingLine');
  const [managerId, setManagerId] = useState('');
  const [reportId, setReportId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<ReportingLine | null>(null);
  const [dialogError, setDialogError] = useState('');
  const opener = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const directory = people.data ?? [];
  const sorted = [...directory].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (pending && dialog && !dialog.open) dialog.showModal();
  }, [pending]);

  function close(removed: boolean) {
    const back = opener.current;
    dialogRef.current?.close();
    setPending(null);
    requestAnimationFrame(() => {
      if (!removed && back && document.contains(back)) back.focus();
      else document.getElementById('add-reporting-line')?.focus();
    });
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');
    if (!managerId || !reportId) { setError('Choose a manager and a person who reports to them.'); return; }
    if (managerId === reportId) { setError('Choose two different people.'); return; }
    try {
      await add.mutateAsync({ managerId, reportId });
      setMessage(`${nameOf(directory, reportId)} now reports to ${nameOf(directory, managerId)}. Sharing starts off until they turn it on.`);
      setManagerId('');
      setReportId('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add that reporting line.');
    }
  }

  async function onRemove() {
    if (!pending) return;
    setDialogError('');
    try {
      await remove.mutateAsync({ managerId: pending.managerId, reportId: pending.reportId });
      setMessage(`Removed ${nameOf(directory, pending.reportId)} from ${nameOf(directory, pending.managerId)}'s reports. Their sharing choice was cleared.`);
      close(true);
    } catch (cause) {
      setDialogError(cause instanceof Error ? cause.message : 'Could not remove that reporting line.');
    }
  }

  const grouped = new Map<string, ReportingLine[]>();
  for (const line of lines.data ?? []) {
    const list = grouped.get(line.managerId) ?? [];
    list.push(line);
    grouped.set(line.managerId, list);
  }
  const managers = [...grouped.keys()].sort((a, b) => nameOf(directory, a).localeCompare(nameOf(directory, b)) || a.localeCompare(b));

  return <div className={styles.page}>
    <TopBar title="Reporting lines" />
    <p className={styles.lede}>Record who reports to whom. A manager is a relationship, not a role. Nothing is shared until that person turns it on, and removing a line clears their choice.</p>
    {message && <StatusNotice tone="success">{message}</StatusNotice>}
    {error && <StatusNotice tone="error">{error}</StatusNotice>}
    {lines.isPending || people.isPending ? <Loading label="Loading reporting lines" /> : lines.error ? <ErrorNotice error={lines.error} /> : people.error ? <ErrorNotice error={people.error} /> : <>
      {managers.length === 0 ? <p className={styles.empty}>No reporting lines yet.</p> : <div className={styles.stack}>
        {managers.map((id) => <section key={id} className={styles.group} aria-labelledby={`manager-${id}`}>
          <h2 id={`manager-${id}`}>{nameOf(directory, id)}</h2>
          <ul className={styles.stack}>
            {(grouped.get(id) ?? []).slice().sort((a, b) => nameOf(directory, a.reportId).localeCompare(nameOf(directory, b.reportId))).map((line) => <li key={`${line.managerId}:${line.reportId}`} className={styles.report}>
              <span>{nameOf(directory, line.reportId)}</span>
              <button type="button" className={styles.textButton} onClick={(event) => { opener.current = event.currentTarget; setDialogError(''); setPending(line); }}>
                Remove<span className={styles.srOnly}> {nameOf(directory, line.reportId)} from {nameOf(directory, id)}&apos;s reports</span>
              </button>
            </li>)}
          </ul>
        </section>)}
      </div>}
      <section className={styles.group} aria-labelledby="add-line-title">
        <h2 id="add-line-title">Add a reporting line</h2>
        <form className={styles.form} onSubmit={(event) => void onAdd(event)}>
          <FormField label="Manager" required>
            {(control) => <Select {...control} value={managerId} onChange={(event) => setManagerId(event.target.value)}>
              <option value="">Choose a person</option>
              {sorted.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </Select>}
          </FormField>
          <FormField label="Reports to them" required>
            {(control) => <Select {...control} value={reportId} onChange={(event) => setReportId(event.target.value)}>
              <option value="">Choose a person</option>
              {sorted.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </Select>}
          </FormField>
          <div className={styles.actions}><Button id="add-reporting-line" type="submit" variant="primary" disabled={add.isPending}>Add reporting line</Button></div>
        </form>
      </section>
    </>}
    {pending && <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="remove-line-title" onCancel={(event) => { event.preventDefault(); close(false); }}>
      <h2 id="remove-line-title">Remove this reporting line?</h2>
      <p>{nameOf(directory, pending.reportId)} will no longer report to {nameOf(directory, pending.managerId)}. Their sharing choice is cleared, so adding the line again starts private.</p>
      {dialogError && <p role="alert">{dialogError}</p>}
      <div className={styles.actions}>
        <Button autoFocus onClick={() => close(false)}>Cancel</Button>
        <button type="button" className={styles.textButton} onClick={() => void onRemove()} disabled={remove.isPending}>Remove reporting line</button>
      </div>
    </dialog>}
  </div>;
}

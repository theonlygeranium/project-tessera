// People directory: filter, add one person, import rows, and change roles.
import { useState, type FormEvent } from 'react';
import type { Invitation, Role, User } from '../../../../shared/domain';
import { isRole, ROLE_LABELS } from '../../../../shared/policy';
import {
  Button, ChoiceGroup, DataTable, FormField, SegmentedControl, Select, StatusNotice, TextArea, TextInput, TopBar,
} from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { ErrorNotice, Loading } from '../../shell/Status';
import { useSession } from '../../shell/session';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './Admin.module.css';
import {
  applyApiFieldError, blankErrors, focusInvalid, hasErrors, importSummary, roleChangeMessage, roleChangeSentence, rolePhrase,
  type FieldErrors,
} from './form';

const ROLES: Role[] = ['administrator', 'instructor', 'student'];
type RoleFilter = 'all' | Role;

const FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'administrator', label: 'Administrators' },
  { value: 'instructor', label: 'Instructors' },
  { value: 'student', label: 'Students' },
];

const CSV_EXAMPLE = `name,email,role
Sam Ibarra,sam.ibarra@meridian.example.edu,student`;

function profileStatus(person: User): string {
  if (person.role !== 'student') return 'Not applicable';
  return person.profile ? 'Profile set' : 'Not yet';
}

function invitationStatus(invitation: Invitation): string {
  if (invitation.acceptedAt) return `Signed in ${new Date(invitation.acceptedAt).toLocaleDateString()}`;
  if (invitation.accessGranted) return 'Access granted, waiting for first sign-in';
  return `Access pending: ${invitation.accessError ?? 'Please try again.'}`;
}

export function PeoplePage() {
  const { user: current } = useSession();
  const [filter, setFilter] = useState<RoleFilter>('all');
  const people = useApiQuery('listUsers', {});
  const visible = (people.data ?? []).filter((person) => filter === 'all' || person.role === filter);
  const create = useApiMutation('createUser');
  const update = useApiMutation('updateUser');
  const importer = useApiMutation('importUsers');
  const [invitationCursor, setInvitationCursor] = useState<string | undefined>(undefined);
  const [previousCursors, setPreviousCursors] = useState<(string | undefined)[]>([]);
  const invitations = useApiQuery('listInvitations', { limit: 20, cursor: invitationCursor });
  const invite = useApiMutation('inviteUser');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role | ''>('');
  const [inviteErrors, setInviteErrors] = useState<FieldErrors>({});
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<{ message: string; granted: boolean } | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [addErrors, setAddErrors] = useState<FieldErrors>({});
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const [csv, setCsv] = useState('');
  const [csvError, setCsvError] = useState<string | undefined>(undefined);
  const [importError, setImportError] = useState<string | null>(null);
  const [imported, setImported] = useState<{ created: number; errors: { line: number; message: string }[] } | null>(null);

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [optimisticRole, setOptimisticRole] = useState<Record<string, Role>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [roleNotice, setRoleNotice] = useState<string | null>(null);

  usePageTitle('People');

  function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setInviteNotice(null);
    setInviteError(null);
    const next = blankErrors([{ field: 'name', value: inviteName }, { field: 'email', value: inviteEmail }]);
    if (!inviteRole) next.role = 'Choose a role.';
    setInviteErrors(next);
    if (hasErrors(next) || !isRole(inviteRole)) {
      requestAnimationFrame(() => focusInvalid(form));
      return;
    }
    invite.mutate({ name: inviteName.trim(), email: inviteEmail.trim(), role: inviteRole }, {
      onSuccess: (result) => {
        setInviteNotice({ message: invitationStatus(result), granted: result.accessGranted });
        setInviteName(''); setInviteEmail(''); setInviteRole('');
        setInvitationCursor(undefined); setPreviousCursors([]);
      },
      onError: (error) => {
        const fields = applyApiFieldError(error, { email: inviteEmail, role: inviteRole });
        setInviteErrors(fields);
        if (!hasErrors(fields)) setInviteError(error.message);
        requestAnimationFrame(() => focusInvalid(form));
      },
    });
  }

  function retryInvitation(invitation: Invitation) {
    const person = people.data?.find((candidate) => candidate.id === invitation.userId);
    if (!person) return;
    setRetryingId(invitation.userId);
    setInviteError(null);
    invite.mutate({ name: person.name, email: invitation.email, role: person.role }, {
      onSuccess: (result) => setInviteNotice({ message: `${person.name}: ${invitationStatus(result)}`, granted: result.accessGranted }),
      onError: (error) => setInviteError(error.message),
      onSettled: () => setRetryingId(null),
    });
  }

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setAdded(null);
    setAddError(null);
    const next = blankErrors([
      { field: 'name', value: name },
      { field: 'email', value: email },
    ]);
    if (!role) next.role = 'Choose a role.';
    setAddErrors(next);
    if (hasErrors(next) || !isRole(role)) {
      requestAnimationFrame(() => focusInvalid(form));
      return;
    }
    create.mutate({ name: name.trim(), email: email.trim(), role }, {
      onSuccess: (created) => {
        setName('');
        setEmail('');
        setRole('');
        setAdded(`${created.name} was added as ${rolePhrase(created.role)}.`);
      },
      onError: (error) => {
        const fields = applyApiFieldError(error, { email, role });
        setAddErrors(fields);
        if (!hasErrors(fields)) setAddError(error.message);
        requestAnimationFrame(() => focusInvalid(form));
      },
    });
  }

  function onImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setImported(null);
    setImportError(null);
    if (!csv.trim()) {
      setCsvError('Paste at least one row.');
      requestAnimationFrame(() => focusInvalid(form));
      return;
    }
    setCsvError(undefined);
    importer.mutate({ csv }, {
      onSuccess: (result) => setImported({ created: result.created.length, errors: result.errors }),
      onError: (error) => setImportError(error.message),
    });
  }

  function changeRole(person: User, next: Role) {
    if (next === person.role) return;
    setRoleNotice(null);
    setPendingId(person.id);
    setOptimisticRole((current) => ({ ...current, [person.id]: next }));
    setRowErrors((currentErrors) => ({ ...currentErrors, [person.id]: '' }));
    update.mutate({ userId: person.id, role: next }, {
      onSuccess: () => setRoleNotice(roleChangeSentence(person.name, next)),
      onError: (error) => {
        setRowErrors((currentErrors) => ({ ...currentErrors, [person.id]: roleChangeMessage(error) }));
        setOptimisticRole((current) => {
          const nextRoles = { ...current };
          delete nextRoles[person.id];
          return nextRoles;
        });
      },
      onSettled: () => setPendingId((id) => (id === person.id ? null : id)),
    });
  }

  return (
    <div className={styles.page}>
      <TopBar title="People" />
      <section className={styles.section}>
        <h2>Everyone</h2>
        <SegmentedControl
          legend="Filter by role"
          name="people-role"
          density="compact"
          value={filter}
          options={FILTERS}
          onChange={(value) => {
            if (value === 'all' || isRole(value)) setFilter(value);
          }}
        />
        {roleNotice && (
          <StatusNotice tone="success" live="polite" title="Role updated" onDismiss={() => setRoleNotice(null)}>
            {roleNotice}
          </StatusNotice>
        )}
        {people.isLoading && <Loading label="Loading people" />}
        {people.error && <ErrorNotice error={people.error} onRetry={() => { void people.refetch(); }} />}
        {people.data && (
          <DataTable
            className={styles.directory}
            density="compact"
            caption="People"
            hideCaption
            rows={visible}
            rowKey={(person) => person.id}
            empty="No one has this role yet."
            columns={[
              {
                key: 'name',
                header: 'Name',
                render: (person) => {
                  const self = person.id === current.id;
                  return (
                    <span className={styles.personName}>
                      <span>{person.name}</span>
                      {self && <span className={styles.why} id={`role-reason-${person.id}`}>You can't change your own role.</span>}
                    </span>
                  );
                },
              },
              { key: 'email', header: 'Email' },
              {
                key: 'role',
                header: 'Role',
                render: (person) => {
                  const self = person.id === current.id;
                  const errorId = `role-error-${person.id}`;
                  const rowError = rowErrors[person.id];
                  const pendingRole = optimisticRole[person.id];
                  const shownRole = pendingRole && pendingRole !== person.role ? pendingRole : person.role;
                  return (
                    <div className={styles.roleCell}>
                      <Select
                        aria-label={`Role for ${person.name}`}
                        aria-describedby={self ? `role-reason-${person.id}` : rowError ? errorId : undefined}
                        value={shownRole}
                        disabled={self || pendingId === person.id}
                        onChange={(event) => {
                          if (isRole(event.target.value)) changeRole(person, event.target.value);
                        }}
                      >
                        {ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}
                      </Select>
                      {rowError && <p className={styles.inlineError} id={errorId}>Error: {rowError}</p>}
                    </div>
                  );
                },
              },
              { key: 'profile', header: 'Profile', render: (person) => profileStatus(person) },
            ]}
          />
        )}
      </section>

      <section className={styles.section}>
        <h2>Invite someone</h2>
        <form className={styles.form} noValidate onSubmit={onInvite}>
          {inviteNotice && <StatusNotice tone={inviteNotice.granted ? 'success' : 'warning'} live="polite" title="Invitation updated" onDismiss={() => setInviteNotice(null)}>{inviteNotice.message}</StatusNotice>}
          {inviteError && <StatusNotice tone="error" live="polite" title="Invitation wasn't updated">{inviteError}</StatusNotice>}
          <FormField label="Name" required error={inviteErrors.name}>
            {(control) => <TextInput {...control} autoComplete="name" value={inviteName} onChange={(event) => { setInviteName(event.target.value); setInviteErrors((currentErrors) => ({ ...currentErrors, name: undefined })); }} />}
          </FormField>
          <FormField label="Email" required error={inviteErrors.email}>
            {(control) => <TextInput {...control} type="email" autoComplete="off" spellCheck={false} value={inviteEmail} onChange={(event) => { setInviteEmail(event.target.value); setInviteErrors((currentErrors) => ({ ...currentErrors, email: undefined })); }} />}
          </FormField>
          <ChoiceGroup legend="Role" type="radio" name="invite-role" value={inviteRole} options={ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))} error={inviteErrors.role} onChange={(value) => { setInviteRole(typeof value === 'string' && isRole(value) ? value : ''); setInviteErrors((currentErrors) => ({ ...currentErrors, role: undefined })); }} />
          <div className={styles.actions}><Button type="submit" variant="primary" density="compact" disabled={invite.isPending}>{invite.isPending ? 'Inviting…' : 'Invite someone'}</Button></div>
        </form>
      </section>

      <section className={styles.section}>
        <h2>Invitations</h2>
        {invitations.isLoading && <Loading label="Loading invitations" />}
        {invitations.error && <ErrorNotice error={invitations.error} onRetry={() => { void invitations.refetch(); }} />}
        {invitations.data && (
          <>
            <DataTable className={styles.directory} density="compact" caption="Invitations" hideCaption rows={invitations.data.items} rowKey={(item) => item.userId} empty="No invitations yet." columns={[
              { key: 'name', header: 'Name', render: (item) => people.data?.find((person) => person.id === item.userId)?.name ?? 'Loading person…' },
              { key: 'email', header: 'Email' },
              { key: 'role', header: 'Role', render: (item) => {
                const person = people.data?.find((candidate) => candidate.id === item.userId);
                return person ? ROLE_LABELS[person.role] : 'Loading person…';
              } },
              { key: 'invitedAt', header: 'Invited', render: (item) => new Date(item.invitedAt).toLocaleDateString() },
              { key: 'status', header: 'Status', render: invitationStatus },
              { key: 'action', header: 'Action', render: (item) => !item.accessGranted && people.data?.some((person) => person.id === item.userId)
                ? <Button density="compact" variant="secondary" disabled={invite.isPending || retryingId === item.userId} onClick={() => retryInvitation(item)}>Try again</Button>
                : null },
            ]} />
            <div className={styles.actions}>
              {previousCursors.length > 0 && <Button density="compact" variant="secondary" onClick={() => { const previous = [...previousCursors]; setInvitationCursor(previous.pop()); setPreviousCursors(previous); }}>Previous</Button>}
              {invitations.data.nextCursor && <Button density="compact" variant="secondary" onClick={() => { setPreviousCursors((current) => [...current, invitationCursor]); setInvitationCursor(invitations.data.nextCursor ?? undefined); }}>Next</Button>}
            </div>
          </>
        )}
      </section>

      <section className={styles.section}>
        <h2>Add a person</h2>
        <form className={styles.form} noValidate onSubmit={onAdd}>
          {added && (
            <StatusNotice tone="success" live="polite" title="Person added" onDismiss={() => setAdded(null)}>
              {added}
            </StatusNotice>
          )}
          {addError && <StatusNotice tone="error" title="Person wasn't added">{addError}</StatusNotice>}
          <FormField label="Name" required error={addErrors.name}>
            {(control) => (
              <TextInput
                {...control}
                autoComplete="name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setAddErrors((currentErrors) => ({ ...currentErrors, name: undefined }));
                }}
              />
            )}
          </FormField>
          <FormField label="Email" required error={addErrors.email}>
            {(control) => (
              <TextInput
                {...control}
                type="email"
                autoComplete="off"
                spellCheck={false}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setAddErrors((currentErrors) => ({ ...currentErrors, email: undefined }));
                }}
              />
            )}
          </FormField>
          <FormField label="Role" required error={addErrors.role}>
            {(control) => (
              <Select
                {...control}
                value={role}
                onChange={(event) => {
                  const next = event.target.value;
                  setRole(isRole(next) ? next : '');
                  setAddErrors((currentErrors) => ({ ...currentErrors, role: undefined }));
                }}
              >
                <option value="">Choose a role</option>
                {ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}
              </Select>
            )}
          </FormField>
          <div className={styles.actions}>
            <Button type="submit" variant="primary" density="compact" disabled={create.isPending}>
              {create.isPending ? 'Adding…' : 'Add person'}
            </Button>
          </div>
        </form>
      </section>

      <section className={styles.section}>
        <h2>Import from CSV</h2>
        <form className={styles.form} noValidate onSubmit={onImport}>
          {imported && (
            <StatusNotice
              tone={imported.errors.length === 0 && imported.created > 0 ? 'success' : 'warning'}
              live="polite"
              title="Import finished"
              onDismiss={() => setImported(null)}
            >
              <p>
                {imported.created === 0 && imported.errors.length === 0
                  ? 'Nothing was imported. Add a row under the header.'
                  : importSummary(imported.created, imported.errors.length)}
              </p>
              {imported.errors.length > 0 && (
                <ul className={styles.importErrors}>
                  {imported.errors.map((row, index) => (
                    <li key={`${row.line}-${index}`}>Line {row.line}: {row.message}</li>
                  ))}
                </ul>
              )}
            </StatusNotice>
          )}
          {importError && <StatusNotice tone="error" title="Import didn't finish">{importError}</StatusNotice>}
          <FormField
            label="People to import"
            error={csvError}
            hint="One person per line: name, email, role. A header row is optional. Importing an email that already exists is reported on that line."
          >
            {(control) => (
              <TextArea
                {...control}
                rows={6}
                spellCheck={false}
                value={csv}
                onChange={(event) => {
                  setCsv(event.target.value);
                  setCsvError(undefined);
                }}
              />
            )}
          </FormField>
          <p className={styles.note} id="csv-example-label">Example</p>
          <pre className={styles.example} aria-labelledby="csv-example-label">{CSV_EXAMPLE}</pre>
          <div className={styles.actions}>
            <Button type="submit" variant="primary" density="compact" disabled={importer.isPending}>
              {importer.isPending ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

// Field errors, policy shaping, and short bits of copy shared by the admin pages.
// The service stays the source of truth; this only places its messages on fields.
import { ApiError } from '../../../../shared/api';
import type { AiPolicy, Role, TutorMode } from '../../../../shared/domain';
import { isEmail, isRole, ROLE_LABELS, TUTOR_MODES } from '../../../../shared/policy';

export type FieldErrors = Partial<Record<string, string>>;

const KNOWN_FIELDS = new Set(['name', 'shortName', 'email', 'role', 'code', 'title', 'term', 'description', 'accent', 'csv']);

const REQUIRED_COPY: Record<string, string> = {
  name: 'Enter a name.',
  shortName: 'Enter a short name.',
  email: 'Enter an email address.',
  code: 'Enter a course code.',
  title: 'Enter a title.',
  term: 'Enter a term.',
  description: 'Enter a description.',
  role: 'Choose a role.',
  accent: 'Choose an accent.',
  csv: 'Paste at least one row.',
};

export const OPEN_GRADED_REASON = 'Open is never allowed on graded work.';
export const OFF_REASON = 'Off is always allowed.';
export const AI_DRAFT_NOTE = 'AI drafts are always labeled, and an instructor reviews each one before it is published.';

const MODE_IDS = new Set<string>(TUTOR_MODES.map((mode) => mode.id));

export interface PolicyValue {
  aiAuthoring: boolean;
  graded: TutorMode[];
  practice: TutorMode[];
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some((message) => Boolean(message));
}

export function blankErrors(fields: { field: string; value: string; message?: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of fields) {
    if (!field.value.trim()) errors[field.field] = field.message ?? REQUIRED_COPY[field.field] ?? 'Enter a value.';
  }
  return errors;
}

function fromDetails(error: ApiError): FieldErrors {
  const details = error.details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  const record = details as Record<string, unknown>;
  const source = record.fields && typeof record.fields === 'object' && !Array.isArray(record.fields)
    ? record.fields as Record<string, unknown>
    : record;
  const errors: FieldErrors = {};
  for (const [key, value] of Object.entries(source)) {
    if (KNOWN_FIELDS.has(key) && typeof value === 'string' && value.trim()) errors[key] = value;
  }
  return errors;
}

/** Maps an invalid or conflict response onto the field that caused it. */
export function applyApiFieldError(error: ApiError, values: { email?: string; role?: string } = {}): FieldErrors {
  if (error.code !== 'invalid' && error.code !== 'conflict') return {};
  const detailed = fromDetails(error);
  if (hasErrors(detailed)) return detailed;

  const message = error.message.trim();
  const required = message.match(/^(\w+) is required\.?$/);
  if (required) {
    const field = required[1];
    return { [field]: REQUIRED_COPY[field] ?? message };
  }
  if (message === 'Email already exists.') return { email: 'That email is already used.' };
  if (message === 'Unknown accent.') return { accent: 'Choose an accent.' };
  if (message === 'Invalid email or role.') {
    const errors: FieldErrors = {};
    if (values.email === undefined || !isEmail(values.email)) errors.email = 'Enter an email address like name@school.edu.';
    if (values.role !== undefined && !isRole(values.role)) errors.role = 'Choose a role.';
    if (!hasErrors(errors)) errors.email = 'Enter an email address like name@school.edu.';
    return errors;
  }
  return {};
}

export function roleChangeMessage(error: ApiError): string {
  if (error.message === 'Cannot change this role.') return "You can't change your own role.";
  return error.message;
}

const ROLE_ARTICLE: Record<Role, 'a' | 'an'> = {
  administrator: 'an',
  instructor: 'an',
  student: 'a',
};

export function rolePhrase(role: Role): string {
  return `${ROLE_ARTICLE[role]} ${ROLE_LABELS[role].toLowerCase()}`;
}

export function roleChangeSentence(name: string, role: Role): string {
  return `${name} is now ${rolePhrase(role)}.`;
}

export function countPhrase(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "3 added, 1 needs attention" */
export function importSummary(added: number, problems: number): string {
  const addedText = `${added} added`;
  if (problems === 0) return addedText;
  const problemText = problems === 1 ? '1 needs attention' : `${problems} need attention`;
  return `${addedText}, ${problemText}`;
}

export function modesFrom(values: readonly string[], kind: 'graded' | 'practice'): TutorMode[] {
  const modes = values.filter((value): value is TutorMode => MODE_IDS.has(value));
  const limited = kind === 'graded' ? modes.filter((mode) => mode !== 'open') : modes;
  return limited.includes('off') ? limited : ['off', ...limited];
}

export function policyValueFrom(policy: AiPolicy): PolicyValue {
  return {
    aiAuthoring: policy.aiAuthoring,
    graded: modesFrom(policy.tutorModes.graded, 'graded'),
    practice: modesFrom(policy.tutorModes.practice, 'practice'),
  };
}

export function toAiPolicy(value: PolicyValue): AiPolicy {
  return {
    aiAuthoring: value.aiAuthoring,
    tutorModes: {
      graded: modesFrom(value.graded, 'graded'),
      practice: modesFrom(value.practice, 'practice'),
    },
  };
}

export function tutorChoice(mode: { id: TutorMode; label: string; description: string }, kind: 'graded' | 'practice') {
  if (mode.id === 'off') {
    return { value: mode.id, label: mode.label, description: `${mode.description} ${OFF_REASON}`, disabled: true };
  }
  if (kind === 'graded' && mode.id === 'open') {
    return { value: mode.id, label: mode.label, description: `${mode.description} ${OPEN_GRADED_REASON}`, disabled: true };
  }
  return { value: mode.id, label: mode.label, description: mode.description, disabled: false };
}

export function focusInvalid(scope: ParentNode | null) {
  scope?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}

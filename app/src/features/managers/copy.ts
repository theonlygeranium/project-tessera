import type { TrainingStatus } from '../../../../shared/domain';
import type { StatusChipProps } from '../../components';

/** Manager-facing wording from the approved artboard. The sharing page uses the policy lists instead. */
export const TEAM_SEES = [
  'Their required training and when each is due',
  "Whether they've started, finished, or tested out, and the date they finished",
  'Certificates for required training',
];

export const TEAM_NEVER_SEES = [
  'Scores on checks, test-outs, or assignments, or how many attempts',
  'Conversations with the tutor',
  'Their learning profile and the changes Tessera made for them',
  "Courses that aren't required training, or when and how long they studied",
];

export function shortDay(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function sharingLabel(sharing: boolean, since: string | null): string {
  return sharing && since ? `Sharing since ${shortDay(since)}` : 'Not sharing';
}

export function statusLabel(status: TrainingStatus, completedAt: string | null): string {
  if (status === 'completed') return completedAt ? `Completed ${shortDay(completedAt)}` : 'Completed';
  if (status === 'tested-out') return completedAt ? `Tested out ${shortDay(completedAt)}` : 'Tested out';
  if (status === 'in-progress') return 'In progress';
  if (status === 'overdue') return 'Overdue';
  return 'Not started';
}

export function statusTone(status: TrainingStatus): StatusChipProps['tone'] {
  if (status === 'completed' || status === 'tested-out') return 'success';
  if (status === 'in-progress') return 'accent';
  if (status === 'overdue') return 'warning';
  return 'neutral';
}

export function dueLabel(dueAt: string | null): string {
  return dueAt ? shortDay(dueAt) : 'No due date';
}

export function sharingCaption(count: number): string {
  return count === 1 ? '1 person shares their training with you' : `${count} people share their training with you`;
}

export function notSharingNote(count: number): string {
  return count === 1
    ? "1 person who reports to you hasn't chosen to share."
    : `${count} people who report to you haven't chosen to share.`;
}

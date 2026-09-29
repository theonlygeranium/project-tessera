// Manager visibility rules (D-025, D-026, principle #9, report §5). The most sensitive
// surface in Night 3, so every rule lives here, in pure tested functions that the
// service, the app, and the docs all use.
//
// - A manager is a relationship, not a role: an administrator records who reports to whom.
// - Nothing is shared by default. A learner opts in per manager, and opting out takes
//   effect on the next request. Removing the reporting line clears the choice, so a
//   re-added line starts private again.
// - A manager sees only required training: course, due date, status, completion date, and
//   the certificate. Never scores, attempts, tutor conversations, the learning profile,
//   adaptations, activity times, email, or courses that aren't required.
// - The view is built by explicit construction (never by copying and deleting fields),
//   and `assertManagerSafe` rejects any forbidden field before it leaves the service.
import type {
  Certificate, Id, ManagerConsent, ManagerReportRow, ManagerTrainingRow, ManagerView, RequiredTraining, ReportingLine, User,
} from '../domain';

/** What a manager sees when the learner shares (shown in "Who sees this" and the docs). */
export const MANAGER_SEES: string[] = [
  'Your required training and when each is due',
  "Whether you've started, finished, or tested out, and the date you finished",
  'Certificates for required training',
];

/** What a manager never sees, whatever the learner chooses. */
export const MANAGER_NEVER_SEES: string[] = [
  'Scores on checks, test-outs, or assignments',
  'How many attempts you made',
  'Your conversations with the tutor',
  'Your learning profile and the changes Tessera made for you',
  "Courses that aren't required training",
  'When you were active or how long you spent',
];

/**
 * Field names that must never appear anywhere in a manager's view. Checked recursively
 * by `assertManagerSafe`; the zod schemas for the view are also strict.
 */
export const FORBIDDEN_MANAGER_FIELDS = [
  'score', 'percent', 'points', 'grade', 'grades', 'feedback', 'criteria',
  'attempt', 'attempts', 'checks', 'correct',
  'messages', 'tutor', 'hintsUsed', 'answerRequests', 'summary',
  'profile', 'adaptations', 'preset', 'readingLevel', 'accessibility', 'goals',
  'email', 'lastActivity', 'updatedAt', 'minutesDone', 'progress',
  'jobCode', 'jobTitle', 'department', 'location', 'employmentType', 'employeeId', 'managerEmployeeId', 'hireDate',
] as const;

type Line = Pick<ReportingLine, 'managerId' | 'reportId' | 'createdAt'>;
type Consent = Pick<ManagerConsent, 'managerId' | 'reportId' | 'sharing' | 'at'>;

/**
 * Whether this learner currently shares with this manager: the reporting line exists and
 * the learner's latest choice for it, made after the line was created, is "share".
 */
export function isSharing(lines: Line[], consents: Consent[], managerId: Id, reportId: Id): boolean {
  const line = lines.find((l) => l.managerId === managerId && l.reportId === reportId);
  if (!line) return false;
  const consent = consents.find((c) => c.managerId === managerId && c.reportId === reportId);
  return !!consent && consent.sharing && consent.at >= line.createdAt;
}

/** People who report to this manager, split by whether they share. */
export function reportsOf(lines: Line[], consents: Consent[], managerId: Id): { sharing: Id[]; notSharing: Id[] } {
  const reports = lines.filter((l) => l.managerId === managerId).map((l) => l.reportId);
  const sharing = reports.filter((id) => isSharing(lines, consents, managerId, id));
  return { sharing, notSharing: reports.filter((id) => !sharing.includes(id)) };
}

/** One required course, reduced to what a manager may see. */
export function managerTrainingRow(training: RequiredTraining, certificate: Pick<Certificate, 'id' | 'code' | 'replacedBy'> | null): ManagerTrainingRow {
  return {
    courseId: training.courseId,
    courseTitle: training.courseTitle,
    dueAt: training.dueAt,
    status: training.status,
    completedAt: training.completedAt,
    certificate: certificate && !certificate.replacedBy ? { id: certificate.id, code: certificate.code } : null,
  };
}

export interface ManagerViewInput {
  managerId: Id;
  lines: Line[];
  consents: Consent[];
  people: Pick<User, 'id' | 'name' | 'initials'>[];
  /** Required training per person (only required training: see `listMyTraining`). */
  training: Record<Id, RequiredTraining[]>;
  /** Certificates by id. */
  certificates: Record<Id, Pick<Certificate, 'id' | 'code' | 'replacedBy' | 'userId'>>;
}

/** The manager's view: completion only, for people who opted in, ordered by name. */
export function managerView(input: ManagerViewInput): ManagerView {
  const { sharing, notSharing } = reportsOf(input.lines, input.consents, input.managerId);
  const rows: ManagerReportRow[] = [];
  for (const id of sharing) {
    const person = input.people.find((p) => p.id === id);
    if (!person) continue;
    const training = (input.training[id] ?? []).map((t) => {
      const cert = t.certificateId ? input.certificates[t.certificateId] : undefined;
      return managerTrainingRow(t, cert && cert.userId === id ? cert : null);
    });
    rows.push({ person: { id: person.id, name: person.name, initials: person.initials }, training });
  }
  rows.sort((a, b) => a.person.name.localeCompare(b.person.name) || a.person.id.localeCompare(b.person.id));
  const view: ManagerView = { rows, notSharingCount: notSharing.length };
  assertManagerSafe(view);
  return view;
}

/**
 * Whether a manager may open one certificate: the learner shares with them and the
 * certificate is for a course that's required training for that learner.
 */
export function managerMayReadCertificate(lines: Line[], consents: Consent[], managerId: Id, certificate: Pick<Certificate, 'userId' | 'courseId'>, requiredCourseIds: Id[]): boolean {
  return isSharing(lines, consents, managerId, certificate.userId) && requiredCourseIds.includes(certificate.courseId);
}

/** Throws if any forbidden field appears anywhere in the value. */
export function assertManagerSafe(value: unknown, path = 'view'): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertManagerSafe(v, `${path}[${i}]`));
    return;
  }
  for (const [key, v] of Object.entries(value)) {
    if ((FORBIDDEN_MANAGER_FIELDS as readonly string[]).includes(key)) {
      throw new Error(`Manager view must not include "${key}" (at ${path}.${key}).`);
    }
    assertManagerSafe(v, `${path}.${key}`);
  }
}

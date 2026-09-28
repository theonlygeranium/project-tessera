import { describe, expect, it } from 'vitest';
import type { RequiredTraining } from '../domain';
import { ManagerViewSchema } from '../schema/domain';
import { assertManagerSafe, isSharing, MANAGER_NEVER_SEES, managerMayReadCertificate, managerView, reportsOf } from './policy';

const T0 = '2026-09-01T00:00:00.000Z';
const T1 = '2026-09-10T00:00:00.000Z';
const lines = [
  { managerId: 'u-sam', reportId: 'u-dana', createdBy: 'u-admin', createdAt: T0 },
  { managerId: 'u-sam', reportId: 'u-ravi', createdBy: 'u-admin', createdAt: T0 },
  { managerId: 'u-sam', reportId: 'u-jo', createdBy: 'u-admin', createdAt: T1 },
];
const people = [
  { id: 'u-dana', name: 'Dana Whitfield', initials: 'DW' },
  { id: 'u-ravi', name: 'Ravi Menon', initials: 'RM' },
  { id: 'u-jo', name: 'Jo Park', initials: 'JP' },
];
const training = (courseId: string, extra: Partial<RequiredTraining> = {}): RequiredTraining => ({
  requirementId: 'r1', courseId, courseTitle: 'Lockout/tagout', dueAt: '2026-10-15T00:00:00.000Z', status: 'completed', completedAt: T1, certificateId: 'cert1', ...extra,
});

describe('manager visibility (D-025)', () => {
  it('is off by default and needs a reporting line plus the learner\'s opt-in', () => {
    expect(isSharing(lines, [], 'u-sam', 'u-dana')).toBe(false);
    expect(isSharing(lines, [{ managerId: 'u-sam', reportId: 'u-dana', sharing: true, at: T1 }], 'u-sam', 'u-dana')).toBe(true);
    expect(isSharing(lines, [{ managerId: 'u-sam', reportId: 'u-dana', sharing: false, at: T1 }], 'u-sam', 'u-dana')).toBe(false);
    // Another manager's consent doesn't count.
    expect(isSharing(lines, [{ managerId: 'u-lee', reportId: 'u-dana', sharing: true, at: T1 }], 'u-sam', 'u-dana')).toBe(false);
    // No reporting line, no visibility, whatever the consent says.
    expect(isSharing([], [{ managerId: 'u-sam', reportId: 'u-dana', sharing: true, at: T1 }], 'u-sam', 'u-dana')).toBe(false);
  });

  it('ignores a consent given before the current reporting line existed', () => {
    expect(isSharing(lines, [{ managerId: 'u-sam', reportId: 'u-jo', sharing: true, at: T0 }], 'u-sam', 'u-jo')).toBe(false);
  });

  it('splits reports into sharing and not sharing', () => {
    const consents = [{ managerId: 'u-sam', reportId: 'u-ravi', sharing: true, at: T1 }];
    expect(reportsOf(lines, consents, 'u-sam')).toEqual({ sharing: ['u-ravi'], notSharing: ['u-dana', 'u-jo'] });
  });

  it('shows completion only, for people who opted in, and counts the rest without names', () => {
    const consents = [{ managerId: 'u-sam', reportId: 'u-dana', sharing: true, at: T1 }];
    const view = managerView({
      managerId: 'u-sam', lines, consents, people,
      // Extra fields a careless caller might pass must not survive.
      training: { 'u-dana': [{ ...training('c-loto'), score: 55, attempts: 3 } as RequiredTraining], 'u-ravi': [training('c-loto')] },
      certificates: { cert1: { id: 'cert1', code: 'TSR-7K2M-94QD', replacedBy: null, userId: 'u-dana' } },
    });
    expect(view).toEqual({
      rows: [{ person: { id: 'u-dana', name: 'Dana Whitfield', initials: 'DW' }, training: [{ courseId: 'c-loto', courseTitle: 'Lockout/tagout', dueAt: '2026-10-15T00:00:00.000Z', status: 'completed', completedAt: T1, certificate: { id: 'cert1', code: 'TSR-7K2M-94QD' } }] }],
      notSharingCount: 2,
    });
    expect(ManagerViewSchema.safeParse(view).success).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/Ravi|Jo Park|score|attempt|email/);
  });

  it('empties the view immediately when the learner opts out', () => {
    const on = [{ managerId: 'u-sam', reportId: 'u-dana', sharing: true, at: T1 }];
    const off = [{ managerId: 'u-sam', reportId: 'u-dana', sharing: false, at: '2026-09-11T00:00:00.000Z' }];
    const input = { managerId: 'u-sam', lines, people, training: { 'u-dana': [training('c-loto')] }, certificates: {} };
    expect(managerView({ ...input, consents: on }).rows).toHaveLength(1);
    expect(managerView({ ...input, consents: off })).toEqual({ rows: [], notSharingCount: 3 });
  });

  it('hides replaced certificates and certificates that belong to someone else', () => {
    const consents = [{ managerId: 'u-sam', reportId: 'u-dana', sharing: true, at: T1 }];
    const base = { managerId: 'u-sam', lines, consents, people, training: { 'u-dana': [training('c-loto')] } };
    expect(managerView({ ...base, certificates: { cert1: { id: 'cert1', code: 'X', replacedBy: 'cert2', userId: 'u-dana' } } }).rows[0].training[0].certificate).toBeNull();
    expect(managerView({ ...base, certificates: { cert1: { id: 'cert1', code: 'X', replacedBy: null, userId: 'u-ravi' } } }).rows[0].training[0].certificate).toBeNull();
  });

  it('lets a manager open a certificate only for shared, required training', () => {
    const consents = [{ managerId: 'u-sam', reportId: 'u-dana', sharing: true, at: T1 }];
    expect(managerMayReadCertificate(lines, consents, 'u-sam', { userId: 'u-dana', courseId: 'c-loto' }, ['c-loto'])).toBe(true);
    expect(managerMayReadCertificate(lines, consents, 'u-sam', { userId: 'u-dana', courseId: 'c-elective' }, ['c-loto'])).toBe(false);
    expect(managerMayReadCertificate(lines, [], 'u-sam', { userId: 'u-dana', courseId: 'c-loto' }, ['c-loto'])).toBe(false);
  });

  it('rejects any forbidden field, however deep', () => {
    expect(() => assertManagerSafe({ rows: [{ person: { id: 'x', email: 'a@b.c' } }] })).toThrow(/email/);
    expect(() => assertManagerSafe({ rows: [{ training: [{ percent: 80 }] }] })).toThrow(/percent/);
    expect(() => assertManagerSafe({ rows: [{ tutor: { messages: [] } }] })).toThrow(/tutor/);
    expect(() => assertManagerSafe({ rows: [], notSharingCount: 1 })).not.toThrow();
    expect(ManagerViewSchema.safeParse({ rows: [{ person: { id: 'x', name: 'X', initials: 'X', email: 'a@b.c' }, training: [] }], notSharingCount: 0 }).success).toBe(false);
    expect(MANAGER_NEVER_SEES.join(' ')).toMatch(/Scores/);
  });
});

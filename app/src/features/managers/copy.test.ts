import { describe, expect, it } from 'vitest';
import { paths } from '../../paths';
import { currentNavId, navFor } from '../../shell/nav';
import { dueLabel, notSharingNote, sharingCaption, sharingLabel, statusLabel, statusTone } from './copy';

describe('manager page copy', () => {
  it('states sharing and each training status in words', () => {
    expect(sharingLabel(false, null)).toBe('Not sharing');
    expect(sharingLabel(true, '2026-09-10T00:00:00.000Z')).toMatch(/^Sharing since 10 Sept?$/);
    expect(sharingLabel(false, '2026-09-10T00:00:00.000Z')).toBe('Not sharing');
    expect(statusLabel('completed', '2026-09-12T00:00:00.000Z')).toMatch(/^Completed 12 Sept?$/);
    expect(statusLabel('tested-out', '2026-09-18T00:00:00.000Z')).toMatch(/^Tested out 18 Sept?$/);
    expect(statusLabel('in-progress', null)).toBe('In progress');
    expect(statusLabel('overdue', null)).toBe('Overdue');
    expect(statusLabel('not-started', null)).toBe('Not started');
    expect(statusTone('completed')).toBe('success');
    expect(statusTone('tested-out')).toBe('success');
    expect(statusTone('in-progress')).toBe('accent');
    expect(statusTone('overdue')).toBe('warning');
    expect(statusTone('not-started')).toBe('neutral');
    expect(dueLabel('2026-10-15T00:00:00.000Z')).toBe('15 Oct');
    expect(dueLabel(null)).toBe('No due date');
  });

  it('counts people who have not shared without naming them', () => {
    expect(sharingCaption(1)).toBe('1 person shares their training with you');
    expect(sharingCaption(2)).toBe('2 people share their training with you');
    expect(notSharingNote(1)).toBe("1 person who reports to you hasn't chosen to share.");
    expect(notSharingNote(3)).toBe("3 people who report to you haven't chosen to share.");
    expect(notSharingNote(3)).not.toMatch(/@|Dana|Sam/);
  });
});

describe('relationship navigation', () => {
  it('shows Team, Sharing, and Reporting lines only to the people they apply to', () => {
    expect(navFor('student').map((item) => item.id)).not.toContain('team');
    expect(navFor('student').map((item) => item.id)).not.toContain('sharing');
    expect(navFor('student', { hasReports: true }).find((item) => item.id === 'team')).toMatchObject({ label: 'Team', href: paths.me.team });
    expect(navFor('instructor', { hasManager: true }).find((item) => item.id === 'sharing')).toMatchObject({ label: 'Sharing', href: paths.me.sharing });
    expect(navFor('administrator', { courseId: 'c-ops101', hasReports: true, hasManager: true }).map((item) => item.id)).toEqual(
      expect.arrayContaining(['reporting-lines', 'team', 'sharing']),
    );
    const admin = navFor('administrator');
    expect(admin.find((item) => item.id === 'reporting-lines')).toMatchObject({ label: 'Reporting lines', href: paths.admin.reportingLines });
    expect(currentNavId(admin, paths.admin.reportingLines)).toBe('reporting-lines');
  });
});

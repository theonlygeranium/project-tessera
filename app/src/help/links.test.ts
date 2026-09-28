import { describe, expect, it } from 'vitest';
import { resolveHelpLink } from './links';
import type { HelpLink } from './courseSetup';
import { paths } from '../paths';

describe('resolveHelpLink', () => {
  it('resolves every course-specific link', () => {
    const courseId = 'c-test';
    const expected: [HelpLink, string][] = [
      ['admin.course', paths.admin.course(courseId)],
      ['admin.courseReadiness', paths.admin.courseReadiness(courseId)],
      ['teach.course', paths.teach.course(courseId)],
      ['teach.build', paths.teach.build(courseId)],
      ['teach.generate', paths.teach.generate(courseId)],
      ['teach.template', paths.teach.template(courseId)],
      ['teach.readiness', paths.teach.readiness(courseId)],
      ['teach.outcomes', paths.teach.outcomes(courseId)],
    ];
    for (const [link, url] of expected) expect(resolveHelpLink(link, { courseId })).toBe(url);
  });
  it('resolves administrator destinations without a course', () => {
    const expected: [HelpLink, string][] = [
      ['admin.people', paths.admin.people], ['admin.courses', paths.admin.courses],
      ['admin.programs', paths.admin.programs], ['admin.templates', paths.admin.templates],
      ['admin.rubrics', paths.admin.rubrics], ['admin.policy', paths.admin.policy],
    ];
    for (const [link, url] of expected) expect(resolveHelpLink(link)).toBe(url);
  });
});

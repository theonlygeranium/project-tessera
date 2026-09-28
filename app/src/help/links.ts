import { paths } from '../paths';
import type { HelpLink } from './courseSetup';

export function resolveHelpLink(link: HelpLink, { courseId }: { courseId?: string } = {}): string {
  switch (link) {
    case 'admin.people': return paths.admin.people;
    case 'admin.courses': return paths.admin.courses;
    case 'admin.course': return paths.admin.course(courseId ?? '');
    case 'admin.courseReadiness': return paths.admin.courseReadiness(courseId ?? '');
    case 'admin.programs': return paths.admin.programs;
    case 'admin.templates': return paths.admin.templates;
    case 'admin.rubrics': return paths.admin.rubrics;
    case 'admin.policy': return paths.admin.policy;
    case 'teach.course': return paths.teach.course(courseId ?? '');
    case 'teach.build': return paths.teach.build(courseId ?? '');
    case 'teach.generate': return paths.teach.generate(courseId ?? '');
    case 'teach.template': return paths.teach.template(courseId ?? '');
    case 'teach.readiness': return paths.teach.readiness(courseId ?? '');
    case 'teach.outcomes': return paths.teach.outcomes(courseId ?? '');
  }
}

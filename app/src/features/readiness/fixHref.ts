import type { FixLink } from '../../../../shared/domain';
import { paths } from '../../paths';

export function fixHref(courseId: string, fix: FixLink): string {
  const t = fix.target;
  switch (t.kind) {
    case 'block': return `${paths.teach.lesson(courseId, t.lessonId)}#block-${t.blockId}`;
    case 'lesson': return paths.teach.lesson(courseId, t.lessonId);
    case 'module': return paths.teach.course(courseId);
    case 'assignment': return paths.teach.assignment(courseId, t.assignmentId);
    case 'course': return t.field === 'outcomes' ? paths.teach.outcomes(courseId) : paths.teach.course(courseId);
    case 'template': return paths.teach.template(courseId);
    case 'access': return paths.teach.access(courseId);
  }
}

import { useEffect } from 'react';
import { useApiQuery } from '../../data/hooks';
import { useSession } from '../../shell/session';

/** Staff course pages can resolve the program through listPrograms. */
export function useStaffCourseBrand(courseId: string) {
  const { institution } = useSession();
  const outline = useApiQuery('getCourseOutline', { courseId }, { enabled: !!courseId });
  const programs = useApiQuery('listPrograms', undefined, { enabled: !!courseId });
  const program = programs.data?.find(p => p.id === outline.data?.course.programId);
  const accent = program?.brand.accent ?? institution.accent;
  useEffect(() => {
    const root = document.documentElement.style;
    const set = (id: string) => {
      if (id === 'teal') {
        root.removeProperty('--accent'); root.removeProperty('--accent-hover'); root.removeProperty('--accent-soft');
      } else {
        root.setProperty('--accent', `var(--accent-option-${id})`);
        root.setProperty('--accent-hover', 'color-mix(in oklab, var(--accent) 78%, var(--ink))');
        root.setProperty('--accent-soft', 'color-mix(in oklab, var(--accent) 12%, var(--surface))');
      }
    };
    set(accent);
    return () => set(institution.accent);
  }, [accent, institution.accent]);
  return { course: outline.data?.course, program };
}

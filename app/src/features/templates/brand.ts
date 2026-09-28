import { useEffect } from 'react';
import { useApiQuery } from '../../data/hooks';
import { useSession } from '../../shell/session';

/** Applies the course's program accent (D-024) on any course page, for every role; returns the course and its program. */
export function useCourseBrand(courseId: string) {
  const { institution } = useSession();
  const outline = useApiQuery('getCourseOutline', { courseId }, { enabled: !!courseId });
  const program = outline.data?.course.program ?? undefined;
  const accent = program?.accent ?? institution.accent;
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

/** Kept for the staff pages that already use it. */
export const useStaffCourseBrand = useCourseBrand;

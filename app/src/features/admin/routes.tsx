// Lane D (administrator). Owns app/src/features/admin/. Paths: paths.admin in app/src/paths.ts.
import type { RouteObject } from 'react-router';
import { Placeholder } from '../../shell/Placeholder';

const lane = 'lane D (administrator)';
export const adminRoutes: RouteObject[] = [
  { path: 'admin', element: <Placeholder title="Overview" lane={lane} /> },
  { path: 'admin/setup', element: <Placeholder title="Setup" lane={lane} /> },
  { path: 'admin/people', element: <Placeholder title="People" lane={lane} /> },
  { path: 'admin/courses', element: <Placeholder title="Courses" lane={lane} /> },
  { path: 'admin/courses/:courseId', element: <Placeholder title="Course" lane={lane} /> },
  { path: 'admin/policy', element: <Placeholder title="AI policy" lane={lane} /> },
];

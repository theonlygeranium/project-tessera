// Lane E (instructor). Owns app/src/features/instructor/. Paths: paths.teach in app/src/paths.ts.
import type { RouteObject } from 'react-router';
import { Placeholder } from '../../shell/Placeholder';

const lane = 'lane E (instructor)';
export const instructorRoutes: RouteObject[] = [
  { path: 'teach', element: <Placeholder title="My courses" lane={lane} /> },
  { path: 'teach/courses/:courseId', element: <Placeholder title="Course" lane={lane} /> },
  { path: 'teach/courses/:courseId/lessons/:lessonId', element: <Placeholder title="Lesson" lane={lane} /> },
  { path: 'teach/courses/:courseId/announcements', element: <Placeholder title="Announcements" lane={lane} /> },
  { path: 'teach/courses/:courseId/roster', element: <Placeholder title="Roster" lane={lane} /> },
];

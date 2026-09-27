// Lane G (student). Owns app/src/features/student/. Paths: paths.student in app/src/paths.ts.
import type { RouteObject } from 'react-router';
import { Placeholder } from '../../shell/Placeholder';

const lane = 'lane G (student)';
export const studentRoutes: RouteObject[] = [
  { path: 'today', element: <Placeholder title="Today" lane={lane} /> },
  { path: 'onboarding', element: <Placeholder title="Your learning profile" lane={lane} /> },
  { path: 'profile', element: <Placeholder title="Profile" lane={lane} /> },
  { path: 'courses', element: <Placeholder title="Courses" lane={lane} /> },
  { path: 'courses/:courseId', element: <Placeholder title="Course" lane={lane} /> },
  { path: 'courses/:courseId/lessons/:lessonId', element: <Placeholder title="Lesson" lane={lane} /> },
  { path: 'announcements', element: <Placeholder title="Announcements" lane={lane} /> },
];

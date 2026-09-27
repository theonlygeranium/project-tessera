// Lane F (hint-first tutor). Owns app/src/features/tutor/. Paths: paths.teach.tutor.
import type { RouteObject } from 'react-router';
import { Placeholder } from '../../shell/Placeholder';

export const tutorInstructorRoutes: RouteObject[] = [
  { path: 'teach/courses/:courseId/tutor', element: <Placeholder title="Tutor" lane="lane F" /> },
];

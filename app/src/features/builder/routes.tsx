// Lane F (AI course builder). Owns app/src/features/builder/. Paths: paths.teach.build*.
import type { RouteObject } from 'react-router';
import { Placeholder } from '../../shell/Placeholder';

const lane = 'lane F (AI course builder)';
export const builderRoutes: RouteObject[] = [
  { path: 'teach/courses/:courseId/build', element: <Placeholder title="Build with AI" lane={lane} /> },
  { path: 'teach/courses/:courseId/build/:sessionId', element: <Placeholder title="Build with AI" lane={lane} /> },
];

// Lane F (AI course builder). Owns app/src/features/builder/. Paths: paths.teach.build*.
import type { RouteObject } from 'react-router';
import { BuilderStart } from './Start';
import { BuilderSessionPage } from './Session';
import { Placeholder } from '../../shell/Placeholder';

export const builderRoutes: RouteObject[] = [
  { path: 'teach/courses/:courseId/build', element: <BuilderStart /> },
  { path: 'teach/courses/:courseId/build/:sessionId', element: <BuilderSessionPage /> },
  { path: 'teach/courses/:courseId/generate', element: <Placeholder title="Generate with AI" lane="lane D" /> },
];

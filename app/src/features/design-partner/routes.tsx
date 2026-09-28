import type { RouteObject } from 'react-router';
import { DesignStart } from './Start';
import { DesignSessionPage } from './Session';

export const designPartnerRoutes: RouteObject[] = [
  { path: 'teach/courses/:courseId/design', element: <DesignStart /> },
  { path: 'teach/courses/:courseId/design/:sessionId', element: <DesignSessionPage /> },
];

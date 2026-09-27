// Lane B (Tessera Access UI). Owns app/src/features/access/. Paths: paths.teach.access, files, file; paths.admin.access.
import type { RouteObject } from 'react-router';
import { Placeholder } from '../../shell/Placeholder';

export const accessInstructorRoutes: RouteObject[] = [
  { path: 'teach/courses/:courseId/access', element: <Placeholder title="Accessibility" lane="lane B" /> },
  { path: 'teach/courses/:courseId/files', element: <Placeholder title="Files" lane="lane B" /> },
  { path: 'teach/courses/:courseId/files/:fileId', element: <Placeholder title="File" lane="lane B" /> },
];

export const accessAdminRoutes: RouteObject[] = [
  { path: 'admin/access', element: <Placeholder title="Accessibility" lane="lane B" /> },
];

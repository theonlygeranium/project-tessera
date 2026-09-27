import type { RouteObject } from 'react-router';
import { CourseAccessPage, FileLibraryPage, FileRemediationPage, InstitutionAccessPage } from './AccessPages';
export const accessInstructorRoutes: RouteObject[] = [
  { path: 'teach/courses/:courseId/access', element: <CourseAccessPage /> },
  { path: 'teach/courses/:courseId/files', element: <FileLibraryPage /> },
  { path: 'teach/courses/:courseId/files/:fileId', element: <FileRemediationPage /> },
];
export const accessAdminRoutes: RouteObject[] = [
  { path: 'admin/access', element: <InstitutionAccessPage /> },
];

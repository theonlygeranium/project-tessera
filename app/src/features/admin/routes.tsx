// Lane D (administrator). Owns app/src/features/admin/. Paths: paths.admin in app/src/paths.ts.
import type { RouteObject } from 'react-router';
import { CoursePage } from './CoursePage';
import { CoursesPage } from './CoursesPage';
import { OverviewPage } from './OverviewPage';
import { PeoplePage } from './PeoplePage';
import { PolicyPage } from './PolicyPage';
import { SetupPage } from './SetupPage';

export const adminRoutes: RouteObject[] = [
  { path: 'admin', element: <OverviewPage /> },
  { path: 'admin/setup', element: <SetupPage /> },
  { path: 'admin/people', element: <PeoplePage /> },
  { path: 'admin/courses', element: <CoursesPage /> },
  { path: 'admin/courses/:courseId', element: <CoursePage /> },
  { path: 'admin/policy', element: <PolicyPage /> },
];

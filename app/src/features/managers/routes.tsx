// Reporting lines, sharing with managers, and the manager view (lane D2, D-025, D-026).
import type { RouteObject } from 'react-router';
import { ReportingLinesPage } from './ReportingLinesPage';
import { SharingPage } from './SharingPage';
import { TeamPage } from './TeamPage';

export const adminManagerRoutes: RouteObject[] = [
  { path: 'admin/reporting-lines', element: <ReportingLinesPage /> },
];

export const anyManagerRoutes: RouteObject[] = [
  { path: 'team', element: <TeamPage /> },
  { path: 'sharing', element: <SharingPage /> },
];

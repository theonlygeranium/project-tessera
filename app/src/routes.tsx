// The app's route tree (lane A). Feature lanes own their route modules; this file
// only mounts them behind the session and role guards. Basename: /app.
import { createBrowserRouter, Navigate } from 'react-router';
import { adminRoutes } from './features/admin/routes';
import { builderRoutes } from './features/builder/routes';
import { instructorRoutes } from './features/instructor/routes';
import { studentRoutes } from './features/student/routes';
import { instructorGradingRoutes, studentGradingRoutes } from './features/grading/routes';
import { TokensPage } from './pages/TokensPage';
import { AppShell } from './shell/AppShell';
import { RequireRole } from './shell/RequireRole';
import { Root } from './shell/Root';

export const router = createBrowserRouter(
  [
    {
      element: <Root />,
      children: [
        { path: 'tokens', element: <TokensPage /> },
        { path: 'sign-in', element: null },
        {
          element: <AppShell />,
          children: [
            { index: true, element: null },
            { element: <RequireRole roles={['administrator']} />, children: adminRoutes },
            { element: <RequireRole roles={['instructor']} />, children: [...instructorRoutes, ...builderRoutes, ...instructorGradingRoutes] },
            { element: <RequireRole roles={['student']} />, children: [...studentRoutes, ...studentGradingRoutes] },
            { path: '*', element: <Navigate to="/" replace /> },
          ],
        },
      ],
    },
  ],
  { basename: '/app' },
);

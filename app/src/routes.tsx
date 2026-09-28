// The app's route tree (lane A). Feature lanes own their route modules; this file
// only mounts them behind the session and role guards. Basename: /app.
import { createBrowserRouter, Navigate } from 'react-router';
import { accessAdminRoutes, accessInstructorRoutes } from './features/access/routes';
import { adminRoutes } from './features/admin/routes';
import { tutorInstructorRoutes } from './features/tutor/routes';
import { builderRoutes } from './features/builder/routes';
import { instructorRoutes } from './features/instructor/routes';
import { studentRoutes } from './features/student/routes';
import { instructorGradingRoutes, studentGradingRoutes } from './features/grading/routes';
import { adminTemplateRoutes, instructorTemplateRoutes } from './features/templates/routes';
import { adminReadinessRoutes, instructorReadinessRoutes } from './features/readiness/routes';
import { instructorVariantRoutes } from './features/variants/routes';
import { adminTrainingRoutes, anyTrainingRoutes, instructorTrainingRoutes, studentTrainingRoutes } from './features/training/routes';
import { adminManagerRoutes, anyManagerRoutes } from './features/managers/routes';
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
            { element: <RequireRole roles={['administrator']} />, children: [...adminRoutes, ...accessAdminRoutes, ...adminTemplateRoutes, ...adminReadinessRoutes, ...adminTrainingRoutes, ...adminManagerRoutes] },
            { element: <RequireRole roles={['instructor']} />, children: [...instructorRoutes, ...builderRoutes, ...instructorGradingRoutes, ...accessInstructorRoutes, ...tutorInstructorRoutes, ...instructorTemplateRoutes, ...instructorReadinessRoutes, ...instructorVariantRoutes, ...instructorTrainingRoutes] },
            { element: <RequireRole roles={['student']} />, children: [...studentRoutes, ...studentGradingRoutes, ...studentTrainingRoutes] },
            // Night 3: any signed-in person (required training, certificates, sharing, the manager view).
            ...anyTrainingRoutes,
            ...anyManagerRoutes,
            { path: '*', element: <Navigate to="/" replace /> },
          ],
        },
      ],
    },
  ],
  { basename: '/app' },
);

import type { RouteObject } from 'react-router';
import { ReadinessPage } from './ReadinessPage';
import { OutcomesPage } from './OutcomesPage';
import { RubricsPage, RubricPage } from './RubricsPage';

export const adminReadinessRoutes: RouteObject[] = [
  { path: 'admin/rubrics', element: <RubricsPage /> },
  { path: 'admin/rubrics/:rubricId', element: <RubricPage /> },
  { path: 'admin/courses/:courseId/readiness', element: <ReadinessPage admin /> },
];
export const instructorReadinessRoutes: RouteObject[] = [
  { path: 'teach/courses/:courseId/readiness', element: <ReadinessPage /> },
  { path: 'teach/courses/:courseId/outcomes', element: <OutcomesPage /> },
];

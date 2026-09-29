import type { RouteObject } from 'react-router';
import { GradesPage, AssignmentEditor, StudentAssignmentPage } from './GradingPages';
import { SetupPage } from '../gradebook/SetupPage';
export const instructorGradingRoutes: RouteObject[] = [
  { path: 'teach/courses/:courseId/grades', element: <GradesPage /> },
  { path: 'teach/courses/:courseId/grades/setup', element: <SetupPage /> },
  { path: 'teach/courses/:courseId/assignments/:assignmentId', element: <AssignmentEditor /> },
];
export const studentGradingRoutes: RouteObject[] = [
  { path: 'courses/:courseId/assignments/:assignmentId', element: <StudentAssignmentPage /> },
];

import type { RouteObject } from 'react-router';
import { GradesPage, AssignmentEditor, StudentAssignmentPage } from './GradingPages';
export const instructorGradingRoutes: RouteObject[] = [
  { path: 'teach/courses/:courseId/grades', element: <GradesPage /> },
  { path: 'teach/courses/:courseId/assignments/:assignmentId', element: <AssignmentEditor /> },
];
export const studentGradingRoutes: RouteObject[] = [
  { path: 'courses/:courseId/assignments/:assignmentId', element: <StudentAssignmentPage /> },
];

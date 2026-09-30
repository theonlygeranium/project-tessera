import type { RouteObject } from 'react-router';
import { GradesPage, AssignmentEditor, StudentAssignmentPage } from './GradingPages';
import { SetupPage } from '../gradebook/SetupPage';
import { HistoryPage } from '../gradebook/HistoryPage';
import { MyGrade } from '../gradebook/MyGrade';
export const instructorGradingRoutes: RouteObject[] = [
  { path: 'teach/courses/:courseId/grades', element: <GradesPage /> },
  { path: 'teach/courses/:courseId/grades/setup', element: <SetupPage /> },
  { path: 'teach/courses/:courseId/grades/history', element: <HistoryPage /> },
  { path: 'teach/courses/:courseId/assignments/:assignmentId', element: <AssignmentEditor /> },
];
export const studentGradingRoutes: RouteObject[] = [
  { path: 'courses/:courseId/assignments/:assignmentId', element: <StudentAssignmentPage /> },
  { path: 'courses/:courseId/grades', element: <MyGrade /> },
];

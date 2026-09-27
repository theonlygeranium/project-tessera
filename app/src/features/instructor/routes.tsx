import type { RouteObject } from 'react-router';
import { Courses } from './Courses';
import { Workspace } from './Workspace';
import { LessonEditor } from './LessonEditor';
import { Announcements } from './Announcements';
import { Roster } from './Roster';
export const instructorRoutes: RouteObject[] = [
  { path: 'teach', element: <Courses /> },
  { path: 'teach/courses/:courseId', element: <Workspace /> },
  { path: 'teach/courses/:courseId/lessons/:lessonId', element: <LessonEditor /> },
  { path: 'teach/courses/:courseId/announcements', element: <Announcements /> },
  { path: 'teach/courses/:courseId/roster', element: <Roster /> },
];

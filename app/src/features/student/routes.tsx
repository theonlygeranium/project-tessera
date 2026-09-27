// Lane G (student). Owns app/src/features/student/. Paths: paths.student in app/src/paths.ts.
import type { RouteObject } from 'react-router';
import { ProfilePage } from './ProfilePage';
import { TodayPage, CoursesPage, AnnouncementsPage } from './StudentPages';
import { CoursePage, LessonPage } from './CoursePages';
export const studentRoutes: RouteObject[] = [
  { path: 'today', element: <TodayPage /> },
  { path: 'onboarding', element: <ProfilePage onboarding /> },
  { path: 'profile', element: <ProfilePage /> },
  { path: 'courses', element: <CoursesPage /> },
  { path: 'courses/:courseId', element: <CoursePage /> },
  { path: 'courses/:courseId/lessons/:lessonId', element: <LessonPage /> },
  { path: 'announcements', element: <AnnouncementsPage /> },
];

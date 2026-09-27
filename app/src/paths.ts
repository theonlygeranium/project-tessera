// Every app URL, in one place, so lanes link to each other consistently.
// Paths are relative to the router's basename (/app).
import type { Role } from '../../shared/domain';

export const paths = {
  signIn: '/sign-in',
  tokens: '/tokens',
  home: (role: Role) => (role === 'administrator' ? paths.admin.overview : role === 'instructor' ? paths.teach.courses : paths.student.today),

  admin: {
    overview: '/admin',
    setup: '/admin/setup',
    people: '/admin/people',
    courses: '/admin/courses',
    course: (courseId: string) => `/admin/courses/${courseId}`,
    policy: '/admin/policy',
    access: '/admin/access',
  },

  teach: {
    courses: '/teach',
    course: (courseId: string) => `/teach/courses/${courseId}`,
    lesson: (courseId: string, lessonId: string) => `/teach/courses/${courseId}/lessons/${lessonId}`,
    announcements: (courseId: string) => `/teach/courses/${courseId}/announcements`,
    roster: (courseId: string) => `/teach/courses/${courseId}/roster`,
    build: (courseId: string) => `/teach/courses/${courseId}/build`,
    buildSession: (courseId: string, sessionId: string) => `/teach/courses/${courseId}/build/${sessionId}`,
    assignment: (courseId: string, id: string) => `/teach/courses/${courseId}/assignments/${id}`,
    gradebook: (courseId: string) => `/teach/courses/${courseId}/grades`,
    access: (courseId: string) => `/teach/courses/${courseId}/access`,
    files: (courseId: string) => `/teach/courses/${courseId}/files`,
    file: (courseId: string, fileId: string) => `/teach/courses/${courseId}/files/${fileId}`,
    generate: (courseId: string) => `/teach/courses/${courseId}/generate`,
    tutor: (courseId: string) => `/teach/courses/${courseId}/tutor`,
  },

  student: {
    today: '/today',
    onboarding: '/onboarding',
    profile: '/profile',
    courses: '/courses',
    course: (courseId: string) => `/courses/${courseId}`,
    lesson: (courseId: string, lessonId: string) => `/courses/${courseId}/lessons/${lessonId}`,
    announcements: '/announcements',
    assignment: (courseId: string, id: string) => `/courses/${courseId}/assignments/${id}`,
  },
} as const;

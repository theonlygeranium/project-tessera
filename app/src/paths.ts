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
    // Night 3
    programs: '/admin/programs',
    program: (programId: string) => `/admin/programs/${programId}`,
    templates: '/admin/templates',
    template: (templateId: string) => `/admin/templates/${templateId}`,
    rubrics: '/admin/rubrics',
    rubric: (rubricId: string) => `/admin/rubrics/${rubricId}`,
    courseReadiness: (courseId: string) => `/admin/courses/${courseId}/readiness`,
    training: '/admin/training',
    compliance: '/admin/compliance',
    reportingLines: '/admin/reporting-lines',
  },

  teach: {
    courses: '/teach',
    course: (courseId: string) => `/teach/courses/${courseId}`,
    lesson: (courseId: string, lessonId: string) => `/teach/courses/${courseId}/lessons/${lessonId}`,
    announcements: (courseId: string) => `/teach/courses/${courseId}/announcements`,
    roster: (courseId: string) => `/teach/courses/${courseId}/roster`,
    build: (courseId: string) => `/teach/courses/${courseId}/build`,
    design: (courseId: string) => `/teach/courses/${courseId}/design`,
    designSession: (courseId: string, sessionId: string) => `/teach/courses/${courseId}/design/${sessionId}`,
    buildSession: (courseId: string, sessionId: string) => `/teach/courses/${courseId}/build/${sessionId}`,
    assignment: (courseId: string, id: string) => `/teach/courses/${courseId}/assignments/${id}`,
    gradebook: (courseId: string) => `/teach/courses/${courseId}/grades`,
    access: (courseId: string) => `/teach/courses/${courseId}/access`,
    files: (courseId: string) => `/teach/courses/${courseId}/files`,
    file: (courseId: string, fileId: string) => `/teach/courses/${courseId}/files/${fileId}`,
    generate: (courseId: string) => `/teach/courses/${courseId}/generate`,
    tutor: (courseId: string) => `/teach/courses/${courseId}/tutor`,
    // Night 3
    readiness: (courseId: string) => `/teach/courses/${courseId}/readiness`,
    outcomes: (courseId: string) => `/teach/courses/${courseId}/outcomes`,
    template: (courseId: string) => `/teach/courses/${courseId}/template`,
    variants: (courseId: string, lessonId: string) => `/teach/courses/${courseId}/lessons/${lessonId}/variants`,
    variant: (courseId: string, lessonId: string, variantId: string) => `/teach/courses/${courseId}/lessons/${lessonId}/variants/${variantId}`,
    testOut: (courseId: string) => `/teach/courses/${courseId}/test-out`,
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
    testOut: (courseId: string) => `/courses/${courseId}/test-out`,
  },

  /** Night 3: pages for any signed-in person (required training can apply to anyone; a manager is a relationship, not a role). */
  me: {
    training: '/training',
    trainingCourse: (courseId: string) => `/training/courses/${courseId}`,
    trainingLesson: (courseId: string, lessonId: string) => `/training/courses/${courseId}/lessons/${lessonId}`,
    trainingTestOut: (courseId: string) => `/training/courses/${courseId}/test-out`,
    certificate: (certificateId: string) => `/certificates/${certificateId}`,
    sharing: '/sharing',
    team: '/team',
  },

  /** Public, outside the app and Cloudflare Access: served by the Worker (D-027). */
  verify: (code: string) => `/verify/${encodeURIComponent(code)}`,
} as const;

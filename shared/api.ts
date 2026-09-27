// The Tessera API contract (Night 1, lane A). One table drives three things:
//   1. the Worker router (worker/): method, path, and which roles may call it;
//   2. the app's HTTP adapter (app/src/data/http.ts), generically;
//   3. the app's mock adapter (app/src/data/mock.ts), which must behave the same.
//
// Every operation takes one input object (or none) and returns JSON.
// Path parameters (":courseId") are read from the input object by name. For GET and
// DELETE the remaining input fields become the query string; otherwise they're the
// JSON body. Role rules here are the first check; handlers also check resource
// access (an instructor must teach the course, a student must be enrolled).
import type {
  AiPolicy, Announcement, Block, BlockContent, BuilderSession, CheckResult, Course, CourseBrief, CourseOutline,
  CourseSummary, Id, Institution, LearningProfile, Lesson, LessonDetail, LessonProgress, LessonProgressState, Module,
  OutlineDraft, Overview, Provenance, Role, RosterEntry, StudentLesson, Today, User,
} from './domain';

export interface SessionInfo {
  user: User | null;
  institution: Institution;
}

/** A block as the editor sends it: existing blocks keep their id; new ones have none. */
export type BlockInput = { id?: Id } & BlockContent;

export type Ok = { ok: true };

/** Every operation: its input and output. */
export interface ApiSpec {
  // Session and demo sign-in (D-014: a persona picker behind Cloudflare Access)
  getSession: { input: void; output: SessionInfo };
  signIn: { input: { userId: Id }; output: SessionInfo };
  signOut: { input: void; output: Ok };
  listDemoUsers: { input: void; output: User[] };
  resetDemo: { input: void; output: Ok };

  // Administrator
  updateInstitution: { input: Partial<Pick<Institution, 'name' | 'shortName' | 'accent' | 'setupComplete'>>; output: Institution };
  updatePolicy: { input: AiPolicy; output: Institution };
  getOverview: { input: void; output: Overview };
  listUsers: { input: { role?: Role }; output: User[] };
  createUser: { input: { name: string; email: string; role: Role }; output: User };
  /** CSV with a header row: name,email,role */
  importUsers: { input: { csv: string }; output: { created: User[]; errors: { line: number; message: string }[] } };
  updateUser: { input: { userId: Id; name?: string; role?: Role }; output: User };

  // Courses
  listCourses: { input: void; output: CourseSummary[] };
  createCourse: { input: { code: string; title: string; term: string; description?: string }; output: Course };
  getCourseOutline: { input: { courseId: Id }; output: CourseOutline };
  updateCourse: {
    input: { courseId: Id } & Partial<Pick<Course, 'code' | 'title' | 'term' | 'description' | 'welcome' | 'outcomes'>>;
    output: Course;
  };
  setCourseInstructors: { input: { courseId: Id; userIds: Id[] }; output: Course };
  getCourseEnrollments: { input: { courseId: Id }; output: { userIds: Id[] } };
  setCourseEnrollments: { input: { courseId: Id; userIds: Id[] }; output: { userIds: Id[] } };
  getRoster: { input: { courseId: Id }; output: RosterEntry[] };

  // Course structure (instructor)
  createModule: { input: { courseId: Id; title: string }; output: Module };
  updateModule: { input: { moduleId: Id; title?: string; position?: number }; output: Module };
  /** Only an empty module can be deleted (409 otherwise). */
  deleteModule: { input: { moduleId: Id }; output: Ok };
  createLesson: { input: { moduleId: Id; title: string; minutes?: number }; output: Lesson };
  updateLesson: { input: { lessonId: Id; title?: string; minutes?: number; position?: number; moduleId?: Id }; output: Lesson };
  deleteLesson: { input: { lessonId: Id }; output: Ok };
  getLesson: { input: { lessonId: Id }; output: LessonDetail };
  /**
   * Replaces the lesson's blocks, in order. Blocks with an id keep their origin and AI
   * state; editing an AI draft keeps it a draft (a person still has to keep it) and
   * records the prior content in `previous`. Blocks without an id are new human blocks.
   */
  saveBlocks: { input: { lessonId: Id; blocks: BlockInput[] }; output: LessonDetail };
  /** A person keeps an AI draft block (D-003). */
  keepBlock: { input: { blockId: Id }; output: LessonDetail };
  /** Restores `previous`; an AI block with no previous content is removed. */
  revertBlock: { input: { blockId: Id }; output: LessonDetail };
  /** Asks the AI for a new version; the block becomes a draft with `previous` set. */
  regenerateBlock: { input: { blockId: Id; instruction?: string }; output: LessonDetail };
  /** 409 `not-ready` (with the ReadinessReport as `details`) unless the lesson is ready. */
  publishLesson: { input: { lessonId: Id }; output: Lesson };
  unpublishLesson: { input: { lessonId: Id }; output: Lesson };

  // Student
  saveProfile: { input: Omit<LearningProfile, 'completedAt'>; output: User };
  getToday: { input: void; output: Today };
  getStudentLesson: { input: { lessonId: Id }; output: StudentLesson };
  answerCheck: { input: { lessonId: Id; blockId: Id; optionId: string }; output: CheckResult };
  setLessonProgress: { input: { lessonId: Id; state: Exclude<LessonProgressState, 'not-started'> }; output: LessonProgress };

  // Announcements (communication center)
  listAnnouncements: { input: { courseId?: Id }; output: Announcement[] };
  /**
   * `aiDraft` marks an announcement that started from `draftAnnouncement`; it's
   * stored with origin "ai". Publishing it counts as the instructor keeping it.
   */
  createAnnouncement: {
    input: { courseId: Id; title: string; body: string; pinned: boolean; publish: boolean; aiDraft?: Provenance };
    output: Announcement;
  };
  updateAnnouncement: {
    input: { announcementId: Id; title?: string; body?: string; pinned?: boolean; publish?: boolean };
    output: Announcement;
  };
  deleteAnnouncement: { input: { announcementId: Id }; output: Ok };
  markAnnouncementRead: { input: { announcementId: Id }; output: Ok };
  draftAnnouncement: { input: { courseId: Id; prompt: string }; output: { title: string; body: string; provenance: Provenance } };

  // AI course builder (lane F, #20)
  listBuilderSessions: { input: { courseId: Id }; output: BuilderSession[] };
  /** Creates a session and drafts the brief from the prompt and sources. */
  createBuilderSession: { input: { courseId: Id; prompt: string; sources: { name: string; text: string }[] }; output: BuilderSession };
  getBuilderSession: { input: { sessionId: Id }; output: BuilderSession };
  updateBuilderSession: { input: { sessionId: Id; brief?: CourseBrief; outline?: OutlineDraft }; output: BuilderSession };
  generateOutline: { input: { sessionId: Id }; output: BuilderSession };
  /** Creates modules, lessons, and AI draft blocks in the course from the outline. */
  generateDrafts: { input: { sessionId: Id }; output: BuilderSession };
}

export type Operation = keyof ApiSpec;
export type Input<K extends Operation> = ApiSpec[K]['input'];
export type Output<K extends Operation> = ApiSpec[K]['output'];

/** The client-side API: one async function per operation. */
export type TesseraApi = {
  [K in Operation]: Input<K> extends void ? () => Promise<Output<K>> : (input: Input<K>) => Promise<Output<K>>;
};

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/** `public`: anyone; `signed-in`: any persona; otherwise the listed roles. */
export type Access = 'public' | 'signed-in' | Role[];

export interface Route {
  method: HttpMethod;
  path: string;
  access: Access;
}

const ADMIN: Role[] = ['administrator'];
const STAFF: Role[] = ['administrator', 'instructor'];
const INSTRUCTOR: Role[] = ['instructor'];
const STUDENT: Role[] = ['student'];

/** Permissions as data (D-011 foundations): the Worker and the mock adapter both enforce this table. */
export const ROUTES: { [K in Operation]: Route } = {
  getSession: { method: 'GET', path: '/api/session', access: 'public' },
  signIn: { method: 'POST', path: '/api/session', access: 'public' },
  signOut: { method: 'DELETE', path: '/api/session', access: 'public' },
  listDemoUsers: { method: 'GET', path: '/api/demo/users', access: 'public' },
  resetDemo: { method: 'POST', path: '/api/demo/reset', access: ADMIN },

  updateInstitution: { method: 'PATCH', path: '/api/institution', access: ADMIN },
  updatePolicy: { method: 'PUT', path: '/api/institution/policy', access: ADMIN },
  getOverview: { method: 'GET', path: '/api/overview', access: ADMIN },
  listUsers: { method: 'GET', path: '/api/users', access: ADMIN },
  createUser: { method: 'POST', path: '/api/users', access: ADMIN },
  importUsers: { method: 'POST', path: '/api/users/import', access: ADMIN },
  updateUser: { method: 'PATCH', path: '/api/users/:userId', access: ADMIN },

  listCourses: { method: 'GET', path: '/api/courses', access: 'signed-in' },
  createCourse: { method: 'POST', path: '/api/courses', access: ADMIN },
  getCourseOutline: { method: 'GET', path: '/api/courses/:courseId', access: 'signed-in' },
  updateCourse: { method: 'PATCH', path: '/api/courses/:courseId', access: STAFF },
  setCourseInstructors: { method: 'PUT', path: '/api/courses/:courseId/instructors', access: ADMIN },
  getCourseEnrollments: { method: 'GET', path: '/api/courses/:courseId/enrollments', access: STAFF },
  setCourseEnrollments: { method: 'PUT', path: '/api/courses/:courseId/enrollments', access: ADMIN },
  getRoster: { method: 'GET', path: '/api/courses/:courseId/roster', access: STAFF },

  createModule: { method: 'POST', path: '/api/courses/:courseId/modules', access: INSTRUCTOR },
  updateModule: { method: 'PATCH', path: '/api/modules/:moduleId', access: INSTRUCTOR },
  deleteModule: { method: 'DELETE', path: '/api/modules/:moduleId', access: INSTRUCTOR },
  createLesson: { method: 'POST', path: '/api/modules/:moduleId/lessons', access: INSTRUCTOR },
  updateLesson: { method: 'PATCH', path: '/api/lessons/:lessonId', access: INSTRUCTOR },
  deleteLesson: { method: 'DELETE', path: '/api/lessons/:lessonId', access: INSTRUCTOR },
  getLesson: { method: 'GET', path: '/api/lessons/:lessonId', access: STAFF },
  saveBlocks: { method: 'PUT', path: '/api/lessons/:lessonId/blocks', access: INSTRUCTOR },
  keepBlock: { method: 'POST', path: '/api/blocks/:blockId/keep', access: INSTRUCTOR },
  revertBlock: { method: 'POST', path: '/api/blocks/:blockId/revert', access: INSTRUCTOR },
  regenerateBlock: { method: 'POST', path: '/api/blocks/:blockId/regenerate', access: INSTRUCTOR },
  publishLesson: { method: 'POST', path: '/api/lessons/:lessonId/publish', access: INSTRUCTOR },
  unpublishLesson: { method: 'POST', path: '/api/lessons/:lessonId/unpublish', access: INSTRUCTOR },

  saveProfile: { method: 'PUT', path: '/api/me/profile', access: STUDENT },
  getToday: { method: 'GET', path: '/api/me/today', access: STUDENT },
  getStudentLesson: { method: 'GET', path: '/api/me/lessons/:lessonId', access: STUDENT },
  answerCheck: { method: 'POST', path: '/api/me/lessons/:lessonId/checks/:blockId', access: STUDENT },
  setLessonProgress: { method: 'POST', path: '/api/me/lessons/:lessonId/progress', access: STUDENT },

  listAnnouncements: { method: 'GET', path: '/api/announcements', access: 'signed-in' },
  createAnnouncement: { method: 'POST', path: '/api/courses/:courseId/announcements', access: INSTRUCTOR },
  updateAnnouncement: { method: 'PATCH', path: '/api/announcements/:announcementId', access: INSTRUCTOR },
  deleteAnnouncement: { method: 'DELETE', path: '/api/announcements/:announcementId', access: INSTRUCTOR },
  markAnnouncementRead: { method: 'POST', path: '/api/announcements/:announcementId/read', access: 'signed-in' },
  draftAnnouncement: { method: 'POST', path: '/api/ai/announcement', access: INSTRUCTOR },

  listBuilderSessions: { method: 'GET', path: '/api/courses/:courseId/builder', access: INSTRUCTOR },
  createBuilderSession: { method: 'POST', path: '/api/courses/:courseId/builder', access: INSTRUCTOR },
  getBuilderSession: { method: 'GET', path: '/api/builder/:sessionId', access: INSTRUCTOR },
  updateBuilderSession: { method: 'PATCH', path: '/api/builder/:sessionId', access: INSTRUCTOR },
  generateOutline: { method: 'POST', path: '/api/builder/:sessionId/outline', access: INSTRUCTOR },
  generateDrafts: { method: 'POST', path: '/api/builder/:sessionId/draft', access: INSTRUCTOR },
};

// ---- Errors ------------------------------------------------------------------------------

export type ApiErrorCode =
  | 'unauthenticated' // 401: no persona signed in
  | 'forbidden' //       403: wrong role, or not your course
  | 'not-found' //       404
  | 'invalid' //         400: bad input; `details` may list field errors
  | 'conflict' //        409: for example deleting a non-empty module
  | 'not-ready' //       409: publish blocked; `details` is the ReadinessReport
  | 'ai-disabled' //     403: the administrator turned AI authoring off
  | 'ai-failed'; //      502: the model call failed or returned unusable output

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  'not-found': 404,
  invalid: 400,
  conflict: 409,
  'not-ready': 409,
  'ai-disabled': 403,
  'ai-failed': 502,
};

/** Error body: `{ error: { code, message, details? } }` */
export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(public code: ApiErrorCode, message: string, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
  get status() {
    return ERROR_STATUS[this.code];
  }
}

// ---- Path helpers shared by the router and the HTTP client ---------------------------

/** Names of the `:params` in a route path. */
export function pathParams(path: string): string[] {
  return [...path.matchAll(/:(\w+)/g)].map((m) => m[1]);
}

/** Fills a route path from the input object; returns the path and the remaining fields. */
export function fillPath(path: string, input: Record<string, unknown> = {}) {
  const rest: Record<string, unknown> = { ...input };
  const filled = path.replace(/:(\w+)/g, (_, name: string) => {
    const value = rest[name];
    delete rest[name];
    if (typeof value !== 'string' || !value) throw new ApiError('invalid', `Missing path parameter "${name}"`);
    return encodeURIComponent(value);
  });
  return { path: filled, rest };
}

/** Matches a concrete path against a route path; returns the params or null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const names: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, n: string) => { names.push(n); return '([^/]+)'; }) + '/?$');
  const m = re.exec(path);
  if (!m) return null;
  return Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
}

// Re-exported so callers can import everything from one module.
export type { Block };

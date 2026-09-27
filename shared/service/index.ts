import type { Service } from './context';
import { session } from './session';
import { admin } from './admin';
import { courses } from './courses';
import { contentHandlers } from './content';
import { student } from './student';
import { announcements } from './announcements';
import { builder } from './builder';

export const service: Service = { ...session, ...admin, ...courses, ...contentHandlers, ...student, ...announcements, ...builder };
export { dispatch } from './context';
export type { ServiceContext, Service } from './context';
export { MemoryRepo } from './memory-repo';
export { validateBlockContent } from './validate';

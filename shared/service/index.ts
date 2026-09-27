import type { Service } from './context';
import { session } from './session';
import { admin } from './admin';
import { courses } from './courses';
import { contentHandlers } from './content';
import { student } from './student';
import { announcements } from './announcements';
import { builder } from './builder';
import { tokens } from './tokens';
import { access } from './access';
import { files } from './files';
import { grading } from './grading';
import { generation } from './generation';

import { ApiError, ROUTES, type Operation } from '../api';
import type { Handler } from './context';

const implemented = { ...session, ...admin, ...courses, ...contentHandlers, ...student, ...announcements, ...builder, ...tokens, ...access, ...files, ...grading, ...generation };
// Night 2 lanes replace these stubs as they land (a 501-style error until then).
const pending = Object.fromEntries(
  (Object.keys(ROUTES) as Operation[]).filter((op) => !(op in implemented)).map((op) => [op, (async () => { throw new ApiError('conflict', `${op} is not available yet`); }) as Handler<Operation>]),
);
export const service = { ...pending, ...implemented } as Service;
export { dispatch } from './context';
export type { ServiceContext, Service, DocumentEngine } from './context';
export { canReadFile } from './files';
export { MemoryRepo } from './memory-repo';
export { validateBlockContent } from './validate';

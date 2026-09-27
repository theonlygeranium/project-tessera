// The service: one handler per API operation (shared/api.ts). Lane C1 replaces these
// stubs with real handlers, split across modules in this folder.
import { ApiError, ROUTES, type Operation } from '../api';
import type { Handler, Service } from './context';

const notImplemented = (op: Operation): Handler<Operation> => async () => {
  throw new ApiError('conflict', `${op} is not implemented yet`);
};

export const service = Object.fromEntries(
  (Object.keys(ROUTES) as Operation[]).map((op) => [op, notImplemented(op)]),
) as unknown as Service;

export { dispatch } from './context';
export type { ServiceContext, Service } from './context';

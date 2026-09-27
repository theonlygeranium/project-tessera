// The service layer: every API operation implemented once, over a Repo and an AiClient.
// The Worker (worker/) and the app's mock adapter (app/src/data/mock.ts) both call
// `dispatch`, so they behave the same by construction.
import type { AiClient } from '../ai';
import { ApiError, ROUTES, type Input, type Operation, type Output } from '../api';
import type { ApiToken, Id, Timestamp, User } from '../domain';
import { allows } from '../policy';
import type { Repo } from '../repo';

export interface ServiceContext {
  repo: Repo;
  ai: AiClient;
  /** The signed-in persona, or null. */
  user: User | null;
  /** The API token the request was made with, when it wasn't a browser session (D-020). */
  token?: ApiToken | null;
  now(): Timestamp;
  /** A new unique id with a readable prefix, for example newId('l') → "l-3f9c…". */
  newId(prefix: string): Id;
}

export type Handler<K extends Operation> = (ctx: ServiceContext, input: Input<K>) => Promise<Output<K>>;
export type Service = { [K in Operation]: Handler<K> };

/** Checks the route's role rule (ROUTES), then runs the handler. */
export async function dispatch<K extends Operation>(service: Service, ctx: ServiceContext, op: K, input: Input<K>): Promise<Output<K>> {
  const route = ROUTES[op];
  if (!allows(route.access, ctx.user)) {
    throw ctx.user ? new ApiError('forbidden', 'Your role can\'t do this.') : new ApiError('unauthenticated', 'Sign in first.');
  }
  return service[op](ctx, (input ?? {}) as Input<K>);
}

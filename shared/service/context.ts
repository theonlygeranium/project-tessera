// The service layer: every API operation implemented once, over a Repo and an AiClient.
// The Worker (worker/) and the app's mock adapter (app/src/data/mock.ts) both call
// `dispatch`, so they behave the same by construction.
import type { AiClient } from '../ai';
import { ApiError, ROUTES, type Input, type Operation, type Output } from '../api';
import type { AccessReport, AccessibleFormat, ApiToken, Block, FileRecord, Id, Provenance, Timestamp, User } from '../domain';
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
  /** The document engine (D-022): parsers, fixers, format generation, AI suggestions. The Worker provides it; mock mode has none. */
  documents?: DocumentEngine | null;
  /** Grants an email access to the application through its identity directory. */
  directory?: Directory | null;
  /**
   * Night 3: background work (Cloudflare Workflows in production). When absent, generation
   * jobs advance on each status poll (previews, local, and demo mode).
   */
  background?: { startGeneration(jobId: Id): Promise<void> } | null;
  /** Set when an assistant calls through the MCP server: content it writes is an AI draft a person keeps (D-003). */
  agent?: { name: string } | null;
}

export interface Directory {
  /** Idempotent: an email already present succeeds without changing the directory. */
  grant(email: string): Promise<void>;
}

/** What the Worker's document engine offers the service (implemented in worker/access/engine.ts). */
export interface DocumentEngine {
  scan(file: FileRecord): Promise<AccessReport>;
  /** Applies a fix as a new version and returns the updated record (new key and version). */
  fix(file: FileRecord, fix: Input<'fixFileIssue'>['fix'], userId: Id): Promise<FileRecord>;
  suggest(target: { kind: 'alt-text' | 'rewrite' | 'link-text'; courseTitle: string } & ({ block: Block } | { file: FileRecord; element: number }), ctx: ServiceContext): Promise<{ suggestion: string; provenance: Provenance }>;
  /** Generates a format and returns the R2 key of the output. */
  generateFormat(file: FileRecord, format: AccessibleFormat): Promise<string>;
  /** Deletes the file's objects from storage. */
  remove(file: FileRecord): Promise<void>;
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

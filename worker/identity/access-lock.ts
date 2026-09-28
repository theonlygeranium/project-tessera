// Serialized Access group writes (Night 3 carry-over 1, D-021). Granting access reads
// the Access group and writes it back with one more email. Two invitations handled by
// different Worker instances at the same moment could both read the old group, and the
// second write would drop the first email. One Durable Object per group runs grants one
// at a time, so every read sees the previous write.
import { DurableObject } from 'cloudflare:workers';
import { ApiError } from '../../shared/api';
import type { Directory } from '../../shared/service';
import type { Env } from '../env';
import { createAccessDirectory } from './access-directory';

type GrantResult = { ok: true } | { ok: false; message: string };

export class AccessGroupLock extends DurableObject<Env> {
  /** The tail of the queue: each grant starts after the previous one settles. */
  private tail: Promise<unknown> = Promise.resolve();

  /** RPC: add one email to the group. Errors come back as a message (ApiError doesn't survive RPC). */
  async grant(email: string): Promise<GrantResult> {
    const run = this.tail.then(() => this.directory().grant(email));
    this.tail = run.catch(() => undefined);
    try {
      await run;
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message };
    }
  }

  private directory(): Directory {
    const env = this.env as Env;
    if (!env.CF_ACCESS_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID || !env.ACCESS_GROUP_ID) {
      throw new ApiError('conflict', "Access couldn't be updated: Access isn't configured for this environment.");
    }
    return createAccessDirectory({ token: env.CF_ACCESS_API_TOKEN, accountId: env.CLOUDFLARE_ACCOUNT_ID, groupId: env.ACCESS_GROUP_ID });
  }
}

/** A Directory whose grants go through the group's lock. */
export function lockedDirectory(namespace: Pick<DurableObjectNamespace<AccessGroupLock>, 'get' | 'idFromName'>, groupId: string): Directory {
  return {
    async grant(email: string): Promise<void> {
      const stub = namespace.get(namespace.idFromName(groupId));
      const result = await stub.grant(email);
      if (!result.ok) throw new ApiError('conflict', result.message);
    },
  };
}

// The mock adapter: the real service layer (shared/service) over an in-memory repo,
// seeded with the demo data. Used by `?data=mock` (the a11y audit, docs screenshots,
// and UI work before the API is running). Behaves like the Worker by construction.
// State lives in memory, so a full page load starts from the seed again.
import { fixtureAi } from '../../../shared/ai';
import { ROUTES, type Operation, type TesseraApi } from '../../../shared/api';
import type { User } from '../../../shared/domain';
import { SEED_NOW, seedData } from '../../../shared/seed';
import { MemoryRepo, dispatch, service, type ServiceContext } from '../../../shared/service';

export function createMockApi(options: { signedInAs?: string | null } = {}): TesseraApi {
  const repo = new MemoryRepo(seedData());
  let userId: string | null = options.signedInAs ?? null;
  let counter = 0;
  // A clock that starts at the seed's "now" and moves forward in real time, so new
  // items sort after seeded ones and relative dates stay stable in screenshots.
  const started = Date.now();
  const now = () => new Date(Date.parse(SEED_NOW) + (Date.now() - started)).toISOString();

  async function context(): Promise<ServiceContext> {
    const user: User | null = userId ? await repo.getUser(userId) : null;
    return { repo, ai: fixtureAi, user, now, newId: (p) => `${p}-mock${++counter}` };
  }

  return Object.fromEntries(
    (Object.keys(ROUTES) as Operation[]).map((op) => [
      op,
      async (input?: unknown) => {
        // Let the UI show loading states, as it would with a network.
        await new Promise((r) => setTimeout(r, 30));
        const result = await dispatch(service, await context(), op, input as never);
        if (op === 'signIn') userId = (input as { userId: string }).userId;
        if (op === 'signOut') userId = null;
        return structuredClone(result);
      },
    ]),
  ) as unknown as TesseraApi;
}

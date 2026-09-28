// Background generation (Night 3 carry-over 4). In production, `generateAtScope` hands a
// job to this Workflow, which advances it one batch per durable step, so a job finishes
// even when nobody keeps the page open. Previews, local development, and demo mode have
// no Workflow binding and keep the poll-driven path (Workflows aren't provisioned per
// preview). The drafts are the same AI drafts either way (D-003).
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import type { Env } from './env';
import { D1Repo } from './d1-repo';
import { advanceGenerationJob } from '../shared/service/generation';
import { serviceContextFor } from './index';

export interface GenerationParams { jobId: string }

/** Enough steps for the largest job (60 elements, two per step) with room for retries. */
const MAX_STEPS = 40;

export class GenerationWorkflow extends WorkflowEntrypoint<Env, GenerationParams> {
  async run(event: WorkflowEvent<GenerationParams>, step: WorkflowStep): Promise<string> {
    const { jobId } = event.payload;
    for (let i = 0; i < MAX_STEPS; i++) {
      const state = await step.do(`advance ${i}`, { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' }, timeout: '5 minutes' }, async () => {
        const env = this.env as Env;
        const repo = new D1Repo(env.DB);
        const job = await repo.getGenerationJob(jobId);
        // Polling took over (the Workflow stalled) or the job is finished: stop.
        if (!job || job.state !== 'running' || job.runner !== 'workflow') return 'stopped';
        const user = await repo.getUser(job.requestedBy);
        if (!user) return 'stopped';
        const ctx = serviceContextFor(env, repo, user);
        return (await advanceGenerationJob(ctx, job)).state;
      });
      if (state !== 'running') return state;
    }
    return 'running';
  }
}

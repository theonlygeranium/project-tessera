// Logging for the service layer. `console` exists in Workers, browsers, and Node,
// but shared/ compiles without DOM or Node types, so it's declared here.
declare const console: { error(...args: unknown[]): void };
import { ApiError } from '../api';

/** Records why an operation failed (Worker logs, browser console) without exposing it to users. */
export function logError(...args: unknown[]): void {
  console.error(...args);
}

export function safeAiLog(task: string, error: unknown, ids: Record<string, string> = {}): void {
  const details = error instanceof ApiError && error.details && typeof error.details === 'object' ? error.details as Record<string, unknown> : null;
  console.error('AI task failed', { task, status: typeof details?.status === 'number' ? details.status : null, category: error instanceof ApiError ? error.code : 'unexpected', ...ids });
}

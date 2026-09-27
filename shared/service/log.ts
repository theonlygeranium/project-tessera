// Logging for the service layer. `console` exists in Workers, browsers, and Node,
// but shared/ compiles without DOM or Node types, so it's declared here.
declare const console: { error(...args: unknown[]): void };

/** Records why an operation failed (Worker logs, browser console) without exposing it to users. */
export function logError(...args: unknown[]): void {
  console.error(...args);
}

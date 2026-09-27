// Bindings and vars for the Tessera Worker (D-014). Preview deployments set the
// same names under `previews` in wrangler.jsonc; they are not inherited.
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ENVIRONMENT: 'production' | 'preview' | 'local';
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  WRITER_API_KEY?: string;
  AI_GATEWAY_URL?: string;
}

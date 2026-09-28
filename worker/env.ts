// Bindings and vars for the Tessera Worker (D-014). Preview deployments set the
// same names under `previews` in wrangler.jsonc; they are not inherited.
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ENVIRONMENT: 'production' | 'preview' | 'local';
  ACCESS_TEAM_DOMAIN: string;
  /** Comma-separated Access emails allowed to use the demo persona picker outside local dev. */
  OWNER_EMAILS?: string;
  ACCESS_AUD: string;
  WRITER_API_KEY?: string;
  AI_GATEWAY_URL?: string;
  /** Uploaded files, versions, and generated formats (D-019). */
  FILES: R2Bucket;
  /** Workers AI: audio, OCR and vision fallback, transcription (D-019). */
  AI: Ai;
  /** OCR container (D-022, option B): OCRmyPDF + Tesseract. Absent in tests and plain local dev. */
  OCR?: DurableObjectNamespace<import('./ocr').OcrContainer>;
  /** How many OCR instances to spread across; must match the environment's container max_instances. */
  OCR_INSTANCES?: string;
  /** Night 3: serializes Access group writes, one instance per group (carry-over 1). Absent in tests. */
  /** Night 3: background generation (production only; previews poll instead). */
  GENERATION?: Workflow<import('./generation-workflow').GenerationParams>;
  ACCESS_LOCK?: DurableObjectNamespace<import('./identity/access-lock').AccessGroupLock>;
  /** Lane G (D-021): a Cloudflare API token scoped to Access groups, and the group invitations add to. */
  CF_ACCESS_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  ACCESS_GROUP_ID?: string;
}

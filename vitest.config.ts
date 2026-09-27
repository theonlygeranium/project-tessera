// Unit tests for the shared service layer, the Worker, and app logic (Night 1).
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The Workers runtime module, stubbed for Node (see worker/test/cloudflare-workers-stub.ts).
  resolve: { alias: { 'cloudflare:workers': fileURLToPath(new URL('./worker/test/cloudflare-workers-stub.ts', import.meta.url)) } },
  test: {
    server: { deps: { inline: ['@cloudflare/containers'] } },
    include: ['shared/**/*.test.ts', 'worker/**/*.test.ts', 'app/src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
});

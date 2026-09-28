// Unit tests for the shared service layer, the Worker, and app logic (Night 1).
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [{ name: 'ttf-arraybuffer', enforce: 'pre', load(id) {
    if (!id.endsWith('.ttf')) return null;
    const encoded = readFileSync(id).toString('base64');
    return `export default Uint8Array.from(atob(${JSON.stringify(encoded)}), c => c.charCodeAt(0)).buffer;`;
  } }],
  // The Workers runtime module, stubbed for Node (see worker/test/cloudflare-workers-stub.ts).
  resolve: { alias: { 'cloudflare:workers': fileURLToPath(new URL('./worker/test/cloudflare-workers-stub.ts', import.meta.url)) } },
  test: {
    server: { deps: { inline: ['@cloudflare/containers'] } },
    include: ['shared/**/*.test.ts', 'worker/**/*.test.ts', 'app/src/**/*.test.ts', 'tools/**/*.test.ts', 'sdk/**/*.test.ts'],
  },
});

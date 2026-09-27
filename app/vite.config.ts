// Vite config for the Phase 2 component app (D-011).
// Source lives in app/; the build goes to docs/app/ (gitignored), which
// Cloudflare serves at /app/. Cloudflare runs `npm run build` on every push
// through wrangler.jsonc → build.command.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('.'),
  base: '/app/',
  plugins: [react()],
  build: {
    outDir: here('../docs/app'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // The app imports design/tokens.json from outside app/.
    fs: { allow: [here('..')] },
  },
});

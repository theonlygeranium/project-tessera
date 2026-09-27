// Unit tests for the shared service layer, the Worker, and app logic (Night 1).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'worker/**/*.test.ts', 'app/src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
});

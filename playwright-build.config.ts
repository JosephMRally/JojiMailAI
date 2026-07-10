/**
 * End-to-end test for the full build + dev flow (npm run build -- --provider=vite && npm run dev -- --provider=vite).
 * This config runs the build first, then starts the dev server, and verifies the app displays
 * the seeded demo emails. Run with: npx playwright test -c playwright-build.config.ts
 */
import { defineConfig } from '@playwright/test';

const PORT = 4189;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/build-flow.spec.ts',
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npm run build -- --provider=vite && node scripts/dev.mjs --provider=vite --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
  },
});

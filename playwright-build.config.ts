/**
 * End-to-end test for the full build + dev flow (npm run build -- --provider=fake && npm run dev).
 * This config runs the build first, then starts the dev server, and verifies the app displays
 * fake test emails. Run with: npx playwright test -c playwright-build.config.ts
 */
import { defineConfig } from '@playwright/test';

const PORT = 4189;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/build-flow.spec.ts',
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npm run build -- --provider=fake && npx vite --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
  },
});

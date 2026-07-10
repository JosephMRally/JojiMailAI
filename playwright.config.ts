/**
 * End-to-end suite config (user-stories/typescript_email_ui.md): serves the
 * app with the demo provider (`npm run dev -- --provider=vite` → MODE 'vite' →
 * FakeProvider) and drives a real browser over the seeded demo mailbox.
 * Run with: npx playwright test
 */
import { defineConfig } from '@playwright/test';

const PORT = 4188;

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `node scripts/dev.mjs --provider=vite --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});

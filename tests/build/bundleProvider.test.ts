/// <reference types="node" />
/**
 * Build story (user-stories/typescript_email_ui.md): `--provider=<id>` is 1:1
 * with a single provider class — a production bundle includes only the selected
 * provider's implementation and dead-code-eliminates every other one. The only
 * way to observe what a bundle actually contains is to build it, so this runs a
 * real `vite build` for each provider into a throwaway outDir and greps the
 * emitted JS for the OTHER provider's unique marker, which must be absent.
 *
 * Slower than the io-mocked scripts/runBuild tests in build.test.ts (it shells
 * out to Vite), hence its own file. VITE_MAIL_PROVIDER is passed in the child's
 * process env, which Vite prefers over .env.local.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

/** A string unique to each provider's compiled implementation. */
const GMAIL_MARKER = 'gmail.googleapis.com/gmail/v'; // GmailProvider's REST base
const FAKE_MARKER = 'fake-page-'; // FakeProvider's PAGE_TOKEN_PREFIX

const BUILD_TIMEOUT_MS = 120_000;
const tempDirs: string[] = [];

/** Build the app for one provider into a throwaway outDir; return all emitted JS concatenated. */
function buildBundleJs(provider: string): string {
  const outDir = mkdtempSync(join(tmpdir(), `joji-bundle-${provider}-`));
  tempDirs.push(outDir);
  execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: projectRoot,
    env: { ...process.env, VITE_MAIL_PROVIDER: provider },
    stdio: 'pipe',
  });
  const assets = join(outDir, 'assets');
  return readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(assets, name), 'utf8'))
    .join('\n');
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('story: --provider=<id> ships exactly one provider class', () => {
  it(
    'a gmail build contains GmailProvider and excludes FakeProvider',
    () => {
      const js = buildBundleJs('gmail');
      expect(js).toContain(GMAIL_MARKER);
      expect(js).not.toContain(FAKE_MARKER);
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'a fake build contains FakeProvider and excludes GmailProvider',
    () => {
      const js = buildBundleJs('fake');
      expect(js).toContain(FAKE_MARKER);
      expect(js).not.toContain(GMAIL_MARKER);
    },
    BUILD_TIMEOUT_MS,
  );
});

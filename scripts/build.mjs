#!/usr/bin/env node
/**
 * The production build entry for `npm run build` (spec:
 * user-stories/typescript_email_ui.md): requires an explicit
 * `--provider=<id>` flag — `npm run build -- --provider=gmail` — and throws
 * before any compilation starts when it is missing or unknown. The chosen id
 * reaches the app as VITE_MAIL_PROVIDER, which the composition root uses to
 * register exactly that provider.
 */
import { spawnSync } from 'node:child_process';
import { resolveProviderFlag } from './providerFlag.mjs';

const provider = resolveProviderFlag(process.argv.slice(2)); // throws on bad/missing flag

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Building for provider: ${provider}`);
run('npx', ['tsc', '-b']);
run('npx', ['vite', 'build'], { VITE_MAIL_PROVIDER: provider });

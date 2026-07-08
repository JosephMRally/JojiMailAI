#!/usr/bin/env node
/**
 * The production build entry for `npm run build` (spec:
 * user-stories/typescript_email_ui.md). All behavior — flag validation,
 * compile steps, recording the provider in .env.local — lives in
 * runBuild.mjs, unit-tested by vitest; this file only supplies the real
 * process effects.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { runBuild } from './runBuild.mjs';

const status = runBuild(process.argv.slice(2), {
  run: (command, args, extraEnv) =>
    spawnSync(command, args, {
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
      shell: process.platform === 'win32',
    }).status,
  writeFile: writeFileSync,
  log: console.log,
});
process.exit(status);

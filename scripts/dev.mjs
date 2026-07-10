#!/usr/bin/env node
/**
 * The dev-server entry for `npm run dev` (spec:
 * user-stories/typescript_email_ui.md). All logic — resolving --provider and
 * invoking `vite --mode <id>` — lives in runDev.mjs, unit-tested by vitest;
 * this file only supplies the real process effects.
 */
import { spawnSync } from 'node:child_process';
import { runDev } from './runDev.mjs';

const status = runDev(process.argv.slice(2), {
  run: (command, args) =>
    spawnSync(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    }).status,
  log: console.log,
});
process.exit(status);

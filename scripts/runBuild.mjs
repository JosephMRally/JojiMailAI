/**
 * The build orchestration behind `npm run build` (spec:
 * user-stories/typescript_email_ui.md): resolve the required --provider flag
 * (throws before any compilation starts), spawn `tsc -b` then `vite build`
 * with VITE_MAIL_PROVIDER set to the chosen id, and finally record the id in
 * .env.local so the next `npm run dev` uses it without manual re-entry.
 *
 * Effects are injected via `io` so every path is unit-testable without
 * running a real build:
 *   io.run(command, args, extraEnv) -> exit status (number | null)
 *   io.writeFile(path, content)
 *   io.log(message)
 *
 * Returns the process exit status: 0 on success, the failing step's status
 * otherwise. .env.local is written only after every step succeeds.
 */
import { resolveProviderFlag } from './providerFlag.mjs';

export function runBuild(argv, io) {
  const provider = resolveProviderFlag(argv); // throws on bad/missing flag

  io.log(`Building for provider: ${provider}`);
  const steps = [
    ['npx', ['tsc', '-b'], {}],
    ['npx', ['vite', 'build'], { VITE_MAIL_PROVIDER: provider }],
  ];
  for (const [command, args, extraEnv] of steps) {
    const status = io.run(command, args, extraEnv);
    if (status !== 0) return status ?? 1;
  }

  io.writeFile('.env.local', `VITE_MAIL_PROVIDER=${provider}\n`);
  io.log('Recorded provider in .env.local for the next `npm run dev`');
  return 0;
}

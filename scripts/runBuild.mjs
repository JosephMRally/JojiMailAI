/**
 * The build orchestration behind `npm run build` (spec:
 * user-stories/typescript_email_ui.md): resolve the required --provider flag
 * (throws before any compilation starts), then spawn `tsc -b` and
 * `vite build --mode <id>` so Vite's MODE carries the chosen provider into the
 * bundle. No env var and no .env.local — the flag is the only selector.
 *
 * Effects are injected via `io` so every path is unit-testable without
 * running a real build:
 *   io.run(command, args, extraEnv) -> exit status (number | null)
 *   io.log(message)
 *
 * Returns the process exit status: 0 on success, the failing step's status
 * otherwise.
 */
import { resolveProviderFlag } from './providerFlag.mjs';

export function runBuild(argv, io) {
  const provider = resolveProviderFlag(argv); // throws on bad/missing flag

  io.log(`Building for provider: ${provider}`);
  const steps = [
    ['npx', ['tsc', '-b'], {}],
    ['npx', ['vite', 'build', '--mode', provider], {}],
  ];
  for (const [command, args, extraEnv] of steps) {
    const status = io.run(command, args, extraEnv);
    if (status !== 0) return status ?? 1;
  }
  return 0;
}

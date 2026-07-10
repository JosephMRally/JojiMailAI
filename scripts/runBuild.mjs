/**
 * The build orchestration behind `npm run build` (spec:
 * user-stories/typescript_email_ui.md): resolve the required --provider flag
 * (throws before any compilation starts), then spawn `tsc -b` and
 * `vite build --mode <id>` so Vite's MODE carries the chosen provider into the
 * bundle (no env var), and record the id to `.dev-provider` so `npm run dev`
 * reuses it.
 *
 * Effects are injected via `io` so every path is unit-testable without
 * running a real build:
 *   io.run(command, args, extraEnv) -> exit status (number | null)
 *   io.writeFile(path, content)
 *   io.log(message)
 *
 * Returns the process exit status: 0 on success, the failing step's status
 * otherwise. .dev-provider is written only after every step succeeds.
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
  io.writeFile('.dev-provider', `${provider}\n`);
  io.log(`Recorded provider "${provider}" for npm run dev`);
  return 0;
}

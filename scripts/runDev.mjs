/**
 * The `npm run dev` orchestration (spec: user-stories/typescript_email_ui.md):
 * resolve the provider — an explicit `--provider` wins, otherwise reuse the id
 * the last `npm run build` recorded in `.dev-provider` (else gmail) — and start
 * the Vite dev server in that provider's mode, forwarding any other args.
 * `--provider` is the one flag for both build and dev; Vite's `--mode` is an
 * internal detail (the composition root reads import.meta.env.MODE), never typed.
 *
 * Effects are injected via `io` so the parsing is unit-testable without a real
 * dev server:
 *   io.run(command, args) -> exit status (number | null)
 *   io.readProvider() -> the recorded id (string) or null
 *   io.log(message)
 */
import { KNOWN_PROVIDERS } from './providerFlag.mjs';

export function runDev(argv, io) {
  let provider;
  const passthrough = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--provider=')) {
      provider = arg.slice('--provider='.length);
    } else if (arg === '--provider') {
      provider = argv[i + 1];
      i += 1;
    } else {
      passthrough.push(arg);
    }
  }
  // No explicit --provider: reuse the provider recorded by the last
  // `npm run build` (.dev-provider), falling back to gmail.
  if (provider === undefined) {
    const recorded = (io.readProvider() ?? '').trim();
    provider = KNOWN_PROVIDERS.includes(recorded) ? recorded : 'gmail';
  }
  if (!KNOWN_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unknown provider "${provider}". Known providers: ${KNOWN_PROVIDERS.join(', ')}.\n` +
        'Usage: npm run dev -- --provider=<id>',
    );
  }
  io.log(`Dev server for provider: ${provider}`);
  return io.run('npx', ['vite', '--mode', provider, ...passthrough]) ?? 1;
}

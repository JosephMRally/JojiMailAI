/**
 * The `npm run dev` orchestration (spec: user-stories/typescript_email_ui.md):
 * resolve --provider (default gmail; validated against KNOWN_PROVIDERS) and
 * start the Vite dev server in that provider's mode, forwarding any other args.
 * `--provider` is the one flag for both `npm run build` and `npm run dev`;
 * Vite's `--mode` is an internal detail (the composition root reads
 * import.meta.env.MODE), so developers never type it.
 *
 * Effects are injected via `io` so the parsing is unit-testable without a real
 * dev server:
 *   io.run(command, args) -> exit status (number | null)
 *   io.log(message)
 */
import { KNOWN_PROVIDERS } from './providerFlag.mjs';

export function runDev(argv, io) {
  let provider = 'gmail';
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
  if (!KNOWN_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unknown provider "${provider}". Known providers: ${KNOWN_PROVIDERS.join(', ')}.\n` +
        'Usage: npm run dev -- --provider=<id>',
    );
  }
  io.log(`Dev server for provider: ${provider}`);
  return io.run('npx', ['vite', '--mode', provider, ...passthrough]) ?? 1;
}

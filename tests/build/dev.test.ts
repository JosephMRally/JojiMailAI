/**
 * Dev-server orchestration stories (user-stories/typescript_email_ui.md):
 * - story (engineer): `npm run dev` takes the SAME `--provider` flag as build
 *   and starts `vite --mode <id>` (forwarding other args), so `--provider` is
 *   the one flag for both and Vite's `--mode` stays internal;
 * - story (engineer): without a flag, dev reuses the provider recorded by the
 *   last build (`.dev-provider`), else gmail; an explicit `--provider` wins.
 *
 * The orchestration lives in scripts/runDev.mjs as runDev(argv, io) with an
 * injected io.run/io.readProvider/io.log; scripts/dev.mjs is the thin entry.
 */
import { describe, expect, it, vi } from 'vitest';
import { runDev } from '../../scripts/runDev.mjs';

function fakeIo({
  status = 0,
  recorded = null,
}: { status?: number | null; recorded?: string | null } = {}) {
  const runs: Array<{ command: string; args: string[] }> = [];
  return {
    runs,
    io: {
      run: vi.fn((command: string, args: string[]) => {
        runs.push({ command, args });
        return status;
      }),
      readProvider: vi.fn(() => recorded),
      log: vi.fn(),
    },
  };
}

describe('story: npm run dev takes --provider (the same flag as build)', () => {
  it('--provider=vite starts the dev server in vite mode', () => {
    const { io, runs } = fakeIo();
    runDev(['--provider=vite'], io);
    expect(runs).toEqual([{ command: 'npx', args: ['vite', '--mode', 'vite'] }]);
  });

  it('accepts the two-argument form --provider vite', () => {
    const { io, runs } = fakeIo();
    runDev(['--provider', 'vite'], io);
    expect(runs[0].args).toEqual(['vite', '--mode', 'vite']);
  });

  it('forwards other args (e.g. --port) to Vite after the mode', () => {
    const { io, runs } = fakeIo();
    runDev(['--provider=vite', '--port', '3000'], io);
    expect(runs[0].args).toEqual(['vite', '--mode', 'vite', '--port', '3000']);
  });

  it('an unknown provider throws, listing the known ids, before starting Vite', () => {
    const { io, runs } = fakeIo();
    expect(() => runDev(['--provider=aol'], io)).toThrow(/(?=.*aol)(?=.*gmail)(?=.*vite)/s);
    expect(runs).toEqual([]);
  });

  it('returns the Vite exit status', () => {
    const { io } = fakeIo({ status: 2 });
    expect(runDev(['--provider=vite'], io)).toBe(2);
  });
});

describe('story: without --provider, dev reuses the provider recorded by the last build', () => {
  it("uses .dev-provider's value when no flag is given", () => {
    const { io, runs } = fakeIo({ recorded: 'vite\n' });
    runDev([], io);
    expect(runs[0].args).toEqual(['vite', '--mode', 'vite']);
  });

  it('defaults to gmail when nothing was recorded', () => {
    const { io, runs } = fakeIo({ recorded: null });
    runDev([], io);
    expect(runs[0].args).toEqual(['vite', '--mode', 'gmail']);
  });

  it('an explicit --provider overrides the recorded provider', () => {
    const { io, runs } = fakeIo({ recorded: 'vite\n' });
    runDev(['--provider=gmail'], io);
    expect(runs[0].args).toEqual(['vite', '--mode', 'gmail']);
  });

  it('ignores a garbage .dev-provider value and falls back to gmail', () => {
    const { io, runs } = fakeIo({ recorded: 'garbage' });
    runDev([], io);
    expect(runs[0].args).toEqual(['vite', '--mode', 'gmail']);
  });
});

/**
 * Dev-server orchestration stories (user-stories/typescript_email_ui.md):
 * - story (engineer): `npm run dev` takes the SAME `--provider` flag as build,
 *   resolves it (default gmail; unknown throws), and starts `vite --mode <id>`,
 *   forwarding any other args — so `--provider` is the one flag for both, and
 *   Vite's `--mode` is an internal detail users never type.
 *
 * The orchestration lives in scripts/runDev.mjs as runDev(argv, io) with an
 * injected io.run/io.log; scripts/dev.mjs is the thin entry supplying spawnSync.
 */
import { describe, expect, it, vi } from 'vitest';
import { runDev } from '../../scripts/runDev.mjs';

function fakeIo(status: number | null = 0) {
  const runs: Array<{ command: string; args: string[] }> = [];
  return {
    runs,
    io: {
      run: vi.fn((command: string, args: string[]) => {
        runs.push({ command, args });
        return status;
      }),
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

  it('no --provider defaults to gmail', () => {
    const { io, runs } = fakeIo();
    runDev([], io);
    expect(runs).toEqual([{ command: 'npx', args: ['vite', '--mode', 'gmail'] }]);
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
    const { io } = fakeIo(2);
    expect(runDev(['--provider=vite'], io)).toBe(2);
  });
});

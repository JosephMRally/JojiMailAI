/**
 * Build script stories (user-stories/typescript_email_ui.md):
 * - story (engineer): the build script spawns `tsc -b`, then
 *   `vite build --mode <id>` so Vite's MODE carries the chosen provider — no
 *   env var, and nothing written to .env.local;
 * - story (engineer): a missing or unknown --provider throws before any
 *   compilation starts — the exception paths are tested without running a
 *   real build.
 *
 * The orchestration lives in scripts/runBuild.mjs as runBuild(argv, io) with
 * injected effects (io.run/io.log); scripts/build.mjs is the thin entry that
 * supplies the real spawnSync.
 */
import { describe, expect, it, vi } from 'vitest';
import { runBuild } from '../../scripts/runBuild.mjs';

interface RecordedStep {
  command: string;
  args: string[];
  extraEnv: Record<string, string>;
}

function fakeIo(statuses: Array<number | null> = [0, 0]) {
  const steps: RecordedStep[] = [];
  const writes: Array<{ path: string; content: string }> = [];
  let call = 0;
  return {
    steps,
    writes,
    io: {
      run: vi.fn((command: string, args: string[], extraEnv: Record<string, string>) => {
        steps.push({ command, args, extraEnv });
        return call < statuses.length ? statuses[call++] : 0;
      }),
      writeFile: vi.fn((path: string, content: string) => {
        writes.push({ path, content });
      }),
      log: vi.fn(),
    },
  };
}

describe('story: a missing or unknown --provider throws before any compilation starts', () => {
  it('a missing flag throws and neither compiler nor .env.local is touched', () => {
    const { io, steps, writes } = fakeIo();
    expect(() => runBuild([], io)).toThrow(/--provider/);
    expect(steps).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('an unknown provider throws, listing the known ids, before any step runs', () => {
    const { io, steps, writes } = fakeIo();
    expect(() => runBuild(['--provider=aol'], io)).toThrow(/(?=.*aol)(?=.*gmail)(?=.*vite)/s);
    expect(steps).toEqual([]);
    expect(writes).toEqual([]);
  });
});

describe('story: the build spawns tsc -b, then vite build --mode <id>', () => {
  it('runs the two steps in order with the chosen id as the vite --mode', () => {
    const { io, steps } = fakeIo();
    runBuild(['--provider=vite'], io);
    expect(steps).toEqual([
      { command: 'npx', args: ['tsc', '-b'], extraEnv: {} },
      { command: 'npx', args: ['vite', 'build', '--mode', 'vite'], extraEnv: {} },
    ]);
  });

  it('returns the failing step status and stops — vite never runs after a tsc failure', () => {
    const { io, steps, writes } = fakeIo([2]);
    expect(runBuild(['--provider=gmail'], io)).toBe(2);
    expect(steps).toHaveLength(1);
    expect(writes).toEqual([]);
  });

  it('a null step status (spawn failure) maps to a non-zero exit', () => {
    const { io } = fakeIo([null]);
    expect(runBuild(['--provider=gmail'], io)).toBe(1);
  });
});

describe('story: the build writes nothing beyond compiling — the flag is the only selector', () => {
  it('a successful build produces no .env.local (or any other write)', () => {
    const { io, writes } = fakeIo();
    expect(runBuild(['--provider=vite'], io)).toBe(0);
    expect(writes).toEqual([]);
  });

  it('a failed vite step still writes nothing', () => {
    const { io, writes } = fakeIo([0, 1]);
    expect(runBuild(['--provider=vite'], io)).toBe(1);
    expect(writes).toEqual([]);
  });
});

// The package.json → build.mjs → runBuild.mjs routing is pinned in
// tests/ui/shell.test.ts ("one command path from source to something cap
// sync can package").

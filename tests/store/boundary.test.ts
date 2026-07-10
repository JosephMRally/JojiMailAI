/**
 * Boundary tests for the store layer (user-stories/typescript_mail_store.md):
 * - MailStore is the single storage surface the UI may import, enforced by
 *   the same no-concrete-imports rule that guards providers;
 * - SqliteMailStore is built on @capacitor-community/sqlite only through a
 *   thin injected database handle — the class itself never touches the
 *   plugin, the filesystem, or the network;
 * - FakeMailStore reuses the real shared tokenize module;
 * - tests run under node with no DOM, against in-memory sql.js only.
 */
import { describe, expect, it } from 'vitest';

const storeSources = import.meta.glob('/src/store/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const uiSources = import.meta.glob('/src/ui/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** Matches import/export specifiers such as `from './x'` or `import('./x')`. */
const IMPORT_SPECIFIER_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

function sourceOf(fileName: string): string | undefined {
  return Object.entries(storeSources).find(([path]) => path.endsWith(`/${fileName}`))?.[1];
}

describe('story: MailStore is the single storage surface the UI may import, enforced like providers', () => {
  it('the store layer ships its contract files', () => {
    const fileNames = Object.keys(storeSources).map((p) => p.split('/').pop());
    expect(fileNames).toEqual(
      expect.arrayContaining([
        'MailStore.ts',
        'SqliteMailStore.ts',
        'FakeMailStore.ts',
        'tokenize.ts',
        'stopwords.ts',
      ]),
    );
  });

  it('no file under src/ui/ imports a concrete store module', () => {
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(uiSources)) {
      for (const match of source.matchAll(IMPORT_SPECIFIER_RE)) {
        const specifier = match[1];
        if (/store\/(SqliteMailStore|FakeMailStore|CapacitorDbHandle|DbHandle)/.test(specifier)) {
          offenders.push(`${file} imports ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('story: SqliteMailStore sits behind a thin injected database handle (native plugin only in the production adapter)', () => {
  it('SqliteMailStore.ts never imports @capacitor-community/sqlite itself', () => {
    const source = sourceOf('SqliteMailStore.ts');
    expect(source).toBeDefined();
    expect(source!).not.toMatch(/@capacitor-community\/sqlite/);
  });

  it('a separate production adapter wires the handle to @capacitor-community/sqlite', () => {
    const adapters = Object.entries(storeSources).filter(
      ([path, source]) =>
        !path.endsWith('/SqliteMailStore.ts') && /@capacitor-community\/sqlite/.test(source),
    );
    expect(adapters.length).toBeGreaterThanOrEqual(1);
  });

  it('no store file touches the filesystem or the network', () => {
    const forbidden: Array<[string, RegExp]> = [
      ['node fs import', /['"]node:fs['"]|['"]fs['"]/],
      ['raw fetch call', /\bfetch\s*\(/],
      ['XMLHttpRequest', /XMLHttpRequest/],
      ['WebSocket', /\bWebSocket\b/],
    ];
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(storeSources)) {
      for (const [label, pattern] of forbidden) {
        if (pattern.test(source)) offenders.push(`${file}: ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('story: FakeMailStore implements the interface in memory with real tokenize behavior via the shared module', () => {
  it('FakeMailStore.ts imports the shared tokenize module', () => {
    const source = sourceOf('FakeMailStore.ts');
    expect(source).toBeDefined();
    expect(source!).toMatch(/from\s+['"]\.\/tokenize['"]/);
  });

  it('SqliteMailStore.ts indexes and searches through the same shared module', () => {
    const source = sourceOf('SqliteMailStore.ts');
    expect(source).toBeDefined();
    expect(source!).toMatch(/from\s+['"]\.\/tokenize['"]/);
  });
});

describe('story: vitest runs store tests under node against in-memory sql.js — no DOM, no native plugin, no filesystem', () => {
  it('runs under the node vitest environment with no DOM globals', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });
});

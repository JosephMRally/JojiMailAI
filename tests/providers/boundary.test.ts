/**
 * Boundary and purity tests (user-stories/typescript_mail_provider.md):
 * - no file under src/ui/ imports from any concrete provider directory
 *   (the Proxy boundary is enforced by CI, not convention);
 * - the provider interface layer is zero-I/O pure TypeScript;
 * - this layer's tests run with no network, DOM, or filesystem access
 *   (sources are read via vite's compile-time import.meta.glob, not fs).
 */
import { describe, expect, it } from 'vitest';

const appSources = import.meta.glob('/src/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const uiSources = import.meta.glob('/src/ui/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

// Flat files only: concrete providers live in subdirectories (e.g. gmail/).
const providerLayerSources = import.meta.glob('/src/providers/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** Matches import/export specifiers such as `from './x'` or `import('./x')`. */
const IMPORT_SPECIFIER_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/** The flat interface modules of src/providers/ that UI files may import. */
const PROVIDER_INTERFACE_MODULES = new Set(['MailProvider', 'model', 'ProviderRegistry']);

/**
 * True when a specifier reaches into the providers layer anywhere other than
 * the flat interface modules. Covers files inside a concrete directory
 * ('providers/gmail/GmailProvider') AND bare directory-root imports
 * ('providers/gmail' — which adding an index.ts would make resolvable), so a
 * routine index-module refactor cannot silently defeat the boundary.
 */
function isConcreteProviderImport(specifier: string): boolean {
  const index = specifier.lastIndexOf('providers/');
  if (index === -1) return false;
  const rest = specifier.slice(index + 'providers/'.length).replace(/\.tsx?$/, '');
  return rest.includes('/') || !PROVIDER_INTERFACE_MODULES.has(rest);
}

describe('story: the Proxy boundary is enforced by a test, not convention', () => {
  it('the app source tree exists to be checked', () => {
    expect(Object.keys(appSources).length).toBeGreaterThan(0);
  });

  it('the checker flags concrete-provider specifiers with and without a trailing path', () => {
    // Self-test of the enforcement, so a lax regex cannot pass silently.
    expect(isConcreteProviderImport('../providers/gmail/GmailProvider')).toBe(true);
    expect(isConcreteProviderImport('../providers/gmail')).toBe(true); // directory-root import
    expect(isConcreteProviderImport('../providers/gmail/index')).toBe(true);
    expect(isConcreteProviderImport('../../providers/outlook')).toBe(true); // any future platform
    expect(isConcreteProviderImport('../providers/FakeProvider')).toBe(true); // concrete, though flat
    expect(isConcreteProviderImport('../providers/MailProvider')).toBe(false);
    expect(isConcreteProviderImport('../providers/model')).toBe(false);
    expect(isConcreteProviderImport('../providers/model.ts')).toBe(false);
    expect(isConcreteProviderImport('../providers/ProviderRegistry')).toBe(false);
    expect(isConcreteProviderImport('react')).toBe(false);
  });

  it('no file under src/ui/ imports from any concrete provider directory', () => {
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(uiSources)) {
      for (const match of source.matchAll(IMPORT_SPECIFIER_RE)) {
        const specifier = match[1];
        if (isConcreteProviderImport(specifier)) {
          offenders.push(`${file} imports ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('story: this layer is pure TypeScript with zero I/O, tested without network, DOM, or filesystem', () => {
  it('the provider layer ships its four contract files', () => {
    const fileNames = Object.keys(providerLayerSources).map((p) => p.split('/').pop());
    expect(fileNames).toEqual(
      expect.arrayContaining(['MailProvider.ts', 'model.ts', 'ProviderRegistry.ts', 'FakeProvider.ts']),
    );
  });

  it('no provider-layer file references network, DOM, or filesystem APIs', () => {
    const forbidden: Array<[string, RegExp]> = [
      ['fetch call', /\bfetch\s*\(/],
      ['XMLHttpRequest', /XMLHttpRequest/],
      ['WebSocket', /\bWebSocket\b/],
      ['DOM document', /\bdocument\b/],
      ['DOM window', /\bwindow\b/],
      ['node builtin import', /from\s+['"](?:node:|fs['"]|path['"]|http['"]|https['"]|net['"])/],
      ['CommonJS require', /\brequire\s*\(/],
    ];
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(providerLayerSources)) {
      for (const [label, pattern] of forbidden) {
        if (pattern.test(source)) offenders.push(`${file}: ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('runs under the node vitest environment with no DOM globals', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });
});

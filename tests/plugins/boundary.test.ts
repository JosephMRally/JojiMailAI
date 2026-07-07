/**
 * Boundary and purity tests (user-stories/typescript_plugin_system.md):
 * - story: MailPlugin is the single plug-in surface the UI may import,
 *   enforced by the same no-concrete-imports rule as the other layers
 *   (per SKILL.md the UI may import only the interfaces and the PluginHost);
 * - story: vitest as the test runner; no plug-in test may touch network,
 *   filesystem, or real storage (sources are read via vite's compile-time
 *   import.meta.glob, not fs).
 */
import { describe, expect, it } from 'vitest';

const uiSources = import.meta.glob('/src/ui/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const pluginLayerSources = import.meta.glob('/src/plugins/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** Matches import/export specifiers such as `from './x'` or `import('./x')`. */
const IMPORT_SPECIFIER_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/** The only plug-in-layer modules the UI may import: the contract and the host. */
const UI_IMPORTABLE = new Set(['MailPlugin', 'PluginHost', 'PluginSettings']);

describe('story: MailPlugin is the single plug-in surface the UI may import', () => {
  it('the plugin layer ships its three spec files', () => {
    const fileNames = Object.keys(pluginLayerSources).map((path) => path.split('/').pop());
    expect(fileNames).toEqual(
      expect.arrayContaining(['MailPlugin.ts', 'PluginHost.ts', 'FakePlugin.ts']),
    );
  });

  it('no file under src/ui/ imports a concrete plug-in module', () => {
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(uiSources)) {
      for (const match of source.matchAll(IMPORT_SPECIFIER_RE)) {
        const specifier = match[1];
        const pluginsIndex = specifier.indexOf('plugins/');
        if (pluginsIndex === -1) continue;
        const rest = specifier.slice(pluginsIndex + 'plugins/'.length).replace(/\.tsx?$/, '');
        // Nested paths (plugins/x/y) and anything outside the allowed
        // interface + host modules are concrete and off-limits to the UI.
        if (rest.includes('/') || !UI_IMPORTABLE.has(rest)) {
          offenders.push(`${file} imports ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('story: plug-in tests are deterministic — no network, filesystem, or real storage', () => {
  it('no plugin-layer file references network, DOM, filesystem, or real storage APIs', () => {
    const forbidden: Array<[string, RegExp]> = [
      ['fetch call', /\bfetch\s*\(/],
      ['XMLHttpRequest', /XMLHttpRequest/],
      ['WebSocket', /\bWebSocket\b/],
      ['DOM document', /\bdocument\b/],
      ['DOM window', /\bwindow\b/],
      ['global localStorage', /globalThis\.localStorage/],
      ['indexedDB', /\bindexedDB\b/],
      ['node builtin import', /from\s+['"](?:node:|fs['"]|path['"]|http['"]|https['"]|net['"])/],
      ['CommonJS require', /\brequire\s*\(/],
    ];
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(pluginLayerSources)) {
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

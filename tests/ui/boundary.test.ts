/**
 * Boundary tests (user-stories/typescript_email_ui.md):
 * - story (engineer): every UI file imports mail types only from
 *   src/providers/, storage only from MailStore.ts, plug-ins only from
 *   MailPlugin.ts/PluginHost.ts — never a concrete class — enforced by a test;
 * - story (engineer): src/composition.ts (+ src/main.tsx) is the only place
 *   allowed to import concrete provider/store/plug-in classes;
 * - story (engineer): UI tests run against the in-memory fakes with fake
 *   example.com fixture addresses only.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_MESSAGES, TAGS } from './fixtures';

const uiSources = import.meta.glob('/src/ui/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const rootSources = import.meta.glob('/src/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const harnessSources = import.meta.glob('/tests/ui/harness.tsx', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** Matches import/export specifiers such as `from './x'` or `import('./x')`. */
const IMPORT_SPECIFIER_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/** The only modules of each layer the UI may import (interfaces + registry/host). */
const ALLOWED_BY_LAYER: Array<[string, Set<string>]> = [
  ['providers/', new Set(['MailProvider', 'model', 'ProviderRegistry'])],
  ['store/', new Set(['MailStore'])],
  // The spec allows plug-in imports only from MailPlugin.ts/PluginHost.ts;
  // PluginSettings.ts exports concrete classes and stays composition-only.
  ['plugins/', new Set(['MailPlugin', 'PluginHost'])],
];

/** Modules that are concrete implementations; only the composition root may name them. */
const CONCRETE_MODULE_RE =
  /providers\/gmail|FakeProvider|SqliteMailStore|FakeMailStore|CapacitorDbHandle|DbHandle|FakePlugin|PluginSettings(?:\.tsx?)?$/;

/** The composition-root module; UI files must receive their products as props. */
const COMPOSITION_MODULE_RE = /(?:^|\/)composition(?:\.tsx?)?$/;

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT_SPECIFIER_RE)].map((match) => match[1]);
}

describe('story: all four proxy boundaries hold in every UI file', () => {
  it('the UI layer exists and ships its root component', () => {
    expect(Object.keys(uiSources)).toContain('/src/ui/App.tsx');
  });

  it('no file under src/ui/ imports a concrete provider, store, or plug-in module', () => {
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(uiSources)) {
      for (const specifier of importSpecifiers(source)) {
        for (const [layer, allowed] of ALLOWED_BY_LAYER) {
          const index = specifier.lastIndexOf(layer);
          if (index === -1) continue;
          const rest = specifier.slice(index + layer.length).replace(/\.tsx?$/, '');
          if (rest.includes('/') || !allowed.has(rest)) {
            offenders.push(`${file} imports ${specifier}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no file under src/ui/ imports the composition root', () => {
    // Importing src/composition.ts (which constructs every concrete backend)
    // would bypass the layer scan above; UI files receive everything through
    // props instead.
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(uiSources)) {
      for (const specifier of importSpecifiers(source)) {
        if (COMPOSITION_MODULE_RE.test(specifier)) {
          offenders.push(`${file} imports ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the layer and composition checks flag known-bad specifiers (self-test)', () => {
    expect(COMPOSITION_MODULE_RE.test('../composition')).toBe(true);
    expect(COMPOSITION_MODULE_RE.test('./format')).toBe(false);
    expect(CONCRETE_MODULE_RE.test('../plugins/PluginSettings')).toBe(true);
    expect(CONCRETE_MODULE_RE.test('../providers/gmail')).toBe(true);
    expect(CONCRETE_MODULE_RE.test('../plugins/PluginHost')).toBe(false);
  });
});

describe('story: the composition root is the only module importing concrete classes', () => {
  it('src/composition.ts and src/main.tsx exist beside the UI', () => {
    expect(Object.keys(rootSources)).toContain('/src/composition.ts');
    expect(Object.keys(rootSources)).toContain('/src/main.tsx');
  });

  it('concrete provider/store/plug-in imports appear only in composition.ts and main.tsx', () => {
    const allowedFiles = new Set(['/src/composition.ts', '/src/main.tsx']);
    const offenders: string[] = [];
    for (const [file, source] of Object.entries({ ...uiSources, ...rootSources })) {
      if (allowedFiles.has(file)) continue;
      for (const specifier of importSpecifiers(source)) {
        if (CONCRETE_MODULE_RE.test(specifier)) {
          offenders.push(`${file} imports ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the composition root actually wires the concrete backends and main.tsx consumes it', () => {
    const composition = rootSources['/src/composition.ts'] ?? '';
    expect(composition).toMatch(/providers\/gmail\/GmailProvider/);
    expect(composition).toMatch(/store\/SqliteMailStore/);
    expect(composition).toMatch(/plugins\/PluginHost/);
    const main = rootSources['/src/main.tsx'] ?? '';
    expect(main).toMatch(/from\s+['"]\.\/composition['"]/);
    expect(main).toMatch(/from\s+['"]\.\/ui\/App['"]/);
  });
});

describe('story: UI tests run only against the in-memory fakes with fake addresses', () => {
  it('the shared harness constructs FakeProvider and FakeMailStore — never a concrete backend', () => {
    const source = harnessSources['/tests/ui/harness.tsx'];
    expect(source).toBeDefined();
    expect(source).toMatch(/FakeProvider/);
    expect(source).toMatch(/FakeMailStore/);
    expect(source).toMatch(/PluginHost/);
    expect(source).not.toMatch(/GmailProvider|SqliteMailStore|CapacitorDbHandle/);
  });

  it('every fixture address is an example.com address', () => {
    const addresses = DEFAULT_MESSAGES.flatMap((m) => [m.from, ...m.to, ...m.cc, ...m.bcc]);
    expect(addresses.length).toBeGreaterThan(0);
    for (const address of addresses) {
      expect(address.endsWith('@example.com')).toBe(true);
    }
    expect(TAGS.length).toBeGreaterThan(0);
  });
});

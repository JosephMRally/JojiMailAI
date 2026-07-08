/**
 * Capacitor-shell stories (user-stories/typescript_email_ui.md):
 * - story (engineer): capacitor.config.ts with appId, appName, and webDir
 *   pointing at Vite's build output (dist), with @capacitor-community/sqlite
 *   as the only native community plugin (jeep-sqlite on web);
 * - story (engineer): npm run build (Vite) produces the webDir output that
 *   `npx cap sync` packages.
 */
import { describe, expect, it } from 'vitest';
import capacitorConfig from '../../capacitor.config';
import pkg from '../../package.json';

const mainSources = import.meta.glob('/src/main.tsx', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const buildSources = import.meta.glob('/scripts/build.mjs', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

describe('story: the Capacitor shell wraps the same tested web build', () => {
  it('sets appId, appName, and webDir to the Vite build output', () => {
    expect(capacitorConfig.appId).toBe('com.jojimail.app');
    expect(capacitorConfig.appName).toBe('JojiMailAI');
    expect(capacitorConfig.webDir).toBe('dist');
  });

  it('@capacitor-community/sqlite is the only native community plugin', () => {
    const community = Object.keys(pkg.dependencies).filter((name) =>
      name.startsWith('@capacitor-community/'),
    );
    expect(community).toEqual(['@capacitor-community/sqlite']);
    expect(Object.keys(pkg.dependencies)).toContain('@capacitor/core');
  });

  it('jeep-sqlite backs the store on web: direct dependency, gated on the web platform at startup', () => {
    // The sqlite plugin's web pathway needs the jeep-sqlite custom element
    // registered and the web store initialized before createConnection —
    // without this, `npm run dev` in a browser fails at startup. Not
    // runnable in tests (no live app), so pin the dependency and the wiring.
    expect(Object.keys(pkg.dependencies)).toContain('jeep-sqlite');
    const main = mainSources['/src/main.tsx'] ?? '';
    expect(main).toMatch(/getPlatform\(\)\s*===\s*['"]web['"]/); // web only — native uses the plugin
    expect(main).toMatch(/jeep-sqlite\/loader/); // registers the custom element bundle
    expect(main).toMatch(/defineCustomElements/);
    expect(main).toMatch(/createElement\(\s*['"]jeep-sqlite['"]\s*\)/); // element present in the DOM
    expect(main).toMatch(/initWebStore/); // web store ready before createConnection
  });
});

describe('story: one command path from source to something cap sync can package', () => {
  it('routes the package.json build script through the provider-flag build script, which runs vite build', () => {
    expect(pkg.scripts.build).toContain('scripts/build.mjs');
    const buildScript = buildSources['/scripts/build.mjs'] ?? '';
    expect(buildScript).toContain('vite');
    expect(buildScript).toContain('build');
    expect(buildScript).toContain('resolveProviderFlag'); // missing flag throws before compiling
  });
});

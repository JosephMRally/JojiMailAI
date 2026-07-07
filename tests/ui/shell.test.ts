/**
 * Capacitor-shell stories (user-stories/typescript_email_ui.md):
 * - story (engineer): capacitor.config.ts with appId, appName, and webDir
 *   pointing at Vite's build output (dist), with @capacitor-community/sqlite
 *   as the only native community plugin;
 * - story (engineer): npm run build (Vite) produces the webDir output that
 *   `npx cap sync` packages.
 */
import { describe, expect, it } from 'vitest';
import capacitorConfig from '../../capacitor.config';
import pkg from '../../package.json';

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
});

describe('story: one command path from source to something cap sync can package', () => {
  it('wires vite build into the package.json build script', () => {
    expect(pkg.scripts.build).toContain('vite build');
  });
});

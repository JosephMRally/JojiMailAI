/**
 * Registration, listing, and persistence tests for PluginHost
 * (user-stories/typescript_plugin_system.md):
 * - story: a versioned plug-in API — PLUGIN_API_VERSION (starts at 1) and
 *   register() rejecting a mismatch with an error naming both versions;
 * - story: a PluginHost with register, setEnabled, list();
 * - story: enabled/disabled state persisted through an injected
 *   PluginSettings key-value storage (in-memory in tests, localStorage
 *   adapter in production).
 */
import { describe, expect, it } from 'vitest';
import { FakePlugin } from '../../src/plugins/FakePlugin';
import { PLUGIN_API_VERSION, PluginHost } from '../../src/plugins/PluginHost';
import {
  InMemoryPluginSettings,
  LocalStoragePluginSettings,
  type PluginSettings,
} from '../../src/plugins/PluginSettings';

function makeHost(settings: PluginSettings = new InMemoryPluginSettings()): PluginHost {
  return new PluginHost(settings);
}

/** Deterministic Storage-like double — never the webview's real localStorage. */
function makeStorageLike() {
  const backing = new Map<string, string>();
  return {
    backing,
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
  };
}

describe('story: versioned plug-in API — PLUGIN_API_VERSION and register() rejection', () => {
  it('the host exports PLUGIN_API_VERSION starting at 1', () => {
    expect(PLUGIN_API_VERSION).toBe(1);
  });

  it('register() rejects an apiVersion mismatch with an error naming both versions and the plugin', () => {
    const host = makeHost();
    const stale = new FakePlugin({ id: 'time-machine', apiVersion: 99 });
    let error: unknown;
    try {
      host.register(stale);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('99');
    expect(message).toContain(String(PLUGIN_API_VERSION));
    expect(message).toContain('time-machine');
  });

  it('a rejected plugin is not registered', () => {
    const host = makeHost();
    expect(() => host.register(new FakePlugin({ id: 'time-machine', apiVersion: 99 }))).toThrow();
    expect(host.list()).toEqual([]);
  });

  it('register() accepts a plugin whose apiVersion matches the host', () => {
    const host = makeHost();
    host.register(new FakePlugin({ id: 'current', apiVersion: PLUGIN_API_VERSION }));
    expect(host.list().map((item) => item.id)).toEqual(['current']);
  });
});

describe('story: PluginHost — register, setEnabled, list()', () => {
  it('list() reports id, name, version, enabled, and contributes for each plugin', () => {
    const host = makeHost();
    host.register(
      new FakePlugin({ id: 'p1', name: 'Plugin One', version: '1.2.3', contributes: ['messageView'] }),
    );
    expect(host.list()).toEqual([
      { id: 'p1', name: 'Plugin One', version: '1.2.3', enabled: true, contributes: ['messageView'] },
    ]);
  });

  it('list() preserves registration order', () => {
    const host = makeHost();
    host.register(new FakePlugin({ id: 'first' }));
    host.register(new FakePlugin({ id: 'second' }));
    host.register(new FakePlugin({ id: 'third' }));
    expect(host.list().map((item) => item.id)).toEqual(['first', 'second', 'third']);
  });

  it('setEnabled() toggles a plugin and list() reflects it', () => {
    const host = makeHost();
    host.register(new FakePlugin({ id: 'p1' }));
    host.setEnabled('p1', false);
    expect(host.list()[0].enabled).toBe(false);
    host.setEnabled('p1', true);
    expect(host.list()[0].enabled).toBe(true);
  });
});

describe('story: enabled/disabled state persists through injected PluginSettings', () => {
  it('a disable choice made in one host session is visible to the next host over the same settings', () => {
    const settings = new InMemoryPluginSettings();
    const first = new PluginHost(settings);
    first.register(new FakePlugin({ id: 'p1' }));
    first.setEnabled('p1', false);

    const second = new PluginHost(settings);
    second.register(new FakePlugin({ id: 'p1' }));
    expect(second.list()[0].enabled).toBe(false);
  });

  it('re-enabling persists the same way', () => {
    const settings = new InMemoryPluginSettings();
    const first = new PluginHost(settings);
    first.register(new FakePlugin({ id: 'p1' }));
    first.setEnabled('p1', false);
    first.setEnabled('p1', true);

    const second = new PluginHost(settings);
    second.register(new FakePlugin({ id: 'p1' }));
    expect(second.list()[0].enabled).toBe(true);
  });

  it('InMemoryPluginSettings round-trips values and returns null for missing keys', () => {
    const settings = new InMemoryPluginSettings();
    expect(settings.get('absent')).toBeNull();
    settings.set('k1', 'v1');
    expect(settings.get('k1')).toBe('v1');
  });

  it('the localStorage adapter reads and writes through an injected Storage-like object', () => {
    const storage = makeStorageLike();
    const settings = new LocalStoragePluginSettings(storage);
    expect(settings.get('absent')).toBeNull();
    settings.set('k1', 'v1');
    expect(settings.get('k1')).toBe('v1');
    // Proves it wrote through to the injected storage, not some internal map.
    expect(storage.backing.size).toBeGreaterThan(0);
  });

  it('a PluginHost runs unchanged over the localStorage adapter', () => {
    const storage = makeStorageLike();
    const first = new PluginHost(new LocalStoragePluginSettings(storage));
    first.register(new FakePlugin({ id: 'p1' }));
    first.setEnabled('p1', false);

    const second = new PluginHost(new LocalStoragePluginSettings(storage));
    second.register(new FakePlugin({ id: 'p1' }));
    expect(second.list()[0].enabled).toBe(false);
  });
});

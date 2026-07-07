/**
 * Injected key-value storage for plug-in state, so the host never couples
 * to a storage engine. Production injects the webview's own Storage via
 * LocalStoragePluginSettings; tests inject InMemoryPluginSettings.
 * Spec: user-stories/typescript_plugin_system.md.
 */

export interface PluginSettings {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** Deterministic in-memory settings for tests — no real storage touched. */
export class InMemoryPluginSettings implements PluginSettings {
  private readonly values = new Map<string, string>();

  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.values.set(key, value);
  }
}

/** The subset of the Web Storage API the adapter needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Production adapter over an injected Storage-like object (the composition
 * root passes the webview's localStorage; tests pass a Map-backed double).
 */
export class LocalStoragePluginSettings implements PluginSettings {
  constructor(private readonly storage: StorageLike) {}

  get(key: string): string | null {
    return this.storage.getItem(key);
  }

  set(key: string, value: string): void {
    this.storage.setItem(key, value);
  }
}

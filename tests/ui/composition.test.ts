/**
 * Composition-root stories (user-stories/typescript_email_ui.md):
 * - story (engineer): app startup constructs the providers, the intelligence
 *   backend, the store, and the plugin host in one composition-root module —
 *   the only module allowed to import concrete classes;
 * - story (engineer): construction performs no I/O (every backend connects
 *   lazily), and a missing AI model degrades intelligence instead of blocking
 *   mail.
 */
import { describe, expect, it } from 'vitest';
import { composeApp, GMAIL_ACCOUNT_ID } from '../../src/composition';
import { GmailProvider } from '../../src/providers/gmail/GmailProvider';
import { LocalIntelligence } from '../../src/intelligence/LocalIntelligence';
import { SqliteMailStore } from '../../src/store/SqliteMailStore';
import { PluginHost } from '../../src/plugins/PluginHost';
import { FakePlugin } from '../../src/plugins/FakePlugin';
import type { DbHandle } from '../../src/store/DbHandle';
import { INVOICE_M1 } from './fixtures';

function recordingDbHandle(): { handle: DbHandle; calls: string[] } {
  const calls: string[] = [];
  const handle: DbHandle = {
    exec: async () => {
      calls.push('exec');
    },
    run: async () => {
      calls.push('run');
    },
    query: async () => {
      calls.push('query');
      return [];
    },
  };
  return { handle, calls };
}

function memoryStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe('story: one composition-root module wires every concrete backend', () => {
  it('constructs the Gmail provider, LocalIntelligence, SqliteMailStore, and PluginHost without I/O', () => {
    const { handle, calls } = recordingDbHandle();
    const services = composeApp({
      env: { VITE_AI_MODEL: 'test-model', VITE_BRIDGE_URL: 'http://10.0.2.2:8765' },
      dbHandle: handle,
      settingsStorage: memoryStorage(),
      plugins: [new FakePlugin({ id: 'bundled', contributes: ['settingsPanel'] })],
    });

    expect(services.registry.listAccounts()).toContain(GMAIL_ACCOUNT_ID);
    const provider = services.registry.resolve(GMAIL_ACCOUNT_ID);
    expect(provider).toBeInstanceOf(GmailProvider);
    expect((provider as unknown as { baseUrl: string }).baseUrl).toBe('http://10.0.2.2:8765');
    expect(services.intelligence).toBeInstanceOf(LocalIntelligence);
    expect(services.store).toBeInstanceOf(SqliteMailStore);
    expect(services.pluginHost).toBeInstanceOf(PluginHost);
    expect(services.pluginHost.list().map((item) => item.id)).toContain('bundled');
    // Lazy everywhere: composing the app touches no database, no network.
    expect(calls).toEqual([]);
  });

  it('a missing VITE_AI_MODEL degrades intelligence to AI_UNAVAILABLE instead of blocking mail', async () => {
    const { handle } = recordingDbHandle();
    const services = composeApp({ env: {}, dbHandle: handle, settingsStorage: memoryStorage() });

    expect(services.registry.listAccounts()).toContain(GMAIL_ACCOUNT_ID);
    await expect(services.intelligence.classify(INVOICE_M1, [])).rejects.toMatchObject({
      name: 'MailIntelligenceError',
      code: 'AI_UNAVAILABLE',
    });
  });
});

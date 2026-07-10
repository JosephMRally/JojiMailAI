/**
 * Composition-root stories (user-stories/typescript_email_ui.md and
 * user-stories/providers/typescript_gmail_proxy.md):
 * - story (engineer): app startup constructs the providers, the store, and the
 *   plugin host in one composition-root module — the only module allowed to
 *   import concrete classes;
 * - story (engineer): construction performs no I/O (every backend connects
 *   lazily);
 * - story (engineer): GmailProvider is registered with the getAccessToken
 *   received via the optional gmailAuth option; without one, Gmail calls
 *   surface AUTH_REQUIRED with sign-in guidance instead of crashing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeApp, GMAIL_ACCOUNT_ID } from '../../src/composition';
import { FakeProvider } from '../../src/providers/FakeProvider';
import { GmailProvider } from '../../src/providers/gmail/GmailProvider';
import { SqliteMailStore } from '../../src/store/SqliteMailStore';
import { PluginHost } from '../../src/plugins/PluginHost';
import { FakePlugin } from '../../src/plugins/FakePlugin';
import type { DbHandle } from '../../src/store/DbHandle';

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

// Provider selection now branches on import.meta.env.VITE_MAIL_PROVIDER directly
// (so a build folds the branch and ships one provider class), not on the injected
// `env` option — which still feeds AI config. Tests set it with vi.stubEnv;
// default every test to gmail and let selection tests override.
beforeEach(() => {
  vi.stubEnv('VITE_MAIL_PROVIDER', 'gmail');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('story: one composition-root module wires every concrete backend', () => {
  it('constructs the Gmail provider, SqliteMailStore, and PluginHost without I/O', () => {
    const { handle, calls } = recordingDbHandle();
    const getAccessToken = vi.fn(async () => 'tok');
    const services = composeApp({
      env: {},
      gmailAuth: getAccessToken,
      dbHandle: handle,
      settingsStorage: memoryStorage(),
      plugins: [new FakePlugin({ id: 'bundled', contributes: ['settingsPanel'] })],
    });

    expect(services.registry.listAccounts()).toContain(GMAIL_ACCOUNT_ID);
    expect(services.registry.resolve(GMAIL_ACCOUNT_ID)).toBeInstanceOf(GmailProvider);
    expect(services.store).toBeInstanceOf(SqliteMailStore);
    expect(services.pluginHost).toBeInstanceOf(PluginHost);
    expect(services.pluginHost.list().map((item) => item.id)).toContain('bundled');
    // Lazy everywhere: composing the app touches no database, no network,
    // and no OAuth token.
    expect(calls).toEqual([]);
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('without gmailAuth, a Gmail call surfaces AUTH_REQUIRED with sign-in guidance instead of crashing', async () => {
    const { handle } = recordingDbHandle();
    const services = composeApp({ env: {}, dbHandle: handle, settingsStorage: memoryStorage() });

    const provider = services.registry.resolve(GMAIL_ACCOUNT_ID);
    const error = await provider.listTags().catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'MailProviderError', code: 'AUTH_REQUIRED' });
    expect((error as Error).message).toMatch(/sign[ -]?in/i);
  });

  it('without gmailAuth, VITE_GMAIL_ACCESS_TOKEN supplies the default token (developer escape hatch)', async () => {
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ labels: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const { handle } = recordingDbHandle();
      const services = composeApp({
        env: { VITE_GMAIL_ACCESS_TOKEN: 'dev-token' },
        dbHandle: handle,
        settingsStorage: memoryStorage(),
      });

      await expect(services.registry.resolve(GMAIL_ACCOUNT_ID).listTags()).resolves.toEqual([]);
      expect(new Headers(fetchSpy.mock.calls[0][1]?.headers).get('authorization')).toBe(
        'Bearer dev-token',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('story: the composition root selects one provider from import.meta.env.VITE_MAIL_PROVIDER', () => {
  it('VITE_MAIL_PROVIDER=gmail registers the GmailProvider under the gmail account id', () => {
    vi.stubEnv('VITE_MAIL_PROVIDER', 'gmail');
    const { handle } = recordingDbHandle();
    const services = composeApp({ env: {}, dbHandle: handle, settingsStorage: memoryStorage() });
    expect(services.registry.listAccounts()).toEqual([GMAIL_ACCOUNT_ID]);
    expect(services.registry.resolve(GMAIL_ACCOUNT_ID)).toBeInstanceOf(GmailProvider);
  });

  it('VITE_MAIL_PROVIDER=fake registers the FakeProvider under the fake account id', () => {
    vi.stubEnv('VITE_MAIL_PROVIDER', 'fake');
    const { handle } = recordingDbHandle();
    const services = composeApp({ env: {}, dbHandle: handle, settingsStorage: memoryStorage() });
    expect(services.registry.listAccounts()).toEqual(['fake']);
    expect(services.registry.resolve('fake')).toBeInstanceOf(FakeProvider);
  });

  it('VITE_MAIL_PROVIDER=fake seeds the FakeProvider from the fakeFixtures option', async () => {
    vi.stubEnv('VITE_MAIL_PROVIDER', 'fake');
    const { handle } = recordingDbHandle();
    const services = composeApp({
      env: {},
      dbHandle: handle,
      settingsStorage: memoryStorage(),
      fakeFixtures: { tags: [{ tagId: 'demo-inbox', name: 'Inbox' }], messages: [] },
    });
    const tags = await services.registry.resolve('fake').listTags();
    expect(tags.map((t) => t.tagId)).toEqual(['demo-inbox']);
  });

  it('an unset VITE_MAIL_PROVIDER defaults to gmail (dev mode)', () => {
    vi.stubEnv('VITE_MAIL_PROVIDER', undefined);
    const { handle } = recordingDbHandle();
    const services = composeApp({ env: {}, dbHandle: handle, settingsStorage: memoryStorage() });
    expect(services.registry.resolve(GMAIL_ACCOUNT_ID)).toBeInstanceOf(GmailProvider);
  });

  it('an unknown VITE_MAIL_PROVIDER throws at startup, listing the known ids', () => {
    vi.stubEnv('VITE_MAIL_PROVIDER', 'aol');
    const { handle } = recordingDbHandle();
    expect(() =>
      composeApp({ env: {}, dbHandle: handle, settingsStorage: memoryStorage() }),
    ).toThrow(/(?=.*aol)(?=.*gmail)(?=.*fake)/s);
  });
});

/**
 * Composition-root stories (user-stories/typescript_email_ui.md,
 * user-stories/typescript_mail_intelligence.md, and
 * user-stories/providers/typescript_gmail_proxy.md):
 * - story (engineer): app startup constructs the providers, the intelligence
 *   backend, the store, and the plugin host in one composition-root module —
 *   the only module allowed to import concrete classes;
 * - story (engineer): construction performs no I/O (every backend connects
 *   lazily);
 * - story (engineer): GmailProvider is registered with the getAccessToken
 *   received via the optional gmailAuth option; without one, Gmail calls
 *   surface AUTH_REQUIRED with sign-in guidance instead of crashing;
 * - story (engineer): NoOpIntelligence is instantiated when VITE_AI_BASE_URL
 *   is not configured or empty — the app works out of the box with no server
 *   setup; a configured VITE_AI_BASE_URL selects LocalIntelligence.
 */
import { describe, expect, it, vi } from 'vitest';
import { composeApp, GMAIL_ACCOUNT_ID } from '../../src/composition';
import { GmailProvider } from '../../src/providers/gmail/GmailProvider';
import { LocalIntelligence } from '../../src/intelligence/LocalIntelligence';
import { NoOpIntelligence } from '../../src/intelligence/NoOpIntelligence';
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
  it('constructs the Gmail provider, the intelligence backend, SqliteMailStore, and PluginHost without I/O', () => {
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

describe('story: the composition root registers the provider named by VITE_MAIL_PROVIDER', () => {
  it('VITE_MAIL_PROVIDER=gmail registers the GmailProvider under the gmail account id', () => {
    const { handle } = recordingDbHandle();
    const services = composeApp({
      env: { VITE_MAIL_PROVIDER: 'gmail' },
      dbHandle: handle,
      settingsStorage: memoryStorage(),
    });
    expect(services.registry.listAccounts()).toEqual([GMAIL_ACCOUNT_ID]);
    expect(services.registry.resolve(GMAIL_ACCOUNT_ID)).toBeInstanceOf(GmailProvider);
  });

  it('an unset VITE_MAIL_PROVIDER defaults to gmail (dev mode)', () => {
    const { handle } = recordingDbHandle();
    const services = composeApp({ env: {}, dbHandle: handle, settingsStorage: memoryStorage() });
    expect(services.registry.resolve(GMAIL_ACCOUNT_ID)).toBeInstanceOf(GmailProvider);
  });

  it('an unknown VITE_MAIL_PROVIDER throws at startup, listing the known ids', () => {
    const { handle } = recordingDbHandle();
    expect(() =>
      composeApp({
        env: { VITE_MAIL_PROVIDER: 'aol' },
        dbHandle: handle,
        settingsStorage: memoryStorage(),
      }),
    ).toThrow(/aol.*gmail|gmail.*aol/s);
  });
});

describe('story: AI is opt-in — VITE_AI_BASE_URL decides the intelligence backend', () => {
  it('an unset VITE_AI_BASE_URL selects NoOpIntelligence: the app works with zero server setup', async () => {
    const { handle } = recordingDbHandle();
    const services = composeApp({ env: {}, dbHandle: handle, settingsStorage: memoryStorage() });

    expect(services.intelligence).toBeInstanceOf(NoOpIntelligence);
    // Empty results, never an error: core mail flows run untouched.
    await expect(services.intelligence.classify(INVOICE_M1, [])).resolves.toStrictEqual({
      tagIds: [],
      importance: 'normal',
    });
  });

  it('an empty/whitespace VITE_AI_BASE_URL also selects NoOpIntelligence', () => {
    const { handle } = recordingDbHandle();
    const services = composeApp({
      env: { VITE_AI_BASE_URL: '   ', VITE_AI_MODEL: 'llama3' },
      dbHandle: handle,
      settingsStorage: memoryStorage(),
    });
    expect(services.intelligence).toBeInstanceOf(NoOpIntelligence);
  });

  it('a configured VITE_AI_BASE_URL with a model selects LocalIntelligence', () => {
    const { handle } = recordingDbHandle();
    const services = composeApp({
      env: { VITE_AI_BASE_URL: 'http://127.0.0.1:11434/v1', VITE_AI_MODEL: 'llama3' },
      dbHandle: handle,
      settingsStorage: memoryStorage(),
    });
    expect(services.intelligence).toBeInstanceOf(LocalIntelligence);
  });

  it('a configured VITE_AI_BASE_URL with a missing model degrades to AI_UNAVAILABLE — misconfiguration surfaces, mail keeps working', async () => {
    const { handle } = recordingDbHandle();
    const services = composeApp({
      env: { VITE_AI_BASE_URL: 'http://127.0.0.1:11434/v1' },
      dbHandle: handle,
      settingsStorage: memoryStorage(),
    });

    expect(services.registry.listAccounts()).toContain(GMAIL_ACCOUNT_ID);
    await expect(services.intelligence.classify(INVOICE_M1, [])).rejects.toMatchObject({
      name: 'MailIntelligenceError',
      code: 'AI_UNAVAILABLE',
    });
  });
});

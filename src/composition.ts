/**
 * The composition root (user-stories/typescript_email_ui.md): the ONLY module
 * (with src/main.tsx, which consumes it) allowed to import concrete provider,
 * store, or plug-in classes. Everything is constructed here — GmailProvider
 * over the injected native-OAuth token supplier, SqliteMailStore over the
 * injected database handle, and the PluginHost over persisted settings — and
 * handed to the UI as plain interfaces.
 *
 * Construction performs no I/O: every backend connects lazily on first use.
 */
import type { MailPlugin } from './plugins/MailPlugin';
import { PluginHost } from './plugins/PluginHost';
import { LocalStoragePluginSettings, type StorageLike } from './plugins/PluginSettings';
import { FakeProvider, type FakeProviderFixtures } from './providers/FakeProvider';
import { GmailProvider } from './providers/gmail/GmailProvider';
import { ProviderRegistry } from './providers/ProviderRegistry';
import type { DbHandle } from './store/DbHandle';
import type { MailStore } from './store/MailStore';
import { SqliteMailStore } from './store/SqliteMailStore';

/** The account id the bundled Gmail provider registers under. */
export const GMAIL_ACCOUNT_ID = 'gmail';

export type EnvLike = Record<string, string | undefined>;

/** The provider id VITE_MAIL_PROVIDER selects; gmail when unset (dev mode). */
export function selectedProviderId(env: EnvLike): string {
  return (env.VITE_MAIL_PROVIDER ?? '').trim() || 'gmail';
}

export interface CompositionOptions {
  /** Vite env; injectable so composing is testable without ambient state. */
  env?: EnvLike;
  /**
   * OAuth2 access-token supplier for Gmail, backed by the platform's native
   * sign-in flow. Omitted (before sign-in), every Gmail call surfaces
   * AUTH_REQUIRED with sign-in guidance instead of crashing.
   */
  gmailAuth?: () => Promise<string>;
  /** The on-device SQLite handle (CapacitorDbHandle in production). */
  dbHandle: DbHandle;
  /** Where plug-in enable/disable choices persist (localStorage in production). */
  settingsStorage: StorageLike;
  /** Bundled plug-ins to register into the host. */
  plugins?: MailPlugin[];
  /**
   * Demo mailbox for the fake build (loaded by the app entry from
   * public/fixtures/fake-provider.json). Omitted, the fake starts empty.
   */
  fakeFixtures?: FakeProviderFixtures;
}

export interface AppServices {
  registry: ProviderRegistry;
  store: MailStore;
  pluginHost: PluginHost;
}

export function composeApp(options: CompositionOptions): AppServices {
  const env = options.env ?? (import.meta.env as unknown as EnvLike);

  const registry = new ProviderRegistry();
  registerSelectedProvider(registry, env, options);

  const store: MailStore = new SqliteMailStore(options.dbHandle);

  const pluginHost = new PluginHost(new LocalStoragePluginSettings(options.settingsStorage));
  for (const plugin of options.plugins ?? []) {
    pluginHost.register(plugin);
  }

  return { registry, store, pluginHost };
}

/**
 * Build-time provider selection behind VITE_MAIL_PROVIDER (set by
 * `npm run build -- --provider=<id>` via scripts/build.mjs). The branch reads
 * `import.meta.env.VITE_MAIL_PROVIDER` DIRECTLY — the token Vite inlines to a
 * literal at build time — so the bundler folds the condition and tree-shakes
 * away every provider class except the selected one: `--provider=<id>` is 1:1
 * with the class that ships, and no demo/dead provider code rides along. (This
 * is why selection reads import.meta.env rather than the injected `env`: a
 * runtime value could not be folded. Tests drive it with vi.stubEnv.) New
 * platforms add one branch here and one id in scripts/providerFlag.mjs. Unset
 * (dev) defaults to gmail; an unknown value fails loudly at startup instead of
 * silently shipping the wrong provider.
 */
function registerSelectedProvider(
  registry: ProviderRegistry,
  env: EnvLike,
  options: CompositionOptions,
): void {
  const selected = import.meta.env.VITE_MAIL_PROVIDER;
  if (selected === 'fake') {
    registry.register('fake', new FakeProvider(options.fakeFixtures));
  } else if (selected === undefined || selected === '' || selected === 'gmail') {
    registry.register(
      GMAIL_ACCOUNT_ID,
      new GmailProvider({ getAccessToken: options.gmailAuth ?? defaultGmailAuth(env) }),
    );
  } else {
    throw new Error(
      `Unknown VITE_MAIL_PROVIDER "${selected}". Known providers: gmail, fake. ` +
        'Build with `npm run build -- --provider=<id>`.',
    );
  }
}

/**
 * The fallback token supplier when no gmailAuth is wired: the
 * VITE_GMAIL_ACCESS_TOKEN developer escape hatch (e.g. a token from Google's
 * OAuth playground) if set, otherwise a rejection that GmailProvider
 * surfaces as AUTH_REQUIRED with sign-in guidance.
 */
function defaultGmailAuth(env: EnvLike): () => Promise<string> {
  const devToken = (env.VITE_GMAIL_ACCESS_TOKEN ?? '').trim();
  if (devToken !== '') {
    return async () => devToken;
  }
  return async () => {
    throw new Error('no Gmail account is signed in');
  };
}

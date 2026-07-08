/**
 * The composition root (user-stories/typescript_email_ui.md): the ONLY module
 * (with src/main.tsx, which consumes it) allowed to import concrete provider,
 * intelligence, store, or plug-in classes. Everything is constructed here —
 * GmailProvider over the injected native-OAuth token supplier,
 * the intelligence backend from the optional AI config, SqliteMailStore over
 * the injected database handle, and the PluginHost over persisted settings —
 * and handed to the UI as plain interfaces.
 *
 * Construction performs no I/O: every backend connects lazily on first use.
 * AI is opt-in (user-stories/typescript_mail_intelligence.md): with no
 * VITE_AI_BASE_URL configured, NoOpIntelligence degrades every AI affordance
 * to an empty result — an app-store install works with zero server setup. A
 * configured-but-broken AI (base URL set, model missing) degrades to a
 * backend that rejects with AI_UNAVAILABLE so the misconfiguration surfaces;
 * core mail flows never block on AI either way.
 */
import { isAiConfigured, loadAiConfig } from './config';
import {
  MailIntelligenceError,
  type MailIntelligence,
} from './intelligence/MailIntelligence';
import { LocalIntelligence } from './intelligence/LocalIntelligence';
import { NoOpIntelligence } from './intelligence/NoOpIntelligence';
import type { MailPlugin } from './plugins/MailPlugin';
import { PluginHost } from './plugins/PluginHost';
import { LocalStoragePluginSettings, type StorageLike } from './plugins/PluginSettings';
import { GmailProvider } from './providers/gmail/GmailProvider';
import { ProviderRegistry } from './providers/ProviderRegistry';
import type { DbHandle } from './store/DbHandle';
import type { MailStore } from './store/MailStore';
import { SqliteMailStore } from './store/SqliteMailStore';

/** The account id the bundled Gmail provider registers under. */
export const GMAIL_ACCOUNT_ID = 'gmail';

type EnvLike = Record<string, string | undefined>;

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
}

export interface AppServices {
  registry: ProviderRegistry;
  intelligence: MailIntelligence;
  store: MailStore;
  pluginHost: PluginHost;
}

export function composeApp(options: CompositionOptions): AppServices {
  const env = options.env ?? (import.meta.env as unknown as EnvLike);

  const registry = new ProviderRegistry();
  registry.register(
    GMAIL_ACCOUNT_ID,
    new GmailProvider({ getAccessToken: options.gmailAuth ?? defaultGmailAuth(env) }),
  );

  const store: MailStore = new SqliteMailStore(options.dbHandle);

  const pluginHost = new PluginHost(new LocalStoragePluginSettings(options.settingsStorage));
  for (const plugin of options.plugins ?? []) {
    pluginHost.register(plugin);
  }

  return { registry, intelligence: composeIntelligence(env), store, pluginHost };
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

/** AI is opt-in: no VITE_AI_BASE_URL → NoOp; configured-but-broken → surfaced. */
function composeIntelligence(env: EnvLike): MailIntelligence {
  if (!isAiConfigured(env)) {
    return new NoOpIntelligence();
  }
  try {
    return new LocalIntelligence({ config: loadAiConfig(env) });
  } catch (error) {
    // e.g. VITE_AI_MODEL unset: AI affordances degrade; mail keeps working.
    return unavailableIntelligence(error instanceof Error ? error.message : String(error));
  }
}

/** A MailIntelligence whose every method rejects with AI_UNAVAILABLE. */
function unavailableIntelligence(reason: string): MailIntelligence {
  const reject = <T>(): Promise<T> =>
    Promise.reject(new MailIntelligenceError('AI_UNAVAILABLE', reason));
  return {
    classify: () => reject(),
    summarizeThread: () => reject(),
    draftReply: () => reject(),
    parseSearchQuery: () => reject(),
  };
}

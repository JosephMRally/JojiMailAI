/**
 * The composition root (user-stories/typescript_email_ui.md): the ONLY module
 * (with src/main.tsx, which consumes it) allowed to import concrete provider,
 * intelligence, store, or plug-in classes. Everything is constructed here —
 * GmailProvider from the bridge config, LocalIntelligence from the AI config,
 * SqliteMailStore over the injected database handle, and the PluginHost over
 * persisted settings — and handed to the UI as plain interfaces.
 *
 * Construction performs no I/O: every backend connects lazily on first use.
 * A missing/invalid AI configuration degrades intelligence to a backend that
 * rejects with AI_UNAVAILABLE — core mail flows never block on AI.
 */
import { loadAiConfig, loadBridgeConfig } from './config';
import {
  MailIntelligenceError,
  type MailIntelligence,
} from './intelligence/MailIntelligence';
import { LocalIntelligence } from './intelligence/LocalIntelligence';
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
  registry.register(GMAIL_ACCOUNT_ID, new GmailProvider({ baseUrl: loadBridgeConfig(env).baseUrl }));

  let intelligence: MailIntelligence;
  try {
    intelligence = new LocalIntelligence({ config: loadAiConfig(env) });
  } catch (error) {
    // e.g. VITE_AI_MODEL unset: AI affordances degrade; mail keeps working.
    intelligence = unavailableIntelligence(
      error instanceof Error ? error.message : String(error),
    );
  }

  const store: MailStore = new SqliteMailStore(options.dbHandle);

  const pluginHost = new PluginHost(new LocalStoragePluginSettings(options.settingsStorage));
  for (const plugin of options.plugins ?? []) {
    pluginHost.register(plugin);
  }

  return { registry, intelligence, store, pluginHost };
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

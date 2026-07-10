/**
 * UI test harness (user-stories/typescript_email_ui.md): renders the real App
 * against the in-memory fakes — FakeProvider, FakeMailStore, and a PluginHost
 * over in-memory settings — proving the UI needs nothing concrete. No bridge,
 * no network, no database.
 */
import { render } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { PluginHost } from '../../src/plugins/PluginHost';
import { InMemoryPluginSettings } from '../../src/plugins/PluginSettings';
import { FakeProvider } from '../../src/providers/FakeProvider';
import { ProviderRegistry } from '../../src/providers/ProviderRegistry';
import { FakeMailStore } from '../../src/store/FakeMailStore';
import type { MailStore } from '../../src/store/MailStore';
import type { Message } from '../../src/providers/model';
import { App } from '../../src/ui/App';
import { ACCOUNT_ID, DEFAULT_MESSAGES, FIXED_NOW, TAGS, seedStore } from './fixtures';

export interface RenderAppOptions {
  /** Fixtures for the default FakeProvider; ignored when `provider` is given. */
  fixtures?: { tags: typeof TAGS; messages: Message[] };
  provider?: FakeProvider;
  store?: MailStore;
  pluginHost?: PluginHost;
  accountId?: string;
  extraAccounts?: Array<{ accountId: string; provider: FakeProvider }>;
  /** Messages to pre-sync into the store before first render. */
  seed?: Message[];
  now?: () => number;
}

export interface Harness {
  provider: FakeProvider;
  registry: ProviderRegistry;
  store: MailStore;
  pluginHost: PluginHost;
  user: UserEvent;
}

export async function renderApp(options: RenderAppOptions = {}): Promise<Harness> {
  const fixtures = options.fixtures ?? { tags: TAGS, messages: DEFAULT_MESSAGES };
  const provider = options.provider ?? new FakeProvider(fixtures);
  const accountId = options.accountId ?? ACCOUNT_ID;
  const registry = new ProviderRegistry();
  registry.register(accountId, provider);
  for (const extra of options.extraAccounts ?? []) {
    registry.register(extra.accountId, extra.provider);
  }
  const store = options.store ?? new FakeMailStore();
  if (options.seed) await seedStore(store, options.seed, accountId);
  const pluginHost = options.pluginHost ?? new PluginHost(new InMemoryPluginSettings());
  const user = userEvent.setup();
  render(
    <App
      registry={registry}
      store={store}
      pluginHost={pluginHost}
      now={options.now ?? (() => FIXED_NOW)}
    />,
  );
  return { provider, registry, store, pluginHost, user };
}

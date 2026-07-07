/**
 * UI test harness (user-stories/typescript_email_ui.md): renders the real
 * App against the four in-memory fakes — FakeProvider, FakeIntelligence,
 * FakeMailStore, and a PluginHost over in-memory settings — proving the UI
 * needs nothing concrete. No bridge, no network, no AI server, no database.
 */
import { render } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { FakeIntelligence } from '../../src/intelligence/FakeIntelligence';
import type { MailIntelligence } from '../../src/intelligence/MailIntelligence';
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
  intelligence?: MailIntelligence;
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
  intelligence: MailIntelligence;
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
  const intelligence = options.intelligence ?? new FakeIntelligence({ now: () => FIXED_NOW });
  const store = options.store ?? new FakeMailStore();
  if (options.seed) await seedStore(store, options.seed, accountId);
  const pluginHost = options.pluginHost ?? new PluginHost(new InMemoryPluginSettings());
  const user = userEvent.setup();
  render(
    <App
      registry={registry}
      intelligence={intelligence}
      store={store}
      pluginHost={pluginHost}
      now={options.now ?? (() => FIXED_NOW)}
    />,
  );
  return { provider, registry, intelligence, store, pluginHost, user };
}

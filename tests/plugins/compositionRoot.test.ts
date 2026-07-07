/**
 * Composition-root seam test (user-stories/typescript_plugin_system.md):
 * - story (human): plug-ins that bundle a backend register it through the
 *   existing seams — a MailProvider into the ProviderRegistry, handled at
 *   the composition root — so "mail-platform plug-ins" reuse the proxy
 *   pattern instead of a second registration mechanism.
 */
import { describe, expect, it } from 'vitest';
import { FakeProvider } from '../../src/providers/FakeProvider';
import { ProviderRegistry } from '../../src/providers/ProviderRegistry';
import { FakePlugin } from '../../src/plugins/FakePlugin';
import { PluginHost } from '../../src/plugins/PluginHost';
import { InMemoryPluginSettings } from '../../src/plugins/PluginSettings';

describe('story: a plug-in that bundles a mail backend registers it through the existing seams', () => {
  it('the composition root wires the bundled MailProvider into the ProviderRegistry and the plug-in into the host', () => {
    // A "mail-platform plug-in" ships two artifacts: UI contributions
    // (a MailPlugin) and mail access (a MailProvider). Nothing new is needed.
    const bundle = {
      accountId: 'acme-account',
      provider: new FakeProvider(),
      plugin: new FakePlugin({ id: 'acme-mail', name: 'Acme Mail', contributes: ['settingsPanel'] }),
    };

    // Composition-root wiring — each artifact goes through its existing seam.
    const registry = new ProviderRegistry();
    const host = new PluginHost(new InMemoryPluginSettings());
    registry.register(bundle.accountId, bundle.provider);
    host.register(bundle.plugin);

    expect(registry.resolve('acme-account')).toBe(bundle.provider);
    expect(registry.listAccounts()).toContain('acme-account');
    expect(host.list().map((item) => item.id)).toEqual(['acme-mail']);
  });

  it('the host itself offers no provider registration — the ProviderRegistry stays the only mail seam', () => {
    const methodNames = Object.getOwnPropertyNames(PluginHost.prototype);
    expect(methodNames.filter((name) => /provider/i.test(name))).toEqual([]);
  });
});

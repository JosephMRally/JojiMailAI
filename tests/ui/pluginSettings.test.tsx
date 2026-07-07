// @vitest-environment jsdom
/**
 * Plug-in settings stories (user-stories/typescript_email_ui.md):
 * - story (human): a plug-in settings screen lists PluginHost.list() with
 *   enable/disable toggles, each plug-in's settings panel, and any
 *   auto-disable error message.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PluginHost } from '../../src/plugins/PluginHost';
import { InMemoryPluginSettings } from '../../src/plugins/PluginSettings';
import { FakePlugin, ThrowingPlugin } from '../../src/plugins/FakePlugin';
import { renderApp } from './harness';
import { DEFAULT_MESSAGES, INVOICE_M1 } from './fixtures';

afterEach(cleanup);

async function buildHost(): Promise<PluginHost> {
  const host = new PluginHost(new InMemoryPluginSettings());
  host.register(
    new FakePlugin({
      id: 'signature',
      name: 'Signature Plugin',
      version: '2.1.0',
      contributes: ['composeAction', 'settingsPanel'],
      settingsContribution: {
        title: 'Signature settings',
        fields: [{ key: 'text', label: 'Signature text', value: 'Sent from JojiMailAI' }],
      },
    }),
  );
  host.register(new ThrowingPlugin({ id: 'crashy', name: 'Crashy', contributes: ['messageView'] }));
  // Crash the throwing plug-in so the screen has an auto-disable error to show.
  await host.dispatchMessageView(INVOICE_M1);
  return host;
}

describe('story: one screen lists installed plug-ins with toggles, panels, and errors', () => {
  it('lists name, version, and enabled state from PluginHost.list()', async () => {
    const host = await buildHost();
    const { user } = await renderApp({ pluginHost: host, seed: DEFAULT_MESSAGES });
    await user.click(await screen.findByRole('button', { name: 'Plugins' }));

    const items = await screen.findByRole('list', { name: 'Installed plug-ins' });
    expect(within(items).getByText('Signature Plugin')).toBeInTheDocument();
    expect(within(items).getByText('2.1.0')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Enable Signature Plugin' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Enable Crashy' })).not.toBeChecked();
  });

  it("shows a crashed plug-in's auto-disable error message", async () => {
    const host = await buildHost();
    const { user } = await renderApp({ pluginHost: host, seed: DEFAULT_MESSAGES });
    await user.click(await screen.findByRole('button', { name: 'Plugins' }));

    const items = await screen.findByRole('list', { name: 'Installed plug-ins' });
    expect(within(items).getByText(/disabled for this session/)).toBeInTheDocument();
    expect(within(items).getByText(/messageView failed/)).toBeInTheDocument();
  });

  it("renders each plug-in's settings panel fields", async () => {
    const host = await buildHost();
    const { user } = await renderApp({ pluginHost: host, seed: DEFAULT_MESSAGES });
    await user.click(await screen.findByRole('button', { name: 'Plugins' }));

    expect(await screen.findByText('Signature settings')).toBeInTheDocument();
    expect(screen.getByText(/Signature text/)).toBeInTheDocument();
    expect(screen.getByText(/Sent from JojiMailAI/)).toBeInTheDocument();
  });

  it('enable/disable toggles persist through the host', async () => {
    const host = await buildHost();
    const { user } = await renderApp({ pluginHost: host, seed: DEFAULT_MESSAGES });
    await user.click(await screen.findByRole('button', { name: 'Plugins' }));

    await user.click(await screen.findByRole('checkbox', { name: 'Enable Signature Plugin' }));
    expect(host.list().find((item) => item.id === 'signature')?.enabled).toBe(false);
    expect(screen.getByRole('checkbox', { name: 'Enable Signature Plugin' })).not.toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Enable Signature Plugin' }));
    expect(host.list().find((item) => item.id === 'signature')?.enabled).toBe(true);
  });
});

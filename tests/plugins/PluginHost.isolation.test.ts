/**
 * Crash-isolation tests for PluginHost
 * (user-stories/typescript_plugin_system.md):
 * - story: a hook that throws or exceeds the 2-second timeout is caught,
 *   the plug-in is auto-disabled for the session, and an error naming the
 *   plug-in is surfaced via list() — one broken plug-in can never break a
 *   core mail flow or another plug-in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakePlugin, ThrowingPlugin } from '../../src/plugins/FakePlugin';
import { PluginHost } from '../../src/plugins/PluginHost';
import { InMemoryPluginSettings } from '../../src/plugins/PluginSettings';
import { makeDraft, makeInlinePlugin, makeMessage } from './fixtures';

function makeHost(settings = new InMemoryPluginSettings()): PluginHost {
  return new PluginHost(settings);
}

describe('story: crash isolation — a throwing hook is caught and never breaks the flow', () => {
  it('a throwing messageView does not break dispatch; healthy plug-ins still contribute', async () => {
    const host = makeHost();
    host.register(new ThrowingPlugin({ id: 'grenade' }));
    host.register(new FakePlugin({ id: 'steady', viewContribution: { title: 'Still here', bodyText: 'ok' } }));
    const contributions = await host.dispatchMessageView(makeMessage());
    expect(contributions).toEqual([{ pluginId: 'steady', title: 'Still here', bodyText: 'ok' }]);
  });

  it('the crashed plug-in is auto-disabled for the session and not called again', async () => {
    const host = makeHost();
    const grenade = new ThrowingPlugin({ id: 'grenade' });
    host.register(grenade);
    await host.dispatchMessageView(makeMessage());
    await host.dispatchMessageView(makeMessage());
    expect(grenade.calls.messageView).toBe(1);
    expect(host.list()[0].enabled).toBe(false);
  });

  it('list() surfaces an error naming the crashed plug-in', async () => {
    const host = makeHost();
    host.register(new ThrowingPlugin({ id: 'grenade' }));
    await host.dispatchMessageView(makeMessage());
    const item = host.list()[0];
    expect(item.error).toBeDefined();
    expect(item.error).toContain('grenade');
  });

  it('healthy plug-ins never carry an error entry in list()', async () => {
    const host = makeHost();
    host.register(new FakePlugin({ id: 'steady' }));
    await host.dispatchMessageView(makeMessage());
    expect(host.list()[0].error).toBeUndefined();
  });

  it('a throwing composeAction leaves the chain intact — later transforms apply to the prior good draft', async () => {
    const host = makeHost();
    host.register(
      new FakePlugin({
        id: 'signer',
        composeTransform: (draft) => ({ ...draft, bodyPlain: `${draft.bodyPlain} [signed]` }),
      }),
    );
    host.register(new ThrowingPlugin({ id: 'grenade' }));
    host.register(
      new FakePlugin({
        id: 'shouter',
        composeTransform: (draft) => ({ ...draft, bodyPlain: draft.bodyPlain.toUpperCase() }),
      }),
    );
    const result = await host.dispatchComposeAction(makeDraft());
    expect(result.bodyPlain).toBe('HI BOB [SIGNED]');
    const grenade = host.list().find((item) => item.id === 'grenade');
    expect(grenade?.enabled).toBe(false);
  });

  it('auto-disable is session-only — a fresh host over the same settings sees the plug-in enabled again', async () => {
    const settings = new InMemoryPluginSettings();
    const first = makeHost(settings);
    first.register(new ThrowingPlugin({ id: 'grenade' }));
    await first.dispatchMessageView(makeMessage());
    expect(first.list()[0].enabled).toBe(false);

    const second = makeHost(settings);
    second.register(new ThrowingPlugin({ id: 'grenade' }));
    expect(second.list()[0].enabled).toBe(true);
    expect(second.list()[0].error).toBeUndefined();
  });

  it('explicitly re-enabling a crashed plug-in clears the error and restores dispatch', async () => {
    const host = makeHost();
    let failures = 0;
    host.register(
      makeInlinePlugin({
        id: 'flaky',
        contributes: () => ['messageView'],
        messageView: () => {
          if (failures === 0) {
            failures += 1;
            throw new Error('first call explodes');
          }
          return [{ pluginId: 'flaky', title: 'Recovered', bodyText: 'ok' }];
        },
      }),
    );
    await host.dispatchMessageView(makeMessage());
    expect(host.list()[0].enabled).toBe(false);

    host.setEnabled('flaky', true);
    expect(host.list()[0].error).toBeUndefined();
    const contributions = await host.dispatchMessageView(makeMessage());
    expect(contributions).toEqual([{ pluginId: 'flaky', title: 'Recovered', bodyText: 'ok' }]);
  });
});

describe('story: crash isolation — a hook exceeding the 2-second timeout is treated as hung', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a hung hook is abandoned at 2s and the plug-in auto-disabled with a timeout error', async () => {
    const host = makeHost();
    host.register(new ThrowingPlugin({ id: 'tarpit', failure: 'hang' }));
    host.register(new FakePlugin({ id: 'steady', viewContribution: { title: 'Still here', bodyText: 'ok' } }));

    const pending = host.dispatchMessageView(makeMessage());
    await vi.advanceTimersByTimeAsync(2000);
    const contributions = await pending;

    expect(contributions).toEqual([{ pluginId: 'steady', title: 'Still here', bodyText: 'ok' }]);
    const tarpit = host.list().find((item) => item.id === 'tarpit');
    expect(tarpit?.enabled).toBe(false);
    expect(tarpit?.error).toContain('tarpit');
    expect(tarpit?.error).toMatch(/2000|2 ?s|time/i);
  });

  it('a slow-but-under-2s hook completes normally and stays enabled', async () => {
    const host = makeHost();
    host.register(
      makeInlinePlugin({
        id: 'slowpoke',
        contributes: () => ['messageView'],
        messageView: () =>
          new Promise((resolve) => {
            setTimeout(() => resolve([{ pluginId: 'slowpoke', title: 'Late', bodyText: 'made it' }]), 1999);
          }),
      }),
    );

    const pending = host.dispatchMessageView(makeMessage());
    await vi.advanceTimersByTimeAsync(1999);
    const contributions = await pending;

    expect(contributions).toEqual([{ pluginId: 'slowpoke', title: 'Late', bodyText: 'made it' }]);
    expect(host.list()[0].enabled).toBe(true);
    expect(host.list()[0].error).toBeUndefined();
  });
});

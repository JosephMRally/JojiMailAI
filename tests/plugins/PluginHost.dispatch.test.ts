/**
 * Dispatch tests for PluginHost (user-stories/typescript_plugin_system.md):
 * - story: per-extension-point dispatch calls only enabled plug-ins that
 *   declare that point (capability negotiation is structural);
 * - story: results merged in registration order, each contribution
 *   attributable via pluginId;
 * - story: composeAction transforms applied sequentially in registration
 *   order, each receiving the previous result, never auto-sending;
 * - story: core flows fully functional with zero plug-ins registered.
 */
import { describe, expect, it } from 'vitest';
import { FakePlugin } from '../../src/plugins/FakePlugin';
import { PluginHost } from '../../src/plugins/PluginHost';
import { InMemoryPluginSettings } from '../../src/plugins/PluginSettings';
import { makeDraft, makeInlinePlugin, makeMessage, makeThreadSummary } from './fixtures';

function makeHost(): PluginHost {
  return new PluginHost(new InMemoryPluginSettings());
}

describe('story: dispatch calls only enabled plug-ins that declare the point', () => {
  it('a hook on a plug-in that does not declare the point is never called', async () => {
    const host = makeHost();
    let called = 0;
    host.register(
      makeInlinePlugin({
        id: 'undeclared',
        contributes: () => ['composeAction'],
        composeAction: (draft) => draft,
        messageView: () => {
          called += 1;
          return [{ pluginId: 'undeclared', title: 'sneaky', bodyText: 'should not appear' }];
        },
      }),
    );
    const contributions = await host.dispatchMessageView(makeMessage());
    expect(called).toBe(0);
    expect(contributions).toEqual([]);
  });

  it('a disabled plug-in is skipped by every dispatch', async () => {
    const host = makeHost();
    const plugin = new FakePlugin({
      id: 'muted',
      composeTransform: (draft) => ({ ...draft, bodyPlain: 'hijacked' }),
    });
    host.register(plugin);
    host.setEnabled('muted', false);

    expect(await host.dispatchMessageView(makeMessage())).toEqual([]);
    expect(await host.dispatchThreadAction(makeThreadSummary())).toEqual([]);
    expect(await host.dispatchSettingsPanel()).toEqual([]);
    expect(await host.dispatchComposeAction(makeDraft())).toEqual(makeDraft());
    expect(plugin.calls.messageView).toBe(0);
    expect(plugin.calls.threadAction).toBe(0);
    expect(plugin.calls.settingsPanel).toBe(0);
    expect(plugin.calls.composeAction).toBe(0);
  });

  it('a composeAction hook on a plug-in that does not declare the point is never applied', async () => {
    const host = makeHost();
    let called = 0;
    host.register(
      makeInlinePlugin({
        id: 'undeclared-compose',
        contributes: () => ['messageView'],
        composeAction: (draft) => {
          called += 1;
          return { ...draft, bodyPlain: 'hijacked' };
        },
      }),
    );
    await expect(host.dispatchComposeAction(makeDraft())).resolves.toEqual(makeDraft());
    expect(called).toBe(0);
  });

  it('a plug-in that declares a point but implements no hook is skipped without error', async () => {
    const host = makeHost();
    host.register(makeInlinePlugin({ id: 'all-talk', contributes: () => ['messageView'] }));
    await expect(host.dispatchMessageView(makeMessage())).resolves.toEqual([]);
  });
});

describe('story: results merged in registration order, every contribution attributable via pluginId', () => {
  it('messageView contributions arrive in registration order, each carrying its pluginId', async () => {
    const host = makeHost();
    host.register(new FakePlugin({ id: 'first', viewContribution: { title: 'A', bodyText: 'a' } }));
    host.register(new FakePlugin({ id: 'second', viewContribution: { title: 'B', bodyText: 'b' } }));
    const contributions = await host.dispatchMessageView(makeMessage());
    expect(contributions).toEqual([
      { pluginId: 'first', title: 'A', bodyText: 'a' },
      { pluginId: 'second', title: 'B', bodyText: 'b' },
    ]);
  });

  it('threadAction actions arrive in registration order with pluginIds and runnable actions', async () => {
    const host = makeHost();
    const runs: string[] = [];
    host.register(new FakePlugin({ id: 'first', actionLabel: 'Alpha', onAction: () => runs.push('first') }));
    host.register(new FakePlugin({ id: 'second', actionLabel: 'Beta', onAction: () => runs.push('second') }));
    const actions = await host.dispatchThreadAction(makeThreadSummary());
    expect(actions.map((action) => action.pluginId)).toEqual(['first', 'second']);
    expect(actions.map((action) => action.label)).toEqual(['Alpha', 'Beta']);
    await actions[1].run();
    expect(runs).toEqual(['second']);
  });

  it('settingsPanel contributions arrive in registration order with pluginIds', async () => {
    const host = makeHost();
    host.register(new FakePlugin({ id: 'first', settingsContribution: { title: 'First panel', fields: [] } }));
    host.register(new FakePlugin({ id: 'second', settingsContribution: { title: 'Second panel', fields: [] } }));
    const panels = await host.dispatchSettingsPanel();
    expect(panels.map((panel) => panel.pluginId)).toEqual(['first', 'second']);
    expect(panels.map((panel) => panel.title)).toEqual(['First panel', 'Second panel']);
  });

  it('the host stamps pluginId even when a plug-in mislabels its own contribution', async () => {
    const host = makeHost();
    host.register(
      makeInlinePlugin({
        id: 'honest-abe',
        contributes: () => ['messageView'],
        messageView: () => [{ pluginId: 'imposter', title: 'Claimed', bodyText: 'body' }],
      }),
    );
    const contributions = await host.dispatchMessageView(makeMessage());
    expect(contributions).toEqual([{ pluginId: 'honest-abe', title: 'Claimed', bodyText: 'body' }]);
  });
});

describe('story: composeAction transforms chain sequentially in registration order', () => {
  it('each transform receives the previous transform’s result', async () => {
    const host = makeHost();
    const received: string[] = [];
    host.register(
      new FakePlugin({
        id: 'signer',
        composeTransform: (draft) => ({ ...draft, bodyPlain: `${draft.bodyPlain} [signed]` }),
      }),
    );
    host.register(
      new FakePlugin({
        id: 'shouter',
        composeTransform: (draft) => {
          received.push(draft.bodyPlain);
          return { ...draft, bodyPlain: draft.bodyPlain.toUpperCase() };
        },
      }),
    );
    const result = await host.dispatchComposeAction(makeDraft());
    expect(received).toEqual(['Hi Bob [signed]']);
    expect(result.bodyPlain).toBe('HI BOB [SIGNED]');
  });

  it('the final draft is returned to the caller — the host exposes no send affordance', () => {
    const methodNames = Object.getOwnPropertyNames(PluginHost.prototype);
    expect(methodNames.filter((name) => /send/i.test(name))).toEqual([]);
  });
});

describe('story: core flows fully functional with zero plug-ins registered', () => {
  it('an empty host lists nothing and dispatches every extension point harmlessly', async () => {
    const host = makeHost();
    expect(host.list()).toEqual([]);
    await expect(host.dispatchMessageView(makeMessage())).resolves.toEqual([]);
    await expect(host.dispatchThreadAction(makeThreadSummary())).resolves.toEqual([]);
    await expect(host.dispatchSettingsPanel()).resolves.toEqual([]);
  });

  it('an empty host passes a compose draft through unchanged', async () => {
    const host = makeHost();
    const draft = makeDraft();
    await expect(host.dispatchComposeAction(draft)).resolves.toEqual(makeDraft());
  });
});

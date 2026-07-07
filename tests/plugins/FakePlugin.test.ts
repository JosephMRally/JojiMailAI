/**
 * Fixture-plug-in tests (user-stories/typescript_plugin_system.md):
 * - story: FakePlugin implementing configurable contributions and a
 *   ThrowingPlugin fixture for the isolation stories, both with fake data —
 *   UI and host tests exercise every extension point and every failure path
 *   deterministically.
 */
import { describe, expect, it } from 'vitest';
import { FakePlugin, ThrowingPlugin } from '../../src/plugins/FakePlugin';
import { PLUGIN_API_VERSION } from '../../src/plugins/PluginHost';
import { makeDraft, makeMessage, makeThreadSummary } from './fixtures';

const ALL_POINTS = ['messageView', 'composeAction', 'threadAction', 'settingsPanel'];

describe('story: FakePlugin — configurable contributions with fake data', () => {
  it('defaults target the current API and declare all four extension points with deterministic data', async () => {
    const plugin = new FakePlugin();
    expect(plugin.apiVersion).toBe(PLUGIN_API_VERSION);
    expect(plugin.contributes()).toEqual(ALL_POINTS);

    const views = await plugin.messageView!(makeMessage());
    expect(views).toHaveLength(1);
    expect(views[0].pluginId).toBe(plugin.id);
    expect(typeof views[0].title).toBe('string');
    expect(typeof views[0].bodyText).toBe('string');

    // Default compose transform is the identity — safe to stack anywhere.
    const draft = makeDraft();
    expect(await plugin.composeAction!(draft)).toEqual(makeDraft());

    const actions = await plugin.threadAction!(makeThreadSummary());
    expect(actions).toHaveLength(1);
    expect(actions[0].pluginId).toBe(plugin.id);
    await expect(actions[0].run()).resolves.toBeUndefined();

    const panel = await plugin.settingsPanel!();
    expect(panel.pluginId).toBe(plugin.id);
    expect(Array.isArray(panel.fields)).toBe(true);
  });

  it('identity, capabilities, and every contribution are configurable per test', async () => {
    let ran = 0;
    const plugin = new FakePlugin({
      id: 'custom',
      name: 'Custom Plugin',
      version: '9.9.9',
      contributes: ['messageView', 'threadAction'],
      viewContribution: { title: 'Custom panel', bodyText: 'custom body' },
      actionLabel: 'Custom action',
      onAction: () => {
        ran += 1;
      },
    });
    expect(plugin.id).toBe('custom');
    expect(plugin.name).toBe('Custom Plugin');
    expect(plugin.version).toBe('9.9.9');
    expect(plugin.contributes()).toEqual(['messageView', 'threadAction']);

    expect(await plugin.messageView!(makeMessage())).toEqual([
      { pluginId: 'custom', title: 'Custom panel', bodyText: 'custom body' },
    ]);
    const actions = await plugin.threadAction!(makeThreadSummary());
    await actions[0].run();
    expect(ran).toBe(1);
  });

  it('records hook calls so tests can assert what the host did and did not dispatch', async () => {
    const plugin = new FakePlugin({ id: 'counted' });
    expect(plugin.calls).toEqual({ messageView: 0, composeAction: 0, threadAction: 0, settingsPanel: 0 });
    await plugin.messageView!(makeMessage());
    await plugin.messageView!(makeMessage());
    await plugin.composeAction!(makeDraft());
    await plugin.threadAction!(makeThreadSummary());
    await plugin.settingsPanel!();
    expect(plugin.calls).toEqual({ messageView: 2, composeAction: 1, threadAction: 1, settingsPanel: 1 });
  });
});

describe('story: ThrowingPlugin — deterministic failure fixture for the isolation stories', () => {
  it('declares all four extension points and throws from every hook by default', () => {
    const plugin = new ThrowingPlugin({ id: 'boom' });
    expect(plugin.contributes()).toEqual(ALL_POINTS);
    expect(() => plugin.messageView!(makeMessage())).toThrow();
    expect(() => plugin.composeAction!(makeDraft())).toThrow();
    expect(() => plugin.threadAction!(makeThreadSummary())).toThrow();
    expect(() => plugin.settingsPanel!()).toThrow();
  });

  it('counts hook calls so tests can prove the host stopped dispatching to it', () => {
    const plugin = new ThrowingPlugin({ id: 'boom' });
    expect(() => plugin.messageView!(makeMessage())).toThrow();
    expect(plugin.calls.messageView).toBe(1);
  });

  it("failure: 'hang' returns promises that never settle", async () => {
    const plugin = new ThrowingPlugin({ id: 'tarpit', failure: 'hang' });
    const pending = plugin.messageView!(makeMessage());
    expect(pending).toBeInstanceOf(Promise);
    const winner = await Promise.race([pending, Promise.resolve('still-pending')]);
    expect(winner).toBe('still-pending');
  });
});

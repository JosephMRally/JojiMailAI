/**
 * Contract tests for the MailPlugin interface
 * (user-stories/typescript_plugin_system.md):
 * - story: a `MailPlugin` interface — {id, name, version, apiVersion,
 *   contributes()} plus one optional method per extension point — that is
 *   the single plug-in surface;
 * - story: four typed extension points in v1 (messageView, composeAction,
 *   threadAction, settingsPanel).
 */
import { describe, expect, it } from 'vitest';
import type { ExtensionPoint, MailPlugin } from '../../src/plugins/MailPlugin';
import { FakePlugin } from '../../src/plugins/FakePlugin';
import { makeDraft, makeMessage, makeThreadSummary } from './fixtures';

const ALL_POINTS: ExtensionPoint[] = ['messageView', 'composeAction', 'threadAction', 'settingsPanel'];

describe('story: MailPlugin — id, name, version, apiVersion, contributes(), one optional method per point', () => {
  it('a minimal plugin with only the required members satisfies the interface (all hooks optional)', () => {
    const minimal: MailPlugin = {
      id: 'minimal',
      name: 'Minimal Plugin',
      version: '0.1.0',
      apiVersion: 1,
      contributes: () => [],
    };
    expect(minimal.contributes()).toEqual([]);
    expect(minimal.messageView).toBeUndefined();
    expect(minimal.composeAction).toBeUndefined();
    expect(minimal.threadAction).toBeUndefined();
    expect(minimal.settingsPanel).toBeUndefined();
  });

  it('FakePlugin satisfies the MailPlugin interface with the required identity fields', () => {
    const plugin: MailPlugin = new FakePlugin();
    expect(typeof plugin.id).toBe('string');
    expect(typeof plugin.name).toBe('string');
    expect(typeof plugin.version).toBe('string');
    expect(typeof plugin.apiVersion).toBe('number');
    expect(plugin.contributes()).toEqual(ALL_POINTS);
  });
});

describe('story: four typed extension points in v1', () => {
  it('messageView(message) yields ViewContribution[] — {pluginId, title, bodyText}', async () => {
    const plugin = new FakePlugin({
      id: 'viewer',
      viewContribution: { title: 'Tracker check', bodyText: 'No trackers found.' },
    });
    const contributions = await plugin.messageView!(makeMessage());
    expect(contributions).toEqual([
      { pluginId: 'viewer', title: 'Tracker check', bodyText: 'No trackers found.' },
    ]);
  });

  it('composeAction(draft) yields a transformed Draft', async () => {
    const plugin = new FakePlugin({
      id: 'signer',
      composeTransform: (draft) => ({ ...draft, bodyPlain: `${draft.bodyPlain}\n--\nSent from JojiMail` }),
    });
    const result = await plugin.composeAction!(makeDraft());
    expect(result.to).toEqual(['bob@example.com']);
    expect(result.bodyPlain).toBe('Hi Bob\n--\nSent from JojiMail');
  });

  it('threadAction(threadSummary) yields PluginAction[] — {pluginId, label, run()} with awaitable run', async () => {
    let ran = 0;
    const plugin = new FakePlugin({
      id: 'snoozer',
      actionLabel: 'Snooze',
      onAction: () => {
        ran += 1;
      },
    });
    const actions = await plugin.threadAction!(makeThreadSummary());
    expect(actions).toHaveLength(1);
    expect(actions[0].pluginId).toBe('snoozer');
    expect(actions[0].label).toBe('Snooze');
    await actions[0].run();
    expect(ran).toBe(1);
  });

  it('settingsPanel() yields a SettingsContribution — {pluginId, title, fields[]}', async () => {
    const plugin = new FakePlugin({
      id: 'themer',
      settingsContribution: {
        title: 'Theme',
        fields: [{ key: 'accent', label: 'Accent color', value: 'teal' }],
      },
    });
    const panel = await plugin.settingsPanel!();
    expect(panel).toEqual({
      pluginId: 'themer',
      title: 'Theme',
      fields: [{ key: 'accent', label: 'Accent color', value: 'teal' }],
    });
  });
});

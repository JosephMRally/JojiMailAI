/**
 * Registry and crash-isolated dispatcher for MailPlugins
 * (user-stories/typescript_plugin_system.md):
 * - register() rejects plug-ins written against another API version;
 * - dispatch reaches only enabled plug-ins that declare the point, merges
 *   results in registration order, and stamps pluginId on every
 *   contribution so the UI can render, group, and blame deterministically;
 * - every hook call is isolated: a throw or a 2-second timeout auto-disables
 *   the plug-in for the session and surfaces the error via list();
 * - enabled/disabled choices persist through the injected PluginSettings.
 *
 * The final compose Draft is returned to the caller — dispatch never sends
 * anything; only the user's explicit action does.
 */
import type {
  ExtensionPoint,
  MailPlugin,
  PluginAction,
  SettingsContribution,
  ViewContribution,
} from './MailPlugin';
import type { Draft, Message, ThreadSummary } from '../providers/model';
import type { PluginSettings } from './PluginSettings';

/** The plug-in API version this host implements. */
export const PLUGIN_API_VERSION = 1;

/** In-process hooks are synchronous work; anything past this is hung. */
export const DISPATCH_TIMEOUT_MS = 2000;

export interface PluginListItem {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  contributes: ExtensionPoint[];
  error?: string;
}

interface PluginRecord {
  plugin: MailPlugin;
  contributes: ExtensionPoint[];
  /** The user's persisted choice. */
  enabled: boolean;
  /** Crash isolation: set for this session only, never persisted. */
  sessionDisabled: boolean;
  error?: string;
}

const ENABLED_KEY_PREFIX = 'plugin.enabled.';

export class PluginHost {
  /** Map preserves insertion order — dispatch and list() follow registration order. */
  private readonly records = new Map<string, PluginRecord>();

  constructor(private readonly settings: PluginSettings) {}

  register(plugin: MailPlugin): void {
    if (plugin.apiVersion !== PLUGIN_API_VERSION) {
      throw new Error(
        `Plugin "${plugin.id}" targets plugin API version ${plugin.apiVersion}, ` +
          `but this host implements version ${PLUGIN_API_VERSION}`,
      );
    }
    const persisted = this.settings.get(ENABLED_KEY_PREFIX + plugin.id);
    this.records.set(plugin.id, {
      plugin,
      contributes: plugin.contributes(),
      enabled: persisted === null ? true : persisted === 'true',
      sessionDisabled: false,
    });
  }

  setEnabled(pluginId: string, enabled: boolean): void {
    const record = this.requireRecord(pluginId);
    record.enabled = enabled;
    this.settings.set(ENABLED_KEY_PREFIX + pluginId, String(enabled));
    if (enabled) {
      // An explicit re-enable gives a crashed plug-in a fresh chance.
      record.sessionDisabled = false;
      record.error = undefined;
    }
  }

  list(): PluginListItem[] {
    return [...this.records.values()].map((record) => ({
      id: record.plugin.id,
      name: record.plugin.name,
      version: record.plugin.version,
      enabled: record.enabled && !record.sessionDisabled,
      contributes: [...record.contributes],
      error: record.error,
    }));
  }

  async dispatchMessageView(message: Message): Promise<ViewContribution[]> {
    const merged: ViewContribution[] = [];
    for (const record of this.activeRecords('messageView')) {
      const hook = record.plugin.messageView;
      if (!hook) continue;
      const result = await this.invoke(record, 'messageView', () => hook.call(record.plugin, message));
      if (result) {
        merged.push(...result.map((item) => ({ ...item, pluginId: record.plugin.id })));
      }
    }
    return merged;
  }

  async dispatchComposeAction(draft: Draft): Promise<Draft> {
    let current = draft;
    for (const record of this.activeRecords('composeAction')) {
      const hook = record.plugin.composeAction;
      if (!hook) continue;
      const input = current;
      const result = await this.invoke(record, 'composeAction', () => hook.call(record.plugin, input));
      if (result !== undefined) current = result;
    }
    return current;
  }

  async dispatchThreadAction(threadSummary: ThreadSummary): Promise<PluginAction[]> {
    const merged: PluginAction[] = [];
    for (const record of this.activeRecords('threadAction')) {
      const hook = record.plugin.threadAction;
      if (!hook) continue;
      const result = await this.invoke(record, 'threadAction', () => hook.call(record.plugin, threadSummary));
      if (result) {
        merged.push(...result.map((action) => ({ ...action, pluginId: record.plugin.id })));
      }
    }
    return merged;
  }

  async dispatchSettingsPanel(): Promise<SettingsContribution[]> {
    const merged: SettingsContribution[] = [];
    for (const record of this.activeRecords('settingsPanel')) {
      const hook = record.plugin.settingsPanel;
      if (!hook) continue;
      const result = await this.invoke(record, 'settingsPanel', () => hook.call(record.plugin));
      if (result) {
        merged.push({ ...result, pluginId: record.plugin.id });
      }
    }
    return merged;
  }

  /** Enabled plug-ins that declare the point, in registration order. */
  private activeRecords(point: ExtensionPoint): PluginRecord[] {
    return [...this.records.values()].filter(
      (record) => record.enabled && !record.sessionDisabled && record.contributes.includes(point),
    );
  }

  /**
   * Crash isolation around one hook call: a synchronous throw, a rejection,
   * or a hang past DISPATCH_TIMEOUT_MS auto-disables the plug-in for the
   * session and records an error for list(); dispatch then continues with
   * the remaining plug-ins.
   */
  private async invoke<T>(
    record: PluginRecord,
    point: ExtensionPoint,
    call: () => T | Promise<T>,
  ): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => call())(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`hook timed out after ${DISPATCH_TIMEOUT_MS} ms`)),
            DISPATCH_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : String(caught);
      record.sessionDisabled = true;
      record.error = `Plugin "${record.plugin.id}" was disabled for this session: ${point} failed — ${reason}`;
      return undefined;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private requireRecord(pluginId: string): PluginRecord {
    const record = this.records.get(pluginId);
    if (!record) {
      throw new Error(`No plugin registered with id "${pluginId}"`);
    }
    return record;
  }
}

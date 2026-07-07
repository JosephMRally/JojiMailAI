/**
 * The versioned plug-in contract and its typed extension-point payloads —
 * the single plug-in surface the UI may import (plus the PluginHost).
 * Pure types — zero I/O. Spec: user-stories/typescript_plugin_system.md.
 *
 * v1 plug-ins are in-process TypeScript modules registered at the
 * composition root; dynamic loading from files or URLs is a deliberate
 * non-goal of this version.
 */
import type { Draft, Message, ThreadSummary } from '../providers/model';

/** The four typed extension points of plug-in API v1. */
export type ExtensionPoint = 'messageView' | 'composeAction' | 'threadAction' | 'settingsPanel';

/** A panel/banner rendered above a message. */
export interface ViewContribution {
  pluginId: string;
  title: string;
  bodyText: string;
}

/** An extra action offered on a thread row. */
export interface PluginAction {
  pluginId: string;
  label: string;
  run(): Promise<void>;
}

export interface SettingsField {
  key: string;
  label: string;
  value: string;
}

/** A plug-in's panel in the settings screen. */
export interface SettingsContribution {
  pluginId: string;
  title: string;
  fields: SettingsField[];
}

/**
 * The contract every plug-in implements: identity, the API version it was
 * written against, a declaration of which extension points it contributes
 * to, and one optional hook per extension point. The host only ever calls
 * hooks for points a plug-in declares via contributes() — capability
 * negotiation is structural.
 */
export interface MailPlugin {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  contributes(): ExtensionPoint[];
  messageView?(message: Message): ViewContribution[] | Promise<ViewContribution[]>;
  composeAction?(draft: Draft): Draft | Promise<Draft>;
  threadAction?(threadSummary: ThreadSummary): PluginAction[] | Promise<PluginAction[]>;
  settingsPanel?(): SettingsContribution | Promise<SettingsContribution>;
}

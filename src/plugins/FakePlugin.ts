/**
 * Deterministic fixture plug-ins (user-stories/typescript_plugin_system.md):
 * FakePlugin offers configurable contributions for every extension point and
 * counts hook calls; ThrowingPlugin fails on demand (throw or hang) for the
 * crash-isolation stories. All data is fake; zero I/O.
 */
import type {
  ExtensionPoint,
  MailPlugin,
  PluginAction,
  SettingsContribution,
  SettingsField,
  ViewContribution,
} from './MailPlugin';
import type { Draft, Message, ThreadSummary } from '../providers/model';
import { PLUGIN_API_VERSION } from './PluginHost';

const ALL_POINTS: ExtensionPoint[] = ['messageView', 'composeAction', 'threadAction', 'settingsPanel'];

interface HookCallCounts {
  messageView: number;
  composeAction: number;
  threadAction: number;
  settingsPanel: number;
}

function zeroCounts(): HookCallCounts {
  return { messageView: 0, composeAction: 0, threadAction: 0, settingsPanel: 0 };
}

export interface FakePluginOptions {
  id?: string;
  name?: string;
  version?: string;
  apiVersion?: number;
  contributes?: ExtensionPoint[];
  /** Rendered by messageView; pluginId is stamped automatically. */
  viewContribution?: { title: string; bodyText: string };
  /** Applied by composeAction; defaults to the identity transform. */
  composeTransform?: (draft: Draft) => Draft;
  /** Label of the single threadAction this fake offers. */
  actionLabel?: string;
  /** Invoked when the threadAction's run() is awaited. */
  onAction?: () => void;
  /** Returned by settingsPanel; pluginId is stamped automatically. */
  settingsContribution?: { title: string; fields: SettingsField[] };
}

export class FakePlugin implements MailPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly apiVersion: number;
  /** Observability for tests: how often each hook was actually called. */
  readonly calls: HookCallCounts = zeroCounts();

  private readonly declared: ExtensionPoint[];
  private readonly viewContribution: { title: string; bodyText: string };
  private readonly composeTransform: (draft: Draft) => Draft;
  private readonly actionLabel: string;
  private readonly onAction: () => void;
  private readonly settingsContribution: { title: string; fields: SettingsField[] };

  constructor(options: FakePluginOptions = {}) {
    this.id = options.id ?? 'fake-plugin';
    this.name = options.name ?? 'Fake Plugin';
    this.version = options.version ?? '1.0.0';
    this.apiVersion = options.apiVersion ?? PLUGIN_API_VERSION;
    this.declared = options.contributes ?? [...ALL_POINTS];
    this.viewContribution = options.viewContribution ?? {
      title: 'Fake panel',
      bodyText: 'Deterministic fake panel body.',
    };
    this.composeTransform = options.composeTransform ?? ((draft) => draft);
    this.actionLabel = options.actionLabel ?? 'Fake action';
    this.onAction = options.onAction ?? (() => {});
    this.settingsContribution = options.settingsContribution ?? {
      title: 'Fake settings',
      fields: [{ key: 'fakeKey', label: 'Fake key', value: 'fake-value' }],
    };
  }

  contributes(): ExtensionPoint[] {
    return [...this.declared];
  }

  messageView(_message: Message): ViewContribution[] {
    this.calls.messageView += 1;
    return [{ pluginId: this.id, ...this.viewContribution }];
  }

  composeAction(draft: Draft): Draft {
    this.calls.composeAction += 1;
    return this.composeTransform(draft);
  }

  threadAction(_threadSummary: ThreadSummary): PluginAction[] {
    this.calls.threadAction += 1;
    return [
      {
        pluginId: this.id,
        label: this.actionLabel,
        run: async () => {
          this.onAction();
        },
      },
    ];
  }

  settingsPanel(): SettingsContribution {
    this.calls.settingsPanel += 1;
    return { pluginId: this.id, ...this.settingsContribution };
  }
}

export interface ThrowingPluginOptions {
  id?: string;
  name?: string;
  version?: string;
  apiVersion?: number;
  contributes?: ExtensionPoint[];
  /** 'throw' fails synchronously; 'hang' returns a promise that never settles. */
  failure?: 'throw' | 'hang';
}

/** Fixture for the isolation stories: every declared hook fails, deterministically. */
export class ThrowingPlugin implements MailPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly apiVersion: number;
  /** Observability for tests: proves the host stopped dispatching to it. */
  readonly calls: HookCallCounts = zeroCounts();

  private readonly declared: ExtensionPoint[];
  private readonly failure: 'throw' | 'hang';

  constructor(options: ThrowingPluginOptions = {}) {
    this.id = options.id ?? 'throwing-plugin';
    this.name = options.name ?? 'Throwing Plugin';
    this.version = options.version ?? '1.0.0';
    this.apiVersion = options.apiVersion ?? PLUGIN_API_VERSION;
    this.declared = options.contributes ?? [...ALL_POINTS];
    this.failure = options.failure ?? 'throw';
  }

  contributes(): ExtensionPoint[] {
    return [...this.declared];
  }

  messageView(_message: Message): ViewContribution[] | Promise<ViewContribution[]> {
    this.calls.messageView += 1;
    return this.fail('messageView');
  }

  composeAction(_draft: Draft): Draft | Promise<Draft> {
    this.calls.composeAction += 1;
    return this.fail('composeAction');
  }

  threadAction(_threadSummary: ThreadSummary): PluginAction[] | Promise<PluginAction[]> {
    this.calls.threadAction += 1;
    return this.fail('threadAction');
  }

  settingsPanel(): SettingsContribution | Promise<SettingsContribution> {
    this.calls.settingsPanel += 1;
    return this.fail('settingsPanel');
  }

  private fail<T>(point: ExtensionPoint): Promise<T> {
    if (this.failure === 'hang') {
      return new Promise<T>(() => {});
    }
    throw new Error(`${this.id} exploded in ${point}`);
  }
}

/**
 * The root UI component (user-stories/typescript_email_ui.md): a client of
 * the Proxy pattern four times over — it receives the ProviderRegistry, a
 * MailIntelligence, a MailStore, and the PluginHost from the composition
 * root and calls only interface methods. State-based navigation (no router):
 * account/tag sidebar, per-tag mailbox, thread view, compose, and plug-in
 * settings. Capability-gated affordances; concrete classes never appear here.
 */
import { useEffect, useMemo, useState } from 'react';
import type { MailIntelligence } from '../intelligence/MailIntelligence';
import type { PluginHost } from '../plugins/PluginHost';
import type { ProviderCapabilities } from '../providers/MailProvider';
import type { Message, Tag } from '../providers/model';
import type { ProviderRegistry } from '../providers/ProviderRegistry';
import type { MailStore } from '../store/MailStore';
import { ComposeScreen, type ComposePrefill } from './ComposeScreen';
import { toProviderFailure, type ProviderFailure } from './errors';
import { MailboxScreen } from './MailboxScreen';
import { PluginSettingsScreen } from './PluginSettingsScreen';
import { ThreadViewScreen } from './ThreadViewScreen';

export interface AppProps {
  registry: ProviderRegistry;
  intelligence: MailIntelligence;
  store: MailStore;
  pluginHost: PluginHost;
  /** Injectable clock so relative dates are testable; defaults to Date.now. */
  now?: () => number;
}

type Screen =
  | { kind: 'list' }
  | { kind: 'thread'; threadId: string }
  | { kind: 'compose'; prefill?: ComposePrefill; replyThread?: Message[] }
  | { kind: 'plugins' };

/** "Re: subject", never duplicated when the subject already carries it. */
export function replySubject(subject: string): string {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

export function App({ registry, intelligence, store, pluginHost, now = Date.now }: AppProps) {
  const accounts = registry.listAccounts();
  const [accountId, setAccountId] = useState<string>(accounts[0]);
  const provider = useMemo(() => registry.resolve(accountId), [registry, accountId]);
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [caps, setCaps] = useState<ProviderCapabilities | null>(null);
  const [tagId, setTagId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });
  const [loadError, setLoadError] = useState<ProviderFailure | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  // Account selection loads that provider's tags and capabilities.
  useEffect(() => {
    let live = true;
    setTags(null);
    setCaps(null);
    setTagId(null);
    setLoadError(null);
    setScreen({ kind: 'list' });
    void Promise.all([provider.listTags(), provider.capabilities()]).then(
      ([loadedTags, loadedCaps]) => {
        if (!live) return;
        setTags(loadedTags);
        setCaps(loadedCaps);
        setTagId(loadedTags[0]?.tagId ?? null);
      },
      (error: unknown) => {
        // Error state, never a stuck loading screen — e.g. AUTH_REQUIRED
        // before Google sign-in, or offline at startup.
        if (live) setLoadError(toProviderFailure(error));
      },
    );
    return () => {
      live = false;
    };
  }, [provider, loadAttempt]);

  const openReply = (message: Message, thread: Message[]): void => {
    setScreen({
      kind: 'compose',
      prefill: { to: message.from, subject: replySubject(message.subject) },
      replyThread: thread,
    });
  };

  return (
    <div>
      <nav aria-label="Accounts">
        {accounts.map((id) => (
          <button
            key={id}
            aria-current={id === accountId ? 'true' : undefined}
            onClick={() => setAccountId(id)}
          >
            {id}
          </button>
        ))}
      </nav>
      {loadError !== null ? (
        <div role="alert">
          {loadError.message}{' '}
          <button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</button>
        </div>
      ) : tags === null || caps === null ? (
        <p>Loading…</p>
      ) : (
        <>
          <nav aria-label="Tags">
            {tags.map((tag) => (
              <button
                key={tag.tagId}
                aria-current={tag.tagId === tagId ? 'true' : undefined}
                onClick={() => {
                  setTagId(tag.tagId);
                  setScreen({ kind: 'list' });
                }}
              >
                {tag.name}
              </button>
            ))}
          </nav>
          {caps.supportsSend && (
            <button onClick={() => setScreen({ kind: 'compose' })}>Compose</button>
          )}
          <button onClick={() => setScreen({ kind: 'plugins' })}>Plugins</button>
          <main>
            {screen.kind === 'list' && tagId !== null && (
              <MailboxScreen
                key={`${accountId}|${tagId}`}
                provider={provider}
                store={store}
                intelligence={intelligence}
                pluginHost={pluginHost}
                caps={caps}
                tags={tags}
                accountId={accountId}
                tagId={tagId}
                now={now}
                onOpenThread={(threadId) => setScreen({ kind: 'thread', threadId })}
              />
            )}
            {screen.kind === 'thread' && (
              <ThreadViewScreen
                key={screen.threadId}
                provider={provider}
                store={store}
                intelligence={intelligence}
                pluginHost={pluginHost}
                caps={caps}
                tags={tags}
                accountId={accountId}
                threadId={screen.threadId}
                now={now}
                onBack={() => setScreen({ kind: 'list' })}
                onReply={openReply}
              />
            )}
            {screen.kind === 'compose' && (
              <ComposeScreen
                provider={provider}
                pluginHost={pluginHost}
                intelligence={intelligence}
                prefill={screen.prefill}
                replyThread={screen.replyThread}
              />
            )}
            {screen.kind === 'plugins' && <PluginSettingsScreen pluginHost={pluginHost} />}
          </main>
        </>
      )}
    </div>
  );
}

/**
 * The thread view (user-stories/typescript_email_ui.md): messages read from
 * the MailStore oldest-first, unread ones marked read via the provider, HTML
 * bodies in a sandboxed script-less iframe with remote images stripped until
 * the per-message opt-in, bodyPlain fallback, an async AI digest panel for
 * threads longer than three messages, optimistic per-message tag chips gated
 * on capabilities().supportsTags, plug-in messageView panels, and a reply
 * action that hands the composer a prefilled draft.
 */
import { useCallback, useEffect, useState } from 'react';
import type { MailIntelligence, ThreadDigest } from '../intelligence/MailIntelligence';
import type { ViewContribution } from '../plugins/MailPlugin';
import type { PluginHost } from '../plugins/PluginHost';
import type { MailProvider, ProviderCapabilities } from '../providers/MailProvider';
import type { Message, Tag } from '../providers/model';
import type { MailStore } from '../store/MailStore';
import { describeAiError, toProviderFailure, type ProviderFailure } from './errors';
import { formatThreadDate } from './format';
import { blockRemoteImages } from './html';

/** Threads longer than this open with an AI digest panel. */
export const DIGEST_THRESHOLD = 3;

type DigestState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'done'; value: ThreadDigest }
  | { state: 'error'; message: string };

export interface ThreadViewScreenProps {
  provider: MailProvider;
  store: MailStore;
  intelligence: MailIntelligence;
  pluginHost: PluginHost;
  caps: ProviderCapabilities;
  tags: Tag[];
  accountId: string;
  threadId: string;
  now: () => number;
  onBack: () => void;
  onReply: (message: Message, thread: Message[]) => void;
}

export function ThreadViewScreen({
  provider,
  store,
  intelligence,
  pluginHost,
  caps,
  tags,
  threadId,
  now,
  onBack,
  onReply,
}: ThreadViewScreenProps) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [messageTags, setMessageTags] = useState<Record<string, string[]>>({});
  const [loadError, setLoadError] = useState<ProviderFailure | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [digest, setDigest] = useState<DigestState>({ state: 'idle' });
  const [digestAttempt, setDigestAttempt] = useState(0);
  const [panels, setPanels] = useState<Record<string, ViewContribution[]>>({});
  const [imagesLoaded, setImagesLoaded] = useState<Record<string, boolean>>({});

  // Load from the store (offline-first) and mark the thread read via the provider.
  useEffect(() => {
    let live = true;
    setLoadError(null);
    store.getThread(threadId).then(
      (thread) => {
        if (!live) return;
        setMessages(thread);
        setMessageTags(Object.fromEntries(thread.map((m) => [m.messageId, m.tagIds])));
        for (const message of thread.filter((m) => m.unread)) {
          void provider.markRead(message.messageId).catch(() => {});
        }
      },
      (error: unknown) => {
        // Error state, never a stuck loading screen; only NETWORK retries.
        if (live) setLoadError(toProviderFailure(error));
      },
    );
    return () => {
      live = false;
    };
  }, [store, provider, threadId, loadAttempt]);

  // The digest loads asynchronously — the messages never wait on it.
  useEffect(() => {
    if (messages === null || messages.length <= DIGEST_THRESHOLD) return;
    let live = true;
    setDigest({ state: 'loading' });
    intelligence.summarizeThread(messages).then(
      (value) => {
        if (live) setDigest({ state: 'done', value });
      },
      (error: unknown) => {
        if (live) setDigest({ state: 'error', message: describeAiError('AI digest unavailable', error) });
      },
    );
    return () => {
      live = false;
    };
  }, [messages, intelligence, digestAttempt]);

  // Plug-in messageView contributions, attributed per message.
  useEffect(() => {
    if (messages === null) return;
    let live = true;
    void (async () => {
      const map: Record<string, ViewContribution[]> = {};
      for (const message of messages) {
        map[message.messageId] = await pluginHost.dispatchMessageView(message);
      }
      if (live) setPanels(map);
    })();
    return () => {
      live = false;
    };
  }, [messages, pluginHost]);

  const tagName = useCallback(
    (id: string): string => tags.find((tag) => tag.tagId === id)?.name ?? id,
    [tags],
  );

  const addTag = (message: Message, tagId: string): void => {
    if (tagId === '') return;
    setMessageTags((prev) => ({
      ...prev,
      [message.messageId]: [...(prev[message.messageId] ?? []), tagId],
    }));
    void provider.addTag(message.messageId, tagId).catch(() => {});
  };

  const removeTag = (message: Message, tagId: string): void => {
    setMessageTags((prev) => ({
      ...prev,
      [message.messageId]: (prev[message.messageId] ?? []).filter((id) => id !== tagId),
    }));
    void provider.removeTag(message.messageId, tagId).catch(() => {});
  };

  return (
    <section>
      <button onClick={onBack}>Back</button>
      <h2>{messages?.[0]?.subject ?? ''}</h2>
      {messages !== null && messages.length > DIGEST_THRESHOLD && (
        <section aria-label="AI digest">
          {digest.state === 'loading' && <p>Summarizing…</p>}
          {digest.state === 'done' && (
            <>
              <p>{digest.value.summary}</p>
              <ul>
                {digest.value.actionItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {digest.state === 'error' && (
            <div role="alert">
              {digest.message}{' '}
              <button onClick={() => setDigestAttempt((attempt) => attempt + 1)}>Retry</button>
            </div>
          )}
        </section>
      )}
      {loadError !== null ? (
        <div role="alert">
          {loadError.message}{' '}
          {loadError.code === 'NETWORK' && (
            <button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</button>
          )}
        </div>
      ) : messages === null ? (
        <p>Loading…</p>
      ) : messages.length === 0 ? (
        <p>no messages</p>
      ) : (
        messages.map((message) => {
          const currentTags = messageTags[message.messageId] ?? message.tagIds;
          return (
            <article key={message.messageId} aria-label={`Message from ${message.from}`}>
              {(panels[message.messageId] ?? []).map((panel, index) => (
                <aside key={`${panel.pluginId}-${index}`}>
                  <h3>{panel.title}</h3>
                  <p>{panel.bodyText}</p>
                  <p>from {panel.pluginId}</p>
                </aside>
              ))}
              <p>
                {message.from} — {formatThreadDate(message.date, now())}
              </p>
              {caps.supportsTags && (
                <div>
                  {currentTags.map((id) => (
                    <span key={id}>
                      {tagName(id)}{' '}
                      <button
                        aria-label={`Remove tag ${tagName(id)}`}
                        onClick={() => removeTag(message, id)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <select
                    aria-label="Add tag"
                    value=""
                    onChange={(event) => addTag(message, event.target.value)}
                  >
                    <option value="">Add tag…</option>
                    {tags
                      .filter((tag) => !currentTags.includes(tag.tagId))
                      .map((tag) => (
                        <option key={tag.tagId} value={tag.tagId}>
                          {tag.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {message.bodyHtml !== undefined ? (
                <>
                  <iframe
                    title={`HTML body of ${message.messageId}`}
                    sandbox=""
                    srcDoc={
                      imagesLoaded[message.messageId]
                        ? message.bodyHtml
                        : blockRemoteImages(message.bodyHtml)
                    }
                  />
                  {!imagesLoaded[message.messageId] && (
                    <button
                      onClick={() =>
                        setImagesLoaded((prev) => ({ ...prev, [message.messageId]: true }))
                      }
                    >
                      Load images
                    </button>
                  )}
                </>
              ) : (
                <pre>{message.bodyPlain ?? ''}</pre>
              )}
              {caps.supportsSend && (
                <button onClick={() => onReply(message, messages)}>Reply</button>
              )}
            </article>
          );
        })
      )}
    </section>
  );
}

/**
 * The per-tag mailbox screen (user-stories/typescript_email_ui.md): thread
 * rows read from the MailStore, manual refresh syncing the provider's current
 * page into the store, pagination on nextPageToken, plain-text search over the
 * stored account (store.searchText), optimistic triage actions, and plug-in
 * threadAction entries — all through the injected interfaces, never a concrete
 * class.
 */
import { useCallback, useEffect, useState } from 'react';
import type { PluginAction } from '../plugins/MailPlugin';
import type { PluginHost } from '../plugins/PluginHost';
import type { MailProvider, ProviderCapabilities, ThreadPage } from '../providers/MailProvider';
import type { Tag, ThreadSummary } from '../providers/model';
import type { MailStore } from '../store/MailStore';
import { toProviderFailure, type ProviderFailure } from './errors';
import { formatThreadDate } from './format';

/** Threads fetched per provider page. */
export const PAGE_SIZE = 10;

export interface MailboxScreenProps {
  provider: MailProvider;
  store: MailStore;
  pluginHost: PluginHost;
  caps: ProviderCapabilities;
  tags: Tag[];
  accountId: string;
  tagId: string;
  now: () => number;
  onOpenThread: (threadId: string) => void;
}

export function MailboxScreen({
  provider,
  store,
  pluginHost,
  caps,
  tags,
  accountId,
  tagId,
  now,
  onOpenThread,
}: MailboxScreenProps) {
  const [rows, setRows] = useState<ThreadSummary[] | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [providerError, setProviderError] = useState<ProviderFailure | null>(null);
  const [query, setQuery] = useState('');
  const [searchRows, setSearchRows] = useState<ThreadSummary[] | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [actions, setActions] = useState<Record<string, PluginAction[]>>({});

  const tagName = useCallback(
    (id: string): string => tags.find((tag) => tag.tagId === id)?.name ?? id,
    [tags],
  );

  const reloadFromStore = useCallback(async (): Promise<void> => {
    setRows(await store.listThreads(accountId, tagId));
  }, [store, accountId, tagId]);

  // All thread lists read from the store; the initial view is whatever synced.
  useEffect(() => {
    let live = true;
    void store.listThreads(accountId, tagId).then((stored) => {
      if (live) setRows(stored);
    });
    return () => {
      live = false;
    };
  }, [store, accountId, tagId]);

  /** Refresh (no token) or load-more (token): provider fetch, then store upsert. */
  const fetchPage = useCallback(
    async (pageToken?: string): Promise<void> => {
      setProviderError(null);
      let page: ThreadPage;
      try {
        page = await provider.listThreads(
          tagId,
          pageToken === undefined ? { pageSize: PAGE_SIZE } : { pageSize: PAGE_SIZE, pageToken },
        );
      } catch (error) {
        setProviderError(toProviderFailure(error));
        return;
      }
      await store.upsertThreads(accountId, page.threads);
      for (const summary of page.threads) {
        try {
          await store.upsertMessages(accountId, await provider.getThread(summary.threadId));
        } catch {
          // A failed thread body fetch leaves the summary usable.
        }
      }
      setNextPageToken(page.nextPageToken);
      await reloadFromStore();
    },
    [provider, store, accountId, tagId, reloadFromStore],
  );

  // --- optimistic triage: state first, provider call in the background ------
  const markRead = (threadId: string): void => {
    setRows((prev) => prev?.map((r) => (r.threadId === threadId ? { ...r, unread: false } : r)) ?? prev);
    void store.getThread(threadId).then((messages) => {
      for (const message of messages.filter((m) => m.unread)) {
        void provider.markRead(message.messageId).catch(() => {});
      }
    });
  };

  const markUnread = (threadId: string): void => {
    setRows((prev) => prev?.map((r) => (r.threadId === threadId ? { ...r, unread: true } : r)) ?? prev);
    void store.getThread(threadId).then((messages) => {
      const newest = messages[messages.length - 1];
      if (newest) void provider.markUnread(newest.messageId).catch(() => {});
    });
  };

  const archive = (threadId: string): void => {
    setRows((prev) => prev?.filter((r) => r.threadId !== threadId) ?? prev);
    void provider.archive(threadId).catch(() => {});
  };

  const trash = (threadId: string): void => {
    setRows((prev) => prev?.filter((r) => r.threadId !== threadId) ?? prev);
    void provider.trash(threadId).catch(() => {});
  };

  // --- plug-in threadAction contributions per row ----------------------------
  useEffect(() => {
    let live = true;
    void (async () => {
      const map: Record<string, PluginAction[]> = {};
      for (const row of rows ?? []) {
        map[row.threadId] = await pluginHost.dispatchThreadAction(row);
      }
      if (live) setActions(map);
    })();
    return () => {
      live = false;
    };
  }, [rows, pluginHost]);

  // --- plain-text search over the stored account -----------------------------
  const runSearch = useCallback(async (): Promise<void> => {
    setSearchNotice(null);
    if (query.trim() === '') {
      setSearchRows(null);
      return;
    }
    const result = await store.searchText(accountId, query);
    if (result.tooGeneric) {
      setSearchNotice('Search terms too generic — try a more specific word.');
      setSearchRows([]);
      return;
    }
    const threadIds = new Set(result.messages.map((message) => message.threadId));
    const base = await store.listThreads(accountId, tagId);
    setSearchRows(base.filter((row) => threadIds.has(row.threadId)));
  }, [query, store, accountId, tagId]);

  const visible = searchRows ?? rows;

  return (
    <section>
      <h2>{tagName(tagId)}</h2>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <input
          type="search"
          aria-label="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit">Search</button>
      </form>
      {searchNotice !== null && <p role="status">{searchNotice}</p>}
      <button onClick={() => void fetchPage()}>Refresh</button>
      {providerError !== null && (
        <div role="alert">
          {providerError.message}{' '}
          {providerError.code === 'NETWORK' && (
            <button onClick={() => void fetchPage()}>Retry</button>
          )}
        </div>
      )}
      {visible === null ? (
        <p>Loading…</p>
      ) : visible.length === 0 ? (
        <p>no messages</p>
      ) : (
        <ul aria-label="Threads">
          {visible.map((row) => (
            <li key={row.threadId} aria-label={row.subject}>
              <button onClick={() => onOpenThread(row.threadId)}>{row.subject}</button>
              {row.unread && <strong aria-label="unread">●</strong>}
              <span>{row.from}</span> <span>{row.snippet}</span>{' '}
              <span>{formatThreadDate(row.date, now())}</span> <span>({row.messageCount})</span>
              {row.tagIds.map((id) => (
                <span key={id}>{tagName(id)}</span>
              ))}
              {row.unread ? (
                <button onClick={() => markRead(row.threadId)}>Mark read</button>
              ) : (
                <button onClick={() => markUnread(row.threadId)}>Mark unread</button>
              )}
              {caps.supportsArchive && (
                <button onClick={() => archive(row.threadId)}>Archive</button>
              )}
              <button onClick={() => trash(row.threadId)}>Trash</button>
              {(actions[row.threadId] ?? []).map((action) => (
                <button key={`${action.pluginId}-${action.label}`} onClick={() => void action.run()}>
                  {action.label} — {action.pluginId}
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
      {nextPageToken !== undefined && (
        <button onClick={() => void fetchPage(nextPageToken)}>Load more</button>
      )}
    </section>
  );
}

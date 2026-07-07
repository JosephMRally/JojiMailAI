/**
 * The per-tag mailbox screen (user-stories/typescript_email_ui.md): thread
 * rows read from the MailStore, manual refresh syncing the provider's current
 * page into the store, AI classification of newly arrived threads (distinct
 * "AI" chips with one-tap undo), AI-importance ordering with a date toggle,
 * pagination on nextPageToken, natural-language search via
 * intelligence.parseSearchQuery (text terms through store.searchText),
 * optimistic triage actions, and plug-in threadAction entries — all through
 * the four injected interfaces, never a concrete class.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Classification,
  MailIntelligence,
  SearchCriteria,
} from '../intelligence/MailIntelligence';
import type { PluginAction } from '../plugins/MailPlugin';
import type { PluginHost } from '../plugins/PluginHost';
import type { MailProvider, ProviderCapabilities, ThreadPage } from '../providers/MailProvider';
import type { Tag, ThreadSummary } from '../providers/model';
import type { MailStore } from '../store/MailStore';
import { describeAiError, toProviderFailure, type ProviderFailure } from './errors';
import { formatThreadDate, formatYmd } from './format';

/** Threads fetched per provider page. */
export const PAGE_SIZE = 10;

type Importance = 'high' | 'normal' | 'low';
const IMPORTANCE_RANK: Record<Importance, number> = { high: 0, normal: 1, low: 2 };

interface AiTagEntry {
  messageId: string;
  tagIds: string[];
}

interface Chip {
  key: string;
  label: string;
  /** The criteria that remain when this chip is removed. */
  without: SearchCriteria;
}

export interface MailboxScreenProps {
  provider: MailProvider;
  store: MailStore;
  intelligence: MailIntelligence;
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
  intelligence,
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
  const [orderMode, setOrderMode] = useState<'importance' | 'date'>('importance');
  const [importance, setImportance] = useState<Record<string, Importance>>({});
  const [aiTags, setAiTags] = useState<Record<string, AiTagEntry>>({});
  const [providerError, setProviderError] = useState<ProviderFailure | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [criteria, setCriteria] = useState<SearchCriteria | null>(null);
  const [searchRows, setSearchRows] = useState<ThreadSummary[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
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

  /** Classify threads new to the app; apply suggested tags as undoable AI chips. */
  const classifyNew = useCallback(
    async (threadIds: string[]): Promise<void> => {
      const newImportance: Record<string, Importance> = {};
      const newAiTags: Record<string, AiTagEntry> = {};
      for (const threadId of threadIds) {
        const messages = await store.getThread(threadId);
        const newest = messages[messages.length - 1];
        if (!newest) continue;
        let result: Classification;
        try {
          result = await intelligence.classify(newest, tags);
        } catch (error) {
          setAiNotice(describeAiError('AI tagging unavailable', error));
          continue;
        }
        newImportance[threadId] = result.importance;
        if (!caps.supportsTags) continue;
        const applied: string[] = [];
        for (const suggested of result.tagIds) {
          if (newest.tagIds.includes(suggested)) continue;
          try {
            await provider.addTag(newest.messageId, suggested);
            applied.push(suggested);
          } catch {
            // A failed tag application never blocks the sync.
          }
        }
        if (applied.length > 0) {
          newAiTags[threadId] = { messageId: newest.messageId, tagIds: applied };
          await store.upsertMessages(accountId, [
            { ...newest, tagIds: [...newest.tagIds, ...applied] },
          ]);
        }
      }
      setImportance((prev) => ({ ...prev, ...newImportance }));
      setAiTags((prev) => ({ ...prev, ...newAiTags }));
    },
    [store, intelligence, provider, tags, caps.supportsTags, accountId],
  );

  /** Refresh (no token) or load-more (token): provider fetch, then store upsert. */
  const fetchPage = useCallback(
    async (pageToken?: string): Promise<void> => {
      setProviderError(null);
      setAiNotice(null);
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
      const fresh: string[] = [];
      for (const summary of page.threads) {
        if ((await store.getThread(summary.threadId)).length === 0) fresh.push(summary.threadId);
      }
      await store.upsertThreads(accountId, page.threads);
      for (const summary of page.threads) {
        try {
          await store.upsertMessages(accountId, await provider.getThread(summary.threadId));
        } catch {
          // A failed thread body fetch leaves the summary usable.
        }
      }
      await classifyNew(fresh);
      setNextPageToken(page.nextPageToken);
      await reloadFromStore();
    },
    [provider, store, accountId, tagId, classifyNew, reloadFromStore],
  );

  const undoAiTags = useCallback(
    async (threadId: string): Promise<void> => {
      const entry = aiTags[threadId];
      if (!entry) return;
      setAiTags((prev) => {
        const next = { ...prev };
        delete next[threadId];
        return next;
      });
      for (const removed of entry.tagIds) {
        try {
          await provider.removeTag(entry.messageId, removed);
        } catch {
          // Undo is best-effort against the server; chips are already gone.
        }
      }
      const message = await store.getMessage(entry.messageId);
      if (message) {
        await store.upsertMessages(accountId, [
          { ...message, tagIds: message.tagIds.filter((id) => !entry.tagIds.includes(id)) },
        ]);
      }
      await reloadFromStore();
    },
    [aiTags, provider, store, accountId, reloadFromStore],
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

  // --- natural-language search ------------------------------------------------
  const applyCriteria = useCallback(
    async (applied: SearchCriteria): Promise<void> => {
      if (isEmptyCriteria(applied)) {
        setCriteria(null);
        setSearchRows(null);
        return;
      }
      setCriteria(applied);
      let base: ThreadSummary[];
      if (applied.tagIds && applied.tagIds.length > 0) {
        const seen = new Map<string, ThreadSummary>();
        for (const searchTag of applied.tagIds) {
          for (const row of await store.listThreads(accountId, searchTag)) {
            seen.set(row.threadId, row);
          }
        }
        base = [...seen.values()];
      } else {
        base = await store.listThreads(accountId, tagId);
      }
      if (applied.from !== undefined) {
        const from = applied.from.toLowerCase();
        base = base.filter((row) => row.from.toLowerCase().includes(from));
      }
      if (applied.dateFrom !== undefined) base = base.filter((row) => row.date >= applied.dateFrom!);
      if (applied.dateTo !== undefined) base = base.filter((row) => row.date <= applied.dateTo!);
      if (applied.text !== undefined) {
        const found = await store.searchText(accountId, applied.text);
        const threadIds = new Set(found.messages.map((message) => message.threadId));
        base = base.filter((row) => threadIds.has(row.threadId));
      }
      setSearchRows(base);
    },
    [store, accountId, tagId],
  );

  const runSearch = useCallback(async (): Promise<void> => {
    setSearchError(null);
    if (query.trim() === '') {
      await applyCriteria({});
      return;
    }
    let parsed: SearchCriteria;
    try {
      parsed = await intelligence.parseSearchQuery(query, tags);
    } catch (error) {
      setSearchError(describeAiError('Search unavailable', error));
      return;
    }
    await applyCriteria(parsed);
  }, [query, intelligence, tags, applyCriteria]);

  const chips: Chip[] = criteria === null ? [] : buildChips(criteria, tagName);

  const visible = searchRows ?? rows;
  const sorted = useMemo(() => {
    const list = [...(visible ?? [])];
    if (orderMode === 'date') {
      list.sort((a, b) => b.date - a.date);
    } else {
      list.sort(
        (a, b) =>
          IMPORTANCE_RANK[importance[a.threadId] ?? 'normal'] -
            IMPORTANCE_RANK[importance[b.threadId] ?? 'normal'] || b.date - a.date,
      );
    }
    return list;
  }, [visible, orderMode, importance]);

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
      {searchError !== null && (
        <div role="alert">
          {searchError} <button onClick={() => void runSearch()}>Retry</button>
        </div>
      )}
      {chips.length > 0 && (
        <ul aria-label="Search criteria">
          {chips.map((chip) => (
            <li key={chip.key}>
              {chip.label}{' '}
              <button aria-label={`Remove ${chip.label}`} onClick={() => void applyCriteria(chip.without)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => void fetchPage()}>Refresh</button>
      <button onClick={() => setOrderMode((mode) => (mode === 'importance' ? 'date' : 'importance'))}>
        {orderMode === 'importance' ? 'Sort by date' : 'Sort by importance'}
      </button>
      {providerError !== null && (
        <div role="alert">
          {providerError.message}{' '}
          {providerError.code === 'NETWORK' && (
            <button onClick={() => void fetchPage()}>Retry</button>
          )}
        </div>
      )}
      {aiNotice !== null && <p role="status">{aiNotice}</p>}
      {rows === null ? (
        <p>Loading…</p>
      ) : sorted.length === 0 ? (
        <p>no messages</p>
      ) : (
        <ul aria-label="Threads">
          {sorted.map((row) => {
            const aiEntry = aiTags[row.threadId];
            const plainTagIds = row.tagIds.filter((id) => !(aiEntry?.tagIds ?? []).includes(id));
            return (
              <li key={row.threadId} aria-label={row.subject}>
                <button onClick={() => onOpenThread(row.threadId)}>{row.subject}</button>
                {row.unread && <strong aria-label="unread">●</strong>}
                <span>{row.from}</span> <span>{row.snippet}</span>{' '}
                <span>{formatThreadDate(row.date, now())}</span> <span>({row.messageCount})</span>
                {plainTagIds.map((id) => (
                  <span key={id}>{tagName(id)}</span>
                ))}
                {(aiEntry?.tagIds ?? []).map((id) => (
                  <span key={`ai-${id}`}>AI: {tagName(id)}</span>
                ))}
                {aiEntry && (
                  <button onClick={() => void undoAiTags(row.threadId)}>Undo AI tags</button>
                )}
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
            );
          })}
        </ul>
      )}
      {nextPageToken !== undefined && (
        <button onClick={() => void fetchPage(nextPageToken)}>Load more</button>
      )}
    </section>
  );
}

function isEmptyCriteria(criteria: SearchCriteria): boolean {
  return (
    criteria.text === undefined &&
    criteria.from === undefined &&
    (criteria.tagIds === undefined || criteria.tagIds.length === 0) &&
    criteria.dateFrom === undefined &&
    criteria.dateTo === undefined
  );
}

function buildChips(criteria: SearchCriteria, tagName: (id: string) => string): Chip[] {
  const chips: Chip[] = [];
  for (const id of criteria.tagIds ?? []) {
    const rest = (criteria.tagIds ?? []).filter((other) => other !== id);
    chips.push({
      key: `tag:${id}`,
      label: `tag: ${tagName(id)}`,
      without: { ...criteria, tagIds: rest.length > 0 ? rest : undefined },
    });
  }
  if (criteria.from !== undefined) {
    chips.push({ key: 'from', label: `from: ${criteria.from}`, without: { ...criteria, from: undefined } });
  }
  if (criteria.text !== undefined) {
    chips.push({ key: 'text', label: `text: ${criteria.text}`, without: { ...criteria, text: undefined } });
  }
  if (criteria.dateFrom !== undefined) {
    chips.push({
      key: 'since',
      label: `since: ${formatYmd(criteria.dateFrom)}`,
      without: { ...criteria, dateFrom: undefined },
    });
  }
  if (criteria.dateTo !== undefined) {
    chips.push({
      key: 'until',
      label: `until: ${formatYmd(criteria.dateTo)}`,
      without: { ...criteria, dateTo: undefined },
    });
  }
  return chips;
}

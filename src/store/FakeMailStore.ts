/**
 * In-memory MailStore for tests (user-stories/typescript_mail_store.md):
 * no database at all, but real tokenize/Bloom behavior via the shared
 * modules, so UI tests exercise sync, offline, and search flows against the
 * same indexing semantics as SqliteMailStore.
 */
import type { Message, ThreadSummary } from '../providers/model';
import { bloomContainsAll, createBloom } from './bloom';
import type { ListStoredThreadsOptions, MailStore, SearchResult } from './MailStore';
import { messageTokens, tokenize } from './tokenize';

interface StoredThread {
  accountId: string;
  summary: ThreadSummary;
}

interface StoredMessage {
  accountId: string;
  message: Message;
  bloom: Uint8Array;
}

export class FakeMailStore implements MailStore {
  private readonly threads = new Map<string, StoredThread>();
  private readonly messages = new Map<string, StoredMessage>();

  async upsertThreads(accountId: string, summaries: ThreadSummary[]): Promise<void> {
    for (const summary of summaries) {
      this.threads.set(summary.threadId, { accountId, summary: structuredClone(summary) });
    }
  }

  async upsertMessages(accountId: string, messages: Message[]): Promise<void> {
    for (const message of messages) {
      // Recomputed on every upsert — the index can never go stale.
      const bloom = createBloom(messageTokens(message.subject, message.bodyPlain));
      this.messages.set(message.messageId, { accountId, message: structuredClone(message), bloom });
    }
  }

  async listThreads(
    accountId: string,
    tagId: string,
    opts?: ListStoredThreadsOptions,
  ): Promise<ThreadSummary[]> {
    const matches = [...this.threads.values()]
      .filter(
        (t) =>
          t.accountId === accountId &&
          this.threadMessages(t.summary.threadId).some((m) => m.message.tagIds.includes(tagId)),
      )
      .sort((a, b) => b.summary.date - a.summary.date)
      .slice(0, opts?.limit ?? Infinity)
      .map((t) => ({
        ...structuredClone(t.summary),
        tagIds: this.threadTagIds(t.summary.threadId),
      }));
    return matches;
  }

  async getThread(threadId: string): Promise<Message[]> {
    return this.threadMessages(threadId)
      .sort((a, b) => a.message.date - b.message.date)
      .map((m) => cloneOut(m.message));
  }

  async getMessage(messageId: string): Promise<Message | undefined> {
    const stored = this.messages.get(messageId);
    return stored ? cloneOut(stored.message) : undefined;
  }

  async searchText(accountId: string, terms: string): Promise<SearchResult> {
    // The same shared tokenizer as indexing: stop words and sub-2-character
    // tokens never reach the Bloom check.
    const queryTokens = [...new Set(tokenize(terms))];
    if (queryTokens.length === 0) {
      return { messages: [], tooGeneric: true };
    }
    const messages = [...this.messages.values()]
      .filter((stored) => stored.accountId === accountId)
      // Prescreen: candidates are only messages whose filter may contain ALL terms.
      .filter((stored) => bloomContainsAll(stored.bloom, queryTokens))
      // Verify against the stored text — false positives end here.
      .filter((stored) => {
        const tokens = messageTokens(stored.message.subject, stored.message.bodyPlain);
        return queryTokens.every((token) => tokens.has(token));
      })
      .sort((a, b) => b.message.date - a.message.date)
      .map((stored) => cloneOut(stored.message));
    return { messages, tooGeneric: false };
  }

  async clear(accountId: string): Promise<void> {
    for (const [threadId, stored] of this.threads) {
      if (stored.accountId === accountId) this.threads.delete(threadId);
    }
    for (const [messageId, stored] of this.messages) {
      if (stored.accountId === accountId) this.messages.delete(messageId);
    }
  }

  private threadMessages(threadId: string): StoredMessage[] {
    return [...this.messages.values()].filter((m) => m.message.threadId === threadId);
  }

  /** Sorted union of the tags on the thread's messages. */
  private threadTagIds(threadId: string): string[] {
    const tags = new Set<string>();
    for (const stored of this.threadMessages(threadId)) {
      for (const tagId of stored.message.tagIds) tags.add(tagId);
    }
    return [...tags].sort();
  }
}

/** Deep copy with sorted tagIds, so callers can never mutate stored state. */
function cloneOut(message: Message): Message {
  const copy = structuredClone(message);
  copy.tagIds = [...copy.tagIds].sort();
  return copy;
}

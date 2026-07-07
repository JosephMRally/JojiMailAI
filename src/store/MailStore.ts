/**
 * The single storage surface the UI may import
 * (user-stories/typescript_mail_store.md) — enforced by the same
 * no-concrete-imports rule that guards providers and intelligence.
 * Syncing, offline reading, local search, and account removal all run
 * through this one contract. Pure types — zero I/O.
 */
import type { Message, ThreadSummary } from '../providers/model';

export interface ListStoredThreadsOptions {
  /** Maximum number of threads to return (newest-first). */
  limit?: number;
}

export interface SearchResult {
  /** Verified matches only, newest-first. */
  messages: Message[];
  /** True when every term was a stop word or shorter than 2 characters. */
  tooGeneric: boolean;
}

export interface MailStore {
  /** Idempotent upsert keyed on threadId. */
  upsertThreads(accountId: string, summaries: ThreadSummary[]): Promise<void>;
  /** Idempotent upsert keyed on messageId; (re)computes each Bloom filter. */
  upsertMessages(accountId: string, messages: Message[]): Promise<void>;
  /** Threads of an account carrying a tag, newest-first. */
  listThreads(
    accountId: string,
    tagId: string,
    opts?: ListStoredThreadsOptions,
  ): Promise<ThreadSummary[]>;
  /** The thread's stored messages, oldest-first ([] when unknown). */
  getThread(threadId: string): Promise<Message[]>;
  /** One stored message, or undefined when unknown. */
  getMessage(messageId: string): Promise<Message | undefined>;
  /** Bloom-prescreened, verification-exact text search over an account. */
  searchText(accountId: string, terms: string): Promise<SearchResult>;
  /** Remove every stored row belonging to the account. */
  clear(accountId: string): Promise<void>;
}

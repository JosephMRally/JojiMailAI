/**
 * The subject interface of the Proxy pattern: the single mail API surface
 * the UI may import. Every method is async; concrete proxies are free to
 * reach their servers however they like. Pure types — zero I/O.
 * Spec: user-stories/typescript_mail_provider.md.
 */
import type { Draft, Message, Tag, ThreadSummary } from './model';

export interface ProviderCapabilities {
  /** True when the user can add/remove arbitrary tags. */
  supportsTags: boolean;
  supportsSend: boolean;
  supportsArchive: boolean;
}

export interface ListThreadsOptions {
  /** Opaque token from a previous page's `nextPageToken`, passed back verbatim. */
  pageToken?: string;
  pageSize?: number;
}

export interface ThreadPage {
  threads: ThreadSummary[];
  /** Opaque continuation token; absent on the last page. */
  nextPageToken?: string;
}

export interface SendResult {
  messageId: string;
}

export interface MailProvider {
  capabilities(): Promise<ProviderCapabilities>;
  listTags(): Promise<Tag[]>;
  listThreads(tagId: string, opts?: ListThreadsOptions): Promise<ThreadPage>;
  /** Resolves with the thread's messages, oldest-first. */
  getThread(threadId: string): Promise<Message[]>;
  getMessage(messageId: string): Promise<Message>;
  /** Resolves with the created message's id. */
  send(draft: Draft): Promise<SendResult>;
  markRead(messageId: string): Promise<void>;
  markUnread(messageId: string): Promise<void>;
  addTag(messageId: string, tagId: string): Promise<void>;
  removeTag(messageId: string, tagId: string): Promise<void>;
  archive(threadId: string): Promise<void>;
  trash(threadId: string): Promise<void>;
}

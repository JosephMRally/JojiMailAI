/**
 * In-memory MailProvider over fixture data: proves the interface is
 * implementable and stands in for every provider in tests (including later
 * UI tests). Zero I/O; fully deterministic. Follows the Proxy discipline:
 * cheap construction, "connection" deferred to the first method call.
 * Spec: user-stories/typescript_mail_provider.md.
 */
import type {
  ListThreadsOptions,
  MailProvider,
  ProviderCapabilities,
  SendResult,
  ThreadPage,
} from './MailProvider';
import { MailProviderError } from './model';
import type { Draft, Message, Tag, ThreadSummary } from './model';

export interface FakeProviderFixtures {
  tags: Tag[];
  messages: Message[];
}

export interface FakeProviderOptions {
  /** Address sent mail is "from". */
  selfAddress?: string;
  /** Tag removed by archive(). */
  inboxTagId?: string;
  /** Tag applied by trash(). */
  trashTagId?: string;
  /** Tag applied to sent mail. */
  sentTagId?: string;
}

const DEFAULT_PAGE_SIZE = 50;
const SNIPPET_LENGTH = 100;
const PAGE_TOKEN_PREFIX = 'fake-page-';

export class FakeProvider implements MailProvider {
  private readonly tags: Tag[];
  private readonly messages: Message[];
  private readonly selfAddress: string;
  private readonly inboxTagId: string;
  private readonly trashTagId: string;
  private readonly sentTagId: string;
  /** Deterministic clock for sent-message dates: max fixture date + n. */
  private clock: number;
  private sendCounter = 0;
  private isConnected = false;

  constructor(
    fixtures: FakeProviderFixtures = { tags: [], messages: [] },
    options: FakeProviderOptions = {},
  ) {
    // Copy fixtures so provider mutations never leak back into caller data.
    this.tags = fixtures.tags.map((tag) => ({ ...tag }));
    this.messages = fixtures.messages.map((message) => copyMessage(message));
    this.selfAddress = options.selfAddress ?? 'me@example.com';
    this.inboxTagId = options.inboxTagId ?? 'inbox';
    this.trashTagId = options.trashTagId ?? 'trash';
    this.sentTagId = options.sentTagId ?? 'sent';
    this.clock = Math.max(0, ...this.messages.map((m) => m.date));
  }

  /** Observability hook for the deferred-connection contract; not part of MailProvider. */
  get connected(): boolean {
    return this.isConnected;
  }

  async capabilities(): Promise<ProviderCapabilities> {
    this.connect();
    return { supportsTags: true, supportsSend: true, supportsArchive: true };
  }

  async listTags(): Promise<Tag[]> {
    this.connect();
    return this.tags.map((tag) => ({ ...tag }));
  }

  async listThreads(tagId: string, opts: ListThreadsOptions = {}): Promise<ThreadPage> {
    this.connect();
    const summaries = this.summarizeThreadsUnder(tagId);
    const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
    const offset = opts.pageToken === undefined ? 0 : decodePageToken(opts.pageToken);
    const page: ThreadPage = { threads: summaries.slice(offset, offset + pageSize) };
    if (offset + pageSize < summaries.length) {
      page.nextPageToken = PAGE_TOKEN_PREFIX + String(offset + pageSize);
    }
    return page;
  }

  async getThread(threadId: string): Promise<Message[]> {
    this.connect();
    return this.requireThread(threadId).map(copyMessage);
  }

  async getMessage(messageId: string): Promise<Message> {
    this.connect();
    return copyMessage(this.requireMessage(messageId));
  }

  async send(draft: Draft): Promise<SendResult> {
    this.connect();
    this.sendCounter += 1;
    this.clock += 1;
    const message: Message = {
      messageId: `fake-sent-m${this.sendCounter}`,
      threadId: `fake-sent-t${this.sendCounter}`,
      from: this.selfAddress,
      to: [...draft.to],
      cc: [...(draft.cc ?? [])],
      bcc: [...(draft.bcc ?? [])],
      subject: draft.subject,
      date: this.clock,
      bodyPlain: draft.bodyPlain,
      unread: false,
      tagIds: [this.sentTagId],
    };
    this.messages.push(message);
    return { messageId: message.messageId };
  }

  async markRead(messageId: string): Promise<void> {
    this.connect();
    this.requireMessage(messageId).unread = false;
  }

  async markUnread(messageId: string): Promise<void> {
    this.connect();
    this.requireMessage(messageId).unread = true;
  }

  async addTag(messageId: string, tagId: string): Promise<void> {
    this.connect();
    const message = this.requireMessage(messageId);
    if (!message.tagIds.includes(tagId)) {
      message.tagIds.push(tagId);
    }
  }

  async removeTag(messageId: string, tagId: string): Promise<void> {
    this.connect();
    const message = this.requireMessage(messageId);
    message.tagIds = message.tagIds.filter((id) => id !== tagId);
  }

  async archive(threadId: string): Promise<void> {
    this.connect();
    for (const message of this.requireThread(threadId)) {
      message.tagIds = message.tagIds.filter((id) => id !== this.inboxTagId);
    }
  }

  async trash(threadId: string): Promise<void> {
    this.connect();
    for (const message of this.requireThread(threadId)) {
      message.tagIds = [this.trashTagId];
    }
  }

  private connect(): void {
    this.isConnected = true;
  }

  private requireMessage(messageId: string): Message {
    const message = this.messages.find((m) => m.messageId === messageId);
    if (!message) {
      throw new MailProviderError('NOT_FOUND', `No message with id "${messageId}"`);
    }
    return message;
  }

  /** The thread's messages, oldest-first. */
  private requireThread(threadId: string): Message[] {
    const thread = this.messages
      .filter((m) => m.threadId === threadId)
      .sort((a, b) => a.date - b.date);
    if (thread.length === 0) {
      throw new MailProviderError('NOT_FOUND', `No thread with id "${threadId}"`);
    }
    return thread;
  }

  /** Summaries of threads with ANY message carrying tagId, newest-first. */
  private summarizeThreadsUnder(tagId: string): ThreadSummary[] {
    const threadIds = new Set(
      this.messages.filter((m) => m.tagIds.includes(tagId)).map((m) => m.threadId),
    );
    return [...threadIds]
      .map((threadId) => summarize(threadId, this.requireThread(threadId)))
      .sort((a, b) => b.date - a.date);
  }
}

function copyMessage(message: Message): Message {
  return {
    ...message,
    to: [...message.to],
    cc: [...message.cc],
    bcc: [...message.bcc],
    tagIds: [...message.tagIds],
  };
}

function decodePageToken(token: string): number {
  const offset = token.startsWith(PAGE_TOKEN_PREFIX)
    ? Number(token.slice(PAGE_TOKEN_PREFIX.length))
    : Number.NaN;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new MailProviderError('PROVIDER_ERROR', `Invalid page token "${token}"`);
  }
  return offset;
}

/** Build a ThreadSummary from a thread's messages (oldest-first). */
function summarize(threadId: string, thread: Message[]): ThreadSummary {
  const oldest = thread[0];
  const newest = thread[thread.length - 1];
  return {
    threadId,
    subject: oldest.subject,
    snippet: snippetOf(newest),
    from: newest.from,
    date: newest.date,
    unread: thread.some((m) => m.unread),
    messageCount: thread.length,
    tagIds: [...new Set(thread.flatMap((m) => m.tagIds))],
  };
}

function snippetOf(message: Message): string {
  const text = message.bodyPlain ?? (message.bodyHtml ?? '').replace(/<[^>]*>/g, ' ');
  return text.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LENGTH);
}

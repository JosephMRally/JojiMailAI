/**
 * GmailProvider — the first concrete Proxy behind the MailProvider
 * interface: a local surrogate for the remote Gmail server that fulfills
 * every method by delegating over HTTP to the Python bridge (bridge/app.py),
 * which wraps `simplegmail`. All Gmail-specific knowledge in the app —
 * bridge URL, wire schema, error mapping — lives in this one directory.
 * Spec: user-stories/typescript_gmail_proxy.md.
 *
 * Construction performs no I/O (lazy initialization): the first HTTP
 * request happens on the first interface method call.
 *
 * Deliberate v1 omission: no retry, no caching, and no offline-queue logic.
 * The proxy stays a thin remote surrogate; resilience is a later,
 * separately-tested layer.
 */
import type {
  ListThreadsOptions,
  MailProvider,
  ProviderCapabilities,
  SendResult,
  ThreadPage,
} from '../MailProvider';
import {
  MailProviderError,
  type Draft,
  type MailProviderErrorCode,
  type Message,
  type Tag,
  type ThreadSummary,
} from '../model';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8765';

export interface GmailProviderOptions {
  /** Bridge origin; devices that can't see the host's localhost point elsewhere. */
  baseUrl?: string;
  /** Injected by tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

// --- internal wire-shape typings for the bridge JSON (snake_case) -----------

interface WireTag {
  tag_id: string;
  name: string;
  unread_count?: number;
}

interface WireThreadSummary {
  thread_id: string;
  subject: string;
  snippet: string;
  from: string;
  date: number;
  unread: boolean;
  message_count: number;
  tag_ids: string[];
}

interface WireThreadList {
  threads: WireThreadSummary[];
  next_page_token?: string;
}

interface WireMessage {
  message_id: string;
  thread_id: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  date: number;
  body_plain?: string;
  body_html?: string;
  unread: boolean;
  tag_ids: string[];
}

interface WireSendResult {
  message_id: string;
}

/** The message-scoped actions of the bridge's POST /messages/{id}/modify. */
type MessageModifyAction = 'mark_read' | 'mark_unread' | 'add_tag' | 'remove_tag';

/** The thread-scoped actions of the bridge's POST /threads/{id}/modify. */
type ThreadModifyAction = 'archive' | 'trash';

const ERROR_CODES: readonly MailProviderErrorCode[] = [
  'AUTH_REQUIRED',
  'NETWORK',
  'NOT_FOUND',
  'RATE_LIMITED',
  'PROVIDER_ERROR',
];

// --- wire → model mapping (field-for-field, snake_case → camelCase) ---------

function toTag(wire: WireTag): Tag {
  const tag: Tag = { tagId: wire.tag_id, name: wire.name };
  if (wire.unread_count !== undefined) tag.unreadCount = wire.unread_count;
  return tag;
}

function toThreadSummary(wire: WireThreadSummary): ThreadSummary {
  return {
    threadId: wire.thread_id,
    subject: wire.subject,
    snippet: wire.snippet,
    from: wire.from,
    // Epoch milliseconds, normalized once server-side: carried as-is.
    date: wire.date,
    unread: wire.unread,
    messageCount: wire.message_count,
    tagIds: wire.tag_ids,
  };
}

function toMessage(wire: WireMessage): Message {
  const message: Message = {
    messageId: wire.message_id,
    threadId: wire.thread_id,
    from: wire.from,
    to: wire.to,
    cc: wire.cc,
    bcc: wire.bcc,
    subject: wire.subject,
    date: wire.date,
    unread: wire.unread,
    tagIds: wire.tag_ids,
  };
  if (wire.body_plain !== undefined) message.bodyPlain = wire.body_plain;
  if (wire.body_html !== undefined) message.bodyHtml = wire.body_html;
  return message;
}

export class GmailProvider implements MailProvider {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: GmailProviderOptions = {}) {
    // No I/O here — the proxy connects lazily on the first method call.
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  }

  async capabilities(): Promise<ProviderCapabilities> {
    // Static knowledge about Gmail: answered without any bridge call.
    return { supportsTags: true, supportsSend: true, supportsArchive: true };
  }

  async listTags(): Promise<Tag[]> {
    const wire = await this.request<WireTag[]>('/tags');
    return wire.map(toTag);
  }

  async listThreads(tagId: string, opts?: ListThreadsOptions): Promise<ThreadPage> {
    const query = new URLSearchParams({ tag: tagId });
    // Opaque platform tokens pass through verbatim.
    if (opts?.pageToken !== undefined) query.set('page_token', opts.pageToken);
    if (opts?.pageSize !== undefined) query.set('page_size', String(opts.pageSize));

    const wire = await this.request<WireThreadList>(`/threads?${query}`);
    const page: ThreadPage = { threads: wire.threads.map(toThreadSummary) };
    if (wire.next_page_token !== undefined) page.nextPageToken = wire.next_page_token;
    return page;
  }

  async getThread(threadId: string): Promise<Message[]> {
    const wire = await this.request<WireMessage[]>(`/threads/${encodeURIComponent(threadId)}`);
    return wire.map(toMessage); // bridge order preserved: oldest-first
  }

  async getMessage(messageId: string): Promise<Message> {
    const wire = await this.request<WireMessage>(`/messages/${encodeURIComponent(messageId)}`);
    return toMessage(wire);
  }

  async send(draft: Draft): Promise<SendResult> {
    // JSON.stringify drops undefined cc/bcc, matching the bridge's optionals.
    const wire = await this.post<WireSendResult>('/messages/send', {
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      body_plain: draft.bodyPlain,
    });
    return { messageId: wire.message_id };
  }

  markRead(messageId: string): Promise<void> {
    return this.modify(messageId, 'mark_read');
  }

  markUnread(messageId: string): Promise<void> {
    return this.modify(messageId, 'mark_unread');
  }

  addTag(messageId: string, tagId: string): Promise<void> {
    return this.modify(messageId, 'add_tag', tagId);
  }

  removeTag(messageId: string, tagId: string): Promise<void> {
    return this.modify(messageId, 'remove_tag', tagId);
  }

  archive(threadId: string): Promise<void> {
    return this.modifyThread(threadId, 'archive');
  }

  trash(threadId: string): Promise<void> {
    return this.modifyThread(threadId, 'trash');
  }

  // --- HTTP plumbing ---------------------------------------------------------

  private async modify(messageId: string, action: MessageModifyAction, tagId?: string): Promise<void> {
    await this.post(`/messages/${encodeURIComponent(messageId)}/modify`, {
      action,
      tag_id: tagId,
    });
  }

  /** Thread-scoped triage: the bridge applies it to every message in the thread. */
  private async modifyThread(threadId: string, action: ThreadModifyAction): Promise<void> {
    await this.post(`/threads/${encodeURIComponent(threadId)}/modify`, { action });
  }

  private post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /**
   * One bridge round-trip: no retry and no caching (deliberate v1 omission —
   * see the module doc). Bridge {code, message} error bodies are rethrown as
   * MailProviderError with the same code; transport failures (fetch
   * rejection, non-JSON body) become MailProviderError('NETWORK').
   */
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchFn(this.baseUrl + path, init);
    } catch {
      throw new MailProviderError(
        'NETWORK',
        `Cannot reach the Gmail bridge at ${this.baseUrl}. Is it running?`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new MailProviderError(
        'NETWORK',
        `The Gmail bridge at ${this.baseUrl} returned a non-JSON response (HTTP ${response.status}).`,
      );
    }

    if (!response.ok) {
      throw toProviderError(body);
    }
    return body as T;
  }
}

/** Rethrow a bridge {code, message} error body as the normalized error. */
function toProviderError(body: unknown): MailProviderError {
  const wire = (body ?? {}) as { code?: unknown; message?: unknown };
  const code: MailProviderErrorCode = ERROR_CODES.includes(wire.code as MailProviderErrorCode)
    ? (wire.code as MailProviderErrorCode)
    : 'PROVIDER_ERROR';
  const detail = typeof wire.message === 'string' ? wire.message : code;

  if (code === 'AUTH_REQUIRED') {
    return new MailProviderError(
      'AUTH_REQUIRED',
      `${detail} — start the Gmail bridge (bridge/app.py) and complete the Google sign-in in a browser, then try again.`,
    );
  }
  return new MailProviderError(code, detail);
}

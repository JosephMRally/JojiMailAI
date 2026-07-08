/**
 * GmailProvider — the first concrete Proxy behind the MailProvider
 * interface: a local surrogate for the remote Gmail server that fulfills
 * every method by calling the Gmail REST API v1 directly with an OAuth2
 * bearer token. Authentication happens outside this class: the composition
 * root supplies `getAccessToken`, a per-request token supplier backed by the
 * platform's native OAuth flow (ASWebAuthenticationSession on iOS, Custom
 * Tabs on Android, browser OAuth on web) — no localhost bridge, nothing for
 * the user to install. All Gmail-specific knowledge in the app — endpoint
 * shapes, wire schema, error mapping — lives in this one directory.
 * Spec: user-stories/providers/typescript_gmail_proxy.md.
 *
 * Construction performs no I/O (lazy initialization): the first HTTP request
 * and the first getAccessToken call happen on the first interface method call.
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
  type Message,
  type Tag,
  type ThreadSummary,
} from '../model';

const BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';

const SIGN_IN_GUIDANCE =
  'Sign in with Google from the app to connect your Gmail account, then try again.';

export interface GmailProviderOptions {
  /**
   * Per-request OAuth2 access-token supplier. A static token wraps trivially
   * (`async () => token`); native platforms plug in Keychain/KeyStore-backed
   * refresh without provider changes.
   */
  getAccessToken: () => Promise<string>;
  /** Injected by tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

// --- internal wire-shape typings for the Gmail API v1 JSON ------------------

interface WireLabel {
  id: string;
  name: string;
}

interface WireHeader {
  name: string;
  value: string;
}

interface WirePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: WirePart[];
}

interface WireMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: WirePart & { headers?: WireHeader[] };
}

interface WireThread {
  id: string;
  messages?: WireMessage[];
}

interface WireThreadsList {
  threads?: Array<{ id: string }>;
  nextPageToken?: string;
}

// --- base64url codecs (webview-safe: no Buffer) ------------------------------

function decodeB64url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeB64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// --- wire → model mapping ----------------------------------------------------

function headerValue(message: WireMessage, name: string): string | undefined {
  const lower = name.toLowerCase();
  return message.payload?.headers?.find((h) => h.name.toLowerCase() === lower)?.value;
}

/** Split a To/Cc/Bcc header into addresses; a missing header is an empty list. */
function addressList(message: WireMessage, name: string): string[] {
  const value = headerValue(message, name);
  if (!value) return [];
  return value
    .split(',')
    .map((address) => address.trim())
    .filter((address) => address !== '');
}

/**
 * Walk the MIME part tree recursively for the first text/plain and text/html
 * bodies. Present-but-empty data ('') still counts as a body.
 */
function findBodies(part: WirePart | undefined, found: { plain?: string; html?: string }): void {
  if (!part) return;
  if (part.body?.data !== undefined) {
    if (part.mimeType === 'text/plain' && found.plain === undefined) {
      found.plain = decodeB64url(part.body.data);
    } else if (part.mimeType === 'text/html' && found.html === undefined) {
      found.html = decodeB64url(part.body.data);
    }
  }
  for (const child of part.parts ?? []) {
    findBodies(child, found);
  }
}

function toMessage(wire: WireMessage): Message {
  const tagIds = wire.labelIds ?? [];
  const message: Message = {
    messageId: wire.id,
    threadId: wire.threadId,
    from: headerValue(wire, 'From') ?? '',
    to: addressList(wire, 'To'),
    cc: addressList(wire, 'Cc'),
    bcc: addressList(wire, 'Bcc'),
    subject: headerValue(wire, 'Subject') ?? '',
    // internalDate is a string of epoch milliseconds: normalized exactly once.
    date: Number(wire.internalDate ?? 0),
    unread: tagIds.includes('UNREAD'),
    tagIds,
  };
  const bodies: { plain?: string; html?: string } = {};
  findBodies(wire.payload, bodies);
  if (bodies.plain !== undefined) message.bodyPlain = bodies.plain;
  if (bodies.html !== undefined) message.bodyHtml = bodies.html;
  return message;
}

/** Summary of a metadata-format thread: the newest (last) message speaks for it. */
function toThreadSummary(wire: WireThread): ThreadSummary {
  const messages = wire.messages ?? [];
  const newest = messages[messages.length - 1];
  return {
    threadId: wire.id,
    subject: newest ? (headerValue(newest, 'Subject') ?? '') : '',
    snippet: newest?.snippet ?? '',
    from: newest ? (headerValue(newest, 'From') ?? '') : '',
    date: Number(newest?.internalDate ?? 0),
    unread: messages.some((m) => (m.labelIds ?? []).includes('UNREAD')),
    messageCount: messages.length,
    tagIds: newest?.labelIds ?? [],
  };
}

/** RFC 2822 message for the Gmail send endpoint's {raw} field. */
function toRfc2822(draft: Draft): string {
  const lines = [`To: ${draft.to.join(', ')}`];
  if (draft.cc && draft.cc.length > 0) lines.push(`Cc: ${draft.cc.join(', ')}`);
  if (draft.bcc && draft.bcc.length > 0) lines.push(`Bcc: ${draft.bcc.join(', ')}`);
  lines.push(`Subject: ${draft.subject}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('', draft.bodyPlain);
  return lines.join('\r\n');
}

export class GmailProvider implements MailProvider {
  private readonly getAccessToken: () => Promise<string>;
  private readonly fetchFn: typeof fetch;

  constructor(options: GmailProviderOptions) {
    // No I/O here — the proxy connects (and fetches a token) lazily on the
    // first method call.
    this.getAccessToken = options.getAccessToken;
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  }

  async capabilities(): Promise<ProviderCapabilities> {
    // Static knowledge about Gmail: answered without any API call.
    return { supportsTags: true, supportsSend: true, supportsArchive: true };
  }

  async listTags(): Promise<Tag[]> {
    const wire = await this.request<{ labels?: WireLabel[] }>('/labels');
    // unreadCount omitted in v1: labels.list carries no counts.
    return (wire.labels ?? []).map((label) => ({ tagId: label.id, name: label.name }));
  }

  async listThreads(tagId: string, opts?: ListThreadsOptions): Promise<ThreadPage> {
    const query = new URLSearchParams({ labelIds: tagId });
    // Opaque platform tokens pass through verbatim.
    if (opts?.pageToken !== undefined) query.set('pageToken', opts.pageToken);
    if (opts?.pageSize !== undefined) query.set('maxResults', String(opts.pageSize));

    const list = await this.request<WireThreadsList>(`/threads?${query}`);
    // threads.list returns only ids and snippets: summaries need the
    // metadata fetch (headers + labels, no bodies), one per listed thread.
    const threads = await Promise.all(
      (list.threads ?? []).map(async ({ id }) => {
        const thread = await this.request<WireThread>(
          `/threads/${encodeURIComponent(id)}?format=metadata`,
        );
        return toThreadSummary(thread);
      }),
    );

    const page: ThreadPage = { threads };
    if (list.nextPageToken !== undefined) page.nextPageToken = list.nextPageToken;
    return page;
  }

  async getThread(threadId: string): Promise<Message[]> {
    const wire = await this.request<WireThread>(
      `/threads/${encodeURIComponent(threadId)}?format=full`,
    );
    return (wire.messages ?? []).map(toMessage); // Gmail order preserved: oldest-first
  }

  async getMessage(messageId: string): Promise<Message> {
    const wire = await this.request<WireMessage>(
      `/messages/${encodeURIComponent(messageId)}?format=full`,
    );
    return toMessage(wire);
  }

  async send(draft: Draft): Promise<SendResult> {
    const wire = await this.post<{ id: string }>('/messages/send', {
      raw: encodeB64url(toRfc2822(draft)),
    });
    return { messageId: wire.id };
  }

  markRead(messageId: string): Promise<void> {
    // Read state is the UNREAD label — one more tag change, not a move.
    return this.modifyMessage(messageId, { removeLabelIds: ['UNREAD'] });
  }

  markUnread(messageId: string): Promise<void> {
    return this.modifyMessage(messageId, { addLabelIds: ['UNREAD'] });
  }

  addTag(messageId: string, tagId: string): Promise<void> {
    return this.modifyMessage(messageId, { addLabelIds: [tagId] });
  }

  removeTag(messageId: string, tagId: string): Promise<void> {
    return this.modifyMessage(messageId, { removeLabelIds: [tagId] });
  }

  async archive(threadId: string): Promise<void> {
    // Thread-scoped: Gmail applies the change to every message in the thread.
    await this.post(`/threads/${encodeURIComponent(threadId)}/modify`, {
      removeLabelIds: ['INBOX'],
    });
  }

  async trash(threadId: string): Promise<void> {
    // Gmail forbids adding TRASH via modify: the dedicated endpoint moves the
    // whole thread to Trash (reversible from Gmail's own UI, never a delete).
    await this.post(`/threads/${encodeURIComponent(threadId)}/trash`, {});
  }

  // --- HTTP plumbing ---------------------------------------------------------

  private async modifyMessage(
    messageId: string,
    body: { addLabelIds?: string[]; removeLabelIds?: string[] },
  ): Promise<void> {
    await this.post(`/messages/${encodeURIComponent(messageId)}/modify`, body);
  }

  private post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * One Gmail API round-trip: no retry and no caching (deliberate v1
   * omission — see the module doc). Errors map by HTTP status; transport
   * failures (fetch rejection, non-JSON body) become
   * MailProviderError('NETWORK'); a failing token supplier becomes
   * AUTH_REQUIRED before any request is made.
   */
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let token: string;
    try {
      token = await this.getAccessToken();
    } catch {
      throw new MailProviderError('AUTH_REQUIRED', SIGN_IN_GUIDANCE);
    }

    let response: Response;
    try {
      response = await this.fetchFn(BASE_URL + path, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          ...(init?.method === 'POST' ? { 'content-type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new MailProviderError(
        'NETWORK',
        'Cannot reach Gmail. Check your network connection and try again.',
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new MailProviderError(
        'NETWORK',
        `Gmail returned a non-JSON response (HTTP ${response.status}).`,
      );
    }

    if (!response.ok) {
      throw toProviderError(response.status, body);
    }
    return body as T;
  }
}

/** Map a Gmail API error response to the normalized error by HTTP status. */
function toProviderError(status: number, body: unknown): MailProviderError {
  const wire = (body ?? {}) as { error?: { message?: unknown } };
  const detail = typeof wire.error?.message === 'string' ? wire.error.message : `HTTP ${status}`;

  if (status === 401 || status === 403) {
    return new MailProviderError('AUTH_REQUIRED', `${detail} — ${SIGN_IN_GUIDANCE}`);
  }
  if (status === 404) {
    return new MailProviderError('NOT_FOUND', detail);
  }
  if (status === 429) {
    return new MailProviderError('RATE_LIMITED', detail);
  }
  return new MailProviderError('PROVIDER_ERROR', detail);
}

/**
 * Shared model types spoken by every MailProvider, plus the one normalized
 * error class. Pure types — zero I/O. Spec: user-stories/typescript_mail_provider.md.
 */

export interface Account {
  accountId: string;
  displayName: string;
  platform: string;
}

export interface Tag {
  tagId: string;
  name: string;
  unreadCount?: number;
}

export interface ThreadSummary {
  threadId: string;
  subject: string;
  snippet: string;
  from: string;
  /** Epoch milliseconds, normalized by each proxy. */
  date: number;
  unread: boolean;
  messageCount: number;
  tagIds: string[];
}

export interface Message {
  messageId: string;
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  /** Epoch milliseconds, normalized by each proxy. */
  date: number;
  bodyPlain?: string;
  bodyHtml?: string;
  unread: boolean;
  tagIds: string[];
}

export interface Draft {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyPlain: string;
}

export type MailProviderErrorCode =
  | 'AUTH_REQUIRED'
  | 'NETWORK'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR';

/**
 * The one normalized error every provider throws: a stable machine-readable
 * `code` for UI logic plus a human-readable `message`.
 */
export class MailProviderError extends Error {
  readonly code: MailProviderErrorCode;

  constructor(code: MailProviderErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'MailProviderError';
    this.code = code;
  }
}

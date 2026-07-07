/**
 * Tests for the shared model types and the normalized error class
 * (user-stories/typescript_mail_provider.md — model + error stories).
 */
import { describe, expect, it } from 'vitest';
import {
  MailProviderError,
  type Account,
  type Draft,
  type MailProviderErrorCode,
  type Message,
  type Tag,
  type ThreadSummary,
} from '../../src/providers/model';

describe('story: shared model types Account, Tag, ThreadSummary, Message, Draft used by every provider', () => {
  it('typed literals for every model type compile against the schema and carry its fields', () => {
    const account: Account = {
      accountId: 'acct-1',
      displayName: 'Alice Example',
      platform: 'fake',
    };
    const tag: Tag = { tagId: 'inbox', name: 'Inbox', unreadCount: 2 };
    const tagWithoutCount: Tag = { tagId: 'work', name: 'Work' }; // unreadCount optional
    const summary: ThreadSummary = {
      threadId: 't1',
      subject: 'Quarterly report',
      snippet: 'Please review…',
      from: 'alice@example.com',
      date: Date.UTC(2025, 0, 1),
      unread: false,
      messageCount: 2,
      tagIds: ['inbox', 'work'],
    };
    const message: Message = {
      messageId: 'm1',
      threadId: 't1',
      from: 'alice@example.com',
      to: ['bob@example.com'],
      cc: [],
      bcc: [],
      subject: 'Quarterly report',
      date: Date.UTC(2025, 0, 1),
      bodyPlain: 'Please review.',
      unread: false,
      tagIds: ['inbox'],
    };
    const draft: Draft = {
      to: ['bob@example.com'],
      subject: 'Re: Quarterly report',
      bodyPlain: 'Looks good.',
    }; // cc/bcc optional

    expect(account.accountId).toBe('acct-1');
    expect(tag.unreadCount).toBe(2);
    expect(tagWithoutCount.unreadCount).toBeUndefined();
    expect(summary.tagIds).toEqual(['inbox', 'work']);
    expect(message.cc).toEqual([]);
    expect(draft.cc).toBeUndefined();
  });

  it('story: dates in the model are epoch-millisecond numbers, plain numeric to compare', () => {
    const earlier: ThreadSummary = {
      threadId: 't1',
      subject: 'a',
      snippet: 'a',
      from: 'alice@example.com',
      date: Date.UTC(2025, 0, 1),
      unread: false,
      messageCount: 1,
      tagIds: [],
    };
    const later: ThreadSummary = { ...earlier, threadId: 't2', date: Date.UTC(2025, 0, 2) };
    expect(typeof earlier.date).toBe('number');
    expect(Number.isInteger(earlier.date)).toBe(true);
    expect(later.date > earlier.date).toBe(true); // plain numeric comparison
  });
});

describe('story: one normalized error class MailProviderError with a closed machine-readable code union', () => {
  const codes: MailProviderErrorCode[] = [
    'AUTH_REQUIRED',
    'NETWORK',
    'NOT_FOUND',
    'RATE_LIMITED',
    'PROVIDER_ERROR',
  ];

  it('constructs with each stable code plus a human-readable message', () => {
    for (const code of codes) {
      const err = new MailProviderError(code, `human readable: ${code}`);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(MailProviderError);
      expect(err.name).toBe('MailProviderError');
      expect(err.code).toBe(code);
      expect(err.message).toBe(`human readable: ${code}`);
    }
  });

  it('never has an empty message: it defaults to the code', () => {
    const err = new MailProviderError('NETWORK');
    expect(err.message.length).toBeGreaterThan(0);
  });
});

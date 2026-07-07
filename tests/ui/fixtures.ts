/**
 * Shared deterministic UI fixtures (user-stories/typescript_email_ui.md):
 * fake example.com addresses only, a fixed clock so relative dates are
 * reproducible, and a seedStore helper mirroring what a provider sync
 * would have written. No network, no real data.
 */
import type { Message, Tag, ThreadSummary } from '../../src/providers/model';
import type { MailStore } from '../../src/store/MailStore';

export const ACCOUNT_ID = 'alice@example.com';
export const SECOND_ACCOUNT_ID = 'alice-work@example.com';

/** "Now" for every UI test: 2024-05-15 12:00 local time. */
export const FIXED_NOW = new Date(2024, 4, 15, 12, 0, 0).getTime();
export const TODAY_MORNING = new Date(2024, 4, 15, 9, 5, 0).getTime();
export const MAY_3_MORNING = new Date(2024, 4, 3, 10, 0, 0).getTime();
export const MAY_3_LATER = new Date(2024, 4, 3, 11, 0, 0).getTime();
export const APRIL_1 = new Date(2024, 3, 1, 10, 0, 0).getTime();

export const INBOX: Tag = { tagId: 'tag-inbox', name: 'inbox' };
export const FINANCE: Tag = { tagId: 'tag-finance', name: 'finance' };
export const TRAVEL: Tag = { tagId: 'tag-travel', name: 'travel' };
export const TAGS: Tag[] = [INBOX, FINANCE, TRAVEL];

export function makeMessage(
  overrides: Partial<Message> & { messageId: string; threadId: string },
): Message {
  return {
    from: 'bob@example.com',
    to: [ACCOUNT_ID],
    cc: [],
    bcc: [],
    subject: 'Quarterly invoice',
    date: MAY_3_MORNING,
    bodyPlain: 'Please pay the unpaid invoice by Friday.',
    unread: false,
    tagIds: [INBOX.tagId],
    ...overrides,
  };
}

/** Two-message thread whose newest message is unread; subject/body match the "invoice" AI rule. */
export const INVOICE_M1 = makeMessage({
  messageId: 'm1',
  threadId: 't-invoice',
  date: MAY_3_MORNING,
  unread: false,
});
export const INVOICE_M2 = makeMessage({
  messageId: 'm2',
  threadId: 't-invoice',
  date: MAY_3_LATER,
  unread: true,
  bodyPlain: 'Bump — the invoice is still unpaid.',
});
/** Single-message thread arriving "today", matching no AI rule. */
export const LUNCH_M1 = makeMessage({
  messageId: 'm3',
  threadId: 't-lunch',
  subject: 'Lunch plans',
  from: 'carol@example.com',
  date: TODAY_MORNING,
  bodyPlain: 'Lunch at noon on Thursday?',
  unread: false,
});

export const DEFAULT_MESSAGES: Message[] = [INVOICE_M1, INVOICE_M2, LUNCH_M1];

/** A 4-message thread so the AI digest panel triggers (> 3 messages). */
export const PLAN_MESSAGES: Message[] = [0, 1, 2, 3].map((i) =>
  makeMessage({
    messageId: `plan-m${i + 1}`,
    threadId: 't-plan',
    subject: 'Planning',
    from: i % 2 === 0 ? 'bob@example.com' : 'carol@example.com',
    date: MAY_3_MORNING + i * 60_000,
    bodyPlain: `Nothing to report ${i + 1}.`,
    unread: false,
  }),
);

/** `count` single-message threads for pagination tests; no AI rule words. */
export function makeBulkMessages(count: number): Message[] {
  return Array.from({ length: count }, (_unused, i) =>
    makeMessage({
      messageId: `bulk-m${i + 1}`,
      threadId: `bulk-t${i + 1}`,
      subject: `Bulk ${i + 1}`,
      bodyPlain: 'Nothing special here.',
      date: APRIL_1 + i * 1_000,
      unread: false,
    }),
  );
}

/** ThreadSummary rows equivalent to what a provider page carries. */
export function summarize(messages: Message[]): ThreadSummary[] {
  const byThread = new Map<string, Message[]>();
  for (const message of messages) {
    const bucket = byThread.get(message.threadId) ?? [];
    bucket.push(message);
    byThread.set(message.threadId, bucket);
  }
  return [...byThread.entries()].map(([threadId, thread]) => {
    const sorted = [...thread].sort((a, b) => a.date - b.date);
    const oldest = sorted[0];
    const newest = sorted[sorted.length - 1];
    return {
      threadId,
      subject: oldest.subject,
      snippet: (newest.bodyPlain ?? '').slice(0, 100),
      from: newest.from,
      date: newest.date,
      unread: sorted.some((m) => m.unread),
      messageCount: sorted.length,
      tagIds: [...new Set(sorted.flatMap((m) => m.tagIds))],
    };
  });
}

/** Seed the store as if the account had already synced these messages. */
export async function seedStore(
  store: MailStore,
  messages: Message[],
  accountId: string = ACCOUNT_ID,
): Promise<void> {
  await store.upsertThreads(accountId, summarize(messages));
  await store.upsertMessages(accountId, messages);
}

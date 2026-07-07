/**
 * Shared fixture builders for the provider-layer tests. All addresses are
 * fake (@example.com) per SKILL.md — no real addresses or credentials.
 */
import type { Message, Tag } from '../../src/providers/model';

export interface ProviderFixtures {
  tags: Tag[];
  messages: Message[];
}

export const SELF_ADDRESS = 'me@example.com';

export const D_M1 = Date.UTC(2025, 0, 1, 9, 0, 0);
export const D_M2 = Date.UTC(2025, 0, 1, 10, 30, 0);
export const D_M3 = Date.UTC(2025, 0, 2, 8, 0, 0);
export const D_M4 = Date.UTC(2025, 0, 3, 12, 0, 0);
export const D_M5 = Date.UTC(2025, 0, 4, 15, 45, 0);
export const D_M6 = Date.UTC(2025, 0, 5, 7, 15, 0);

/** Every thread in the fixture set carries the `inbox` tag. */
export const ALL_INBOX_THREAD_IDS = ['t1', 't2', 't3', 't4', 't5'];

export function makeFixtures(): ProviderFixtures {
  return {
    tags: [
      { tagId: 'inbox', name: 'Inbox', unreadCount: 2 },
      { tagId: 'work', name: 'Work', unreadCount: 1 },
      { tagId: 'starred', name: 'Starred' },
      { tagId: 'sent', name: 'Sent' },
      { tagId: 'trash', name: 'Trash' },
    ],
    messages: [
      {
        messageId: 'm1',
        threadId: 't1',
        from: 'alice@example.com',
        to: [SELF_ADDRESS],
        cc: [],
        bcc: [],
        subject: 'Quarterly report',
        date: D_M1,
        bodyPlain: 'Please review the attached quarterly report.',
        unread: false,
        tagIds: ['inbox', 'work'],
      },
      {
        messageId: 'm2',
        threadId: 't1',
        from: 'bob@example.com',
        to: [SELF_ADDRESS],
        cc: ['carol@example.com'],
        bcc: [],
        subject: 'Re: Quarterly report',
        date: D_M2,
        bodyPlain: 'Looks good to me.',
        bodyHtml: '<p>Looks good to me.</p>',
        unread: true,
        tagIds: ['inbox', 'work', 'starred'],
      },
      {
        // HTML-only body — the model allows either body as long as one exists.
        messageId: 'm3',
        threadId: 't2',
        from: 'news@example.com',
        to: [SELF_ADDRESS],
        cc: [],
        bcc: [],
        subject: 'Weekly digest',
        date: D_M3,
        bodyHtml: '<h1>Weekly digest</h1><p>Top stories this week.</p>',
        unread: true,
        tagIds: ['inbox'],
      },
      {
        messageId: 'm4',
        threadId: 't3',
        from: 'dave@example.com',
        to: [SELF_ADDRESS],
        cc: [],
        bcc: [],
        subject: 'Lunch on Friday?',
        date: D_M4,
        bodyPlain: 'Want to grab lunch on Friday?',
        unread: false,
        tagIds: ['inbox'],
      },
      {
        messageId: 'm5',
        threadId: 't4',
        from: 'erin@example.com',
        to: [SELF_ADDRESS],
        cc: [],
        bcc: [],
        subject: 'Build is passing again',
        date: D_M5,
        bodyPlain: 'The main branch build is green again.',
        unread: false,
        tagIds: ['inbox'],
      },
      {
        messageId: 'm6',
        threadId: 't5',
        from: 'frank@example.com',
        to: [SELF_ADDRESS],
        cc: [],
        bcc: ['grace@example.com'],
        subject: 'Invoice #42',
        date: D_M6,
        bodyPlain: 'Invoice #42 is attached. Payment due in 30 days.',
        unread: false,
        tagIds: ['inbox'],
      },
    ],
  };
}

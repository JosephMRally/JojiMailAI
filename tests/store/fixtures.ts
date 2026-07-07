/**
 * Shared fixture builders for the store-layer tests
 * (user-stories/typescript_mail_store.md). All addresses are fake
 * (@example.com) per SKILL.md — no real addresses or credentials.
 *
 * Fixture invariant: each ThreadSummary's `tagIds` equals the sorted union of
 * its messages' tags and its `date`/`unread`/`messageCount` match its newest
 * message, so store round-trips can be compared with plain `toEqual`.
 */
import type { Message, ThreadSummary } from '../../src/providers/model';

export const SELF_ADDRESS = 'me@example.com';

export const ACCOUNT_A = 'acct-1';
export const ACCOUNT_B = 'acct-2';

export const D_M1 = Date.UTC(2025, 0, 1, 9, 0, 0);
export const D_M2 = Date.UTC(2025, 0, 1, 10, 30, 0);
export const D_M3 = Date.UTC(2025, 0, 2, 8, 0, 0);
export const D_M4 = Date.UTC(2025, 0, 3, 12, 0, 0);
export const D_M5 = Date.UTC(2025, 0, 4, 15, 45, 0);
export const D_M6 = Date.UTC(2025, 0, 5, 7, 15, 0);
export const D_M9 = Date.UTC(2025, 0, 6, 11, 0, 0);

export interface StoreFixtures {
  threads: ThreadSummary[];
  messages: Message[];
}

/** Threads and messages for the primary account (`acct-1`). */
export function makeAccountAFixtures(): StoreFixtures {
  return {
    threads: [
      {
        threadId: 't1',
        subject: 'Quarterly report',
        snippet: 'Looks good to me.',
        from: 'bob@example.com',
        date: D_M2,
        unread: true,
        messageCount: 2,
        tagIds: ['inbox', 'starred', 'work'],
      },
      {
        threadId: 't2',
        subject: 'Weekly digest',
        snippet: 'Top stories this week.',
        from: 'news@example.com',
        date: D_M3,
        unread: true,
        messageCount: 1,
        tagIds: ['inbox'],
      },
      {
        threadId: 't3',
        subject: 'Lunch on Friday?',
        snippet: 'Want to grab lunch on Friday?',
        from: 'dave@example.com',
        date: D_M4,
        unread: false,
        messageCount: 1,
        tagIds: ['inbox'],
      },
      {
        threadId: 't4',
        subject: 'Build is passing again',
        snippet: 'The main branch build is green again.',
        from: 'erin@example.com',
        date: D_M5,
        unread: false,
        messageCount: 1,
        tagIds: ['inbox', 'work'],
      },
      {
        threadId: 't5',
        subject: 'Invoice #42',
        snippet: 'Invoice #42 is attached.',
        from: 'frank@example.com',
        date: D_M6,
        unread: false,
        messageCount: 1,
        tagIds: ['billing', 'inbox'],
      },
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
        bodyPlain: 'Please review the attached quarterly report before Friday.',
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
        bodyPlain: 'Looks good to me. Numbers match the spreadsheet.',
        bodyHtml: '<p>Looks good to me. Numbers match the spreadsheet.</p>',
        unread: true,
        tagIds: ['inbox', 'starred', 'work'],
      },
      {
        // HTML-only body: body_plain is nullable in the schema and search
        // must still find this message through its subject tokens.
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
        bodyPlain: 'Want to grab lunch on Friday? The new ramen place downtown.',
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
        bodyPlain: 'The main branch build is green again after the flaky test fix.',
        unread: false,
        tagIds: ['inbox', 'work'],
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
        tagIds: ['billing', 'inbox'],
      },
    ],
  };
}

/** A second account (`acct-2`) that shares a search term with the first. */
export function makeAccountBFixtures(): StoreFixtures {
  return {
    threads: [
      {
        threadId: 't9',
        subject: 'Quarterly report',
        snippet: 'The quarterly report for the second account is ready.',
        from: 'zoe@example.com',
        date: D_M9,
        unread: true,
        messageCount: 1,
        tagIds: ['inbox'],
      },
    ],
    messages: [
      {
        messageId: 'm9',
        threadId: 't9',
        from: 'zoe@example.com',
        to: [SELF_ADDRESS],
        cc: [],
        bcc: [],
        subject: 'Quarterly report',
        date: D_M9,
        bodyPlain: 'The quarterly report for the second account is ready.',
        unread: true,
        tagIds: ['inbox'],
      },
    ],
  };
}

/** Deterministic PRNG (mulberry32) so property tests are reproducible. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic synthetic vocabulary: alphanumeric words of length >= 2 that
 * are never stop words (they all start with the 'zz' prefix).
 */
export function syntheticVocab(size: number): string[] {
  return Array.from({ length: size }, (_, i) => `zz${i.toString(36)}`);
}

/** Draw `count` distinct items from `vocab` using the supplied PRNG. */
export function sampleDistinct(vocab: string[], count: number, rand: () => number): string[] {
  const picked = new Set<string>();
  while (picked.size < count) {
    picked.add(vocab[Math.floor(rand() * vocab.length)]);
  }
  return [...picked];
}

/** Build a synthetic message whose bodyPlain is `words` joined by spaces. */
export function makeSyntheticMessage(index: number, words: string[]): Message {
  return {
    messageId: `sm${index}`,
    threadId: `st${index}`,
    from: 'generator@example.com',
    to: [SELF_ADDRESS],
    cc: [],
    bcc: [],
    subject: `Synthetic message ${index}`,
    date: Date.UTC(2025, 1, 1) + index * 60_000,
    bodyPlain: words.join(' '),
    unread: false,
    tagIds: ['inbox'],
  };
}

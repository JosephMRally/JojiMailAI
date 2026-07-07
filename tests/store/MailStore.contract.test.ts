/**
 * MailStore contract tests (user-stories/typescript_mail_store.md), run
 * against BOTH implementations — FakeMailStore in memory and SqliteMailStore
 * over an injected in-memory sql.js handle — so storage backends swap the
 * way mail platforms and AI backends do. Covers: the seven-method surface,
 * idempotent upserts, offline reading, exact Bloom-prescreened search with
 * all-terms semantics, stop-word handling with the too-generic signal,
 * Bloom recompute on content change, and per-account clear.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Message } from '../../src/providers/model';
import { FakeMailStore } from '../../src/store/FakeMailStore';
import type { MailStore } from '../../src/store/MailStore';
import { SqliteMailStore } from '../../src/store/SqliteMailStore';
import {
  ACCOUNT_A,
  ACCOUNT_B,
  makeAccountAFixtures,
  makeAccountBFixtures,
} from './fixtures';
import { createSqlJsHandle } from './sqlJsHandle';

type MakeStore = () => Promise<MailStore>;

const implementations: Array<[string, MakeStore]> = [
  ['FakeMailStore', async () => new FakeMailStore()],
  ['SqliteMailStore', async () => new SqliteMailStore(await createSqlJsHandle())],
];

async function seed(store: MailStore): Promise<void> {
  const a = makeAccountAFixtures();
  const b = makeAccountBFixtures();
  await store.upsertThreads(ACCOUNT_A, a.threads);
  await store.upsertMessages(ACCOUNT_A, a.messages);
  await store.upsertThreads(ACCOUNT_B, b.threads);
  await store.upsertMessages(ACCOUNT_B, b.messages);
}

function ids(messages: Message[]): string[] {
  return messages.map((m) => m.messageId);
}

describe.each(implementations)('MailStore contract — %s', (_name, makeStore) => {
  let store: MailStore;

  beforeEach(async () => {
    store = await makeStore();
    await seed(store);
  });

  describe('story: the interface covers upsertThreads, upsertMessages, listThreads, getThread, getMessage, searchText, and clear', () => {
    it('exposes all seven methods of the one storage contract', () => {
      for (const method of [
        'upsertThreads',
        'upsertMessages',
        'listThreads',
        'getThread',
        'getMessage',
        'searchText',
        'clear',
      ] as const) {
        expect(typeof store[method], method).toBe('function');
      }
    });
  });

  describe('story: mail lists and tag filters are plain local queries', () => {
    it('lists an account tag newest-first', async () => {
      const threads = await store.listThreads(ACCOUNT_A, 'inbox');
      expect(threads.map((t) => t.threadId)).toEqual(['t5', 't4', 't3', 't2', 't1']);
    });

    it('filters by tag', async () => {
      const threads = await store.listThreads(ACCOUNT_A, 'work');
      expect(threads.map((t) => t.threadId)).toEqual(['t4', 't1']);
    });

    it('scopes by account', async () => {
      const threads = await store.listThreads(ACCOUNT_B, 'inbox');
      expect(threads.map((t) => t.threadId)).toEqual(['t9']);
    });

    it('honors opts.limit', async () => {
      const threads = await store.listThreads(ACCOUNT_A, 'inbox', { limit: 2 });
      expect(threads.map((t) => t.threadId)).toEqual(['t5', 't4']);
    });

    it('round-trips full thread summaries, with tagIds as the sorted union of message tags', async () => {
      const threads = await store.listThreads(ACCOUNT_A, 'inbox');
      const t1 = threads.find((t) => t.threadId === 't1');
      expect(t1).toEqual(makeAccountAFixtures().threads[0]);
    });
  });

  describe('story: getThread and getMessage read stored mail back exactly', () => {
    it('getThread returns the thread messages oldest-first', async () => {
      const messages = await store.getThread('t1');
      expect(ids(messages)).toEqual(['m1', 'm2']);
    });

    it('getMessage round-trips every field, including addresses, both bodies, and sorted tagIds', async () => {
      const m2 = makeAccountAFixtures().messages.find((m) => m.messageId === 'm2')!;
      expect(await store.getMessage('m2')).toEqual(m2);
    });

    it('round-trips an HTML-only message (bodyPlain absent)', async () => {
      const stored = await store.getMessage('m3');
      expect(stored?.bodyPlain).toBeUndefined();
      expect(stored?.bodyHtml).toContain('Weekly digest');
    });

    it('getMessage resolves undefined for an unknown id', async () => {
      expect(await store.getMessage('no-such-message')).toBeUndefined();
    });

    it('getThread resolves [] for an unknown thread', async () => {
      expect(await store.getThread('no-such-thread')).toEqual([]);
    });
  });

  describe('story: all writes are idempotent upserts keyed on thread_id/message_id', () => {
    it('re-syncing the same page never duplicates a row', async () => {
      await seed(store); // the exact same page a second time
      expect((await store.listThreads(ACCOUNT_A, 'inbox')).length).toBe(5);
      expect(ids(await store.getThread('t1'))).toEqual(['m1', 'm2']);
    });

    it('content updates land in place', async () => {
      const m1 = makeAccountAFixtures().messages.find((m) => m.messageId === 'm1')!;
      const updated: Message = { ...m1, subject: 'Quarterly report (v2)', unread: true };
      await store.upsertMessages(ACCOUNT_A, [updated]);
      expect(await store.getMessage('m1')).toEqual(updated);
      expect(ids(await store.getThread('t1'))).toEqual(['m1', 'm2']);
    });

    it('re-upserting a message with a different tag set replaces the stored tags', async () => {
      const m6 = makeAccountAFixtures().messages.find((m) => m.messageId === 'm6')!;
      expect((await store.listThreads(ACCOUNT_A, 'billing')).map((t) => t.threadId)).toEqual(['t5']);

      const updated: Message = { ...m6, tagIds: ['inbox', 'receipts'] };
      await store.upsertMessages(ACCOUNT_A, [updated]);

      // The removed tag leaves no phantom row behind; the new tag lands.
      expect((await store.getMessage('m6'))?.tagIds).toEqual(['inbox', 'receipts']);
      expect(await store.listThreads(ACCOUNT_A, 'billing')).toEqual([]);
      expect((await store.listThreads(ACCOUNT_A, 'receipts')).map((t) => t.threadId)).toEqual(['t5']);
    });
  });

  describe('story: previously synced mail is listed and read even when the bridge and network are unreachable', () => {
    it('reads run entirely from the store while fetch is dead (offline)', async () => {
      const realFetch = globalThis.fetch;
      globalThis.fetch = (() => {
        throw new Error('network unreachable — offline');
      }) as typeof fetch;
      try {
        expect((await store.listThreads(ACCOUNT_A, 'inbox')).length).toBe(5);
        expect(ids(await store.getThread('t1'))).toEqual(['m1', 'm2']);
        expect((await store.getMessage('m6'))?.subject).toBe('Invoice #42');
        const result = await store.searchText(ACCOUNT_A, 'invoice');
        expect(ids(result.messages)).toEqual(['m6']);
      } finally {
        globalThis.fetch = realFetch;
      }
    });
  });

  describe('story: searchText tokenizes terms, prescreens with Bloom filters (ALL terms), then verifies against stored text', () => {
    it('finds every message containing a term, newest-first', async () => {
      const result = await store.searchText(ACCOUNT_A, 'quarterly');
      expect(ids(result.messages)).toEqual(['m2', 'm1']);
      expect(result.tooGeneric).toBe(false);
    });

    it('multi-term queries require ALL terms in the same message', async () => {
      const result = await store.searchText(ACCOUNT_A, 'quarterly spreadsheet');
      expect(ids(result.messages)).toEqual(['m2']);
    });

    it('matches subject tokens of an HTML-only message', async () => {
      const result = await store.searchText(ACCOUNT_A, 'digest');
      expect(ids(result.messages)).toEqual(['m3']);
    });

    it('returns verified Message objects, not raw rows', async () => {
      const result = await store.searchText(ACCOUNT_A, 'invoice');
      const m6 = makeAccountAFixtures().messages.find((m) => m.messageId === 'm6')!;
      expect(result.messages).toEqual([m6]);
    });

    it('returns [] when no stored message matches', async () => {
      const result = await store.searchText(ACCOUNT_A, 'zeppelin');
      expect(result.messages).toEqual([]);
      expect(result.tooGeneric).toBe(false);
    });

    it('scopes search to the account', async () => {
      const result = await store.searchText(ACCOUNT_B, 'quarterly');
      expect(ids(result.messages)).toEqual(['m9']);
    });
  });

  describe('story: stop words and sub-2-character tokens are dropped before the Bloom check; all-stop queries fail fast', () => {
    it('stop words in the query do not change the result', async () => {
      const bare = await store.searchText(ACCOUNT_A, 'quarterly');
      const wrapped = await store.searchText(ACCOUNT_A, 'the quarterly of it');
      expect(ids(wrapped.messages)).toEqual(ids(bare.messages));
      expect(wrapped.tooGeneric).toBe(false);
    });

    it('an all-stop-word query returns an empty result plus the too-generic signal', async () => {
      const result = await store.searchText(ACCOUNT_A, 'the of and is to a i');
      expect(result.messages).toEqual([]);
      expect(result.tooGeneric).toBe(true);
    });
  });

  describe('story: the Bloom filter is recomputed whenever an upsert changes subject or body_plain', () => {
    it('search reflects the new text and forgets the old after a content update', async () => {
      const m4 = makeAccountAFixtures().messages.find((m) => m.messageId === 'm4')!;
      expect(ids((await store.searchText(ACCOUNT_A, 'ramen')).messages)).toEqual(['m4']);

      const updated: Message = { ...m4, bodyPlain: 'Moved to Monday. Sushi spot instead.' };
      await store.upsertMessages(ACCOUNT_A, [updated]);

      expect(ids((await store.searchText(ACCOUNT_A, 'sushi')).messages)).toEqual(['m4']);
      expect(ids((await store.searchText(ACCOUNT_A, 'ramen')).messages)).toEqual([]);
    });

    it('a subject-only update also recomputes the filter: new subject found, old forgotten', async () => {
      const m5 = makeAccountAFixtures().messages.find((m) => m.messageId === 'm5')!;
      expect(ids((await store.searchText(ACCOUNT_A, 'passing')).messages)).toEqual(['m5']);

      const updated: Message = { ...m5, subject: 'Build is failing again' };
      await store.upsertMessages(ACCOUNT_A, [updated]);

      // A filter recomputed only on body_plain changes would miss 'failing'.
      expect(ids((await store.searchText(ACCOUNT_A, 'failing')).messages)).toEqual(['m5']);
      expect(ids((await store.searchText(ACCOUNT_A, 'passing')).messages)).toEqual([]);
    });
  });

  describe('story: clear(accountId) removes exactly that account (account removal)', () => {
    it('clears one account and leaves the other intact', async () => {
      await store.clear(ACCOUNT_A);

      expect(await store.listThreads(ACCOUNT_A, 'inbox')).toEqual([]);
      expect(await store.getMessage('m1')).toBeUndefined();
      expect(await store.getThread('t1')).toEqual([]);
      expect((await store.searchText(ACCOUNT_A, 'quarterly')).messages).toEqual([]);

      expect((await store.listThreads(ACCOUNT_B, 'inbox')).length).toBe(1);
      expect(ids((await store.searchText(ACCOUNT_B, 'quarterly')).messages)).toEqual(['m9']);
    });
  });
});

/**
 * Full-scan equivalence tests (user-stories/typescript_mail_store.md, human
 * story): search results are identical to what a brute-force scan of every
 * stored message would return, and identical across both implementations —
 * never a missed or phantom result. Runs against both implementations on the
 * fixture corpus and on a larger seeded synthetic corpus.
 */
import { describe, expect, it } from 'vitest';
import type { Message } from '../../src/providers/model';
import { FakeMailStore } from '../../src/store/FakeMailStore';
import type { MailStore } from '../../src/store/MailStore';
import { SqliteMailStore } from '../../src/store/SqliteMailStore';
import { tokenize } from '../../src/store/tokenize';
import {
  ACCOUNT_A,
  makeAccountAFixtures,
  makeSyntheticMessage,
  mulberry32,
  sampleDistinct,
  syntheticVocab,
} from './fixtures';
import { createSqlJsHandle } from './sqlJsHandle';

type MakeStore = () => Promise<MailStore>;

const implementations: Array<[string, MakeStore]> = [
  ['FakeMailStore', async () => new FakeMailStore()],
  ['SqliteMailStore', async () => new SqliteMailStore(await createSqlJsHandle())],
];

/** Ground truth: tokenize every stored message and require ALL query tokens. */
function bruteForceSearch(corpus: Message[], terms: string): string[] {
  const queryTokens = [...new Set(tokenize(terms))];
  if (queryTokens.length === 0) return [];
  return corpus
    .filter((m) => {
      const tokens = new Set(tokenize(`${m.subject} ${m.bodyPlain ?? ''}`));
      return queryTokens.every((t) => tokens.has(t));
    })
    .sort((a, b) => b.date - a.date)
    .map((m) => m.messageId);
}

describe.each(implementations)('search equals a full scan — %s', (_name, makeStore) => {
  it('matches the brute-force result for every fixture query, newest-first', async () => {
    const store = await makeStore();
    const { threads, messages } = makeAccountAFixtures();
    await store.upsertThreads(ACCOUNT_A, threads);
    await store.upsertMessages(ACCOUNT_A, messages);

    const queries = [
      'quarterly',
      'friday',
      'report friday',
      'build green',
      'digest',
      'invoice 42',
      'payment days',
      'quarterly zeppelin',
      'the',
      '',
    ];
    for (const terms of queries) {
      const result = await store.searchText(ACCOUNT_A, terms);
      expect(result.messages.map((m) => m.messageId), `query: "${terms}"`).toEqual(
        bruteForceSearch(messages, terms),
      );
    }
  });

  it('matches the brute-force result across a seeded synthetic corpus (no misses, no phantoms)', async () => {
    const store = await makeStore();
    const vocab = syntheticVocab(800);
    const rand = mulberry32(0x5ca1ab1e);
    const corpus: Message[] = [];
    for (let i = 0; i < 40; i++) {
      corpus.push(makeSyntheticMessage(i, sampleDistinct(vocab, 150, rand)));
    }
    await store.upsertMessages(ACCOUNT_A, corpus);

    let queriesWithHits = 0;
    for (let q = 0; q < 25; q++) {
      const terms = sampleDistinct(vocab, q % 3 === 0 ? 1 : 2, rand).join(' ');
      const expected = bruteForceSearch(corpus, terms);
      const result = await store.searchText(ACCOUNT_A, terms);
      expect(result.messages.map((m) => m.messageId), `query: "${terms}"`).toEqual(expected);
      if (expected.length > 0) queriesWithHits++;
    }
    // The comparison must be meaningful: some queries really match.
    expect(queriesWithHits).toBeGreaterThan(0);
  });
});

/**
 * FakeProvider stories not covered by the contract suite in
 * FakeProvider.test.ts (user-stories/providers/typescript_fake_provider.md):
 * - loadFakeFixtures(path) loads FakeProviderFixtures from a JSON file
 *   (fetch is mocked — no network, per the layer's test rules);
 * - an unrecognizable page token throws MailProviderError('PROVIDER_ERROR');
 * - pagination defaults to page size 50 with opaque fake-page-<offset> tokens;
 * - listThreads returns summaries newest-first;
 * - non-default FakeProviderOptions steer send/archive/trash semantics;
 * - sent messages use ids fake-sent-m<n>/fake-sent-t<n> and a deterministic
 *   clock seeded from the newest fixture date;
 * - fixtures are defensively copied on the way in and model objects on the
 *   way out.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FakeProviderFixtures } from '../../src/providers/FakeProvider';
import { FakeProvider } from '../../src/providers/FakeProvider';
import { MailProviderError } from '../../src/providers/model';
import type { Message } from '../../src/providers/model';
import { loadFakeFixtures } from '../../src/testing/FakeProviderFixtures';
import simpleFixtures from '../fixtures/fake-provider-simple.json';
import { D_M6, makeFixtures } from './fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('story: loadFakeFixtures loads FakeProviderFixtures from a JSON file', () => {
  it('fetches the path and resolves with the parsed fixture JSON', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      statusText: 'OK',
      json: async () => simpleFixtures,
    }));
    vi.stubGlobal('fetch', fetchFn);

    const fixtures = await loadFakeFixtures('/fixtures/fake-provider-simple.json');
    expect(fetchFn).toHaveBeenCalledWith('/fixtures/fake-provider-simple.json');
    expect(fixtures).toEqual(simpleFixtures);
  });

  it('rejects with an error naming the path when the file is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, statusText: 'Not Found', json: async () => ({}) })),
    );

    await expect(loadFakeFixtures('/fixtures/nope.json')).rejects.toThrow(
      /\/fixtures\/nope\.json.*Not Found/s,
    );
  });

  it('the JSON fixture shape seeds a FakeProvider as-is — no TypeScript duplication', async () => {
    const provider = new FakeProvider(simpleFixtures as FakeProviderFixtures);
    const tags = await provider.listTags();
    expect(tags.map((t) => t.tagId)).toEqual(simpleFixtures.tags.map((t) => t.tagId));
    const inbox = await provider.listThreads('inbox');
    expect(inbox.threads.length).toBeGreaterThan(0);
  });
});

describe('story: an unrecognizable page token throws PROVIDER_ERROR', () => {
  it.each(['garbage', 'fake-page-xyz', 'fake-page--5'])('rejects token %j', async (token) => {
    const provider = new FakeProvider(makeFixtures());
    await expect(provider.listThreads('inbox', { pageToken: token })).rejects.toMatchObject({
      name: 'MailProviderError',
      code: 'PROVIDER_ERROR',
    });
    await expect(
      provider.listThreads('inbox', { pageToken: token }),
    ).rejects.toBeInstanceOf(MailProviderError);
  });
});

describe('story: pagination defaults to page size 50 with fake-page-<offset> tokens', () => {
  function bulkFixtures(count: number): FakeProviderFixtures {
    return {
      tags: [{ tagId: 'inbox', name: 'Inbox' }],
      messages: Array.from({ length: count }, (_unused, i) => ({
        messageId: `bulk-m${i + 1}`,
        threadId: `bulk-t${i + 1}`,
        from: 'sender@example.com',
        to: ['me@example.com'],
        cc: [],
        bcc: [],
        subject: `Bulk ${i + 1}`,
        date: 1_000_000 + i,
        bodyPlain: 'bulk body',
        unread: false,
        tagIds: ['inbox'],
      })),
    };
  }

  it('an unspecified pageSize serves 50 threads and hands back fake-page-50', async () => {
    const provider = new FakeProvider(bulkFixtures(51));
    const page1 = await provider.listThreads('inbox');
    expect(page1.threads).toHaveLength(50);
    expect(page1.nextPageToken).toBe('fake-page-50');

    const page2 = await provider.listThreads('inbox', { pageToken: page1.nextPageToken! });
    expect(page2.threads).toHaveLength(1);
    expect('nextPageToken' in page2).toBe(false);
  });
});

describe('story: listThreads returns summaries newest-first by date', () => {
  it('the returned order itself is newest-first (not merely sortable)', async () => {
    const provider = new FakeProvider(makeFixtures());
    const inbox = await provider.listThreads('inbox');
    const dates = inbox.threads.map((t) => t.date);
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    expect(inbox.threads[0].threadId).toBe('t5'); // carries the newest fixture message
    expect(inbox.threads[0].date).toBe(D_M6);
  });
});

describe('story: non-default options steer send/archive/trash without subclassing', () => {
  const OPTIONED: FakeProviderFixtures = {
    tags: [
      { tagId: 'in', name: 'In' },
      { tagId: 'bin', name: 'Bin' },
      { tagId: 'outbox', name: 'Outbox' },
      { tagId: 'keep', name: 'Keep' },
    ],
    messages: [
      {
        messageId: 'o-m1',
        threadId: 'o-t1',
        from: 'alice@example.com',
        to: ['robot@example.com'],
        cc: [],
        bcc: [],
        subject: 'Optioned',
        date: 5_000,
        bodyPlain: 'configured tags',
        unread: true,
        tagIds: ['in', 'keep'],
      },
    ],
  };

  function optionedProvider(): FakeProvider {
    return new FakeProvider(OPTIONED, {
      selfAddress: 'robot@example.com',
      inboxTagId: 'in',
      trashTagId: 'bin',
      sentTagId: 'outbox',
    });
  }

  it('send is from selfAddress and tagged with the configured sent tag', async () => {
    const provider = optionedProvider();
    const { messageId } = await provider.send({
      to: ['alice@example.com'],
      subject: 'hi',
      bodyPlain: 'hello',
    });
    const sent = await provider.getMessage(messageId);
    expect(sent.from).toBe('robot@example.com');
    expect(sent.tagIds).toEqual(['outbox']);
  });

  it('archive removes the configured inbox tag, leaving other tags', async () => {
    const provider = optionedProvider();
    await provider.archive('o-t1');
    expect((await provider.getMessage('o-m1')).tagIds).toEqual(['keep']);
  });

  it('trash replaces every message tag set with the configured trash tag', async () => {
    const provider = optionedProvider();
    await provider.trash('o-t1');
    expect((await provider.getMessage('o-m1')).tagIds).toEqual(['bin']);
  });
});

describe('story: send appends deterministic messages — exact ids and a seeded clock', () => {
  it('ids are fake-sent-m<n>/fake-sent-t<n> and dates advance from the newest fixture date', async () => {
    const provider = new FakeProvider(makeFixtures());

    const first = await provider.send({ to: ['a@example.com'], subject: '1', bodyPlain: 'x' });
    expect(first.messageId).toBe('fake-sent-m1');
    const sent1 = await provider.getMessage('fake-sent-m1');
    expect(sent1.threadId).toBe('fake-sent-t1');
    expect(sent1.date).toBe(D_M6 + 1); // clock seeded from the newest fixture date

    const second = await provider.send({ to: ['a@example.com'], subject: '2', bodyPlain: 'y' });
    expect(second.messageId).toBe('fake-sent-m2');
    const sent2 = await provider.getMessage('fake-sent-m2');
    expect(sent2.threadId).toBe('fake-sent-t2');
    expect(sent2.date).toBe(D_M6 + 2); // strictly advancing, no wall clock
  });
});

describe('story: fixtures copied on the way in, model objects on the way out', () => {
  it('mutating caller-held fixture data after construction never reaches the provider', async () => {
    const fixtures = makeFixtures();
    const provider = new FakeProvider(fixtures);

    fixtures.tags[0].name = 'CORRUPTED';
    fixtures.messages[0].subject = 'CORRUPTED';
    fixtures.messages[0].tagIds.push('CORRUPTED');

    expect((await provider.listTags())[0].name).toBe('Inbox');
    const m1 = await provider.getMessage('m1');
    expect(m1.subject).toBe('Quarterly report');
    expect(m1.tagIds).not.toContain('CORRUPTED');
  });

  it('mutating returned model objects never corrupts provider state', async () => {
    const provider = new FakeProvider(makeFixtures());

    (await provider.getMessage('m1')).tagIds.push('CORRUPTED');
    (await provider.listTags())[0].name = 'CORRUPTED';
    const thread: Message[] = await provider.getThread('t1');
    thread[0].subject = 'CORRUPTED';

    expect((await provider.getMessage('m1')).tagIds).not.toContain('CORRUPTED');
    expect((await provider.listTags())[0].name).toBe('Inbox');
    expect((await provider.getThread('t1'))[0].subject).toBe('Quarterly report');
  });
});

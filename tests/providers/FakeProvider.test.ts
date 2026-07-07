/**
 * Contract tests for the MailProvider interface, exercised through the
 * in-memory FakeProvider (user-stories/typescript_mail_provider.md).
 * Zero network, DOM, or filesystem access — pure in-memory fixtures.
 */
import { describe, expect, it } from 'vitest';
import { FakeProvider } from '../../src/providers/FakeProvider';
import type { MailProvider } from '../../src/providers/MailProvider';
import { MailProviderError } from '../../src/providers/model';
import {
  ALL_INBOX_THREAD_IDS,
  D_M2,
  D_M6,
  makeFixtures,
  SELF_ADDRESS,
} from './fixtures';

function makeProvider(): FakeProvider {
  return new FakeProvider(makeFixtures());
}

/** A UI-style consumer that only knows the MailProvider interface. */
async function subjectsUnderTag(provider: MailProvider, tagId: string): Promise<string[]> {
  const page = await provider.listThreads(tagId);
  return page.threads.map((t) => t.subject);
}

describe('story: MailProvider is the single mail API surface — platforms swap without touching consumer code', () => {
  it('one consumer function works unchanged against two different provider implementations', async () => {
    const fake: MailProvider = makeProvider();

    // A second, structurally different "platform" behind the same interface.
    const otherPlatform: MailProvider = {
      capabilities: async () => ({ supportsTags: false, supportsSend: false, supportsArchive: true }),
      listTags: async () => [{ tagId: 'all', name: 'All Mail' }],
      listThreads: async () => ({
        threads: [
          {
            threadId: 'x1',
            subject: 'from another platform',
            snippet: 'hello',
            from: 'zoe@example.com',
            date: Date.UTC(2025, 0, 1),
            unread: false,
            messageCount: 1,
            tagIds: ['all'],
          },
        ],
      }),
      getThread: async () => [],
      getMessage: async () => {
        throw new MailProviderError('NOT_FOUND');
      },
      send: async () => ({ messageId: 'x-sent-1' }),
      markRead: async () => {},
      markUnread: async () => {},
      addTag: async () => {},
      removeTag: async () => {},
      archive: async () => {},
      trash: async () => {},
    };

    expect(await subjectsUnderTag(fake, 'inbox')).toContain('Quarterly report');
    expect(await subjectsUnderTag(otherPlatform, 'anything')).toEqual(['from another platform']);
  });
});

describe('story: the interface covers a usable v1 client', () => {
  it('exposes listTags, listThreads, getThread, getMessage, send, markRead, markUnread, addTag, removeTag, archive, trash, capabilities', () => {
    const provider: MailProvider = makeProvider();
    const methods = [
      'listTags',
      'listThreads',
      'getThread',
      'getMessage',
      'send',
      'markRead',
      'markUnread',
      'addTag',
      'removeTag',
      'archive',
      'trash',
      'capabilities',
    ] as const;
    for (const method of methods) {
      expect(typeof provider[method], `${method} must be a function`).toBe('function');
    }
  });
});

describe('story: organization modeled on tags, never folders — many-to-many, no containment', () => {
  it('a message carries any number of tagIds and its thread is listed under every one of them', async () => {
    const provider = makeProvider();
    const message = await provider.getMessage('m1');
    expect(message.tagIds).toEqual(expect.arrayContaining(['inbox', 'work']));

    const inbox = await provider.listThreads('inbox');
    const work = await provider.listThreads('work');
    expect(inbox.threads.map((t) => t.threadId)).toContain('t1');
    expect(work.threads.map((t) => t.threadId)).toContain('t1'); // same thread, two tags at once
  });

  it('a thread is listed under a tag when ANY of its messages carries that tag', async () => {
    const provider = makeProvider();
    // Only m2 (not m1) carries 'starred', yet thread t1 shows up under it.
    const starred = await provider.listThreads('starred');
    expect(starred.threads.map((t) => t.threadId)).toContain('t1');
  });
});

describe('story: every interface method is async and returns the shared model types', () => {
  it('each method returns a Promise', async () => {
    const provider = makeProvider();
    const pending: Array<Promise<unknown>> = [
      provider.capabilities(),
      provider.listTags(),
      provider.listThreads('inbox'),
      provider.getThread('t1'),
      provider.getMessage('m1'),
      provider.send({ to: ['dana@example.com'], subject: 'hi', bodyPlain: 'hello' }),
      provider.markRead('m1'),
      provider.markUnread('m1'),
      provider.addTag('m1', 'starred'),
      provider.removeTag('m1', 'starred'),
      provider.archive('t3'),
      provider.trash('t4'),
    ];
    for (const p of pending) {
      expect(p).toBeInstanceOf(Promise);
    }
    await Promise.all(pending);
  });
});

describe('story: Proxy pattern — constructed cheaply with no I/O, connection deferred to first call', () => {
  it('is not connected after construction and connects on the first method call', async () => {
    const provider = makeProvider();
    expect(provider.connected).toBe(false); // constructor did no work
    await provider.listTags();
    expect(provider.connected).toBe(true); // first call triggered the (fake) connection
  });
});

describe('story: pagination via an opaque pageToken passed back in verbatim', () => {
  it('pages through all inbox threads; nextPageToken is a string, absent on the last page', async () => {
    const provider = makeProvider();

    const page1 = await provider.listThreads('inbox', { pageSize: 2 });
    expect(page1.threads).toHaveLength(2);
    expect(typeof page1.nextPageToken).toBe('string');

    const page2 = await provider.listThreads('inbox', {
      pageSize: 2,
      pageToken: page1.nextPageToken!, // handed back in verbatim, never interpreted
    });
    expect(page2.threads).toHaveLength(2);
    expect(typeof page2.nextPageToken).toBe('string');

    const page3 = await provider.listThreads('inbox', {
      pageSize: 2,
      pageToken: page2.nextPageToken!,
    });
    expect(page3.threads).toHaveLength(1);
    expect(page3.nextPageToken).toBeUndefined();
    expect('nextPageToken' in page3).toBe(false); // absent, not null, on the last page

    const seen = [...page1.threads, ...page2.threads, ...page3.threads].map((t) => t.threadId);
    expect(new Set(seen).size).toBe(seen.length); // no overlap between pages
    expect(new Set(seen)).toEqual(new Set(ALL_INBOX_THREAD_IDS)); // no thread missed
  });

  it('omits nextPageToken when a single page holds everything', async () => {
    const provider = makeProvider();
    const page = await provider.listThreads('work');
    expect(page.threads.map((t) => t.threadId)).toEqual(['t1']);
    expect('nextPageToken' in page).toBe(false);
  });
});

describe('story: capabilities() reports what affordances the platform supports', () => {
  it('returns the three supports* booleans', async () => {
    const provider = makeProvider();
    const caps = await provider.capabilities();
    expect(caps).toEqual({ supportsTags: true, supportsSend: true, supportsArchive: true });
    expect(typeof caps.supportsTags).toBe('boolean');
    expect(typeof caps.supportsSend).toBe('boolean');
    expect(typeof caps.supportsArchive).toBe('boolean');
  });
});

describe('story: ThreadSummary carries everything the inbox list needs', () => {
  it('has exactly threadId, subject, snippet, from, date, unread, messageCount, tagIds', async () => {
    const provider = makeProvider();
    const inbox = await provider.listThreads('inbox');
    const t1 = inbox.threads.find((t) => t.threadId === 't1');
    expect(t1).toBeDefined();
    expect(Object.keys(t1!).sort()).toEqual([
      'date',
      'from',
      'messageCount',
      'snippet',
      'subject',
      'tagIds',
      'threadId',
      'unread',
    ]);
    expect(t1).toMatchObject({
      threadId: 't1',
      subject: 'Quarterly report', // the thread's original subject
      from: 'bob@example.com', // the latest sender
      date: D_M2, // the latest message's date
      unread: true, // any unread message marks the thread unread
      messageCount: 2,
    });
    expect(new Set(t1!.tagIds)).toEqual(new Set(['inbox', 'work', 'starred'])); // union of message tags
    expect(t1!.snippet.length).toBeGreaterThan(0);
  });

  it('derives a plain-text snippet even for an HTML-only thread', async () => {
    const provider = makeProvider();
    const inbox = await provider.listThreads('inbox');
    const t2 = inbox.threads.find((t) => t.threadId === 't2');
    expect(t2!.snippet.length).toBeGreaterThan(0);
    expect(t2!.snippet).not.toContain('<'); // no raw markup in the inbox list
  });
});

describe('story: Message carries everything a full message view and reply flow need', () => {
  it('has messageId, threadId, from, to, cc, bcc, subject, date, bodies, unread, tagIds', async () => {
    const provider = makeProvider();
    const m2 = await provider.getMessage('m2');
    expect(Object.keys(m2).sort()).toEqual([
      'bcc',
      'bodyHtml',
      'bodyPlain',
      'cc',
      'date',
      'from',
      'messageId',
      'subject',
      'tagIds',
      'threadId',
      'to',
      'unread',
    ]);
    expect(m2).toMatchObject({
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
    });
  });
});

describe('story: all model dates are epoch-millisecond numbers', () => {
  it('every date off the provider is an integer, and sorting is plain numeric', async () => {
    const provider = makeProvider();
    const inbox = await provider.listThreads('inbox');
    for (const t of inbox.threads) {
      expect(typeof t.date).toBe('number');
      expect(Number.isInteger(t.date)).toBe(true);
    }
    const newestFirst = [...inbox.threads].sort((a, b) => b.date - a.date);
    expect(newestFirst[0].date).toBe(D_M6);

    const thread = await provider.getThread('t1');
    const dates = thread.map((m) => m.date);
    expect(dates).toEqual([...dates].sort((a, b) => a - b)); // oldest-first, numerically
  });
});

describe('story: addressing arrays and body encoding match how mail actually works', () => {
  it('to/cc/bcc are string[] and from is a string (any may be empty)', async () => {
    const provider = makeProvider();
    const m6 = await provider.getMessage('m6');
    expect(typeof m6.from).toBe('string');
    for (const field of [m6.to, m6.cc, m6.bcc]) {
      expect(Array.isArray(field)).toBe(true);
      for (const addr of field) expect(typeof addr).toBe('string');
    }
    expect(m6.cc).toEqual([]); // empty is a valid value
    expect(m6.bcc).toEqual(['grace@example.com']);
  });

  it('bodyPlain and bodyHtml are each optional but at least one is always present', async () => {
    const provider = makeProvider();
    const plainOnly = await provider.getMessage('m1');
    expect(plainOnly.bodyPlain).toBeTruthy();
    expect(plainOnly.bodyHtml).toBeUndefined();

    const htmlOnly = await provider.getMessage('m3');
    expect(htmlOnly.bodyHtml).toBeTruthy();
    expect(htmlOnly.bodyPlain).toBeUndefined();

    for (const threadId of ALL_INBOX_THREAD_IDS) {
      for (const message of await provider.getThread(threadId)) {
        expect(message.bodyPlain ?? message.bodyHtml).toBeTruthy();
      }
    }
  });
});

describe('story: an in-memory FakeProvider fully implements MailProvider over fixture data with fake addresses', () => {
  it('uses only fake @example.com addresses in its fixtures', async () => {
    const provider = makeProvider();
    for (const threadId of ALL_INBOX_THREAD_IDS) {
      for (const message of await provider.getThread(threadId)) {
        for (const addr of [message.from, ...message.to, ...message.cc, ...message.bcc]) {
          expect(addr.endsWith('@example.com')).toBe(true);
        }
      }
    }
  });

  it('getThread returns the thread messages oldest-first', async () => {
    const provider = makeProvider();
    const thread = await provider.getThread('t1');
    expect(thread.map((m) => m.messageId)).toEqual(['m1', 'm2']);
  });

  it('markRead and markUnread flip the unread flag on message and thread summary', async () => {
    const provider = makeProvider();
    await provider.markRead('m2');
    await provider.markRead('m3');
    expect((await provider.getMessage('m2')).unread).toBe(false);
    const inbox = await provider.listThreads('inbox');
    expect(inbox.threads.find((t) => t.threadId === 't1')!.unread).toBe(false);

    await provider.markUnread('m1');
    expect((await provider.getMessage('m1')).unread).toBe(true);
    const again = await provider.listThreads('inbox');
    expect(again.threads.find((t) => t.threadId === 't1')!.unread).toBe(true);
  });

  it('addTag and removeTag change a message tag set and where its thread is listed', async () => {
    const provider = makeProvider();
    await provider.addTag('m3', 'work');
    expect((await provider.getMessage('m3')).tagIds).toContain('work');
    let work = await provider.listThreads('work');
    expect(work.threads.map((t) => t.threadId)).toContain('t2');

    await provider.removeTag('m3', 'work');
    expect((await provider.getMessage('m3')).tagIds).not.toContain('work');
    work = await provider.listThreads('work');
    expect(work.threads.map((t) => t.threadId)).not.toContain('t2');
  });

  it('addTag is idempotent — tagging twice does not duplicate the tag', async () => {
    const provider = makeProvider();
    await provider.addTag('m3', 'work');
    await provider.addTag('m3', 'work');
    const tagIds = (await provider.getMessage('m3')).tagIds;
    expect(tagIds.filter((t) => t === 'work')).toEqual(['work']);
  });

  it('archive removes the thread from the inbox without touching its other tags (tags, not folders)', async () => {
    const provider = makeProvider();
    await provider.archive('t1');
    const inbox = await provider.listThreads('inbox');
    expect(inbox.threads.map((t) => t.threadId)).not.toContain('t1');
    const work = await provider.listThreads('work');
    expect(work.threads.map((t) => t.threadId)).toContain('t1'); // still tagged 'work'
  });

  it('trash retags the whole thread as trash', async () => {
    const provider = makeProvider();
    await provider.trash('t2');
    const trash = await provider.listThreads('trash');
    expect(trash.threads.map((t) => t.threadId)).toContain('t2');
    const inbox = await provider.listThreads('inbox');
    expect(inbox.threads.map((t) => t.threadId)).not.toContain('t2');
  });

  it('send resolves with the created messageId and the sent message is retrievable', async () => {
    const provider = makeProvider();
    const result = await provider.send({
      to: ['alice@example.com'],
      subject: 'Re: Quarterly report',
      bodyPlain: 'Thanks, merging it in.',
    });
    expect(typeof result.messageId).toBe('string');
    expect(result.messageId.length).toBeGreaterThan(0);

    const sent = await provider.getMessage(result.messageId);
    expect(sent.from).toBe(SELF_ADDRESS);
    expect(sent.to).toEqual(['alice@example.com']);
    expect(sent.cc).toEqual([]); // omitted draft fields default to empty
    expect(sent.bcc).toEqual([]);
    expect(sent.subject).toBe('Re: Quarterly report');
    expect(sent.bodyPlain).toBe('Thanks, merging it in.');
    expect(sent.unread).toBe(false);
    expect(typeof sent.date).toBe('number');

    const sentList = await provider.listThreads('sent');
    expect(sentList.threads.map((t) => t.threadId)).toContain(sent.threadId);
  });

  it('rejects with MailProviderError NOT_FOUND for unknown message and thread ids', async () => {
    const provider = makeProvider();
    await expect(provider.getMessage('missing')).rejects.toBeInstanceOf(MailProviderError);
    await expect(provider.getMessage('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(provider.getThread('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(provider.markRead('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(provider.addTag('missing', 'work')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(provider.archive('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(provider.trash('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lists the fixture tags', async () => {
    const provider = makeProvider();
    const tags = await provider.listTags();
    expect(tags.map((t) => t.tagId)).toEqual(['inbox', 'work', 'starred', 'sent', 'trash']);
    expect(tags.find((t) => t.tagId === 'inbox')!.unreadCount).toBe(2);
  });
});

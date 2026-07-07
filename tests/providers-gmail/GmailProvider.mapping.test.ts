/**
 * Wire→model mapping tests for the GmailProvider proxy
 * (user-stories/typescript_gmail_proxy.md):
 * - wire snake_case JSON maps field-for-field to the shared camelCase model
 *   types (thread_id→threadId, body_plain→bodyPlain, ...) — one test per
 *   model type;
 * - tag semantics pass through untouched (labels are tags, tag_ids→tagIds,
 *   no folder/containment behavior synthesized);
 * - the bridge's epoch-milliseconds date integers are carried as-is with no
 *   parsing or timezone math;
 * - fixtures are modeled on the bridge's wire JSON with fake addresses, and
 *   the fixture builders are shared with the provider-interface tests where
 *   shapes overlap.
 */
import { describe, expect, it } from 'vitest';
import { GmailProvider } from '../../src/providers/gmail/GmailProvider';
import { createFetchMock } from './fetchMock';
import { makeFixtures } from '../providers/fixtures';
import {
  wireMessageGmailLabels,
  wireMessageM1,
  wireMessageM2,
  wireMessageM3,
  wireTags,
  wireThreadListWithNext,
  wireThreadSummaryT1,
  wireThreadT1,
} from './wireFixtures';

function makeProvider() {
  const mock = createFetchMock();
  const provider = new GmailProvider({ fetchFn: mock.fn });
  return { mock, provider };
}

describe('story: wire snake_case maps field-for-field to camelCase — Tag', () => {
  it('tag_id→tagId, name→name, unread_count→unreadCount', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson([{ tag_id: 'inbox', name: 'Inbox', unread_count: 2 }]);

    const tags = await provider.listTags();
    expect(tags).toStrictEqual([{ tagId: 'inbox', name: 'Inbox', unreadCount: 2 }]);
  });

  it('unreadCount is omitted (not undefined-valued) when unread_count is absent on the wire', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson([{ tag_id: 'starred', name: 'Starred' }]);

    const tags = await provider.listTags();
    expect(tags).toStrictEqual([{ tagId: 'starred', name: 'Starred' }]);
    expect('unreadCount' in tags[0]).toBe(false);
  });
});

describe('story: wire snake_case maps field-for-field to camelCase — ThreadSummary', () => {
  it('thread_id→threadId, message_count→messageCount, tag_ids→tagIds, rest verbatim', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireThreadListWithNext());
    const wire = wireThreadSummaryT1();

    const page = await provider.listThreads('inbox');

    expect(page.threads).toStrictEqual([
      {
        threadId: wire.thread_id,
        subject: wire.subject,
        snippet: wire.snippet,
        from: wire.from,
        date: wire.date,
        unread: wire.unread,
        messageCount: wire.message_count,
        tagIds: wire.tag_ids,
      },
    ]);
  });
});

describe('story: wire snake_case maps field-for-field to camelCase — Message', () => {
  it('a plain-only wire message maps exactly to the shared m1 model fixture', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireMessageM1());

    const message = await provider.getMessage('m1');
    expect(message).toStrictEqual(makeFixtures().messages[0]);
  });

  it('a message with both bodies maps body_plain→bodyPlain and body_html→bodyHtml (shared m2 fixture)', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireMessageM2());

    const message = await provider.getMessage('m2');
    expect(message).toStrictEqual(makeFixtures().messages[1]);
  });

  it('an HTML-only wire message omits bodyPlain in the model (shared m3 fixture)', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireMessageM3());

    const message = await provider.getMessage('m3');
    expect(message).toStrictEqual(makeFixtures().messages[2]);
    expect('bodyPlain' in message).toBe(false);
  });

  it('getThread maps every message in the thread, preserving the bridge order (oldest-first)', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireThreadT1());

    const messages = await provider.getThread('t1');
    expect(messages).toStrictEqual([makeFixtures().messages[0], makeFixtures().messages[1]]);
  });
});

describe('story: wire snake_case maps field-for-field to camelCase — SendResult', () => {
  it('message_id→messageId', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson({ message_id: 'sent-1' });

    const result = await provider.send({
      to: ['bob@example.com'],
      subject: 'Hi',
      bodyPlain: 'Hello',
    });
    expect(result).toStrictEqual({ messageId: 'sent-1' });
  });
});

describe('story: tag semantics pass through untouched — no folder/containment behavior synthesized', () => {
  it('Gmail labels arrive as the flat model tag list, same order, nothing added or dropped', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireTags());

    const tags = await provider.listTags();
    expect(tags).toStrictEqual(makeFixtures().tags);
    for (const tag of tags) {
      // Only the model's own keys: no parent/path/folder fields invented.
      expect(
        Object.keys(tag).every((key) => ['tagId', 'name', 'unreadCount'].includes(key)),
      ).toBe(true);
    }
  });

  it('tag_ids maps to tagIds verbatim, including raw Gmail system label ids', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireMessageGmailLabels());

    const message = await provider.getMessage('m7');
    expect(message.tagIds).toStrictEqual(['INBOX', 'UNREAD', 'STARRED', 'Label_7']);
  });
});

describe('story: epoch-milliseconds dates are carried as-is with no parsing or timezone math', () => {
  it('the wire date integer appears identically in the model', async () => {
    const { mock, provider } = makeProvider();
    const wire = wireMessageM1();
    mock.respondJson(wire);

    const message = await provider.getMessage('m1');
    expect(typeof message.date).toBe('number');
    expect(message.date).toBe(wire.date);
  });

  it('even a zero date passes through untransformed', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson({ ...wireMessageM1(), date: 0 });

    const message = await provider.getMessage('m1');
    expect(message.date).toBe(0);
  });
});

describe("story: fixtures are modeled on the bridge's wire JSON and use fake addresses", () => {
  it('wire message fixtures carry exactly the bridge message schema keys', () => {
    const required = [
      'message_id',
      'thread_id',
      'from',
      'to',
      'cc',
      'bcc',
      'subject',
      'date',
      'unread',
      'tag_ids',
    ];
    expect(Object.keys(wireMessageM2()).sort()).toEqual(
      [...required, 'body_plain', 'body_html'].sort(),
    );
    expect(Object.keys(wireMessageM1()).sort()).toEqual([...required, 'body_plain'].sort());
    expect(Object.keys(wireMessageM3()).sort()).toEqual([...required, 'body_html'].sort());
  });

  it('wire thread_summary and tag fixtures carry exactly the bridge schema keys', () => {
    expect(Object.keys(wireThreadSummaryT1()).sort()).toEqual(
      ['thread_id', 'subject', 'snippet', 'from', 'date', 'unread', 'message_count', 'tag_ids'].sort(),
    );
    for (const tag of wireTags()) {
      expect(
        Object.keys(tag).every((key) => ['tag_id', 'name', 'unread_count'].includes(key)),
      ).toBe(true);
    }
  });

  it('every address in the wire fixtures is a fake @example.com address', () => {
    const addresses: string[] = [];
    for (const wire of [wireMessageM1(), wireMessageM2(), wireMessageM3(), wireMessageGmailLabels()]) {
      addresses.push(wire.from, ...wire.to, ...wire.cc, ...wire.bcc);
    }
    addresses.push(wireThreadSummaryT1().from);
    expect(addresses.length).toBeGreaterThan(0);
    for (const address of addresses) {
      expect(address).toMatch(/^[\w.+-]+@example\.com$/);
    }
  });
});

describe('story: fixture builders are shared with the provider-interface tests where shapes overlap', () => {
  it('mapped wire fixtures reproduce the shared makeFixtures() model objects exactly', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireTags()).respondJson(wireMessageM1());

    const shared = makeFixtures();
    expect(await provider.listTags()).toStrictEqual(shared.tags);
    expect(await provider.getMessage('m1')).toStrictEqual(shared.messages[0]);
  });
});

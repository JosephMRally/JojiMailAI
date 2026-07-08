/**
 * Wire→model mapping tests for the GmailProvider proxy
 * (user-stories/providers/typescript_gmail_proxy.md):
 * - Gmail wire JSON maps field-for-field to the shared camelCase model types:
 *   payload.headers yields subject/from/to/cc/bcc (To/Cc/Bcc split on
 *   commas), body parts walked recursively for text/plain→bodyPlain and
 *   text/html→bodyHtml (base64url-decoded, absent parts omitted), unread =
 *   labelIds contains UNREAD — one test per model type;
 * - tag semantics pass through untouched (labels are tags, id→tagId,
 *   labelIds→tagIds verbatim, no folder/containment behavior synthesized;
 *   unreadCount omitted in v1 — labels.list carries no counts);
 * - date comes from internalDate (a string of epoch milliseconds) via
 *   Number(), no header parsing;
 * - a thread summary derives from the metadata fetch: subject/from/snippet/
 *   date/tagIds from the newest message, unread when any message carries
 *   UNREAD, messageCount from the message count;
 * - fixtures are modeled on the Gmail API v1 wire JSON with fake addresses.
 */
import { describe, expect, it } from 'vitest';
import { GmailProvider } from '../../src/providers/gmail/GmailProvider';
import { createFetchMock } from './fetchMock';
import { D_M1, D_M2, SELF_ADDRESS } from '../providers/fixtures';
import {
  b64url,
  gmailLabels,
  gmailMessageM1,
  gmailMessageM2,
  gmailMessageM3,
  gmailMessageNested,
  gmailMessageSystemLabels,
  gmailThreadMetaT1,
  gmailThreadsListWithNext,
  gmailThreadT1,
} from './wireFixtures';

function makeProvider() {
  const mock = createFetchMock();
  const provider = new GmailProvider({ getAccessToken: async () => 'tok', fetchFn: mock.fn });
  return { mock, provider };
}

describe('story: Gmail labels map field-for-field to the model Tag', () => {
  it('id→tagId and name→name, order preserved, nothing added or dropped', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailLabels());

    const tags = await provider.listTags();
    expect(tags).toStrictEqual([
      { tagId: 'inbox', name: 'Inbox' },
      { tagId: 'work', name: 'Work' },
      { tagId: 'starred', name: 'Starred' },
      { tagId: 'sent', name: 'Sent' },
      { tagId: 'trash', name: 'Trash' },
    ]);
  });

  it('unreadCount is omitted in v1 — labels.list carries no counts', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailLabels());

    const tags = await provider.listTags();
    for (const tag of tags) {
      expect('unreadCount' in tag).toBe(false);
      // Only the model's own keys: no parent/path/folder fields invented.
      expect(Object.keys(tag).sort()).toEqual(['name', 'tagId']);
    }
  });
});

describe('story: a Gmail format=full message maps field-for-field to the model Message', () => {
  it('a single-part text/plain message maps headers, labels, date, and decoded body', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailMessageM1());

    const message = await provider.getMessage('m1');
    expect(message).toStrictEqual({
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
    });
  });

  it('a multipart message maps text/plain→bodyPlain and text/html→bodyHtml, both decoded', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailMessageM2());

    const message = await provider.getMessage('m2');
    expect(message.bodyPlain).toBe('Looks good to me.');
    expect(message.bodyHtml).toBe('<p>Looks good to me.</p>');
    expect(message.cc).toEqual(['carol@example.com']);
    expect(message.unread).toBe(true);
  });

  it('an HTML-only message omits bodyPlain in the model (absent, not undefined-valued)', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailMessageM3());

    const message = await provider.getMessage('m3');
    expect(message.bodyHtml).toBe('<h1>Weekly digest</h1><p>Top stories this week.</p>');
    expect('bodyPlain' in message).toBe(false);
  });

  it('bodies nested inside multipart/mixed → multipart/alternative are found recursively', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailMessageNested());

    const message = await provider.getMessage('m8');
    expect(message.bodyPlain).toBe('Nested body.');
    expect(message.bodyHtml).toBe('<p>Nested body.</p>');
  });

  it('a To header with multiple comma-separated recipients splits into a list', async () => {
    const { mock, provider } = makeProvider();
    const wire = gmailMessageM1();
    wire.payload.headers = wire.payload.headers.map((h) =>
      h.name === 'To' ? { name: 'To', value: 'me@example.com, other@example.com' } : h,
    );
    mock.respondJson(wire);

    const message = await provider.getMessage('m1');
    expect(message.to).toEqual(['me@example.com', 'other@example.com']);
  });

  it('missing To/Cc/Bcc headers map to empty lists and a missing Subject to ""', async () => {
    const { mock, provider } = makeProvider();
    const wire = gmailMessageM1();
    wire.payload.headers = [{ name: 'From', value: 'alice@example.com' }];
    mock.respondJson(wire);

    const message = await provider.getMessage('m1');
    expect(message.to).toEqual([]);
    expect(message.cc).toEqual([]);
    expect(message.bcc).toEqual([]);
    expect(message.subject).toBe('');
  });

  it('getThread maps every message in the thread, preserving Gmail order (oldest-first)', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailThreadT1());

    const messages = await provider.getThread('t1');
    expect(messages.map((m) => m.messageId)).toEqual(['m1', 'm2']);
    expect(messages[0].bodyPlain).toBe('Please review the attached quarterly report.');
  });

  // Edge case (SKILL.md step 8): a message with an empty body.
  it('a message with no body data anywhere maps without either body key — and without crashing', async () => {
    const { mock, provider } = makeProvider();
    const wire = gmailMessageM1();
    (wire.payload as { body?: unknown }).body = {};
    mock.respondJson(wire);

    const message = await provider.getMessage('m1');
    expect('bodyPlain' in message).toBe(false);
    expect('bodyHtml' in message).toBe(false);
    expect(message.subject).toBe('Quarterly report');
  });

  it('an empty-string body part maps to bodyPlain "" — present-but-empty is not absent', async () => {
    const { mock, provider } = makeProvider();
    const wire = gmailMessageM1();
    wire.payload.body = { data: b64url('') };
    mock.respondJson(wire);

    const message = await provider.getMessage('m1');
    expect(message.bodyPlain).toBe('');
    expect('bodyPlain' in message).toBe(true);
  });
});

describe('story: tag semantics pass through untouched — no folder/containment behavior synthesized', () => {
  it('labelIds maps to tagIds verbatim, including raw Gmail system label ids', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailMessageSystemLabels());

    const message = await provider.getMessage('m7');
    expect(message.tagIds).toStrictEqual(['INBOX', 'UNREAD', 'STARRED', 'Label_7']);
  });

  it('unread is derived from the UNREAD label, never from a folder', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailMessageSystemLabels());

    const message = await provider.getMessage('m7');
    expect(message.unread).toBe(true);
  });
});

describe('story: date comes from internalDate (epoch-milliseconds string) via Number()', () => {
  it('the internalDate string becomes the model date number, untransformed', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailMessageM1());

    const message = await provider.getMessage('m1');
    expect(typeof message.date).toBe('number');
    expect(message.date).toBe(D_M1);
  });

  it('even a zero internalDate passes through untransformed', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson({ ...gmailMessageM1(), internalDate: '0' });

    const message = await provider.getMessage('m1');
    expect(message.date).toBe(0);
  });
});

describe('story: a thread summary derives from the metadata fetch', () => {
  it('subject/from/snippet/date/tagIds come from the newest message; unread when any message carries UNREAD', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailThreadsListWithNext()).respondJson(gmailThreadMetaT1());

    const page = await provider.listThreads('inbox');

    expect(page.threads).toStrictEqual([
      {
        threadId: 't1',
        subject: 'Re: Quarterly report',
        snippet: 'Looks good to me.',
        from: 'bob@example.com',
        date: D_M2,
        unread: true,
        messageCount: 2,
        tagIds: ['inbox', 'work', 'starred', 'UNREAD'],
      },
    ]);
  });
});

describe('story: fixtures are modeled on the Gmail API v1 wire JSON and use fake addresses', () => {
  it('wire message fixtures carry the Gmail message resource keys', () => {
    for (const wire of [gmailMessageM1(), gmailMessageM2(), gmailMessageM3()]) {
      expect(Object.keys(wire)).toEqual(
        expect.arrayContaining(['id', 'threadId', 'labelIds', 'snippet', 'internalDate', 'payload']),
      );
    }
  });

  it('every address in the wire fixtures is a fake @example.com address', () => {
    const addresses: string[] = [];
    for (const wire of [gmailMessageM1(), gmailMessageM2(), gmailMessageM3(), gmailMessageSystemLabels()]) {
      for (const h of wire.payload.headers) {
        if (['From', 'To', 'Cc', 'Bcc'].includes(h.name)) {
          addresses.push(...h.value.split(',').map((a) => a.trim()));
        }
      }
    }
    expect(addresses.length).toBeGreaterThan(0);
    for (const address of addresses) {
      expect(address).toMatch(/^[\w.+-]+@example\.com$/);
    }
  });
});

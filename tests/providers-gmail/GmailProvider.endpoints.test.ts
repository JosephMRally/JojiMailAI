/**
 * Endpoint-mapping tests for the GmailProvider proxy
 * (user-stories/typescript_gmail_proxy.md):
 * - each interface method maps to exactly one bridge endpoint:
 *   listTags→GET /tags, listThreads→GET /threads?tag=, getThread→GET
 *   /threads/{id}, getMessage→GET /messages/{id}, send→POST /messages/send,
 *   markRead/markUnread/addTag/removeTag→POST /messages/{id}/modify,
 *   archive/trash→POST /threads/{id}/modify (thread-scoped, matching the
 *   interface's archive(threadId)/trash(threadId));
 * - pageToken passes through to the bridge verbatim and next_page_token
 *   comes back opaquely as nextPageToken;
 * - send(draft) POSTs to, cc, bcc, subject, bodyPlain and resolves with the
 *   created messageId.
 */
import { describe, expect, it } from 'vitest';
import { GmailProvider } from '../../src/providers/gmail/GmailProvider';
import { contentTypeOf, createFetchMock, parseBody } from './fetchMock';
import {
  wireMessageM1,
  wireSendResult,
  wireTags,
  wireThreadListLastPage,
  wireThreadListWithNext,
  wireThreadT1,
} from './wireFixtures';

function makeProvider() {
  const mock = createFetchMock();
  const provider = new GmailProvider({ fetchFn: mock.fn });
  return { mock, provider };
}

describe('story: each interface method maps to exactly one bridge endpoint', () => {
  it('listTags → GET /tags, exactly one call', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireTags());

    await provider.listTags();

    expect(mock.calls).toHaveLength(1);
    const url = new URL(mock.calls[0].url);
    expect(url.pathname).toBe('/tags');
    expect(mock.calls[0].init?.method ?? 'GET').toBe('GET');
  });

  it('listThreads → GET /threads?tag=, exactly one call, no page params unless given', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireThreadListLastPage());

    await provider.listThreads('inbox');

    expect(mock.calls).toHaveLength(1);
    const url = new URL(mock.calls[0].url);
    expect(url.pathname).toBe('/threads');
    expect(url.searchParams.get('tag')).toBe('inbox');
    expect(url.searchParams.has('page_token')).toBe(false);
    expect(url.searchParams.has('page_size')).toBe(false);
    expect(mock.calls[0].init?.method ?? 'GET').toBe('GET');
  });

  it('listThreads carries pageSize as page_size', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireThreadListLastPage());

    await provider.listThreads('inbox', { pageSize: 50 });

    const url = new URL(mock.calls[0].url);
    expect(url.searchParams.get('page_size')).toBe('50');
  });

  it('getThread → GET /threads/{id}, exactly one call', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireThreadT1());

    await provider.getThread('t1');

    expect(mock.calls).toHaveLength(1);
    expect(new URL(mock.calls[0].url).pathname).toBe('/threads/t1');
    expect(mock.calls[0].init?.method ?? 'GET').toBe('GET');
  });

  it('getMessage → GET /messages/{id}, exactly one call', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireMessageM1());

    await provider.getMessage('m1');

    expect(mock.calls).toHaveLength(1);
    expect(new URL(mock.calls[0].url).pathname).toBe('/messages/m1');
    expect(mock.calls[0].init?.method ?? 'GET').toBe('GET');
  });

  it('send → POST /messages/send, exactly one call', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireSendResult());

    await provider.send({ to: ['bob@example.com'], subject: 'Hi', bodyPlain: 'Hello' });

    expect(mock.calls).toHaveLength(1);
    expect(new URL(mock.calls[0].url).pathname).toBe('/messages/send');
    expect(mock.calls[0].init?.method).toBe('POST');
    expect(contentTypeOf(mock.calls[0])).toBe('application/json');
  });

  const modifyCases: Array<{
    name: string;
    call: (provider: GmailProvider) => Promise<void>;
    path: string;
    body: Record<string, string>;
  }> = [
    {
      name: 'markRead → POST /messages/{id}/modify {action: mark_read}',
      call: (p) => p.markRead('m1'),
      path: '/messages/m1/modify',
      body: { action: 'mark_read' },
    },
    {
      name: 'markUnread → POST /messages/{id}/modify {action: mark_unread}',
      call: (p) => p.markUnread('m1'),
      path: '/messages/m1/modify',
      body: { action: 'mark_unread' },
    },
    {
      name: 'addTag → POST /messages/{id}/modify {action: add_tag, tag_id}',
      call: (p) => p.addTag('m1', 'work'),
      path: '/messages/m1/modify',
      body: { action: 'add_tag', tag_id: 'work' },
    },
    {
      name: 'removeTag → POST /messages/{id}/modify {action: remove_tag, tag_id}',
      call: (p) => p.removeTag('m1', 'work'),
      path: '/messages/m1/modify',
      body: { action: 'remove_tag', tag_id: 'work' },
    },
    {
      // Thread-scoped: a multi-message thread archives whole, not just the
      // message sharing the thread's id.
      name: 'archive → POST /threads/{id}/modify {action: archive}',
      call: (p) => p.archive('t1'),
      path: '/threads/t1/modify',
      body: { action: 'archive' },
    },
    {
      name: 'trash → POST /threads/{id}/modify {action: trash}',
      call: (p) => p.trash('t1'),
      path: '/threads/t1/modify',
      body: { action: 'trash' },
    },
  ];

  for (const { name, call, path, body } of modifyCases) {
    it(name, async () => {
      const { mock, provider } = makeProvider();
      mock.respondJson({ status: 'ok' });

      await expect(call(provider)).resolves.toBeUndefined();

      expect(mock.calls).toHaveLength(1);
      expect(new URL(mock.calls[0].url).pathname).toBe(path);
      expect(mock.calls[0].init?.method).toBe('POST');
      expect(contentTypeOf(mock.calls[0])).toBe('application/json');
      expect(parseBody(mock.calls[0])).toStrictEqual(body);
    });
  }
});

describe('story: pageToken passes through verbatim; next_page_token comes back opaquely as nextPageToken', () => {
  it('sends the opaque pageToken to the bridge unaltered, even with URL-hostile characters', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireThreadListLastPage());
    const opaque = 'CAESABC+/=17 42';

    await provider.listThreads('inbox', { pageToken: opaque });

    const url = new URL(mock.calls[0].url);
    expect(url.searchParams.get('page_token')).toBe(opaque);
  });

  it('hands next_page_token back as nextPageToken without inspecting it', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireThreadListWithNext());

    const page = await provider.listThreads('inbox');
    expect(page.nextPageToken).toBe('page-2-token');
  });

  it('omits nextPageToken on the last page (no next_page_token key on the wire)', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireThreadListLastPage());

    const page = await provider.listThreads('inbox');
    expect('nextPageToken' in page).toBe(false);
  });
});

describe("story: send(draft) POSTs the draft's to, cc, bcc, subject, bodyPlain and resolves with the created messageId", () => {
  it('POSTs every draft field as the bridge wire body and resolves the messageId', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireSendResult());

    const result = await provider.send({
      to: ['bob@example.com'],
      cc: ['carol@example.com'],
      bcc: ['grace@example.com'],
      subject: 'Quarterly report',
      bodyPlain: 'Please review.',
    });

    expect(parseBody(mock.calls[0])).toStrictEqual({
      to: ['bob@example.com'],
      cc: ['carol@example.com'],
      bcc: ['grace@example.com'],
      subject: 'Quarterly report',
      body_plain: 'Please review.',
    });
    expect(result).toStrictEqual({ messageId: 'sent-1' });
  });

  it('omits cc and bcc from the wire body when the draft has none', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireSendResult());

    await provider.send({ to: ['bob@example.com'], subject: 'Hi', bodyPlain: 'Hello' });

    expect(parseBody(mock.calls[0])).toStrictEqual({
      to: ['bob@example.com'],
      subject: 'Hi',
      body_plain: 'Hello',
    });
  });
});

/**
 * Endpoint-mapping tests for the GmailProvider proxy
 * (user-stories/providers/typescript_gmail_proxy.md):
 * - interface methods map to Gmail REST endpoints under
 *   https://gmail.googleapis.com/gmail/v1/users/me: listTags→GET /labels,
 *   listThreads→GET /threads?labelIds=… followed by GET
 *   /threads/{id}?format=metadata per listed thread, getThread→GET
 *   /threads/{id}?format=full, getMessage→GET /messages/{id}?format=full,
 *   send→POST /messages/send, markRead/markUnread/addTag/removeTag→POST
 *   /messages/{id}/modify with addLabelIds/removeLabelIds (read state is the
 *   UNREAD label), archive→POST /threads/{id}/modify removing INBOX,
 *   trash→POST /threads/{id}/trash;
 * - pageToken passes through verbatim, pageSize forwards as maxResults, and
 *   nextPageToken comes back opaquely;
 * - send(draft) builds an RFC 2822 raw message, base64url-encodes it, POSTs
 *   {raw}, and resolves with the created message id as messageId.
 */
import { describe, expect, it } from 'vitest';
import { GmailProvider } from '../../src/providers/gmail/GmailProvider';
import { contentTypeOf, createFetchMock, parseBody } from './fetchMock';
import {
  fromB64url,
  gmailLabels,
  gmailMessageM1,
  gmailSendResult,
  gmailThreadMetaT1,
  gmailThreadsListLastPage,
  gmailThreadsListWithNext,
  gmailThreadT1,
} from './wireFixtures';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

function makeProvider() {
  const mock = createFetchMock();
  const provider = new GmailProvider({ getAccessToken: async () => 'tok', fetchFn: mock.fn });
  return { mock, provider };
}

describe('story: interface methods map to Gmail REST endpoints', () => {
  it('listTags → GET /labels, exactly one call', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailLabels());

    await provider.listTags();

    expect(mock.calls).toHaveLength(1);
    const url = new URL(mock.calls[0].url);
    expect(url.origin + url.pathname).toBe(`${BASE}/labels`);
    expect(mock.calls[0].init?.method ?? 'GET').toBe('GET');
  });

  it('listThreads → GET /threads?labelIds=…, then GET /threads/{id}?format=metadata per listed thread', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailThreadsListLastPage()).respondJson(gmailThreadMetaT1());

    await provider.listThreads('inbox');

    expect(mock.calls).toHaveLength(2);
    const list = new URL(mock.calls[0].url);
    expect(list.origin + list.pathname).toBe(`${BASE}/threads`);
    expect(list.searchParams.get('labelIds')).toBe('inbox');
    expect(list.searchParams.has('pageToken')).toBe(false);
    expect(list.searchParams.has('maxResults')).toBe(false);

    const meta = new URL(mock.calls[1].url);
    expect(meta.origin + meta.pathname).toBe(`${BASE}/threads/t1`);
    expect(meta.searchParams.get('format')).toBe('metadata');
  });

  it('getThread → GET /threads/{id}?format=full, exactly one call', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailThreadT1());

    await provider.getThread('t1');

    expect(mock.calls).toHaveLength(1);
    const url = new URL(mock.calls[0].url);
    expect(url.origin + url.pathname).toBe(`${BASE}/threads/t1`);
    expect(url.searchParams.get('format')).toBe('full');
    expect(mock.calls[0].init?.method ?? 'GET').toBe('GET');
  });

  it('getMessage → GET /messages/{id}?format=full, exactly one call', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailMessageM1());

    await provider.getMessage('m1');

    expect(mock.calls).toHaveLength(1);
    const url = new URL(mock.calls[0].url);
    expect(url.origin + url.pathname).toBe(`${BASE}/messages/m1`);
    expect(url.searchParams.get('format')).toBe('full');
  });

  it('send → POST /messages/send, exactly one call', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailSendResult());

    await provider.send({ to: ['bob@example.com'], subject: 'Hi', bodyPlain: 'Hello' });

    expect(mock.calls).toHaveLength(1);
    const url = new URL(mock.calls[0].url);
    expect(url.origin + url.pathname).toBe(`${BASE}/messages/send`);
    expect(mock.calls[0].init?.method).toBe('POST');
    expect(contentTypeOf(mock.calls[0])).toBe('application/json');
  });

  const modifyCases: Array<{
    name: string;
    call: (provider: GmailProvider) => Promise<void>;
    path: string;
    body: Record<string, string[]>;
  }> = [
    {
      name: 'markRead → POST /messages/{id}/modify removing the UNREAD label',
      call: (p) => p.markRead('m1'),
      path: '/gmail/v1/users/me/messages/m1/modify',
      body: { removeLabelIds: ['UNREAD'] },
    },
    {
      name: 'markUnread → POST /messages/{id}/modify adding the UNREAD label',
      call: (p) => p.markUnread('m1'),
      path: '/gmail/v1/users/me/messages/m1/modify',
      body: { addLabelIds: ['UNREAD'] },
    },
    {
      name: 'addTag → POST /messages/{id}/modify adding the label',
      call: (p) => p.addTag('m1', 'work'),
      path: '/gmail/v1/users/me/messages/m1/modify',
      body: { addLabelIds: ['work'] },
    },
    {
      name: 'removeTag → POST /messages/{id}/modify removing the label',
      call: (p) => p.removeTag('m1', 'work'),
      path: '/gmail/v1/users/me/messages/m1/modify',
      body: { removeLabelIds: ['work'] },
    },
    {
      // Thread-scoped: a multi-message thread archives whole.
      name: 'archive → POST /threads/{id}/modify removing the INBOX label',
      call: (p) => p.archive('t1'),
      path: '/gmail/v1/users/me/threads/t1/modify',
      body: { removeLabelIds: ['INBOX'] },
    },
  ];

  for (const { name, call, path, body } of modifyCases) {
    it(name, async () => {
      const { mock, provider } = makeProvider();
      mock.respondJson({ id: 'x' });

      await expect(call(provider)).resolves.toBeUndefined();

      expect(mock.calls).toHaveLength(1);
      expect(new URL(mock.calls[0].url).pathname).toBe(path);
      expect(mock.calls[0].init?.method).toBe('POST');
      expect(contentTypeOf(mock.calls[0])).toBe('application/json');
      expect(parseBody(mock.calls[0])).toStrictEqual(body);
    });
  }

  it('trash → POST /threads/{id}/trash (Gmail forbids adding TRASH via modify)', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson({ id: 't1' });

    await expect(provider.trash('t1')).resolves.toBeUndefined();

    expect(mock.calls).toHaveLength(1);
    expect(new URL(mock.calls[0].url).pathname).toBe('/gmail/v1/users/me/threads/t1/trash');
    expect(mock.calls[0].init?.method).toBe('POST');
  });
});

describe('story: pageToken passes through verbatim; nextPageToken comes back opaquely; pageSize forwards as maxResults', () => {
  it('sends the opaque pageToken to Gmail unaltered, even with URL-hostile characters', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailThreadsListLastPage()).respondJson(gmailThreadMetaT1());
    const opaque = 'CAESABC+/=17 42';

    await provider.listThreads('inbox', { pageToken: opaque });

    const url = new URL(mock.calls[0].url);
    expect(url.searchParams.get('pageToken')).toBe(opaque);
  });

  it('carries pageSize as maxResults', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailThreadsListLastPage()).respondJson(gmailThreadMetaT1());

    await provider.listThreads('inbox', { pageSize: 50 });

    const url = new URL(mock.calls[0].url);
    expect(url.searchParams.get('maxResults')).toBe('50');
  });

  it('hands nextPageToken back opaquely without inspecting it', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailThreadsListWithNext()).respondJson(gmailThreadMetaT1());

    const page = await provider.listThreads('inbox');
    expect(page.nextPageToken).toBe('page-2-token');
  });

  it('omits nextPageToken on the last page (no nextPageToken key on the wire)', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailThreadsListLastPage()).respondJson(gmailThreadMetaT1());

    const page = await provider.listThreads('inbox');
    expect('nextPageToken' in page).toBe(false);
  });

  it('an empty mailbox (no threads key) maps to an empty page with no metadata fetches', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson({});

    const page = await provider.listThreads('inbox');
    expect(page.threads).toEqual([]);
    expect(mock.calls).toHaveLength(1);
  });
});

describe('story: send(draft) builds an RFC 2822 raw message, base64url-encoded, and resolves the created messageId', () => {
  it('POSTs {raw} whose decoded form carries To/Cc/Bcc/Subject and the plain body', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailSendResult());

    const result = await provider.send({
      to: ['bob@example.com'],
      cc: ['carol@example.com'],
      bcc: ['grace@example.com'],
      subject: 'Quarterly report',
      bodyPlain: 'Please review.',
    });

    const body = parseBody(mock.calls[0]) as { raw: string };
    expect(Object.keys(body)).toEqual(['raw']);
    // base64url alphabet only: URL-safe, no padding issues on the wire.
    expect(body.raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const rfc2822 = fromB64url(body.raw);
    expect(rfc2822).toContain('To: bob@example.com');
    expect(rfc2822).toContain('Cc: carol@example.com');
    expect(rfc2822).toContain('Bcc: grace@example.com');
    expect(rfc2822).toContain('Subject: Quarterly report');
    expect(rfc2822).toContain('Please review.');
    expect(result).toStrictEqual({ messageId: 'sent-1' });
  });

  it('omits Cc and Bcc header lines when the draft has none', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailSendResult());

    await provider.send({ to: ['bob@example.com'], subject: 'Hi', bodyPlain: 'Hello' });

    const rfc2822 = fromB64url((parseBody(mock.calls[0]) as { raw: string }).raw);
    expect(rfc2822).toContain('To: bob@example.com');
    expect(rfc2822).not.toMatch(/^Cc:/m);
    expect(rfc2822).not.toMatch(/^Bcc:/m);
  });

  it('joins multiple recipients with commas in one header line', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailSendResult());

    await provider.send({
      to: ['bob@example.com', 'dave@example.com'],
      subject: 'Hi',
      bodyPlain: 'Hello',
    });

    const rfc2822 = fromB64url((parseBody(mock.calls[0]) as { raw: string }).raw);
    expect(rfc2822).toContain('To: bob@example.com, dave@example.com');
  });
});

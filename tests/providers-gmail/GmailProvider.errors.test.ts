/**
 * Error-normalization tests for the GmailProvider proxy
 * (user-stories/typescript_gmail_proxy.md):
 * - bridge error bodies {code, message} are rethrown as MailProviderError
 *   with the same code;
 * - transport failures (fetch rejection, non-JSON body) throw
 *   MailProviderError('NETWORK');
 * - an AUTH_REQUIRED error carries a message telling the human to start the
 *   bridge and complete the Google sign-in in a browser;
 * - no retry, caching, or offline-queue logic in v1, documented as a
 *   deliberate omission.
 */
import { describe, expect, it } from 'vitest';
import { MailProviderError } from '../../src/providers/model';
import { GmailProvider } from '../../src/providers/gmail/GmailProvider';
import { createFetchMock } from './fetchMock';
import { wireError, wireTags } from './wireFixtures';

const gmailSources = import.meta.glob('/src/providers/gmail/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function makeProvider() {
  const mock = createFetchMock();
  const provider = new GmailProvider({ fetchFn: mock.fn });
  return { mock, provider };
}

describe('story: bridge error bodies {code, message} are rethrown as MailProviderError with the same code', () => {
  const cases: Array<[code: 'NOT_FOUND' | 'RATE_LIMITED' | 'PROVIDER_ERROR', status: number]> = [
    ['NOT_FOUND', 404],
    ['RATE_LIMITED', 429],
    ['PROVIDER_ERROR', 502],
  ];

  for (const [code, status] of cases) {
    it(`a ${status} {code: ${code}} body becomes MailProviderError('${code}') with the bridge message`, async () => {
      const { mock, provider } = makeProvider();
      mock.respondJson(wireError(code, `bridge says: ${code}`), status);

      const error = await provider.getMessage('m1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(MailProviderError);
      expect((error as MailProviderError).code).toBe(code);
      expect((error as MailProviderError).message).toContain(`bridge says: ${code}`);
    });
  }
});

describe('story: a bridge request-validation error keeps its diagnostic message', () => {
  it('a 422 {code, message} body is rethrown with the message preserved, never collapsed', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson({ code: 'PROVIDER_ERROR', message: 'page_size: must be <= 100' }, 422);

    const error = await provider.listThreads('inbox', { pageSize: 200 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailProviderError);
    expect((error as MailProviderError).code).toBe('PROVIDER_ERROR');
    expect((error as MailProviderError).message).toContain('page_size');
  });
});

describe("story: transport failures throw MailProviderError('NETWORK')", () => {
  it('a rejected fetch (bridge down) becomes NETWORK', async () => {
    const { mock, provider } = makeProvider();
    mock.reject(new TypeError('fetch failed'));

    const error = await provider.listTags().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailProviderError);
    expect((error as MailProviderError).code).toBe('NETWORK');
  });

  it('a non-JSON error body (e.g. an HTML 502 page) becomes NETWORK', async () => {
    const { mock, provider } = makeProvider();
    mock.respondText('<html>Bad Gateway</html>', 502);

    const error = await provider.listTags().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailProviderError);
    expect((error as MailProviderError).code).toBe('NETWORK');
  });

  it('a non-JSON body on a 200 response also becomes NETWORK', async () => {
    const { mock, provider } = makeProvider();
    mock.respondText('not json at all', 200);

    const error = await provider.listTags().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailProviderError);
    expect((error as MailProviderError).code).toBe('NETWORK');
  });
});

describe('story: an AUTH_REQUIRED error tells the human to start the bridge and sign in with a browser', () => {
  it('carries actionable guidance, not just the raw bridge message', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireError('AUTH_REQUIRED', 'token expired'), 401);

    const error = await provider.listTags().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailProviderError);
    expect((error as MailProviderError).code).toBe('AUTH_REQUIRED');
    const message = (error as MailProviderError).message;
    expect(message).toMatch(/bridge/i);
    expect(message).toMatch(/browser/i);
    expect(message).toMatch(/sign[ -]?in/i);
    expect(message).toContain('token expired'); // the bridge detail is preserved
  });
});

describe('story: no retry, caching, or offline-queue logic in v1 — a deliberate, documented omission', () => {
  it('a failed request is not retried: exactly one fetch call', async () => {
    const { mock, provider } = makeProvider();
    mock.reject(new TypeError('fetch failed'));

    await provider.listTags().catch(() => undefined);
    expect(mock.calls).toHaveLength(1);
  });

  it('nothing is cached: every call reaches the bridge again', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(wireTags()).respondJson(wireTags());

    await provider.listTags();
    await provider.listTags();
    expect(mock.calls).toHaveLength(2);
  });

  it('the omission is documented in GmailProvider.ts', () => {
    const source = Object.entries(gmailSources).find(([path]) =>
      path.endsWith('/GmailProvider.ts'),
    )?.[1];
    expect(source).toBeDefined();
    expect(source!).toMatch(/retr/i); // retry / retries
    expect(source!).toMatch(/cach/i); // cache / caching
    expect(source!).toMatch(/offline/i); // offline queue
  });
});

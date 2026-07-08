/**
 * Error-normalization tests for the GmailProvider proxy
 * (user-stories/providers/typescript_gmail_proxy.md):
 * - Gmail API error responses map by status to MailProviderError: 401/403 →
 *   AUTH_REQUIRED, 404 → NOT_FOUND, 429 → RATE_LIMITED, other 4xx/5xx →
 *   PROVIDER_ERROR carrying Gmail's error.message when present;
 * - transport failures (fetch rejection, non-JSON body) throw
 *   MailProviderError('NETWORK'); a rejecting getAccessToken throws
 *   MailProviderError('AUTH_REQUIRED');
 * - an AUTH_REQUIRED error tells the human to sign in with Google via the
 *   app's OAuth flow;
 * - no retry, caching, or offline-queue logic in v1, documented as a
 *   deliberate omission.
 */
import { describe, expect, it } from 'vitest';
import { MailProviderError } from '../../src/providers/model';
import { GmailProvider } from '../../src/providers/gmail/GmailProvider';
import { createFetchMock } from './fetchMock';
import { gmailError, gmailLabels } from './wireFixtures';

const gmailSources = import.meta.glob('/src/providers/gmail/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function makeProvider() {
  const mock = createFetchMock();
  const provider = new GmailProvider({ getAccessToken: async () => 'tok', fetchFn: mock.fn });
  return { mock, provider };
}

describe('story: Gmail API error responses map by HTTP status to MailProviderError', () => {
  const cases: Array<[status: number, code: 'AUTH_REQUIRED' | 'NOT_FOUND' | 'RATE_LIMITED' | 'PROVIDER_ERROR']> = [
    [401, 'AUTH_REQUIRED'],
    [403, 'AUTH_REQUIRED'],
    [404, 'NOT_FOUND'],
    [429, 'RATE_LIMITED'],
    [500, 'PROVIDER_ERROR'],
    [502, 'PROVIDER_ERROR'],
  ];

  for (const [status, code] of cases) {
    it(`an HTTP ${status} becomes MailProviderError('${code}')`, async () => {
      const { mock, provider } = makeProvider();
      mock.respondJson(gmailError(status, `gmail says: ${status}`), status);

      const error = await provider.getMessage('m1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(MailProviderError);
      expect((error as MailProviderError).code).toBe(code);
    });
  }

  it("Gmail's error.message is preserved on PROVIDER_ERROR, never collapsed", async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailError(500, 'Backend Error: quota exceeded for user'), 500);

    const error = await provider.listTags().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailProviderError);
    expect((error as MailProviderError).message).toContain('quota exceeded');
  });
});

describe("story: transport failures throw MailProviderError('NETWORK')", () => {
  it('a rejected fetch (offline) becomes NETWORK', async () => {
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

describe('story: an AUTH_REQUIRED error tells the human to sign in with Google via the app', () => {
  it('a 401 carries actionable sign-in guidance, not just the raw Gmail message', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailError(401, 'Invalid Credentials'), 401);

    const error = await provider.listTags().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailProviderError);
    expect((error as MailProviderError).code).toBe('AUTH_REQUIRED');
    const message = (error as MailProviderError).message;
    expect(message).toMatch(/sign[ -]?in/i);
    expect(message).toMatch(/google/i);
  });

  it('a rejecting getAccessToken (no signed-in account) becomes AUTH_REQUIRED with the same guidance, with no fetch call', async () => {
    const mock = createFetchMock();
    const provider = new GmailProvider({
      getAccessToken: async () => {
        throw new Error('no account');
      },
      fetchFn: mock.fn,
    });

    const error = await provider.listTags().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailProviderError);
    expect((error as MailProviderError).code).toBe('AUTH_REQUIRED');
    expect((error as MailProviderError).message).toMatch(/sign[ -]?in/i);
    expect(mock.calls).toHaveLength(0);
  });
});

describe('story: no retry, caching, or offline-queue logic in v1 — a deliberate, documented omission', () => {
  it('a failed request is not retried: exactly one fetch call', async () => {
    const { mock, provider } = makeProvider();
    mock.reject(new TypeError('fetch failed'));

    await provider.listTags().catch(() => undefined);
    expect(mock.calls).toHaveLength(1);
  });

  it('nothing is cached: every call reaches the API again', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailLabels()).respondJson(gmailLabels());

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

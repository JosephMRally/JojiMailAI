/**
 * Contract tests for the GmailProvider proxy
 * (user-stories/providers/typescript_gmail_proxy.md):
 * - implements MailProvider exactly (compile-time assignability) and
 *   registers into the ProviderRegistry as a drop-in;
 * - constructor takes {getAccessToken, fetchFn?} — a required async OAuth2
 *   token supplier called per request, so every call carries a fresh
 *   Authorization: Bearer header and refresh stays outside the proxy;
 * - construction performs no I/O and no token fetch — the first HTTP request
 *   (and first getAccessToken call) happens on the first interface method
 *   call (Proxy pattern: lazy initialization);
 * - fetch is injected, never global, and no test opens a socket or OAuth flow;
 * - capabilities() answers without any API call.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MailProvider } from '../../src/providers/MailProvider';
import { ProviderRegistry } from '../../src/providers/ProviderRegistry';
import { GmailProvider } from '../../src/providers/gmail/GmailProvider';
import { createFetchMock } from './fetchMock';
import { gmailLabels } from './wireFixtures';

const TOKEN = 'test-oauth-token';

function makeProvider() {
  const mock = createFetchMock();
  const getAccessToken = vi.fn(async () => TOKEN);
  const provider = new GmailProvider({ getAccessToken, fetchFn: mock.fn });
  return { mock, provider, getAccessToken };
}

describe('story: GmailProvider implements the MailProvider interface exactly and registers as a drop-in', () => {
  it('an instance is assignable to MailProvider and resolves from the ProviderRegistry', () => {
    const { provider } = makeProvider();
    // Compile-time assignability assertion: this line fails to build if the
    // interface is not implemented exactly.
    const asInterface: MailProvider = provider;

    const registry = new ProviderRegistry();
    registry.register('gmail-acct', asInterface);
    expect(registry.resolve('gmail-acct')).toBe(provider);
    expect(registry.listAccounts()).toEqual(['gmail-acct']);
  });

  it('fulfills a MailProvider call through the registry — the caller cannot tell it from any other platform', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailLabels());
    const registry = new ProviderRegistry();
    registry.register('gmail-acct', provider);

    const resolved: MailProvider = registry.resolve('gmail-acct');
    const tags = await resolved.listTags();
    expect(tags.map((tag) => tag.tagId)).toEqual(['inbox', 'work', 'starred', 'sent', 'trash']);
  });
});

describe('story: the constructor takes {getAccessToken, fetchFn?} — a per-request OAuth2 token supplier', () => {
  it('every request carries Authorization: Bearer with the supplied token', async () => {
    const { mock, provider } = makeProvider();
    mock.respondJson(gmailLabels());

    await provider.listTags();

    expect(mock.calls).toHaveLength(1);
    expect(new Headers(mock.calls[0].init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('the supplier is called once per request, so a rotated token is picked up without reconstructing', async () => {
    const mock = createFetchMock().respondJson(gmailLabels()).respondJson(gmailLabels());
    const tokens = ['token-1', 'token-2'];
    const getAccessToken = vi.fn(async () => tokens.shift()!);
    const provider = new GmailProvider({ getAccessToken, fetchFn: mock.fn });

    await provider.listTags();
    await provider.listTags();

    expect(getAccessToken).toHaveBeenCalledTimes(2);
    expect(new Headers(mock.calls[0].init?.headers).get('authorization')).toBe('Bearer token-1');
    expect(new Headers(mock.calls[1].init?.headers).get('authorization')).toBe('Bearer token-2');
  });
});

describe('story: construction performs no I/O; the first request and token fetch happen on the first method call', () => {
  it('constructing and registering the provider makes zero fetch calls and zero token calls', () => {
    const { mock, provider, getAccessToken } = makeProvider();
    new ProviderRegistry().register('gmail-acct', provider);
    expect(mock.calls).toHaveLength(0);
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('the first interface method call triggers the first (and only) request', async () => {
    const { mock, provider, getAccessToken } = makeProvider();
    mock.respondJson(gmailLabels());
    expect(mock.calls).toHaveLength(0);

    await provider.listTags();
    expect(mock.calls).toHaveLength(1);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });
});

describe('story: tests mock fetch (injected, never global) and never open a socket or trigger OAuth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the provider uses only the injected fetchFn — global fetch is never touched', async () => {
    const globalSpy = vi.fn(() => {
      throw new Error('global fetch must never be called');
    });
    vi.stubGlobal('fetch', globalSpy);

    const { mock, provider } = makeProvider();
    mock.respondJson(gmailLabels());
    await provider.listTags();

    expect(globalSpy).not.toHaveBeenCalled();
    expect(mock.calls).toHaveLength(1);
  });
});

describe('story: capabilities() returns Gmail affordances without any API call', () => {
  it('resolves {supportsTags: true, supportsSend: true, supportsArchive: true} with zero fetches', async () => {
    const { mock, provider, getAccessToken } = makeProvider(); // nothing queued: any fetch would throw

    await expect(provider.capabilities()).resolves.toStrictEqual({
      supportsTags: true,
      supportsSend: true,
      supportsArchive: true,
    });
    expect(mock.calls).toHaveLength(0);
    expect(getAccessToken).not.toHaveBeenCalled();
  });
});

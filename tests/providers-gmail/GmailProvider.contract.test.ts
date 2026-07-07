/**
 * Contract tests for the GmailProvider proxy
 * (user-stories/typescript_gmail_proxy.md):
 * - implements MailProvider exactly (compile-time assignability) and
 *   registers into the ProviderRegistry as a drop-in;
 * - constructor takes {baseUrl?, fetchFn?} with baseUrl defaulting to
 *   http://127.0.0.1:8765;
 * - construction performs no I/O — the first HTTP request happens on the
 *   first interface method call (Proxy pattern: lazy initialization);
 * - fetch is injected, never global, and no test opens a socket;
 * - capabilities() answers without any bridge call.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MailProvider } from '../../src/providers/MailProvider';
import { ProviderRegistry } from '../../src/providers/ProviderRegistry';
import { GmailProvider } from '../../src/providers/gmail/GmailProvider';
import { createFetchMock } from './fetchMock';
import { wireTags } from './wireFixtures';
import { makeFixtures } from '../providers/fixtures';

describe('story: GmailProvider implements the MailProvider interface exactly and registers as a drop-in', () => {
  it('an instance is assignable to MailProvider and resolves from the ProviderRegistry', () => {
    const mock = createFetchMock();
    // Compile-time assignability assertion: this line fails to build if the
    // interface is not implemented exactly.
    const provider: MailProvider = new GmailProvider({ fetchFn: mock.fn });

    const registry = new ProviderRegistry();
    registry.register('gmail-acct', provider);
    expect(registry.resolve('gmail-acct')).toBe(provider);
    expect(registry.listAccounts()).toEqual(['gmail-acct']);
  });

  it('fulfills a MailProvider call through the registry — the caller cannot tell it from any other platform', async () => {
    const mock = createFetchMock().respondJson(wireTags());
    const registry = new ProviderRegistry();
    registry.register('gmail-acct', new GmailProvider({ fetchFn: mock.fn }));

    const provider: MailProvider = registry.resolve('gmail-acct');
    const tags = await provider.listTags();
    expect(tags).toStrictEqual(makeFixtures().tags);
  });
});

describe('story: constructor takes {baseUrl?, fetchFn?} with baseUrl defaulting to http://127.0.0.1:8765', () => {
  it('requests go to the default base URL when none is given', async () => {
    const mock = createFetchMock().respondJson(wireTags());
    const provider = new GmailProvider({ fetchFn: mock.fn });

    await provider.listTags();
    expect(mock.calls[0].url).toBe('http://127.0.0.1:8765/tags');
  });

  it('a custom baseUrl (e.g. Android emulator host alias) is used instead', async () => {
    const mock = createFetchMock().respondJson(wireTags());
    const provider = new GmailProvider({ baseUrl: 'http://10.0.2.2:9999', fetchFn: mock.fn });

    await provider.listTags();
    expect(mock.calls[0].url).toBe('http://10.0.2.2:9999/tags');
  });
});

describe('story: construction performs no I/O; the first HTTP request happens on the first method call', () => {
  it('constructing and registering the provider makes zero fetch calls', () => {
    const mock = createFetchMock();
    const provider = new GmailProvider({ fetchFn: mock.fn });
    new ProviderRegistry().register('gmail-acct', provider);
    expect(mock.calls).toHaveLength(0);
  });

  it('the first interface method call triggers the first (and only) request', async () => {
    const mock = createFetchMock().respondJson(wireTags());
    const provider = new GmailProvider({ fetchFn: mock.fn });
    expect(mock.calls).toHaveLength(0);

    await provider.listTags();
    expect(mock.calls).toHaveLength(1);
  });
});

describe('story: tests mock fetch (injected, never global) and never open a socket', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the provider uses only the injected fetchFn — global fetch is never touched', async () => {
    const globalSpy = vi.fn(() => {
      throw new Error('global fetch must never be called');
    });
    vi.stubGlobal('fetch', globalSpy);

    const mock = createFetchMock().respondJson(wireTags());
    const provider = new GmailProvider({ fetchFn: mock.fn });
    await provider.listTags();

    expect(globalSpy).not.toHaveBeenCalled();
    expect(mock.calls).toHaveLength(1);
  });
});

describe('story: capabilities() returns Gmail affordances without any bridge call', () => {
  it('resolves {supportsTags: true, supportsSend: true, supportsArchive: true} with zero fetches', async () => {
    const mock = createFetchMock(); // nothing queued: any fetch would throw
    const provider = new GmailProvider({ fetchFn: mock.fn });

    await expect(provider.capabilities()).resolves.toStrictEqual({
      supportsTags: true,
      supportsSend: true,
      supportsArchive: true,
    });
    expect(mock.calls).toHaveLength(0);
  });
});

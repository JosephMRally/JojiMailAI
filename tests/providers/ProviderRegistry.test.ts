/**
 * Tests for ProviderRegistry (user-stories/typescript_mail_provider.md —
 * registry stories): accounts map to providers, unknown accounts fail with
 * the normalized error, and listAccounts preserves registration order.
 */
import { describe, expect, it } from 'vitest';
import { FakeProvider } from '../../src/providers/FakeProvider';
import type { MailProvider } from '../../src/providers/MailProvider';
import { ProviderRegistry } from '../../src/providers/ProviderRegistry';
import { MailProviderError } from '../../src/providers/model';
import { makeFixtures } from './fixtures';

/** A minimal second-platform provider so registry tests span platforms. */
function makeOtherPlatformProvider(): MailProvider {
  return {
    capabilities: async () => ({ supportsTags: false, supportsSend: false, supportsArchive: false }),
    listTags: async () => [],
    listThreads: async () => ({ threads: [] }),
    getThread: async () => [],
    getMessage: async () => {
      throw new MailProviderError('NOT_FOUND');
    },
    send: async () => ({ messageId: 'other-1' }),
    markRead: async () => {},
    markUnread: async () => {},
    addTag: async () => {},
    removeTag: async () => {},
    archive: async () => {},
    trash: async () => {},
  };
}

describe('story: ProviderRegistry maps accounts to providers so platforms coexist in one app', () => {
  it('register(accountId, provider) then resolve(accountId) returns that exact provider', () => {
    const registry = new ProviderRegistry();
    const gmailLike = new FakeProvider(makeFixtures());
    const otherPlatform = makeOtherPlatformProvider();

    registry.register('acct-alice', gmailLike);
    registry.register('acct-zoe', otherPlatform);

    expect(registry.resolve('acct-alice')).toBe(gmailLike);
    expect(registry.resolve('acct-zoe')).toBe(otherPlatform);
  });

  it('resolve throws MailProviderError with code NOT_FOUND for unknown accounts', () => {
    const registry = new ProviderRegistry();
    registry.register('acct-alice', new FakeProvider(makeFixtures()));

    expect(() => registry.resolve('acct-nobody')).toThrow(MailProviderError);
    try {
      registry.resolve('acct-nobody');
      expect.unreachable('resolve must throw for unknown accounts');
    } catch (err) {
      expect(err).toBeInstanceOf(MailProviderError);
      expect((err as MailProviderError).code).toBe('NOT_FOUND');
      expect((err as MailProviderError).message.length).toBeGreaterThan(0);
    }
  });
});

describe('story: listAccounts returns registered accountIds in registration order', () => {
  it('preserves registration order for the account switcher', () => {
    const registry = new ProviderRegistry();
    registry.register('acct-c', makeOtherPlatformProvider());
    registry.register('acct-a', new FakeProvider(makeFixtures()));
    registry.register('acct-b', makeOtherPlatformProvider());

    expect(registry.listAccounts()).toEqual(['acct-c', 'acct-a', 'acct-b']);
  });

  it('returns an empty list before anything is registered', () => {
    expect(new ProviderRegistry().listAccounts()).toEqual([]);
  });
});

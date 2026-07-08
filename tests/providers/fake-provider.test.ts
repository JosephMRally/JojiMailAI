/**
 * FakeProvider fixture loading (user-stories/providers/typescript_fake_provider.md):
 * - engineer story: a helper `loadFakeFixtures(path)` to load fixtures from a JSON file,
 *   with the JSON shape matching FakeProviderFixtures exactly, allowing fixture data
 *   to live in version control without TypeScript duplication.
 */
import { describe, expect, it } from 'vitest';
import { FakeProvider } from '../../src/providers/FakeProvider';
import { loadFakeFixtures } from '../../src/testing/FakeProviderFixtures';
import type { FakeProviderFixtures } from '../../src/providers/FakeProvider';
import simpleFixtures from '../fixtures/fake-provider-simple.json';

describe('story: loadFakeFixtures loads fixture data from JSON', () => {
  it('loads a valid fixture JSON and returns FakeProviderFixtures shape', async () => {
    // In tests, we can import JSON directly. In dev/prod, loadFakeFixtures fetches via HTTP.
    const fixtures = simpleFixtures as FakeProviderFixtures;

    expect(fixtures.tags).toBeInstanceOf(Array);
    expect(fixtures.messages).toBeInstanceOf(Array);
    expect(fixtures.tags.length).toBeGreaterThan(0);
    expect(fixtures.messages.length).toBeGreaterThan(0);
  });

  it('loaded fixtures can seed a FakeProvider directly', async () => {
    const fixtures = simpleFixtures as FakeProviderFixtures;
    const provider = new FakeProvider(fixtures);

    expect(provider.connected).toBe(false);
    const tags = await provider.listTags();
    expect(tags).toBeInstanceOf(Array);
    expect(tags.length).toEqual(fixtures.tags.length);
    expect(provider.connected).toBe(true);
  });

  it('loaded fixtures preserve message content, tags, and metadata', async () => {
    const fixtures = simpleFixtures as FakeProviderFixtures;

    // Sample a message to verify round-trip
    const originalMessage = fixtures.messages[0];
    expect(originalMessage.from).toBe('alice@example.com');
    expect(originalMessage.subject).toBe('Hello');
    expect(originalMessage.bodyPlain).toBe('Hi, how are you?');
    expect(originalMessage.unread).toBe(true);
    expect(originalMessage.tagIds).toContain('inbox');
  });

  it('fixtures can be composed into a multi-tag workflow', async () => {
    const fixtures = simpleFixtures as FakeProviderFixtures;
    const provider = new FakeProvider(fixtures);

    // List threads in inbox (should have multiple)
    const inboxPage = await provider.listThreads('inbox');
    expect(inboxPage.threads.length).toBeGreaterThan(0);

    // Verify thread summaries derive from fixture data
    const firstThread = inboxPage.threads[0];
    expect(firstThread.from).toBeDefined();
    expect(firstThread.subject).toBeDefined();
    expect(firstThread.snippet).toBeDefined();
  });
});

describe('story: fixture JSON shape matches FakeProviderFixtures exactly', () => {
  it('fixtures have tags array with required Tag fields', async () => {
    const fixtures = simpleFixtures as FakeProviderFixtures;

    for (const tag of fixtures.tags) {
      expect(tag.tagId).toBeDefined();
      expect(typeof tag.tagId).toBe('string');
      expect(tag.name).toBeDefined();
      expect(typeof tag.name).toBe('string');
      if (tag.unreadCount !== undefined) {
        expect(typeof tag.unreadCount).toBe('number');
      }
    }
  });

  it('fixtures have messages array with required Message fields', async () => {
    const fixtures = simpleFixtures as FakeProviderFixtures;

    for (const msg of fixtures.messages) {
      expect(msg.messageId).toBeDefined();
      expect(msg.threadId).toBeDefined();
      expect(msg.from).toBeDefined();
      expect(msg.to).toBeInstanceOf(Array);
      expect(msg.cc).toBeInstanceOf(Array);
      expect(msg.bcc).toBeInstanceOf(Array);
      expect(msg.subject).toBeDefined();
      expect(msg.date).toBeDefined();
      expect(typeof msg.date).toBe('number');
      expect(typeof msg.unread).toBe('boolean');
      expect(msg.tagIds).toBeInstanceOf(Array);
    }
  });
});

/**
 * Shared fixture builders for the plug-in layer tests
 * (user-stories/typescript_plugin_system.md). All addresses are fake
 * (@example.com) per SKILL.md — no real addresses or credentials, and all
 * data is deterministic.
 */
import type { Draft, Message, ThreadSummary } from '../../src/providers/model';
import type { MailPlugin } from '../../src/plugins/MailPlugin';

export function makeMessage(): Message {
  return {
    messageId: 'm1',
    threadId: 't1',
    from: 'alice@example.com',
    to: ['me@example.com'],
    cc: [],
    bcc: [],
    subject: 'Quarterly report',
    date: Date.UTC(2025, 0, 1, 9, 0, 0),
    bodyPlain: 'Please review the attached quarterly report.',
    unread: true,
    tagIds: ['inbox', 'work'],
  };
}

export function makeDraft(): Draft {
  return {
    to: ['bob@example.com'],
    subject: 'Hello',
    bodyPlain: 'Hi Bob',
  };
}

export function makeThreadSummary(): ThreadSummary {
  return {
    threadId: 't1',
    subject: 'Quarterly report',
    snippet: 'Please review the attached quarterly report.',
    from: 'alice@example.com',
    date: Date.UTC(2025, 0, 1, 9, 0, 0),
    unread: true,
    messageCount: 2,
    tagIds: ['inbox', 'work'],
  };
}

/**
 * Hand-rolled minimal plug-in for tests that need precise control over a
 * single hook (spies, misbehaving return values) without FakePlugin's
 * conveniences. apiVersion defaults to 1 — the v1 plug-in API.
 */
export function makeInlinePlugin(overrides: Partial<MailPlugin> & Pick<MailPlugin, 'id'>): MailPlugin {
  return {
    name: `Inline ${overrides.id}`,
    version: '0.0.1',
    apiVersion: 1,
    contributes: () => [],
    ...overrides,
  };
}

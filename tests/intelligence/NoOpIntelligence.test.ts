/**
 * NoOpIntelligence tests (user-stories/typescript_mail_intelligence.md):
 * - story (engineer): NoOpIntelligence implements the interface such that
 *   classify returns empty tagIds and importance 'normal', summarizeThread
 *   returns empty summary and actionItems, draftReply returns empty
 *   bodyPlain, and parseSearchQuery returns {} — AI affordances gracefully
 *   degrade when no inference server is configured, and the app remains
 *   fully functional for reading/sending mail.
 */
import { describe, expect, it } from 'vitest';
import type { MailIntelligence } from '../../src/intelligence/MailIntelligence';
import { NoOpIntelligence } from '../../src/intelligence/NoOpIntelligence';
import { makeFixtures } from '../providers/fixtures';

describe('story: NoOpIntelligence degrades every AI affordance to an empty result, never an error', () => {
  // Compile-time assignability: fails to build if the interface drifts.
  const intelligence: MailIntelligence = new NoOpIntelligence();
  const { tags, messages } = makeFixtures();

  it('classify resolves empty tagIds and normal importance — no tags applied, nothing blocked', async () => {
    await expect(intelligence.classify(messages[0], tags)).resolves.toStrictEqual({
      tagIds: [],
      importance: 'normal',
    });
  });

  it('summarizeThread resolves an empty digest', async () => {
    await expect(intelligence.summarizeThread(messages)).resolves.toStrictEqual({
      summary: '',
      actionItems: [],
    });
  });

  it('draftReply resolves an empty body — compose starts from a blank box', async () => {
    await expect(intelligence.draftReply(messages, 'decline politely')).resolves.toStrictEqual({
      bodyPlain: '',
    });
  });

  it('parseSearchQuery resolves {} — search falls back to showing everything', async () => {
    await expect(intelligence.parseSearchQuery('unread invoices', tags)).resolves.toStrictEqual({});
  });

  it('never rejects, even with empty inputs', async () => {
    await expect(intelligence.classify(messages[0], [])).resolves.toBeDefined();
    await expect(intelligence.summarizeThread([])).resolves.toBeDefined();
    await expect(intelligence.draftReply([])).resolves.toBeDefined();
    await expect(intelligence.parseSearchQuery('', [])).resolves.toBeDefined();
  });
});

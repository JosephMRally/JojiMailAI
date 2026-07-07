/**
 * Contract tests for the MailIntelligence interface and its output schemas
 * (user-stories/typescript_mail_intelligence.md):
 * - the interface covers the four core flows: classify, summarizeThread,
 *   draftReply, parseSearchQuery;
 * - both LocalIntelligence and FakeIntelligence are assignable to it, so AI
 *   backends swap the way mail platforms do;
 * - each return type has a matching zod schema (Classification, ThreadDigest,
 *   ReplyDraft, SearchCriteria) that accepts the documented shape and rejects
 *   drift;
 * - MailIntelligenceError carries one of the four documented codes.
 */
import { describe, expect, it } from 'vitest';
import type { MailIntelligence } from '../../src/intelligence/MailIntelligence';
import {
  ClassificationSchema,
  MailIntelligenceError,
  ReplyDraftSchema,
  SearchCriteriaSchema,
  ThreadDigestSchema,
  type MailIntelligenceErrorCode,
} from '../../src/intelligence/MailIntelligence';
import { LocalIntelligence } from '../../src/intelligence/LocalIntelligence';
import { FakeIntelligence } from '../../src/intelligence/FakeIntelligence';
import { createChatMock, TEST_CONFIG } from './fixtures';

describe('story: one interface covers the four core intelligence flows', () => {
  const implementations: Array<[string, () => MailIntelligence]> = [
    ['FakeIntelligence', () => new FakeIntelligence()],
    [
      'LocalIntelligence',
      () => new LocalIntelligence({ config: TEST_CONFIG, client: createChatMock().client }),
    ],
  ];

  for (const [name, make] of implementations) {
    it(`${name} is assignable to MailIntelligence and exposes all four flows`, () => {
      const intelligence: MailIntelligence = make();
      expect(typeof intelligence.classify).toBe('function');
      expect(typeof intelligence.summarizeThread).toBe('function');
      expect(typeof intelligence.draftReply).toBe('function');
      expect(typeof intelligence.parseSearchQuery).toBe('function');
    });
  }
});

describe('story: each flow output is expressed as a zod schema', () => {
  it('ClassificationSchema accepts {tagIds, importance} and rejects an unknown importance', () => {
    expect(
      ClassificationSchema.safeParse({ tagIds: ['t-finance'], importance: 'high' }).success,
    ).toBe(true);
    expect(
      ClassificationSchema.safeParse({ tagIds: ['t-finance'], importance: 'mega' }).success,
    ).toBe(false);
    expect(ClassificationSchema.safeParse({ importance: 'low' }).success).toBe(false);
  });

  it('ThreadDigestSchema accepts {summary, actionItems} and rejects missing actionItems', () => {
    expect(
      ThreadDigestSchema.safeParse({ summary: 'a thread', actionItems: ['reply'] }).success,
    ).toBe(true);
    expect(ThreadDigestSchema.safeParse({ summary: 'a thread' }).success).toBe(false);
  });

  it('ReplyDraftSchema accepts {bodyPlain} and rejects a non-string body', () => {
    expect(ReplyDraftSchema.safeParse({ bodyPlain: 'Hi Alice' }).success).toBe(true);
    expect(ReplyDraftSchema.safeParse({ bodyPlain: 42 }).success).toBe(false);
  });

  it('SearchCriteriaSchema accepts an empty object (every field optional) and full criteria', () => {
    expect(SearchCriteriaSchema.safeParse({}).success).toBe(true);
    expect(
      SearchCriteriaSchema.safeParse({
        tagIds: ['t-finance'],
        from: 'billing@example.com',
        text: 'invoice',
        dateFrom: 1_748_736_000_000,
        dateTo: 1_751_328_000_000,
      }).success,
    ).toBe(true);
  });

  it('SearchCriteriaSchema rejects non-epoch-number dates', () => {
    expect(SearchCriteriaSchema.safeParse({ dateFrom: 'last month' }).success).toBe(false);
  });
});

describe('story: one MailIntelligenceError with four stable codes', () => {
  const codes: MailIntelligenceErrorCode[] = [
    'AI_UNAVAILABLE',
    'AI_MODEL_NOT_FOUND',
    'AI_BAD_OUTPUT',
    'AI_ERROR',
  ];

  for (const code of codes) {
    it(`carries code ${code} and is an Error`, () => {
      const error = new MailIntelligenceError(code, 'detail');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('MailIntelligenceError');
      expect(error.code).toBe(code);
      expect(error.message).toContain('detail');
    });
  }
});

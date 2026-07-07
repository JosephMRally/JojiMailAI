/**
 * FakeIntelligence tests (user-stories/typescript_mail_intelligence.md):
 * the deterministic in-memory implementation every UI/integration test runs
 * against — fixture rules (e.g. subject containing "invoice" → tag finance),
 * fake example.com addresses, no server, no model, no flakiness. It honors
 * the same contract as LocalIntelligence: outputs validate against the zod
 * schemas and classify never invents a tagId.
 */
import { describe, expect, it } from 'vitest';
import { FakeIntelligence } from '../../src/intelligence/FakeIntelligence';
import {
  ClassificationSchema,
  ReplyDraftSchema,
  SearchCriteriaSchema,
  ThreadDigestSchema,
} from '../../src/intelligence/MailIntelligence';
import { fixtureMessage, fixtureThread, TAGS } from './fixtures';

const fakeIntelligenceSources = import.meta.glob('/src/intelligence/FakeIntelligence.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const FIXED_NOW = 1_751_760_000_000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

describe('story: FakeIntelligence classifies deterministically over fixture rules', () => {
  it('a subject containing "invoice" maps to the finance tag when it is available', async () => {
    const fake = new FakeIntelligence();
    const result = await fake.classify(fixtureMessage({ subject: 'Invoice #42 from ACME' }), TAGS);

    expect(ClassificationSchema.safeParse(result).success).toBe(true);
    expect(result.tagIds).toContain('t-finance');
    expect(result.importance).toBe('normal');
  });

  it('an urgent subject is classified importance high', async () => {
    const fake = new FakeIntelligence();
    const result = await fake.classify(
      fixtureMessage({ subject: 'URGENT: server down', bodyPlain: 'help' }),
      TAGS,
    );
    expect(result.importance).toBe('high');
  });

  it('never invents a tagId: no finance tag available means no finance tagId', async () => {
    const fake = new FakeIntelligence();
    const result = await fake.classify(fixtureMessage({ subject: 'Invoice #42 from ACME' }), [
      { tagId: 't-travel', name: 'travel' },
    ]);
    expect(result.tagIds).toEqual([]);
  });

  it('is deterministic: the same message classifies identically run after run', async () => {
    const fake = new FakeIntelligence();
    const first = await fake.classify(fixtureMessage(), TAGS);
    const second = await fake.classify(fixtureMessage(), TAGS);
    expect(second).toEqual(first);
  });
});

describe('story: FakeIntelligence digests threads deterministically', () => {
  it('returns {summary, actionItems} mentioning the subject and extracting the ask', async () => {
    const fake = new FakeIntelligence();
    const digest = await fake.summarizeThread(fixtureThread());

    expect(ThreadDigestSchema.safeParse(digest).success).toBe(true);
    expect(digest.summary).toContain('Invoice #42 from ACME');
    expect(digest.actionItems.some((item) => item.includes('agenda'))).toBe(true);
  });

  it('is deterministic across runs', async () => {
    const fake = new FakeIntelligence();
    expect(await fake.summarizeThread(fixtureThread())).toEqual(
      await fake.summarizeThread(fixtureThread()),
    );
  });
});

describe('story: FakeIntelligence drafts replies shaped by the thread and guidance', () => {
  it('returns {bodyPlain} addressed to the last sender', async () => {
    const fake = new FakeIntelligence();
    const draft = await fake.draftReply(fixtureThread());

    expect(ReplyDraftSchema.safeParse(draft).success).toBe(true);
    expect(draft.bodyPlain).toMatch(/bob/i); // last message in the fixture thread is from bob@example.com
  });

  it('reflects the optional guidance in the draft', async () => {
    const fake = new FakeIntelligence();
    const draft = await fake.draftReply(fixtureThread(), 'decline politely');
    expect(draft.bodyPlain).toMatch(/decline politely/i);
  });

  it('is deterministic across runs', async () => {
    const fake = new FakeIntelligence();
    expect(await fake.draftReply(fixtureThread(), 'decline politely')).toEqual(
      await fake.draftReply(fixtureThread(), 'decline politely'),
    );
  });
});

describe('story: FakeIntelligence parses natural-language search deterministically', () => {
  it('extracts tag, sender, free text, and a last-month date range from an injected clock', async () => {
    const fake = new FakeIntelligence({ now: () => FIXED_NOW });
    const criteria = await fake.parseSearchQuery(
      'finance invoice from billing@example.com last month',
      TAGS,
    );

    expect(SearchCriteriaSchema.safeParse(criteria).success).toBe(true);
    expect(criteria.tagIds).toEqual(['t-finance']);
    expect(criteria.from).toBe('billing@example.com');
    expect(criteria.text).toContain('invoice');
    expect(criteria.dateFrom).toBe(FIXED_NOW - THIRTY_DAYS_MS);
    expect(criteria.dateTo).toBe(FIXED_NOW);
  });

  it('a plain query becomes free text with no phantom criteria', async () => {
    const fake = new FakeIntelligence({ now: () => FIXED_NOW });
    const criteria = await fake.parseSearchQuery('hello world', TAGS);

    expect(criteria.text).toBe('hello world');
    expect(criteria.from).toBeUndefined();
    expect(criteria.dateFrom).toBeUndefined();
    expect(criteria.tagIds ?? []).toEqual([]);
  });
});

describe('story: FakeIntelligence uses fake addresses only', () => {
  it('its source contains no email address outside example.com/example.org', () => {
    const source = Object.values(fakeIntelligenceSources).join('\n');
    const addresses = source.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? [];
    const offenders = addresses.filter((a) => !/@example\.(com|org)$/i.test(a));
    expect(offenders).toEqual([]);
  });
});

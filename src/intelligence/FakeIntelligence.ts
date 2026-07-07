/**
 * FakeIntelligence — the deterministic in-memory MailIntelligence that all
 * UI and integration tests run against: fixture rules instead of a model
 * (e.g. subject containing "invoice" → tag finance), no server, no
 * flakiness, fake example.com addresses only. It honors the same contract
 * as LocalIntelligence — in particular it never invents a tagId.
 * Spec: user-stories/typescript_mail_intelligence.md.
 */
import type { Message, Tag } from '../providers/model';
import type {
  Classification,
  MailIntelligence,
  ReplyDraft,
  SearchCriteria,
  ThreadDigest,
} from './MailIntelligence';

export interface FakeTagRule {
  /** Case-insensitive substring matched against subject + plain body. */
  contains: string;
  /** Applied only when a tag with this name exists in availableTags. */
  tagName: string;
}

export interface FakeIntelligenceOptions {
  tagRules?: FakeTagRule[];
  /** Injectable clock so date criteria stay deterministic in tests. */
  now?: () => number;
}

const DEFAULT_TAG_RULES: FakeTagRule[] = [
  { contains: 'invoice', tagName: 'finance' },
  { contains: 'receipt', tagName: 'finance' },
  { contains: 'flight', tagName: 'travel' },
  { contains: 'itinerary', tagName: 'travel' },
  { contains: 'newsletter', tagName: 'newsletters' },
  { contains: 'unsubscribe', tagName: 'newsletters' },
];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ACTION_LINE = /please|todo|action required/i;
const HIGH_IMPORTANCE = /urgent|asap|action required/i;
const LOW_IMPORTANCE = /newsletter|unsubscribe/i;

export class FakeIntelligence implements MailIntelligence {
  private readonly tagRules: FakeTagRule[];
  private readonly now: () => number;

  constructor(options: FakeIntelligenceOptions = {}) {
    this.tagRules = options.tagRules ?? DEFAULT_TAG_RULES;
    this.now = options.now ?? Date.now;
  }

  async classify(message: Message, availableTags: Tag[]): Promise<Classification> {
    const haystack = `${message.subject}\n${message.bodyPlain ?? ''}`.toLowerCase();
    const byName = new Map(availableTags.map((tag) => [tag.name.toLowerCase(), tag.tagId]));
    const tagIds: string[] = [];
    for (const rule of this.tagRules) {
      if (!haystack.includes(rule.contains.toLowerCase())) continue;
      const tagId = byName.get(rule.tagName.toLowerCase());
      if (tagId !== undefined && !tagIds.includes(tagId)) tagIds.push(tagId);
    }
    const importance = HIGH_IMPORTANCE.test(message.subject)
      ? 'high'
      : LOW_IMPORTANCE.test(haystack)
        ? 'low'
        : 'normal';
    return { tagIds, importance };
  }

  async summarizeThread(messages: Message[]): Promise<ThreadDigest> {
    const subject = messages[0]?.subject ?? '(no subject)';
    const participants = [...new Set(messages.map((message) => message.from))];
    const summary =
      `Thread "${subject}": ${messages.length} message(s) between ` +
      `${participants.join(' and ') || 'nobody'}.`;
    const actionItems: string[] = [];
    for (const message of messages) {
      for (const line of (message.bodyPlain ?? '').split('\n')) {
        const trimmed = line.trim();
        if (trimmed && ACTION_LINE.test(trimmed) && !actionItems.includes(trimmed)) {
          actionItems.push(trimmed);
        }
      }
    }
    return { summary, actionItems };
  }

  async draftReply(thread: Message[], guidance?: string): Promise<ReplyDraft> {
    const last = thread[thread.length - 1];
    const recipient = last?.from.split('@')[0] || 'there';
    const subject = last?.subject ?? '(no subject)';
    const guidanceNote = guidance === undefined ? '' : `\n\n(As requested: ${guidance}.)`;
    return {
      bodyPlain: `Hi ${recipient},\n\nThanks for your message about "${subject}".${guidanceNote}\n\nBest regards`,
    };
  }

  async parseSearchQuery(query: string, availableTags: Tag[]): Promise<SearchCriteria> {
    const criteria: SearchCriteria = {};
    let remaining = query;

    const fromMatch = remaining.match(/from[:\s]+([\w.+-]+@[\w.-]+)/i);
    if (fromMatch) {
      criteria.from = fromMatch[1];
      remaining = remaining.replace(fromMatch[0], ' ');
    }

    if (/last month/i.test(remaining)) {
      const now = this.now();
      criteria.dateFrom = now - THIRTY_DAYS_MS;
      criteria.dateTo = now;
      remaining = remaining.replace(/last month/i, ' ');
    }

    const tagIds: string[] = [];
    for (const tag of availableTags) {
      const pattern = new RegExp(`\\b${escapeRegExp(tag.name)}\\b`, 'i');
      if (pattern.test(remaining)) {
        tagIds.push(tag.tagId);
        remaining = remaining.replace(pattern, ' ');
      }
    }
    if (tagIds.length > 0) criteria.tagIds = tagIds;

    const text = remaining.replace(/\s+/g, ' ').trim();
    if (text) criteria.text = text;
    return criteria;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

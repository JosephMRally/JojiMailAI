/**
 * NoOpIntelligence — the graceful-degradation MailIntelligence backend the
 * composition root selects when no inference server is configured
 * (VITE_AI_BASE_URL unset/empty). Every flow resolves an empty result and
 * never rejects: arriving mail gets no auto-tags, long threads open without
 * a digest, compose starts from a blank box, and search shows everything —
 * while reading, tagging, and sending mail keep working untouched. This is
 * what lets an app-store install run with zero server setup.
 * Spec: user-stories/typescript_mail_intelligence.md.
 */
import type {
  Classification,
  MailIntelligence,
  ReplyDraft,
  SearchCriteria,
  ThreadDigest,
} from './MailIntelligence';

export class NoOpIntelligence implements MailIntelligence {
  async classify(): Promise<Classification> {
    return { tagIds: [], importance: 'normal' };
  }

  async summarizeThread(): Promise<ThreadDigest> {
    return { summary: '', actionItems: [] };
  }

  async draftReply(): Promise<ReplyDraft> {
    return { bodyPlain: '' };
  }

  async parseSearchQuery(): Promise<SearchCriteria> {
    return {};
  }
}

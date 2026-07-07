/**
 * MailIntelligence — the single AI surface the UI may import, mirroring the
 * MailProvider design: an interface the UI depends on, concrete backends
 * swapped at the composition root, and one normalized error type.
 * Output types are zod schemas so every backend validates what it returns.
 * Pure contract — zero I/O. Spec: user-stories/typescript_mail_intelligence.md.
 */
import { z } from 'zod';
import type { Message, Tag } from '../providers/model';

// --- output schemas (zod is the runtime source of truth) ---------------------

export const ClassificationSchema = z.object({
  tagIds: z.array(z.string()),
  importance: z.enum(['high', 'normal', 'low']),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export const ThreadDigestSchema = z.object({
  summary: z.string(),
  actionItems: z.array(z.string()),
});
export type ThreadDigest = z.infer<typeof ThreadDigestSchema>;

export const ReplyDraftSchema = z.object({
  bodyPlain: z.string(),
});
export type ReplyDraft = z.infer<typeof ReplyDraftSchema>;

/** Dates are epoch milliseconds, matching the shared Message model. */
export const SearchCriteriaSchema = z.object({
  tagIds: z.array(z.string()).optional(),
  from: z.string().optional(),
  text: z.string().optional(),
  dateFrom: z.number().optional(),
  dateTo: z.number().optional(),
});
export type SearchCriteria = z.infer<typeof SearchCriteriaSchema>;

// --- the interface ------------------------------------------------------------

export interface MailIntelligence {
  /** Classifies one message into the given tags — never inventing a tagId. */
  classify(message: Message, availableTags: Tag[]): Promise<Classification>;
  summarizeThread(messages: Message[]): Promise<ThreadDigest>;
  draftReply(thread: Message[], guidance?: string): Promise<ReplyDraft>;
  parseSearchQuery(query: string, availableTags: Tag[]): Promise<SearchCriteria>;
}

// --- the one normalized error --------------------------------------------------

export type MailIntelligenceErrorCode =
  | 'AI_UNAVAILABLE'
  | 'AI_MODEL_NOT_FOUND'
  | 'AI_BAD_OUTPUT'
  | 'AI_ERROR';

export class MailIntelligenceError extends Error {
  readonly code: MailIntelligenceErrorCode;

  constructor(code: MailIntelligenceErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'MailIntelligenceError';
    this.code = code;
  }
}

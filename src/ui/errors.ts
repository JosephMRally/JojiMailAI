/**
 * Error copy helpers (user-stories/typescript_email_ui.md): messages are
 * keyed off the normalized error codes — MailProviderError for mail flows,
 * MailIntelligenceError for AI affordances — so provider- or backend-specific
 * guidance flows through without the UI knowing platforms.
 */
import { MailIntelligenceError } from '../intelligence/MailIntelligence';
import { MailProviderError, type MailProviderErrorCode } from '../providers/model';

export interface ProviderFailure {
  code: MailProviderErrorCode;
  message: string;
}

export function toProviderFailure(error: unknown): ProviderFailure {
  if (error instanceof MailProviderError) {
    return { code: error.code, message: error.message };
  }
  return { code: 'PROVIDER_ERROR', message: String(error) };
}

/** "AI digest unavailable (AI_UNAVAILABLE): inference server unreachable". */
export function describeAiError(prefix: string, error: unknown): string {
  if (error instanceof MailIntelligenceError) {
    return `${prefix} (${error.code}): ${error.message}`;
  }
  return `${prefix}: ${String(error)}`;
}

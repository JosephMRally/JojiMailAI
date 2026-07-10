/**
 * Error copy helpers (user-stories/typescript_email_ui.md): messages are
 * keyed off the normalized MailProviderError code, so provider-specific
 * guidance flows through without the UI knowing platforms.
 */
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

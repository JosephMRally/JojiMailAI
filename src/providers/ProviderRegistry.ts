/**
 * Maps accountIds to whichever concrete MailProvider serves them, so
 * multiple accounts on different platforms coexist in one running app.
 * Spec: user-stories/typescript_mail_provider.md.
 */
import type { MailProvider } from './MailProvider';
import { MailProviderError } from './model';

export class ProviderRegistry {
  private readonly providers = new Map<string, MailProvider>();

  register(accountId: string, provider: MailProvider): void {
    this.providers.set(accountId, provider);
  }

  resolve(accountId: string): MailProvider {
    const provider = this.providers.get(accountId);
    if (!provider) {
      throw new MailProviderError('NOT_FOUND', `No provider registered for account "${accountId}"`);
    }
    return provider;
  }

  /** Registered accountIds in registration order. */
  listAccounts(): string[] {
    return [...this.providers.keys()];
  }
}

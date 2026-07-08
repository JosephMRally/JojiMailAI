// @vitest-environment jsdom
/**
 * Startup-failure stories (user-stories/typescript_email_ui.md):
 * - story (human): a failed initial tag/capability load (e.g. AUTH_REQUIRED
 *   before Google sign-in, or offline) replaces the "Loading…" state with
 *   the normalized error message and a Retry button — never an indefinite
 *   spinner.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MailProviderError } from '../../src/providers/model';
import { renderApp } from './harness';
import { DEFAULT_MESSAGES, TAGS } from './fixtures';
import { TagsFailingProvider } from './testDoubles';

afterEach(cleanup);

function authFailingProvider(): TagsFailingProvider {
  const provider = new TagsFailingProvider({ tags: TAGS, messages: DEFAULT_MESSAGES });
  provider.tagsFailWith = new MailProviderError(
    'AUTH_REQUIRED',
    'Sign in with Google from the app to connect your Gmail account, then try again.',
  );
  return provider;
}

describe('story: a failed initial tag load shows the error and a Retry button, never a stuck spinner', () => {
  it('an AUTH_REQUIRED rejection replaces Loading… with the sign-in guidance', async () => {
    await renderApp({ provider: authFailingProvider() });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/sign in with google/i);
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('a NETWORK rejection is shown the same way — the error path is code-agnostic', async () => {
    const provider = new TagsFailingProvider({ tags: TAGS, messages: DEFAULT_MESSAGES });
    provider.tagsFailWith = new MailProviderError(
      'NETWORK',
      'Cannot reach Gmail. Check your network connection and try again.',
    );
    await renderApp({ provider });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/network connection/i);
  });

  it('Retry reloads the tags once the failure clears (e.g. after signing in)', async () => {
    const provider = authFailingProvider();
    const { user } = await renderApp({ provider });
    await screen.findByRole('alert');

    provider.tagsFailWith = undefined; // the user signed in
    await user.click(screen.getByRole('button', { name: /retry/i }));

    const tagsNav = await screen.findByRole('navigation', { name: /tags/i });
    expect(tagsNav).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

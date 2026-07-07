// @vitest-environment jsdom
/**
 * Sidebar stories (user-stories/typescript_email_ui.md):
 * - story (human): an account switcher listing ProviderRegistry.listAccounts(),
 *   showing the selected account's tags from listTags();
 * - story (human): navigation by tags, never folders — a tag shows the threads
 *   carrying it and the same thread appears under every tag it carries;
 * - story (engineer): loading and empty ("no messages") states;
 * - story (engineer): vitest + React Testing Library asserting on roles/text.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeProvider } from '../../src/providers/FakeProvider';
import { renderApp } from './harness';
import {
  ACCOUNT_ID,
  DEFAULT_MESSAGES,
  LUNCH_M1,
  SECOND_ACCOUNT_ID,
  TAGS,
  makeMessage,
} from './fixtures';
import { HangingProvider } from './testDoubles';

afterEach(cleanup);

const workProvider = () =>
  new FakeProvider({ tags: [{ tagId: 'tag-work', name: 'work' }], messages: [] });

describe('story: an account switcher lists every registered account with its tags', () => {
  it('lists all accounts from ProviderRegistry.listAccounts() (roles and text, not internals)', async () => {
    await renderApp({
      extraAccounts: [{ accountId: SECOND_ACCOUNT_ID, provider: workProvider() }],
    });
    const accountsNav = await screen.findByRole('navigation', { name: /accounts/i });
    expect(within(accountsNav).getByRole('button', { name: ACCOUNT_ID })).toBeInTheDocument();
    expect(
      within(accountsNav).getByRole('button', { name: SECOND_ACCOUNT_ID }),
    ).toBeInTheDocument();
  });

  it('shows the selected account tags from listTags() and switches accounts on selection', async () => {
    const { user } = await renderApp({
      extraAccounts: [{ accountId: SECOND_ACCOUNT_ID, provider: workProvider() }],
    });
    const tagsNav = await screen.findByRole('navigation', { name: /tags/i });
    await within(tagsNav).findByRole('button', { name: 'inbox' });
    expect(within(tagsNav).getByRole('button', { name: 'finance' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: SECOND_ACCOUNT_ID }));
    const switchedNav = await screen.findByRole('navigation', { name: /tags/i });
    await within(switchedNav).findByRole('button', { name: 'work' });
    expect(within(switchedNav).queryByRole('button', { name: 'inbox' })).toBeNull();
  });
});

describe('story: navigation is by tags, never folders', () => {
  it('selecting a tag shows the threads carrying it, and a thread appears under every tag it carries', async () => {
    const multiTagged = [
      makeMessage({
        messageId: 'm1',
        threadId: 't-invoice',
        tagIds: ['tag-inbox', 'tag-finance'],
      }),
      LUNCH_M1,
    ];
    const { user } = await renderApp({ seed: multiTagged });

    const threads = await screen.findByRole('list', { name: 'Threads' });
    await within(threads).findByRole('listitem', { name: 'Quarterly invoice' });
    expect(within(threads).getByRole('listitem', { name: 'Lunch plans' })).toBeInTheDocument();

    const tagsNav = screen.getByRole('navigation', { name: /tags/i });
    await user.click(within(tagsNav).getByRole('button', { name: 'finance' }));
    const financeThreads = await screen.findByRole('list', { name: 'Threads' });
    await within(financeThreads).findByRole('listitem', { name: 'Quarterly invoice' });
    expect(within(financeThreads).queryByRole('listitem', { name: 'Lunch plans' })).toBeNull();
  });
});

describe('story: loading and empty states on the mailbox screen', () => {
  it('shows a loading state while provider data is pending', async () => {
    await renderApp({
      provider: new HangingProvider({ tags: TAGS, messages: DEFAULT_MESSAGES }),
    });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows "no messages" when the selected tag has no stored threads', async () => {
    await renderApp();
    expect(await screen.findByText(/no messages/i)).toBeInTheDocument();
  });
});

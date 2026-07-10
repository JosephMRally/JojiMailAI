// @vitest-environment jsdom
/**
 * Refresh/sync stories (user-stories/typescript_email_ui.md):
 * - story (human): manual refresh fetches the current page from the provider
 *   and upserts it into the MailStore; thread lists read from the store;
 * - story (human): previously synced mail stays readable when the provider is
 *   unreachable — refresh surfaces the error, stored mail stays listed;
 * - story (engineer): error copy keyed off MailProviderError.code —
 *   AUTH_REQUIRED shows the error's own message, NETWORK offers a retry.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailProviderError } from '../../src/providers/model';
import { renderApp } from './harness';
import { ACCOUNT_ID, DEFAULT_MESSAGES, TAGS } from './fixtures';
import { FlakyProvider } from './testDoubles';

afterEach(cleanup);

describe('story: manual refresh syncs the provider page into the store, and lists read from the store', () => {
  it('upserts threads and messages, then renders rows read back from the store', async () => {
    const { store, user } = await renderApp();
    const upsertThreads = vi.spyOn(store, 'upsertThreads');
    const upsertMessages = vi.spyOn(store, 'upsertMessages');
    const listFromStore = vi.spyOn(store, 'listThreads');

    await user.click(await screen.findByRole('button', { name: 'Refresh' }));

    await screen.findByRole('listitem', { name: 'Quarterly invoice' });
    expect(upsertThreads).toHaveBeenCalledWith(
      ACCOUNT_ID,
      expect.arrayContaining([expect.objectContaining({ threadId: 't-invoice' })]),
    );
    expect(upsertMessages).toHaveBeenCalledWith(
      ACCOUNT_ID,
      expect.arrayContaining([expect.objectContaining({ messageId: 'm1' })]),
    );
    expect(listFromStore).toHaveBeenCalled();
  });
});

describe('story: synced mail stays readable offline', () => {
  it('keeps stored rows listed when refresh rejects with NETWORK, and retry recovers', async () => {
    const provider = new FlakyProvider({ tags: TAGS, messages: DEFAULT_MESSAGES });
    const { user } = await renderApp({ provider, seed: DEFAULT_MESSAGES });
    await screen.findByRole('listitem', { name: 'Quarterly invoice' });

    provider.failWith = new MailProviderError('NETWORK', 'bridge unreachable');
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('bridge unreachable');
    expect(screen.getByRole('listitem', { name: 'Quarterly invoice' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Lunch plans' })).toBeInTheDocument();

    provider.failWith = undefined;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('story: provider error copy is keyed off MailProviderError.code', () => {
  it("AUTH_REQUIRED shows the error's own message and no retry button", async () => {
    const provider = new FlakyProvider({ tags: TAGS, messages: DEFAULT_MESSAGES });
    provider.failWith = new MailProviderError(
      'AUTH_REQUIRED',
      'Reconnect Gmail: run the bridge once and complete Google sign-in.',
    );
    const { user } = await renderApp({ provider, seed: DEFAULT_MESSAGES });

    await user.click(await screen.findByRole('button', { name: 'Refresh' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(
      'Reconnect Gmail: run the bridge once and complete Google sign-in.',
    );
    expect(within(alert).queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});

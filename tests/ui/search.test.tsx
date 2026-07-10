// @vitest-environment jsdom
/**
 * Search stories (user-stories/typescript_email_ui.md):
 * - story (human): one search box runs my words through the store's exact text
 *   search (store.searchText) and filters the thread list to matching threads;
 * - story (human): clearing the query restores the full list;
 * - story (engineer): an all-stop-word query is reported as too generic and
 *   matches nothing, instead of matching everything.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from './harness';
import { ACCOUNT_ID, DEFAULT_MESSAGES } from './fixtures';

afterEach(cleanup);

function threadsList(): HTMLElement {
  return screen.getByRole('list', { name: 'Threads' });
}

async function search(user: UserEvent, query: string): Promise<void> {
  const box = await screen.findByRole('searchbox', { name: 'Search' });
  await user.clear(box);
  if (query !== '') await user.type(box, query);
  await user.click(screen.getByRole('button', { name: 'Search' }));
}

describe('story: text search filters the list to matching threads', () => {
  it('runs the store text search and keeps only threads that contain the term', async () => {
    const { store, user } = await renderApp({ seed: DEFAULT_MESSAGES });
    const searchText = vi.spyOn(store, 'searchText');
    await screen.findByRole('listitem', { name: 'Lunch plans' });

    await search(user, 'unpaid');

    await waitFor(() => expect(searchText).toHaveBeenCalledWith(ACCOUNT_ID, 'unpaid'));
    await within(threadsList()).findByRole('listitem', { name: 'Quarterly invoice' });
    expect(within(threadsList()).queryByRole('listitem', { name: 'Lunch plans' })).toBeNull();
  });
});

describe('story: clearing the query restores the full list', () => {
  it('shows every thread again after the search box is emptied', async () => {
    const { user } = await renderApp({ seed: DEFAULT_MESSAGES });
    await screen.findByRole('listitem', { name: 'Lunch plans' });

    await search(user, 'unpaid');
    await waitFor(() =>
      expect(within(threadsList()).queryByRole('listitem', { name: 'Lunch plans' })).toBeNull(),
    );

    await search(user, '');
    await screen.findByRole('listitem', { name: 'Lunch plans' });
    await within(threadsList()).findByRole('listitem', { name: 'Quarterly invoice' });
  });
});

describe('story: an all-stop-word query is reported as too generic', () => {
  it('matches nothing and shows a too-generic notice', async () => {
    const { user } = await renderApp({ seed: DEFAULT_MESSAGES });
    await screen.findByRole('listitem', { name: 'Lunch plans' });

    await search(user, 'the');

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toMatch(/too generic/i);
    expect(screen.queryByRole('list', { name: 'Threads' })).toBeNull();
  });
});

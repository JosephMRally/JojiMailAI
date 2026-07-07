// @vitest-environment jsdom
/**
 * Search stories (user-stories/typescript_email_ui.md):
 * - story (human): one search box passes my words through
 *   intelligence.parseSearchQuery and applies the criteria to the thread list,
 *   showing them as removable chips — text terms go through store.searchText,
 *   tag/from/date criteria filter the store's rows;
 * - story (engineer): a parseSearchQuery failure degrades with error copy
 *   keyed off MailIntelligenceError.code and a retry, never blocking the list.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from './harness';
import {
  ACCOUNT_ID,
  APRIL_1,
  DEFAULT_MESSAGES,
  LUNCH_M1,
  makeMessage,
} from './fixtures';
import { RejectingIntelligence } from './testDoubles';

afterEach(cleanup);

function threadsList(): HTMLElement {
  return screen.getByRole('list', { name: 'Threads' });
}

async function search(user: { click(e: Element): Promise<void>; type(e: Element, t: string): Promise<void> }, query: string): Promise<void> {
  await user.type(await screen.findByRole('searchbox', { name: 'Search' }), query);
  await user.click(screen.getByRole('button', { name: 'Search' }));
}

describe('story: text terms go through store.searchText and filter the list', () => {
  it('runs the Bloom-backed store search, shows a removable chip, and restores on removal', async () => {
    const { store, user } = await renderApp({ seed: DEFAULT_MESSAGES });
    const searchText = vi.spyOn(store, 'searchText');
    await screen.findByRole('listitem', { name: 'Lunch plans' });

    await search(user, 'unpaid');

    await waitFor(() => expect(searchText).toHaveBeenCalledWith(ACCOUNT_ID, 'unpaid'));
    const chips = await screen.findByRole('list', { name: 'Search criteria' });
    expect(within(chips).getByText('text: unpaid')).toBeInTheDocument();
    await within(threadsList()).findByRole('listitem', { name: 'Quarterly invoice' });
    expect(within(threadsList()).queryByRole('listitem', { name: 'Lunch plans' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Remove text: unpaid' }));
    await within(threadsList()).findByRole('listitem', { name: 'Lunch plans' });
  });
});

describe('story: from criteria filter the store rows', () => {
  it('keeps only threads whose sender matches the interpreted from: criterion', async () => {
    const { user } = await renderApp({ seed: DEFAULT_MESSAGES });
    await screen.findByRole('listitem', { name: 'Lunch plans' });

    await search(user, 'from bob@example.com');

    const chips = await screen.findByRole('list', { name: 'Search criteria' });
    expect(within(chips).getByText('from: bob@example.com')).toBeInTheDocument();
    await within(threadsList()).findByRole('listitem', { name: 'Quarterly invoice' });
    expect(within(threadsList()).queryByRole('listitem', { name: 'Lunch plans' })).toBeNull();
  });
});

describe('story: tag criteria filter the store rows by tag', () => {
  it('interprets a tag name and lists the threads carrying that tag', async () => {
    const financeInvoice = makeMessage({
      messageId: 'm1',
      threadId: 't-invoice',
      tagIds: ['tag-inbox', 'tag-finance'],
    });
    const { user } = await renderApp({ seed: [financeInvoice, LUNCH_M1] });
    await screen.findByRole('listitem', { name: 'Lunch plans' });

    await search(user, 'finance');

    const chips = await screen.findByRole('list', { name: 'Search criteria' });
    expect(within(chips).getByText('tag: finance')).toBeInTheDocument();
    await within(threadsList()).findByRole('listitem', { name: 'Quarterly invoice' });
    expect(within(threadsList()).queryByRole('listitem', { name: 'Lunch plans' })).toBeNull();
  });
});

describe('story: date criteria filter the store rows by date range', () => {
  it('interprets "last month" into removable since/until chips that bound the list', async () => {
    const oldInvoice = makeMessage({
      messageId: 'm1',
      threadId: 't-invoice',
      date: APRIL_1,
    });
    const { user } = await renderApp({ seed: [oldInvoice, LUNCH_M1] });
    await screen.findByRole('listitem', { name: 'Quarterly invoice' });

    await search(user, 'last month');

    const chips = await screen.findByRole('list', { name: 'Search criteria' });
    expect(within(chips).getByText('since: 2024-04-15')).toBeInTheDocument();
    expect(within(chips).getByText('until: 2024-05-15')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(threadsList()).queryByRole('listitem', { name: 'Quarterly invoice' }),
      ).toBeNull(),
    );
    expect(within(threadsList()).getByRole('listitem', { name: 'Lunch plans' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove since: 2024-04-15' }));
    await within(threadsList()).findByRole('listitem', { name: 'Quarterly invoice' });
  });
});

describe('story: a search AI failure degrades with a retry and never blocks the list', () => {
  it('shows error copy with the MailIntelligenceError code, keeps rows, and retry recovers', async () => {
    const intelligence = new RejectingIntelligence(['parseSearchQuery'], { times: 1 });
    const { user } = await renderApp({ intelligence, seed: DEFAULT_MESSAGES });
    await screen.findByRole('listitem', { name: 'Lunch plans' });

    await search(user, 'unpaid');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/search unavailable/i);
    expect(alert.textContent).toContain('AI_UNAVAILABLE');
    expect(within(threadsList()).getByRole('listitem', { name: 'Lunch plans' })).toBeInTheDocument();
    expect(
      within(threadsList()).getByRole('listitem', { name: 'Quarterly invoice' }),
    ).toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    await screen.findByRole('list', { name: 'Search criteria' });
    await waitFor(() =>
      expect(within(threadsList()).queryByRole('listitem', { name: 'Lunch plans' })).toBeNull(),
    );
  });
});

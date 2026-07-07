// @vitest-environment jsdom
/**
 * Thread-list stories (user-stories/typescript_email_ui.md):
 * - story (human): sender, subject, snippet, date, message count, and tag
 *   chips per row, unread visually distinct;
 * - story (human): relative dates — time-of-day today, date otherwise;
 * - story (human): "load more" exactly when nextPageToken is present;
 * - story (human): triage actions (read/unread/archive/trash) calling the
 *   provider and updating the list optimistically;
 * - story (human): AI-importance ordering with a toggle back to date order;
 * - story (engineer): capability-gated affordances;
 * - story (human): plug-in threadAction entries on thread rows.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PluginHost } from '../../src/plugins/PluginHost';
import { InMemoryPluginSettings } from '../../src/plugins/PluginSettings';
import { FakePlugin } from '../../src/plugins/FakePlugin';
import { renderApp } from './harness';
import { DEFAULT_MESSAGES, TAGS, makeBulkMessages, makeMessage } from './fixtures';
import { CapabilityProvider } from './testDoubles';

afterEach(cleanup);

function threadSubjects(): Array<string | null> {
  return within(screen.getByRole('list', { name: 'Threads' }))
    .getAllByRole('listitem')
    .map((item) => item.getAttribute('aria-label'));
}

describe('story: the thread list shows sender, subject, snippet, date, count, and tag chips', () => {
  it('renders every summary field with unread threads visually distinct', async () => {
    await renderApp({ seed: DEFAULT_MESSAGES });
    const invoiceRow = await screen.findByRole('listitem', { name: 'Quarterly invoice' });
    expect(within(invoiceRow).getByText('bob@example.com')).toBeInTheDocument();
    expect(within(invoiceRow).getByText(/still unpaid/)).toBeInTheDocument();
    expect(within(invoiceRow).getByText('(2)')).toBeInTheDocument();
    expect(within(invoiceRow).getByText('inbox')).toBeInTheDocument();
    expect(within(invoiceRow).getByLabelText('unread')).toBeInTheDocument();

    const lunchRow = screen.getByRole('listitem', { name: 'Lunch plans' });
    expect(within(lunchRow).queryByLabelText('unread')).toBeNull();
  });
});

describe('story: dates render relative for today and as a date otherwise', () => {
  it('shows time-of-day for a same-day thread and a date for older threads', async () => {
    await renderApp({ seed: DEFAULT_MESSAGES });
    const lunchRow = await screen.findByRole('listitem', { name: 'Lunch plans' });
    expect(within(lunchRow).getByText('09:05')).toBeInTheDocument();
    const invoiceRow = screen.getByRole('listitem', { name: 'Quarterly invoice' });
    expect(within(invoiceRow).getByText('2024-05-03')).toBeInTheDocument();
  });
});

describe('story: "load more" appears exactly when nextPageToken is present', () => {
  it('pages through a large tag, appending the next page and hiding the control on the last page', async () => {
    const bulk = makeBulkMessages(12);
    const { user } = await renderApp({ fixtures: { tags: TAGS, messages: bulk } });
    await user.click(await screen.findByRole('button', { name: 'Refresh' }));

    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Threads' })).getAllByRole('listitem'),
      ).toHaveLength(10),
    );
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Threads' })).getAllByRole('listitem'),
      ).toHaveLength(12),
    );
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});

describe('story: triage actions call the provider and update the list optimistically', () => {
  it('mark read / mark unread call markRead/markUnread and flip the unread badge', async () => {
    const { provider, user } = await renderApp({ seed: DEFAULT_MESSAGES });
    const markRead = vi.spyOn(provider, 'markRead');
    const markUnread = vi.spyOn(provider, 'markUnread');

    const invoiceRow = await screen.findByRole('listitem', { name: 'Quarterly invoice' });
    await user.click(within(invoiceRow).getByRole('button', { name: 'Mark read' }));
    await waitFor(() => expect(markRead).toHaveBeenCalledWith('m2'));
    expect(
      within(screen.getByRole('listitem', { name: 'Quarterly invoice' })).queryByLabelText(
        'unread',
      ),
    ).toBeNull();

    const lunchRow = screen.getByRole('listitem', { name: 'Lunch plans' });
    await user.click(within(lunchRow).getByRole('button', { name: 'Mark unread' }));
    await waitFor(() => expect(markUnread).toHaveBeenCalledWith('m3'));
    expect(
      within(screen.getByRole('listitem', { name: 'Lunch plans' })).getByLabelText('unread'),
    ).toBeInTheDocument();
  });

  it('archive removes the row before the provider round-trip resolves (optimistic)', async () => {
    const { provider, user } = await renderApp({ seed: DEFAULT_MESSAGES });
    const archive = vi
      .spyOn(provider, 'archive')
      .mockReturnValue(new Promise<void>(() => {}));
    const row = await screen.findByRole('listitem', { name: 'Quarterly invoice' });
    await user.click(within(row).getByRole('button', { name: 'Archive' }));
    expect(archive).toHaveBeenCalledWith('t-invoice');
    expect(screen.queryByRole('listitem', { name: 'Quarterly invoice' })).toBeNull();
  });

  it('trash calls provider.trash and removes the row', async () => {
    const { provider, user } = await renderApp({ seed: DEFAULT_MESSAGES });
    const trash = vi.spyOn(provider, 'trash');
    const row = await screen.findByRole('listitem', { name: 'Lunch plans' });
    await user.click(within(row).getByRole('button', { name: 'Trash' }));
    await waitFor(() => expect(trash).toHaveBeenCalledWith('t-lunch'));
    expect(screen.queryByRole('listitem', { name: 'Lunch plans' })).toBeNull();
  });
});

describe('story: the list orders by AI importance first, with a toggle back to date order', () => {
  it('sorts high before normal before low, and the toggle restores pure date order', async () => {
    const urgent = makeMessage({
      messageId: 'mu',
      threadId: 't-urgent',
      subject: 'Urgent: server down',
      bodyPlain: 'The server is down.',
      date: new Date(2024, 4, 1, 10, 0).getTime(),
    });
    const mid = makeMessage({
      messageId: 'ml',
      threadId: 't-mid',
      subject: 'Team offsite',
      bodyPlain: 'Bring good shoes.',
      date: new Date(2024, 4, 10, 10, 0).getTime(),
    });
    const low = makeMessage({
      messageId: 'mn',
      threadId: 't-news',
      subject: 'Weekly newsletter',
      bodyPlain: 'Click unsubscribe anytime.',
      date: new Date(2024, 4, 14, 10, 0).getTime(),
    });
    const { user } = await renderApp({ fixtures: { tags: TAGS, messages: [urgent, mid, low] } });

    await user.click(await screen.findByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(threadSubjects()).toEqual(['Urgent: server down', 'Team offsite', 'Weekly newsletter']),
    );

    await user.click(screen.getByRole('button', { name: 'Sort by date' }));
    await waitFor(() =>
      expect(threadSubjects()).toEqual(['Weekly newsletter', 'Team offsite', 'Urgent: server down']),
    );
  });
});

describe('story: affordances hide behind capabilities()', () => {
  it('hides archive and compose when the provider does not support them', async () => {
    const provider = new CapabilityProvider(
      { tags: TAGS, messages: DEFAULT_MESSAGES },
      { supportsTags: false, supportsSend: false, supportsArchive: false },
    );
    await renderApp({ provider, seed: DEFAULT_MESSAGES });
    const row = await screen.findByRole('listitem', { name: 'Quarterly invoice' });
    expect(within(row).queryByRole('button', { name: 'Archive' })).toBeNull();
    expect(within(row).getByRole('button', { name: 'Trash' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compose' })).toBeNull();
  });
});

describe('story: plug-in threadAction entries render on thread rows, attributed to their plug-in', () => {
  it('shows the action with its plug-in id and runs it on click', async () => {
    const ran = vi.fn();
    const pluginHost = new PluginHost(new InMemoryPluginSettings());
    pluginHost.register(
      new FakePlugin({
        id: 'snoozer',
        name: 'Snoozer',
        contributes: ['threadAction'],
        actionLabel: 'Snooze',
        onAction: ran,
      }),
    );
    const { user } = await renderApp({ pluginHost, seed: DEFAULT_MESSAGES });
    const row = await screen.findByRole('listitem', { name: 'Lunch plans' });
    const action = await within(row).findByRole('button', { name: /Snooze/ });
    expect(action.textContent).toContain('snoozer');
    await user.click(action);
    await waitFor(() => expect(ran).toHaveBeenCalled());
  });
});

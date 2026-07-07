// @vitest-environment jsdom
/**
 * Thread-view stories (user-stories/typescript_email_ui.md):
 * - story (human): opening a thread shows messages oldest-first and marks the
 *   thread read via the provider;
 * - story (human): HTML bodies render in a sandboxed iframe (no scripts) with
 *   remote images blocked behind a per-message "load images" action, falling
 *   back to bodyPlain when no HTML exists;
 * - story (human): threads with more than three messages open with an async
 *   AI digest panel that never delays the messages;
 * - story (engineer): AI digest failures show error copy keyed off
 *   MailIntelligenceError.code with a retry;
 * - story (human): add/remove tag chips on a message, gated on supportsTags;
 * - story (human): plug-in messageView panels render above a message,
 *   attributed to their plug-in.
 */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PluginHost } from '../../src/plugins/PluginHost';
import { InMemoryPluginSettings } from '../../src/plugins/PluginSettings';
import { FakePlugin } from '../../src/plugins/FakePlugin';
import { renderApp } from './harness';
import { DEFAULT_MESSAGES, PLAN_MESSAGES, TAGS, makeMessage } from './fixtures';
import { MailProviderError } from '../../src/providers/model';
import {
  CapabilityProvider,
  DeferredDigestIntelligence,
  FlakyStore,
  RejectingIntelligence,
} from './testDoubles';

afterEach(cleanup);

async function openThread(
  user: { click(element: Element): Promise<void> },
  subject: string,
): Promise<void> {
  const row = await screen.findByRole('listitem', { name: subject });
  await user.click(within(row).getByRole('button', { name: subject }));
}

describe('story: a thread opens oldest-first and is marked read via the provider', () => {
  it('renders messages in date order and calls markRead for the unread ones', async () => {
    const { provider, user } = await renderApp({ seed: DEFAULT_MESSAGES });
    const markRead = vi.spyOn(provider, 'markRead');

    await openThread(user, 'Quarterly invoice');
    const articles = await screen.findAllByRole('article');
    expect(articles).toHaveLength(2);
    expect(articles[0].textContent).toContain('Please pay the unpaid invoice');
    expect(articles[1].textContent).toContain('still unpaid');
    await waitFor(() => expect(markRead).toHaveBeenCalledWith('m2'));
    expect(markRead).not.toHaveBeenCalledWith('m1');
  });
});

describe('story: the thread view has error and empty states — never a stuck loading screen', () => {
  it('a store read failure shows error copy with a Retry that recovers', async () => {
    const store = new FlakyStore();
    store.getThreadFailWith = new MailProviderError('NETWORK', 'local database unavailable');
    const { user } = await renderApp({ store, seed: DEFAULT_MESSAGES });
    await openThread(user, 'Quarterly invoice');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('local database unavailable');
    expect(screen.queryByText('Loading…')).toBeNull();

    store.getThreadFailWith = undefined;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findAllByRole('article')).toHaveLength(2);
  });

  it('a thread with no stored messages shows the empty copy, not an endless spinner', async () => {
    const store = new FlakyStore();
    const { user } = await renderApp({ store, seed: DEFAULT_MESSAGES });
    store.returnEmptyThreads = true;
    await openThread(user, 'Quarterly invoice');

    expect(await screen.findByText('no messages')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).toBeNull();
  });
});

describe('story: HTML renders sandboxed with remote images blocked until I opt in', () => {
  const promo = makeMessage({
    messageId: 'mh',
    threadId: 't-promo',
    subject: 'Promo',
    bodyPlain: undefined,
    bodyHtml: '<p>Big sale</p><img src="https://tracker.example.com/pixel.png">',
    unread: false,
  });

  it('uses a sandboxed iframe without scripts and strips remote image sources by default', async () => {
    const { user } = await renderApp({ seed: [promo] });
    await openThread(user, 'Promo');

    const iframe = await screen.findByTitle('HTML body of mh');
    expect(iframe.getAttribute('sandbox')).not.toBeNull();
    expect(iframe.getAttribute('sandbox') ?? '').not.toMatch(/allow-scripts/);
    expect(iframe.getAttribute('srcdoc')).toContain('Big sale');
    expect(iframe.getAttribute('srcdoc')).not.toContain('tracker.example.com');
  });

  it('a per-message "Load images" action restores the remote images', async () => {
    const { user } = await renderApp({ seed: [promo] });
    await openThread(user, 'Promo');
    await screen.findByTitle('HTML body of mh');

    await user.click(screen.getByRole('button', { name: 'Load images' }));
    await waitFor(() =>
      expect(screen.getByTitle('HTML body of mh').getAttribute('srcdoc')).toContain(
        'tracker.example.com',
      ),
    );
  });

  it('falls back to bodyPlain when a message has no HTML', async () => {
    const { user } = await renderApp({ seed: DEFAULT_MESSAGES });
    await openThread(user, 'Quarterly invoice');
    await screen.findAllByRole('article');
    expect(screen.queryByTitle(/HTML body/)).toBeNull();
    expect(screen.getByText('Please pay the unpaid invoice by Friday.')).toBeInTheDocument();
  });
});

describe('story: long threads open with an async AI digest that never delays the messages', () => {
  it('shows the messages immediately, then the summary and action items when the digest resolves', async () => {
    const intelligence = new DeferredDigestIntelligence();
    const { user } = await renderApp({ intelligence, seed: PLAN_MESSAGES });
    await openThread(user, 'Planning');

    const articles = await screen.findAllByRole('article');
    expect(articles).toHaveLength(4);
    const digest = screen.getByRole('region', { name: 'AI digest' });
    expect(within(digest).getByText(/summarizing/i)).toBeInTheDocument();

    await act(async () => {
      intelligence.resolveDigests({
        summary: 'Deal closed for launch',
        actionItems: ['Send the contract'],
      });
    });
    expect(await screen.findByText('Deal closed for launch')).toBeInTheDocument();
    expect(screen.getByText('Send the contract')).toBeInTheDocument();
  });

  it('threads of three or fewer messages never request a digest', async () => {
    const intelligence = new DeferredDigestIntelligence();
    const { user } = await renderApp({ intelligence, seed: DEFAULT_MESSAGES });
    await openThread(user, 'Quarterly invoice');
    await screen.findAllByRole('article');
    expect(screen.queryByRole('region', { name: 'AI digest' })).toBeNull();
    expect(intelligence.digestCalls).toBe(0);
  });

  it('a digest failure shows error copy keyed off the code, with a retry that recovers', async () => {
    const intelligence = new RejectingIntelligence(['summarizeThread'], { times: 1 });
    const { user } = await renderApp({ intelligence, seed: PLAN_MESSAGES });
    await openThread(user, 'Planning');

    const digest = await screen.findByRole('region', { name: 'AI digest' });
    await within(digest).findByText(/AI digest unavailable/i);
    expect(digest.textContent).toContain('AI_UNAVAILABLE');

    await user.click(within(digest).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/4 message\(s\)/)).toBeInTheDocument();
  });
});

describe('story: tag chips on a message add/remove via the provider, gated on supportsTags', () => {
  it('removing and adding chips calls removeTag/addTag and updates optimistically', async () => {
    const { provider, user } = await renderApp({ seed: DEFAULT_MESSAGES });
    const removeTag = vi.spyOn(provider, 'removeTag');
    const addTag = vi.spyOn(provider, 'addTag');

    await openThread(user, 'Quarterly invoice');
    const first = (await screen.findAllByRole('article'))[0];

    await user.click(within(first).getByRole('button', { name: 'Remove tag inbox' }));
    await waitFor(() => expect(removeTag).toHaveBeenCalledWith('m1', 'tag-inbox'));
    expect(within(first).queryByRole('button', { name: 'Remove tag inbox' })).toBeNull();

    await user.selectOptions(within(first).getByRole('combobox', { name: 'Add tag' }), 'tag-travel');
    await waitFor(() => expect(addTag).toHaveBeenCalledWith('m1', 'tag-travel'));
    expect(within(first).getByRole('button', { name: 'Remove tag travel' })).toBeInTheDocument();
  });

  it('hides all tag controls when capabilities().supportsTags is false', async () => {
    const provider = new CapabilityProvider(
      { tags: TAGS, messages: DEFAULT_MESSAGES },
      { supportsTags: false, supportsSend: true, supportsArchive: true },
    );
    const { user } = await renderApp({ provider, seed: DEFAULT_MESSAGES });
    await openThread(user, 'Quarterly invoice');
    await screen.findAllByRole('article');
    expect(screen.queryByRole('combobox', { name: 'Add tag' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove tag/ })).toBeNull();
  });
});

describe('story: plug-in messageView panels render above the message, attributed to the plug-in', () => {
  it('shows each contribution title, body, and owning plug-in id', async () => {
    const pluginHost = new PluginHost(new InMemoryPluginSettings());
    pluginHost.register(
      new FakePlugin({
        id: 'tracker-shield',
        name: 'Tracker Shield',
        contributes: ['messageView'],
        viewContribution: { title: 'Tracker report', bodyText: '2 trackers blocked' },
      }),
    );
    const { user } = await renderApp({ pluginHost, seed: DEFAULT_MESSAGES });
    await openThread(user, 'Lunch plans');

    const article = (await screen.findAllByRole('article'))[0];
    await within(article).findByText('Tracker report');
    expect(within(article).getByText('2 trackers blocked')).toBeInTheDocument();
    expect(within(article).getByText(/tracker-shield/)).toBeInTheDocument();
  });
});

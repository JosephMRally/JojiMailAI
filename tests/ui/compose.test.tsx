// @vitest-environment jsdom
/**
 * Compose stories (user-stories/typescript_email_ui.md):
 * - story (human): compose with to/cc/bcc, subject, plain-text body submits a
 *   Draft via provider.send() and confirms with the returned message id;
 * - story (human): reply pre-fills the sender as `to` and prefixes `Re:`
 *   without duplicating it;
 * - story (human): "Draft with AI" fills the body from intelligence.draftReply
 *   (with optional guidance) but never sends anything itself;
 * - story (human): plug-in composeAction transforms apply before send, visibly
 *   attributed to the plug-in;
 * - story (engineer): sending still works when every AI method rejects.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PluginHost } from '../../src/plugins/PluginHost';
import { InMemoryPluginSettings } from '../../src/plugins/PluginSettings';
import { FakePlugin } from '../../src/plugins/FakePlugin';
import { MailProviderError, type Draft } from '../../src/providers/model';
import { renderApp } from './harness';
import { DEFAULT_MESSAGES, TAGS, makeMessage } from './fixtures';
import { FlakyProvider, RejectingIntelligence } from './testDoubles';

afterEach(cleanup);

async function openThread(
  user: { click(element: Element): Promise<void> },
  subject: string,
): Promise<void> {
  const row = await screen.findByRole('listitem', { name: subject });
  await user.click(within(row).getByRole('button', { name: subject }));
}

describe('story: compose submits a Draft via provider.send() and confirms with the message id', () => {
  it('sends to/cc/bcc, subject, and body, then shows the returned id', async () => {
    const { provider, user } = await renderApp({ seed: DEFAULT_MESSAGES });
    const send = vi.spyOn(provider, 'send');

    await user.click(await screen.findByRole('button', { name: 'Compose' }));
    await user.type(screen.getByRole('textbox', { name: 'To' }), 'dana@example.com');
    await user.type(screen.getByRole('textbox', { name: 'Cc' }), 'eve@example.com');
    await user.type(screen.getByRole('textbox', { name: 'Bcc' }), 'frank@example.com');
    await user.type(screen.getByRole('textbox', { name: 'Subject' }), 'Hello');
    await user.type(screen.getByRole('textbox', { name: 'Body' }), 'Hi there');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['dana@example.com'],
          cc: ['eve@example.com'],
          bcc: ['frank@example.com'],
          subject: 'Hello',
          bodyPlain: 'Hi there',
        }),
      ),
    );
    expect(await screen.findByText(/fake-sent-m1/)).toBeInTheDocument();
  });
});

describe('story: send failures show error copy keyed off MailProviderError.code', () => {
  async function fillAndSend(user: Awaited<ReturnType<typeof renderApp>>['user']): Promise<void> {
    await user.click(await screen.findByRole('button', { name: 'Compose' }));
    await user.type(screen.getByRole('textbox', { name: 'To' }), 'dana@example.com');
    await user.type(screen.getByRole('textbox', { name: 'Subject' }), 'Hello');
    await user.type(screen.getByRole('textbox', { name: 'Body' }), 'Hi there');
    await user.click(screen.getByRole('button', { name: 'Send' }));
  }

  it('a NETWORK send failure offers a Retry that resends the same draft and recovers', async () => {
    const provider = new FlakyProvider({ tags: TAGS, messages: DEFAULT_MESSAGES });
    provider.sendFailWith = new MailProviderError('NETWORK', 'bridge unreachable');
    const { user } = await renderApp({ provider, seed: DEFAULT_MESSAGES });
    const send = vi.spyOn(provider, 'send');

    await fillAndSend(user);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('bridge unreachable');

    provider.sendFailWith = undefined;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText(/fake-sent-m1/)).toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: ['dana@example.com'], subject: 'Hello', bodyPlain: 'Hi there' }),
    );
  });

  it("an AUTH_REQUIRED send failure shows the error's own message and no retry button", async () => {
    const provider = new FlakyProvider({ tags: TAGS, messages: DEFAULT_MESSAGES });
    provider.sendFailWith = new MailProviderError(
      'AUTH_REQUIRED',
      'Reconnect Gmail: run the bridge once and complete Google sign-in.',
    );
    const { user } = await renderApp({ provider, seed: DEFAULT_MESSAGES });

    await fillAndSend(user);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(
      'Reconnect Gmail: run the bridge once and complete Google sign-in.',
    );
    expect(within(alert).queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});

describe('story: reply pre-fills the sender and a single Re: prefix', () => {
  it('fills to with the sender and prefixes Re: on the subject', async () => {
    const { user } = await renderApp({ seed: DEFAULT_MESSAGES });
    await openThread(user, 'Quarterly invoice');
    const first = (await screen.findAllByRole('article'))[0];
    await user.click(within(first).getByRole('button', { name: 'Reply' }));

    expect(await screen.findByRole('textbox', { name: 'To' })).toHaveValue('bob@example.com');
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveValue(
      'Re: Quarterly invoice',
    );
  });

  it('does not duplicate an existing Re: prefix', async () => {
    const reThread = [
      makeMessage({
        messageId: 're-m1',
        threadId: 't-re',
        subject: 'Re: Quarterly invoice',
        unread: false,
      }),
    ];
    const { user } = await renderApp({ seed: reThread });
    await openThread(user, 'Re: Quarterly invoice');
    const first = (await screen.findAllByRole('article'))[0];
    await user.click(within(first).getByRole('button', { name: 'Reply' }));

    expect(await screen.findByRole('textbox', { name: 'Subject' })).toHaveValue(
      'Re: Quarterly invoice',
    );
  });
});

describe('story: "Draft with AI" fills the body but never sends', () => {
  it('drafts from the thread with my guidance and leaves sending to me', async () => {
    const { provider, user } = await renderApp({ seed: DEFAULT_MESSAGES });
    const send = vi.spyOn(provider, 'send');

    await openThread(user, 'Quarterly invoice');
    const first = (await screen.findAllByRole('article'))[0];
    await user.click(within(first).getByRole('button', { name: 'Reply' }));

    await user.type(
      await screen.findByRole('textbox', { name: 'Guidance' }),
      'decline politely',
    );
    await user.click(screen.getByRole('button', { name: 'Draft with AI' }));

    await waitFor(() => {
      const body = screen.getByRole('textbox', { name: 'Body' }) as HTMLTextAreaElement;
      expect(body.value).toContain('Hi bob');
      expect(body.value).toContain('(As requested: decline politely.)');
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('a draft failure shows error copy keyed off the code, with a retry that recovers', async () => {
    const intelligence = new RejectingIntelligence(['draftReply'], { times: 1 });
    const { user } = await renderApp({ intelligence, seed: DEFAULT_MESSAGES });

    await user.click(await screen.findByRole('button', { name: 'Compose' }));
    await user.click(screen.getByRole('button', { name: 'Draft with AI' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/AI draft unavailable/i);
    expect(alert.textContent).toContain('AI_UNAVAILABLE');

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      const body = screen.getByRole('textbox', { name: 'Body' }) as HTMLTextAreaElement;
      expect(body.value).toContain('Hi there');
    });
  });
});

describe('story: plug-in composeAction transforms apply before send, visibly attributed', () => {
  it('names the contributing plug-in on the compose screen and sends the transformed draft', async () => {
    const pluginHost = new PluginHost(new InMemoryPluginSettings());
    pluginHost.register(
      new FakePlugin({
        id: 'signature',
        name: 'Signature Plugin',
        contributes: ['composeAction'],
        composeTransform: (draft: Draft): Draft => ({
          ...draft,
          bodyPlain: `${draft.bodyPlain}\n--\nSent from JojiMailAI`,
        }),
      }),
    );
    const { provider, user } = await renderApp({ pluginHost, seed: DEFAULT_MESSAGES });
    const send = vi.spyOn(provider, 'send');

    await user.click(await screen.findByRole('button', { name: 'Compose' }));
    expect(screen.getByText(/Signature Plugin/)).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'To' }), 'dana@example.com');
    await user.type(screen.getByRole('textbox', { name: 'Subject' }), 'Hello');
    await user.type(screen.getByRole('textbox', { name: 'Body' }), 'Hi there');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ bodyPlain: 'Hi there\n--\nSent from JojiMailAI' }),
      ),
    );
  });
});

describe('story: core sending works when every AI method rejects', () => {
  it('composes and sends with a fully failing intelligence backend', async () => {
    const intelligence = new RejectingIntelligence([
      'classify',
      'summarizeThread',
      'draftReply',
      'parseSearchQuery',
    ]);
    const { user } = await renderApp({ intelligence, seed: DEFAULT_MESSAGES });

    await user.click(await screen.findByRole('button', { name: 'Compose' }));
    await user.type(screen.getByRole('textbox', { name: 'To' }), 'dana@example.com');
    await user.type(screen.getByRole('textbox', { name: 'Subject' }), 'Ping');
    await user.type(screen.getByRole('textbox', { name: 'Body' }), 'Still on?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(/fake-sent-m1/)).toBeInTheDocument();
  });
});

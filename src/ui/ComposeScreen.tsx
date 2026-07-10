/**
 * The compose screen (user-stories/typescript_email_ui.md): to/cc/bcc,
 * subject, and a plain-text body submitted as a Draft through the plug-in
 * composeAction pipeline and then provider.send(), confirming with the
 * returned message id. Nothing is ever sent without the user's explicit action.
 */
import { useState } from 'react';
import type { PluginHost } from '../plugins/PluginHost';
import type { MailProvider } from '../providers/MailProvider';
import type { Draft } from '../providers/model';
import { toProviderFailure, type ProviderFailure } from './errors';

export interface ComposePrefill {
  to?: string;
  subject?: string;
}

export interface ComposeScreenProps {
  provider: MailProvider;
  pluginHost: PluginHost;
  prefill?: ComposePrefill;
}

function splitAddresses(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

export function ComposeScreen({ provider, pluginHost, prefill }: ComposeScreenProps) {
  const [to, setTo] = useState(prefill?.to ?? '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(prefill?.subject ?? '');
  const [body, setBody] = useState('');
  const [sentId, setSentId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<ProviderFailure | null>(null);

  const composePlugins = pluginHost
    .list()
    .filter((item) => item.enabled && item.contributes.includes('composeAction'));

  const send = async (): Promise<void> => {
    setSendError(null);
    const draft: Draft = {
      to: splitAddresses(to),
      cc: splitAddresses(cc),
      bcc: splitAddresses(bcc),
      subject,
      bodyPlain: body,
    };
    // Plug-in transforms apply before send; the host isolates their crashes.
    const outgoing = await pluginHost.dispatchComposeAction(draft);
    try {
      const result = await provider.send(outgoing);
      setSentId(result.messageId);
    } catch (error) {
      setSendError(toProviderFailure(error));
    }
  };

  return (
    <section>
      <h2>Compose</h2>
      {composePlugins.length > 0 && (
        <p>Send applies plug-ins: {composePlugins.map((item) => item.name).join(', ')}</p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label>
          To <input value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <label>
          Cc <input value={cc} onChange={(event) => setCc(event.target.value)} />
        </label>
        <label>
          Bcc <input value={bcc} onChange={(event) => setBcc(event.target.value)} />
        </label>
        <label>
          Subject <input value={subject} onChange={(event) => setSubject(event.target.value)} />
        </label>
        <label>
          Body <textarea value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        <button type="submit">Send</button>
      </form>
      {sendError !== null && (
        <div role="alert">
          {/* Keyed off MailProviderError.code: AUTH_REQUIRED shows the error's
              own fix instructions; only NETWORK offers a retry. */}
          {sendError.message}{' '}
          {sendError.code === 'NETWORK' && <button onClick={() => void send()}>Retry</button>}
        </div>
      )}
      {sentId !== null && <p role="status">Sent — message id {sentId}</p>}
    </section>
  );
}

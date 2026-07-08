/**
 * Wire-shape fixtures: Gmail REST API v1 JSON exactly as
 * https://gmail.googleapis.com emits it (labels.list, threads.list,
 * threads.get, messages.get format=full/metadata, messages.send). Values
 * mirror the shared model fixtures in tests/providers/fixtures.ts — the one
 * source of truth where shapes overlap — so mapping tests can assert
 * wire → model field-for-field. All addresses are fake (@example.com); no
 * real account is ever touched and no OAuth flow ever runs.
 * Spec: user-stories/providers/typescript_gmail_proxy.md.
 */
import { D_M1, D_M2, D_M3, SELF_ADDRESS } from '../providers/fixtures';

/** Base64url-encode a UTF-8 string the way Gmail encodes body part data. */
export function b64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode Gmail base64url body part data back to a UTF-8 string. */
export function fromB64url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}

/** `GET /labels` response — ids mirror makeFixtures().tags (passthrough). */
export function gmailLabels() {
  return {
    labels: [
      { id: 'inbox', name: 'Inbox', type: 'system' },
      { id: 'work', name: 'Work', type: 'user' },
      { id: 'starred', name: 'Starred', type: 'system' },
      { id: 'sent', name: 'Sent', type: 'system' },
      { id: 'trash', name: 'Trash', type: 'system' },
    ],
  };
}

function header(name: string, value: string) {
  return { name, value };
}

/** format=full message for shared fixture m1: single text/plain part, read. */
export function gmailMessageM1() {
  return {
    id: 'm1',
    threadId: 't1',
    labelIds: ['inbox', 'work'],
    snippet: 'Please review the attached quarterly report.',
    internalDate: String(D_M1),
    payload: {
      mimeType: 'text/plain',
      headers: [
        header('From', 'alice@example.com'),
        header('To', SELF_ADDRESS),
        header('Subject', 'Quarterly report'),
      ],
      body: { data: b64url('Please review the attached quarterly report.') },
    },
  };
}

/** format=full message for shared fixture m2: multipart, both bodies, cc, unread. */
export function gmailMessageM2() {
  return {
    id: 'm2',
    threadId: 't1',
    labelIds: ['inbox', 'work', 'starred', 'UNREAD'],
    snippet: 'Looks good to me.',
    internalDate: String(D_M2),
    payload: {
      mimeType: 'multipart/alternative',
      headers: [
        header('From', 'bob@example.com'),
        header('To', SELF_ADDRESS),
        header('Cc', 'carol@example.com'),
        header('Subject', 'Re: Quarterly report'),
      ],
      body: {},
      parts: [
        { mimeType: 'text/plain', body: { data: b64url('Looks good to me.') } },
        { mimeType: 'text/html', body: { data: b64url('<p>Looks good to me.</p>') } },
      ],
    },
  };
}

/** format=full message for shared fixture m3: HTML-only body, unread. */
export function gmailMessageM3() {
  return {
    id: 'm3',
    threadId: 't2',
    labelIds: ['inbox', 'UNREAD'],
    snippet: 'Top stories this week.',
    internalDate: String(D_M3),
    payload: {
      mimeType: 'text/html',
      headers: [
        header('From', 'news@example.com'),
        header('To', SELF_ADDRESS),
        header('Subject', 'Weekly digest'),
      ],
      body: { data: b64url('<h1>Weekly digest</h1><p>Top stories this week.</p>') },
    },
  };
}

/** A message whose bodies sit inside a nested multipart/mixed → alternative tree. */
export function gmailMessageNested() {
  return {
    id: 'm8',
    threadId: 't7',
    labelIds: ['inbox'],
    snippet: 'Nested body.',
    internalDate: String(D_M1),
    payload: {
      mimeType: 'multipart/mixed',
      headers: [
        header('From', 'alice@example.com'),
        header('To', SELF_ADDRESS),
        header('Subject', 'Nested body'),
      ],
      body: {},
      parts: [
        {
          mimeType: 'multipart/alternative',
          body: {},
          parts: [
            { mimeType: 'text/plain', body: { data: b64url('Nested body.') } },
            { mimeType: 'text/html', body: { data: b64url('<p>Nested body.</p>') } },
          ],
        },
        { mimeType: 'application/pdf', body: { attachmentId: 'att-1', size: 4 } },
      ],
    },
  };
}

/** A message carrying raw Gmail system + user label ids (passthrough check). */
export function gmailMessageSystemLabels() {
  return {
    id: 'm7',
    threadId: 't6',
    labelIds: ['INBOX', 'UNREAD', 'STARRED', 'Label_7'],
    snippet: 'Labels must pass through untouched.',
    internalDate: String(D_M1),
    payload: {
      mimeType: 'text/plain',
      headers: [
        header('From', 'alice@example.com'),
        header('To', SELF_ADDRESS),
        header('Subject', 'Label passthrough'),
      ],
      body: { data: b64url('Labels must pass through untouched.') },
    },
  };
}

/** `GET /threads/{id}?format=full` response: messages oldest-first. */
export function gmailThreadT1() {
  return { id: 't1', messages: [gmailMessageM1(), gmailMessageM2()] };
}

/** A metadata-format message: headers present, no body data anywhere. */
function metadataOf(message: {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  payload: { mimeType: string; headers: Array<{ name: string; value: string }> };
}) {
  const { payload, ...rest } = message;
  return { ...rest, payload: { mimeType: payload.mimeType, headers: payload.headers } };
}

/** `GET /threads/{id}?format=metadata` response for t1 (summary source). */
export function gmailThreadMetaT1() {
  return { id: 't1', messages: [metadataOf(gmailMessageM1()), metadataOf(gmailMessageM2())] };
}

/** `GET /threads?labelIds=…` response with a continuation token. */
export function gmailThreadsListWithNext() {
  return { threads: [{ id: 't1', snippet: 'Looks good to me.' }], nextPageToken: 'page-2-token' };
}

/** `GET /threads?labelIds=…` response for the last page (no nextPageToken). */
export function gmailThreadsListLastPage() {
  return { threads: [{ id: 't1', snippet: 'Looks good to me.' }] };
}

/** `POST /messages/send` response. */
export function gmailSendResult() {
  return { id: 'sent-1', threadId: 't9', labelIds: ['SENT'] };
}

/** Gmail error body {error: {code, message, status}}. */
export function gmailError(status: number, message: string) {
  return { error: { code: status, message, errors: [{ message }] } };
}

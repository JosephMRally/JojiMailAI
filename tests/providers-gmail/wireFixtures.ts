/**
 * Wire-shape fixtures: snake_case JSON exactly as bridge/app.py emits it
 * (schema: user-stories/python_gmail_bridge.md Output Schema). Values mirror
 * the shared model fixtures in tests/providers/fixtures.ts — the one source
 * of truth where shapes overlap — so mapping tests can assert wire → model
 * field-for-field against the shared builders. All addresses are fake
 * (@example.com); no real account or bridge is ever touched.
 */
import { D_M1, D_M2, D_M3, SELF_ADDRESS } from '../providers/fixtures';

/** `tag` wire object: {tag_id, name, unread_count?} — mirrors makeFixtures().tags. */
export function wireTags() {
  return [
    { tag_id: 'inbox', name: 'Inbox', unread_count: 2 },
    { tag_id: 'work', name: 'Work', unread_count: 1 },
    { tag_id: 'starred', name: 'Starred' },
    { tag_id: 'sent', name: 'Sent' },
    { tag_id: 'trash', name: 'Trash' },
  ];
}

/** `message` wire object for shared fixture m1 (plain body only). */
export function wireMessageM1() {
  return {
    message_id: 'm1',
    thread_id: 't1',
    from: 'alice@example.com',
    to: [SELF_ADDRESS],
    cc: [],
    bcc: [],
    subject: 'Quarterly report',
    date: D_M1,
    body_plain: 'Please review the attached quarterly report.',
    unread: false,
    tag_ids: ['inbox', 'work'],
  };
}

/** `message` wire object for shared fixture m2 (both bodies, cc present). */
export function wireMessageM2() {
  return {
    message_id: 'm2',
    thread_id: 't1',
    from: 'bob@example.com',
    to: [SELF_ADDRESS],
    cc: ['carol@example.com'],
    bcc: [],
    subject: 'Re: Quarterly report',
    date: D_M2,
    body_plain: 'Looks good to me.',
    body_html: '<p>Looks good to me.</p>',
    unread: true,
    tag_ids: ['inbox', 'work', 'starred'],
  };
}

/** `message` wire object for shared fixture m3 (HTML-only body). */
export function wireMessageM3() {
  return {
    message_id: 'm3',
    thread_id: 't2',
    from: 'news@example.com',
    to: [SELF_ADDRESS],
    cc: [],
    bcc: [],
    subject: 'Weekly digest',
    date: D_M3,
    body_html: '<h1>Weekly digest</h1><p>Top stories this week.</p>',
    unread: true,
    tag_ids: ['inbox'],
  };
}

/** A message carrying raw Gmail system + user label ids as tag_ids. */
export function wireMessageGmailLabels() {
  return {
    message_id: 'm7',
    thread_id: 't6',
    from: 'alice@example.com',
    to: [SELF_ADDRESS],
    cc: [],
    bcc: [],
    subject: 'Label passthrough',
    date: D_M1,
    body_plain: 'Labels must pass through untouched.',
    unread: true,
    tag_ids: ['INBOX', 'UNREAD', 'STARRED', 'Label_7'],
  };
}

/** `GET /threads/{id}` wire body: the thread's messages, oldest-first. */
export function wireThreadT1() {
  return [wireMessageM1(), wireMessageM2()];
}

/** `thread_summary` wire object for shared thread t1 (newest message wins). */
export function wireThreadSummaryT1() {
  return {
    thread_id: 't1',
    subject: 'Re: Quarterly report',
    snippet: 'Looks good to me.',
    from: 'bob@example.com',
    date: D_M2,
    unread: true,
    message_count: 2,
    tag_ids: ['inbox', 'work', 'starred'],
  };
}

/** `thread list` wire object with a continuation token (more pages exist). */
export function wireThreadListWithNext() {
  return { threads: [wireThreadSummaryT1()], next_page_token: 'page-2-token' };
}

/** `thread list` wire object for the last page (no next_page_token key). */
export function wireThreadListLastPage() {
  return { threads: [wireThreadSummaryT1()] };
}

/** `send result` wire object. */
export function wireSendResult() {
  return { message_id: 'sent-1' };
}

/** `error` wire body {code, message}. */
export function wireError(code: string, message: string) {
  return { code, message };
}

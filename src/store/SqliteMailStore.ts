/**
 * Concrete MailStore over SQLite (user-stories/typescript_mail_store.md).
 * Built on a thin injected DbHandle — production wires it to the native
 * plugin through the adapter in CapacitorDbHandle.ts, tests inject an
 * in-memory sql.js database — so one store runs on iOS, Android, and web. Each message row carries a 256-byte Bloom filter of its
 * content words (recomputed on every upsert) that prescreens searchText;
 * candidates are verified against the stored subject + body_plain, so
 * results are exact.
 */
import type { Message, ThreadSummary } from '../providers/model';
import { bloomContainsAll, createBloom } from './bloom';
import type { DbHandle, DbRow, DbValue } from './DbHandle';
import type { ListStoredThreadsOptions, MailStore, SearchResult } from './MailStore';
import { messageTokens, tokenize } from './tokenize';

/** Exactly the spec's Output Schema: threads, messages, message_tags. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS threads (
  thread_id TEXT NOT NULL PRIMARY KEY,
  account_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  snippet TEXT NOT NULL,
  from_addr TEXT NOT NULL,
  date INTEGER NOT NULL,
  unread INTEGER NOT NULL,
  message_count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  message_id TEXT NOT NULL PRIMARY KEY,
  thread_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  from_addr TEXT NOT NULL,
  to_addrs TEXT NOT NULL,
  cc_addrs TEXT NOT NULL,
  bcc_addrs TEXT NOT NULL,
  subject TEXT NOT NULL,
  date INTEGER NOT NULL,
  body_plain TEXT,
  body_html TEXT,
  unread INTEGER NOT NULL,
  bloom BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS message_tags (
  message_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (message_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_threads_account_date ON threads(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread_date ON messages(thread_id, date);
CREATE INDEX IF NOT EXISTS idx_messages_account_date ON messages(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_message_tags_tag ON message_tags(tag_id);
`;

const JOIN_SEP = '|';

export class SqliteMailStore implements MailStore {
  private ready: Promise<void> | undefined;

  constructor(private readonly db: DbHandle) {}

  /** Idempotent lazy schema creation; every method awaits it. */
  private init(): Promise<void> {
    this.ready ??= this.db.exec(SCHEMA);
    return this.ready;
  }

  async upsertThreads(accountId: string, summaries: ThreadSummary[]): Promise<void> {
    await this.init();
    for (const t of summaries) {
      await this.db.run(
        `INSERT INTO threads (thread_id, account_id, subject, snippet, from_addr, date, unread, message_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET
           account_id = excluded.account_id,
           subject = excluded.subject,
           snippet = excluded.snippet,
           from_addr = excluded.from_addr,
           date = excluded.date,
           unread = excluded.unread,
           message_count = excluded.message_count`,
        [t.threadId, accountId, t.subject, t.snippet, t.from, t.date, t.unread ? 1 : 0, t.messageCount],
      );
    }
  }

  async upsertMessages(accountId: string, messages: Message[]): Promise<void> {
    await this.init();
    for (const m of messages) {
      // Recomputed on every upsert, so the index can never go stale
      // against the stored subject/body_plain.
      const bloom = createBloom(messageTokens(m.subject, m.bodyPlain));
      await this.db.run(
        `INSERT INTO messages (message_id, thread_id, account_id, from_addr, to_addrs, cc_addrs, bcc_addrs,
                               subject, date, body_plain, body_html, unread, bloom)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET
           thread_id = excluded.thread_id,
           account_id = excluded.account_id,
           from_addr = excluded.from_addr,
           to_addrs = excluded.to_addrs,
           cc_addrs = excluded.cc_addrs,
           bcc_addrs = excluded.bcc_addrs,
           subject = excluded.subject,
           date = excluded.date,
           body_plain = excluded.body_plain,
           body_html = excluded.body_html,
           unread = excluded.unread,
           bloom = excluded.bloom`,
        [
          m.messageId,
          m.threadId,
          accountId,
          m.from,
          m.to.join(JOIN_SEP),
          m.cc.join(JOIN_SEP),
          m.bcc.join(JOIN_SEP),
          m.subject,
          m.date,
          m.bodyPlain ?? null,
          m.bodyHtml ?? null,
          m.unread ? 1 : 0,
          bloom,
        ],
      );
      await this.db.run('DELETE FROM message_tags WHERE message_id = ?', [m.messageId]);
      for (const tagId of m.tagIds) {
        await this.db.run('INSERT OR IGNORE INTO message_tags (message_id, tag_id) VALUES (?, ?)', [
          m.messageId,
          tagId,
        ]);
      }
    }
  }

  async listThreads(
    accountId: string,
    tagId: string,
    opts?: ListStoredThreadsOptions,
  ): Promise<ThreadSummary[]> {
    await this.init();
    const rows = await this.db.query(
      `SELECT DISTINCT t.thread_id, t.subject, t.snippet, t.from_addr, t.date, t.unread, t.message_count
       FROM threads t
       JOIN messages m ON m.thread_id = t.thread_id
       JOIN message_tags mt ON mt.message_id = m.message_id
       WHERE t.account_id = ? AND mt.tag_id = ?
       ORDER BY t.date DESC
       LIMIT ?`,
      [accountId, tagId, opts?.limit ?? -1],
    );
    const threads: ThreadSummary[] = [];
    for (const row of rows) {
      threads.push({
        threadId: row.thread_id as string,
        subject: row.subject as string,
        snippet: row.snippet as string,
        from: row.from_addr as string,
        date: row.date as number,
        unread: row.unread === 1,
        messageCount: row.message_count as number,
        tagIds: await this.threadTagIds(row.thread_id as string),
      });
    }
    return threads;
  }

  async getThread(threadId: string): Promise<Message[]> {
    await this.init();
    const rows = await this.db.query(
      'SELECT * FROM messages WHERE thread_id = ? ORDER BY date ASC',
      [threadId],
    );
    return Promise.all(rows.map((row) => this.rowToMessage(row)));
  }

  async getMessage(messageId: string): Promise<Message | undefined> {
    await this.init();
    const rows = await this.db.query('SELECT * FROM messages WHERE message_id = ?', [messageId]);
    return rows.length === 0 ? undefined : this.rowToMessage(rows[0]);
  }

  async searchText(accountId: string, terms: string): Promise<SearchResult> {
    await this.init();
    // The same shared tokenizer as indexing: stop words and sub-2-character
    // tokens never reach the Bloom check.
    const queryTokens = [...new Set(tokenize(terms))];
    if (queryTokens.length === 0) {
      return { messages: [], tooGeneric: true };
    }
    const rows = await this.db.query(
      'SELECT * FROM messages WHERE account_id = ? ORDER BY date DESC',
      [accountId],
    );
    const messages: Message[] = [];
    for (const row of rows) {
      // Prescreen: candidates are only messages whose filter may contain ALL terms.
      if (!bloomContainsAll(row.bloom as Uint8Array, queryTokens)) continue;
      // Verify against the stored text — false positives end here.
      const stored = messageTokens(row.subject as string, (row.body_plain as string | null) ?? undefined);
      if (queryTokens.every((token) => stored.has(token))) {
        messages.push(await this.rowToMessage(row));
      }
    }
    return { messages, tooGeneric: false };
  }

  async clear(accountId: string): Promise<void> {
    await this.init();
    await this.db.run(
      'DELETE FROM message_tags WHERE message_id IN (SELECT message_id FROM messages WHERE account_id = ?)',
      [accountId],
    );
    await this.db.run('DELETE FROM messages WHERE account_id = ?', [accountId]);
    await this.db.run('DELETE FROM threads WHERE account_id = ?', [accountId]);
  }

  /** Sorted union of the tags on the thread's messages. */
  private async threadTagIds(threadId: string): Promise<string[]> {
    const rows = await this.db.query(
      `SELECT DISTINCT mt.tag_id FROM message_tags mt
       JOIN messages m ON m.message_id = mt.message_id
       WHERE m.thread_id = ?
       ORDER BY mt.tag_id`,
      [threadId],
    );
    return rows.map((row) => row.tag_id as string);
  }

  private async rowToMessage(row: DbRow): Promise<Message> {
    const tagRows = await this.db.query(
      'SELECT tag_id FROM message_tags WHERE message_id = ? ORDER BY tag_id',
      [row.message_id],
    );
    return {
      messageId: row.message_id as string,
      threadId: row.thread_id as string,
      from: row.from_addr as string,
      to: splitAddrs(row.to_addrs),
      cc: splitAddrs(row.cc_addrs),
      bcc: splitAddrs(row.bcc_addrs),
      subject: row.subject as string,
      date: row.date as number,
      bodyPlain: (row.body_plain as string | null) ?? undefined,
      bodyHtml: (row.body_html as string | null) ?? undefined,
      unread: row.unread === 1,
      tagIds: tagRows.map((r) => r.tag_id as string),
    };
  }
}

function splitAddrs(joined: DbValue): string[] {
  const text = joined as string;
  return text === '' ? [] : text.split(JOIN_SEP);
}

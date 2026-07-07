/**
 * Schema tests (user-stories/typescript_mail_store.md): SqliteMailStore
 * creates exactly the spec's Output Schema — threads / messages /
 * message_tags with the given columns, nullability, and keys — on an
 * injected in-memory sql.js handle, and persists rows in the spec's storage
 * formats ('|'-joined address lists, 0/1 unread, epoch-ms dates, 256-byte
 * Bloom BLOBs).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { SqliteMailStore } from '../../src/store/SqliteMailStore';
import { ACCOUNT_A, D_M2, makeAccountAFixtures } from './fixtures';
import { createSqlJsHandle, type SqlJsHandle } from './sqlJsHandle';

/** [name, type, notnull, pk] per PRAGMA table_info. */
type ColumnSpec = [string, string, number, number];

async function tableInfo(handle: SqlJsHandle, table: string): Promise<ColumnSpec[]> {
  const rows = await handle.query(`PRAGMA table_info(${table})`);
  return rows.map((r) => [r.name as string, r.type as string, r.notnull as number, r.pk as number]);
}

describe('story: a schema mirroring the shared model, created on the thin injected handle', () => {
  let handle: SqlJsHandle;
  let store: SqliteMailStore;

  beforeEach(async () => {
    handle = await createSqlJsHandle();
    store = new SqliteMailStore(handle);
    // Any interface call initializes the schema — no native plugin, no filesystem.
    await store.upsertThreads('boot', []);
  });

  it('creates the threads, messages, and message_tags tables', async () => {
    const rows = await handle.query(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const names = rows.map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['message_tags', 'messages', 'threads']));
  });

  it('threads has exactly the spec columns, all NOT NULL, thread_id as PK', async () => {
    expect(await tableInfo(handle, 'threads')).toEqual([
      ['thread_id', 'TEXT', 1, 1],
      ['account_id', 'TEXT', 1, 0],
      ['subject', 'TEXT', 1, 0],
      ['snippet', 'TEXT', 1, 0],
      ['from_addr', 'TEXT', 1, 0],
      ['date', 'INTEGER', 1, 0],
      ['unread', 'INTEGER', 1, 0],
      ['message_count', 'INTEGER', 1, 0],
    ]);
  });

  it('messages has exactly the spec columns — body_plain/body_html nullable, bloom BLOB NOT NULL', async () => {
    expect(await tableInfo(handle, 'messages')).toEqual([
      ['message_id', 'TEXT', 1, 1],
      ['thread_id', 'TEXT', 1, 0],
      ['account_id', 'TEXT', 1, 0],
      ['from_addr', 'TEXT', 1, 0],
      ['to_addrs', 'TEXT', 1, 0],
      ['cc_addrs', 'TEXT', 1, 0],
      ['bcc_addrs', 'TEXT', 1, 0],
      ['subject', 'TEXT', 1, 0],
      ['date', 'INTEGER', 1, 0],
      ['body_plain', 'TEXT', 0, 0],
      ['body_html', 'TEXT', 0, 0],
      ['unread', 'INTEGER', 1, 0],
      ['bloom', 'BLOB', 1, 0],
    ]);
  });

  it('message_tags has the composite PRIMARY KEY (message_id, tag_id)', async () => {
    expect(await tableInfo(handle, 'message_tags')).toEqual([
      ['message_id', 'TEXT', 1, 1],
      ['tag_id', 'TEXT', 1, 2],
    ]);
  });

  describe('stored row formats', () => {
    beforeEach(async () => {
      const { threads, messages } = makeAccountAFixtures();
      await store.upsertThreads(ACCOUNT_A, threads);
      await store.upsertMessages(ACCOUNT_A, messages);
    });

    it("persists address lists '|'-joined and empty lists as empty strings", async () => {
      const [m2] = await handle.query(
        'SELECT to_addrs, cc_addrs, bcc_addrs FROM messages WHERE message_id = ?',
        ['m2'],
      );
      expect(m2.to_addrs).toBe('me@example.com');
      expect(m2.cc_addrs).toBe('carol@example.com');
      expect(m2.bcc_addrs).toBe('');
      const [m6] = await handle.query(
        'SELECT bcc_addrs FROM messages WHERE message_id = ?',
        ['m6'],
      );
      expect(m6.bcc_addrs).toBe('grace@example.com');
    });

    it('persists unread as 0/1, date as epoch ms, and NULL body_plain for HTML-only mail', async () => {
      const [m2] = await handle.query(
        'SELECT unread, date, body_plain FROM messages WHERE message_id = ?',
        ['m2'],
      );
      expect(m2.unread).toBe(1);
      expect(m2.date).toBe(D_M2);
      expect(m2.body_plain).toBe('Looks good to me. Numbers match the spreadsheet.');
      const [m3] = await handle.query(
        'SELECT unread, body_plain, body_html FROM messages WHERE message_id = ?',
        ['m3'],
      );
      expect(m3.body_plain).toBeNull();
      expect(m3.body_html).toContain('Weekly digest');
    });

    it('persists the Bloom filter as a 256-byte BLOB on every message row', async () => {
      const rows = await handle.query('SELECT bloom FROM messages');
      expect(rows.length).toBe(6);
      for (const row of rows) {
        expect(row.bloom).toBeInstanceOf(Uint8Array);
        expect((row.bloom as Uint8Array).length).toBe(256);
      }
    });

    it('persists one tag row per (message_id, tag_id) pair', async () => {
      const rows = await handle.query(
        'SELECT tag_id FROM message_tags WHERE message_id = ? ORDER BY tag_id',
        ['m2'],
      );
      expect(rows.map((r) => r.tag_id)).toEqual(['inbox', 'starred', 'work']);
    });

    it('row-level idempotency: re-upserting the same page leaves all counts unchanged', async () => {
      const counts = async () => {
        const [t] = await handle.query('SELECT COUNT(*) AS n FROM threads');
        const [m] = await handle.query('SELECT COUNT(*) AS n FROM messages');
        const [mt] = await handle.query('SELECT COUNT(*) AS n FROM message_tags');
        return [t.n, m.n, mt.n];
      };
      const before = await counts();
      const { threads, messages } = makeAccountAFixtures();
      await store.upsertThreads(ACCOUNT_A, threads);
      await store.upsertMessages(ACCOUNT_A, messages);
      expect(await counts()).toEqual(before);
    });
  });
});

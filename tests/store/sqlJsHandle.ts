/**
 * Test-only DbHandle built over an in-memory sql.js database — never the
 * native @capacitor-community/sqlite plugin, never the filesystem
 * (user-stories/typescript_mail_store.md). SqliteMailStore receives this
 * handle by injection, exactly as the production adapter would be injected.
 */
import initSqlJs, { type Database } from 'sql.js';
import type { DbHandle, DbRow, DbValue } from '../../src/store/DbHandle';

export interface SqlJsHandle extends DbHandle {
  /** The raw sql.js database, for schema introspection in tests. */
  readonly db: Database;
}

export async function createSqlJsHandle(): Promise<SqlJsHandle> {
  const SQL = await initSqlJs({
    // Resolve the wasm binary relative to this file — no node:path/process,
    // so the test suite stays tsc-clean without @types/node.
    locateFile: (file: string) =>
      new URL(`../../node_modules/sql.js/dist/${file}`, import.meta.url).pathname,
  });
  const db = new SQL.Database();
  return {
    db,
    async exec(sql: string): Promise<void> {
      db.exec(sql);
    },
    async run(sql: string, params: DbValue[] = []): Promise<void> {
      db.run(sql, params);
    },
    async query(sql: string, params: DbValue[] = []): Promise<DbRow[]> {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params);
        const rows: DbRow[] = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject() as DbRow);
        }
        return rows;
      } finally {
        stmt.free();
      }
    },
  };
}

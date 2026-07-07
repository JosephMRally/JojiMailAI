/**
 * The thin database handle SqliteMailStore is built on
 * (user-stories/typescript_mail_store.md): production injects an adapter
 * over @capacitor-community/sqlite (jeep-sqlite/sql.js on web), tests inject
 * an in-memory sql.js database. Pure types — zero I/O.
 */
export type DbValue = string | number | Uint8Array | null;

export interface DbRow {
  [column: string]: DbValue;
}

export interface DbHandle {
  /** Execute one or more statements with no result (DDL, batches). */
  exec(sql: string): Promise<void>;
  /** Execute a single parameterized statement with no result. */
  run(sql: string, params?: DbValue[]): Promise<void>;
  /** Execute a single parameterized SELECT/PRAGMA and resolve with all rows. */
  query(sql: string, params?: DbValue[]): Promise<DbRow[]>;
}

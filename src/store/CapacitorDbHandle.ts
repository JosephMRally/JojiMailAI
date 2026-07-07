/**
 * Production DbHandle adapter over @capacitor-community/sqlite (the
 * jeep-sqlite/sql.js pathway on web). Wired at the composition root; tests
 * never import this file — they inject an in-memory sql.js handle instead
 * (user-stories/typescript_mail_store.md).
 */
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { DbHandle, DbRow, DbValue } from './DbHandle';

export class CapacitorDbHandle implements DbHandle {
  constructor(private readonly connection: SQLiteDBConnection) {}

  async exec(sql: string): Promise<void> {
    await this.connection.execute(sql);
  }

  async run(sql: string, params: DbValue[] = []): Promise<void> {
    await this.connection.run(sql, params as unknown[]);
  }

  async query(sql: string, params: DbValue[] = []): Promise<DbRow[]> {
    const result = await this.connection.query(sql, params as unknown[]);
    return (result.values ?? []) as DbRow[];
  }
}

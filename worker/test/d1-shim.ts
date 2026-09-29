// Minimal D1Database over Node's built-in sqlite, for Worker tests. Not used in
// the Worker bundle. Foreign keys are on, matching D1.
import { readFileSync } from 'node:fs';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

// Every migration, in order, so the shim matches production's schema.
const migrationSql = ['0001_init.sql', '0002_night2.sql', '0003_block_types.sql', '0004_generation_work.sql', '0005_invitation_error.sql', '0006_night3.sql', '0007_generation_runner.sql', '0012_identity.sql', '0014_lti_core.sql'].map((f) => readFileSync(new URL(`../../migrations/${f}`, import.meta.url), 'utf8')).join('\n');

type SqlValue = null | number | bigint | string | Uint8Array;

export interface ShimMeta {
  duration: number;
  size_after: number;
  rows_read: number;
  rows_written: number;
  last_row_id: number;
  changed_db: boolean;
  changes: number;
}

export interface ShimResult<T = Record<string, unknown>> {
  results: T[];
  success: true;
  meta: ShimMeta;
}

function meta(changes = 0, lastRowId = 0): ShimMeta {
  return {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: changes,
    last_row_id: lastRowId,
    changed_db: changes > 0,
    changes,
  };
}

function result<T>(rows: T[], changes = 0, lastRowId = 0): ShimResult<T> {
  return { results: rows, success: true, meta: meta(changes, lastRowId) };
}

function bindable(values: unknown[]): SqlValue[] {
  return values.map((value) => {
    if (value == null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') return value;
    if (value instanceof Uint8Array) return value;
    throw new Error(`Cannot bind a ${typeof value} to SQLite`);
  });
}

class SqliteStatement {
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqliteStatement {
    return new SqliteStatement(this.sqlite, this.sql, values);
  }

  private statement(): StatementSync {
    return this.sqlite.prepare(this.sql);
  }

  private args(): SqlValue[] {
    return bindable(this.params);
  }

  private readsRows(): boolean {
    return /^\s*(select|with|pragma|explain)\b/i.test(this.sql);
  }

  async all<T = Record<string, unknown>>(): Promise<ShimResult<T>> {
    const rows = this.statement().all(...this.args()) as T[];
    return result(rows);
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const row = this.statement().get(...this.args()) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (colName !== undefined) return (row[colName] ?? null) as T;
    return row as T;
  }

  async run<T = Record<string, unknown>>(): Promise<ShimResult<T>> {
    const info = this.statement().run(...this.args());
    return result<T>([], Number(info.changes), Number(info.lastInsertRowid));
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const statement = this.statement();
    statement.setReturnArrays(true);
    return statement.all(...this.args()) as T[];
  }

  /** Run inside a batch, keeping rows when the statement is a query. */
  execute<T = Record<string, unknown>>(): ShimResult<T> {
    if (this.readsRows()) {
      const rows = this.statement().all(...this.args()) as T[];
      return result(rows);
    }
    const info = this.statement().run(...this.args());
    return result<T>([], Number(info.changes), Number(info.lastInsertRowid));
  }
}

class SqliteDatabase {
  constructor(private readonly sqlite: DatabaseSync) {}

  prepare(sql: string): SqliteStatement {
    return new SqliteStatement(this.sqlite, sql);
  }

  async batch<T = Record<string, unknown>>(statements: SqliteStatement[]): Promise<ShimResult<T>[]> {
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.execute<T>());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      try {
        this.sqlite.exec('ROLLBACK');
      } catch {
        // The failed statement already aborted the transaction.
      }
      throw error;
    }
  }

  async exec(query: string): Promise<{ count: number; duration: number }> {
    this.sqlite.exec(query);
    const count = query.split(';').filter((part) => part.trim()).length;
    return { count, duration: 0 };
  }
}

export function createTestDb(): SqliteDatabase {
  const sqlite = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  return new SqliteDatabase(sqlite);
}

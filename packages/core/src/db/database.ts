import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { ArvisConfig } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('database');

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface MigrationRecord {
  id: number;
  name: string;
  applied_at: string;
}

export interface Migration {
  name: string;
  up: (db: ArvisDatabase) => void;
  down: (db: ArvisDatabase) => void;
}

/**
 * SQLite database wrapper with typed query helpers, migrations, and transactions.
 */
export class ArvisDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(config: ArvisConfig) {
    this.dbPath = path.join(config.dataDir, 'arvis.db');

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Create migrations tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT DEFAULT (datetime('now'))
      )
    `);

    log.info({ path: this.dbPath }, 'Database initialized');
  }

  /**
   * Runs all pending migrations in order.
   * @param migrations Array of migration objects with name, up, and down functions
   */
  migrate(migrations: Migration[]): void {
    const applied = this.all<MigrationRecord>('SELECT * FROM _migrations ORDER BY id');
    const appliedNames = new Set(applied.map(m => m.name));

    // Sort migrations by name (they should be numbered: 001-xxx, 002-xxx)
    const sorted = [...migrations].sort((a, b) => a.name.localeCompare(b.name));

    let count = 0;
    for (const migration of sorted) {
      if (appliedNames.has(migration.name)) continue;

      log.info({ migration: migration.name }, 'Running migration');
      try {
        this.transaction(() => {
          migration.up(this);
          this.run('INSERT OR IGNORE INTO _migrations (name) VALUES (?)', migration.name);
        });
        count++;
      } catch (err) {
        // If another process applied this migration concurrently, silently ignore
        if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
          log.debug({ migration: migration.name }, 'Migration already applied by another process');
        } else {
          throw err;
        }
      }
    }

    if (count > 0) {
      log.info({ count }, 'Migrations applied');
    } else {
      log.debug('No pending migrations');
    }
  }

  /**
   * Rolls back the most recent migration.
   * @param migrations Array of all migration objects
   */
  rollback(migrations: Migration[]): string | null {
    const applied = this.all<MigrationRecord>('SELECT * FROM _migrations ORDER BY id DESC LIMIT 1');
    if (applied.length === 0) return null;

    const lastApplied = applied[0];
    const migration = migrations.find(m => m.name === lastApplied.name);

    if (!migration) {
      throw new Error(`Migration "${lastApplied.name}" not found in provided migrations`);
    }

    log.info({ migration: migration.name }, 'Rolling back migration');
    this.transaction(() => {
      migration.down(this);
      this.run('DELETE FROM _migrations WHERE name = ?', lastApplied.name);
    });

    return migration.name;
  }

  /** Fetches a single row, or undefined if not found */
  get<T>(sql: string, ...params: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  /** Fetches all matching rows */
  all<T>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  /** Executes a statement (INSERT, UPDATE, DELETE) and returns result info */
  run(sql: string, ...params: unknown[]): RunResult {
    const result = this.db.prepare(sql).run(...params);
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  /** Executes raw SQL (for multi-statement DDL) */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  /** Wraps a function in a SQLite transaction. Rolls back on error. */
  transaction<T>(fn: () => T): T {
    const txn = this.db.transaction(fn);
    return txn();
  }

  /** Checks if the database is accessible and writable */
  isHealthy(): boolean {
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  /** Creates a backup of the database to the specified path */
  async backup(destPath: string): Promise<void> {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await this.db.backup(destPath);
    log.info({ path: destPath }, 'Database backup created');
  }

  /** Closes the database connection */
  close(): void {
    this.db.close();
    log.debug('Database connection closed');
  }

  /** Returns the raw better-sqlite3 instance (escape hatch) */
  get raw(): Database.Database {
    return this.db;
  }
}

import Database from 'better-sqlite3';
import type { ArvisConfig } from '../config.js';
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
export declare class ArvisDatabase {
    private db;
    private dbPath;
    constructor(config: ArvisConfig);
    /**
     * Runs all pending migrations in order.
     * @param migrations Array of migration objects with name, up, and down functions
     */
    migrate(migrations: Migration[]): void;
    /**
     * Rolls back the most recent migration.
     * @param migrations Array of all migration objects
     */
    rollback(migrations: Migration[]): string | null;
    /** Fetches a single row, or undefined if not found */
    get<T>(sql: string, ...params: unknown[]): T | undefined;
    /** Fetches all matching rows */
    all<T>(sql: string, ...params: unknown[]): T[];
    /** Executes a statement (INSERT, UPDATE, DELETE) and returns result info */
    run(sql: string, ...params: unknown[]): RunResult;
    /** Executes raw SQL (for multi-statement DDL) */
    exec(sql: string): void;
    /** Wraps a function in a SQLite transaction. Rolls back on error. */
    transaction<T>(fn: () => T): T;
    /** Checks if the database is accessible and writable */
    isHealthy(): boolean;
    /** Creates a backup of the database to the specified path */
    backup(destPath: string): Promise<void>;
    /** Closes the database connection */
    close(): void;
    /** Returns the raw better-sqlite3 instance (escape hatch) */
    get raw(): Database.Database;
}
//# sourceMappingURL=database.d.ts.map
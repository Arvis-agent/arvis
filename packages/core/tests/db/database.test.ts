import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ArvisDatabase } from '../../src/db/database.js';
import type { Migration } from '../../src/db/database.js';
import type { ArvisConfig } from '../../src/config.js';
import initialMigration from '../../src/db/migrations/001-initial.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

function makeTestConfig(): ArvisConfig {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arvis-test-'));
  return {
    dataDir: tmpDir,
    discord: { token: 'test-token', ownerId: 'test-owner' },
    telegram: {},
    web: { port: 5070 },
    accounts: [],
    webhook: { port: 5050 },
    dashboard: { port: 5100 },
    logLevel: 'error',
    timezone: 'UTC',
  };
}

describe('ArvisDatabase', () => {
  let db: ArvisDatabase;
  let config: ArvisConfig;

  beforeEach(() => {
    config = makeTestConfig();
    db = new ArvisDatabase(config);
  });

  afterEach(() => {
    db.close();
    // Clean up temp dir
    fs.rmSync(config.dataDir, { recursive: true, force: true });
  });

  it('creates the database file', () => {
    expect(fs.existsSync(path.join(config.dataDir, 'arvis.db'))).toBe(true);
  });

  it('isHealthy returns true for working database', () => {
    expect(db.isHealthy()).toBe(true);
  });

  it('runs basic get/all/run queries', () => {
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    const result = db.run('INSERT INTO test (name) VALUES (?)', 'hello');
    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBe(1);

    const row = db.get<{ id: number; name: string }>('SELECT * FROM test WHERE id = ?', 1);
    expect(row).toEqual({ id: 1, name: 'hello' });

    db.run('INSERT INTO test (name) VALUES (?)', 'world');
    const rows = db.all<{ id: number; name: string }>('SELECT * FROM test ORDER BY id');
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('hello');
    expect(rows[1].name).toBe('world');
  });

  it('get returns undefined for no match', () => {
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
    const row = db.get('SELECT * FROM test WHERE id = ?', 999);
    expect(row).toBeUndefined();
  });

  it('transactions commit on success', () => {
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, val TEXT)');

    db.transaction(() => {
      db.run('INSERT INTO test (val) VALUES (?)', 'a');
      db.run('INSERT INTO test (val) VALUES (?)', 'b');
    });

    const rows = db.all('SELECT * FROM test');
    expect(rows).toHaveLength(2);
  });

  it('transactions rollback on error', () => {
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, val TEXT NOT NULL)');

    try {
      db.transaction(() => {
        db.run('INSERT INTO test (val) VALUES (?)', 'a');
        // This will fail because val is NOT NULL
        db.run('INSERT INTO test (val) VALUES (?)', null);
      });
    } catch {
      // expected
    }

    const rows = db.all('SELECT * FROM test');
    expect(rows).toHaveLength(0);
  });

  it('backup creates a copy', async () => {
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, val TEXT)');
    db.run('INSERT INTO test (val) VALUES (?)', 'backup-test');

    const backupPath = path.join(config.dataDir, 'backup.db');
    await db.backup(backupPath);

    expect(fs.existsSync(backupPath)).toBe(true);
  });
});

describe('Migration System', () => {
  let db: ArvisDatabase;
  let config: ArvisConfig;

  beforeEach(() => {
    config = makeTestConfig();
    db = new ArvisDatabase(config);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(config.dataDir, { recursive: true, force: true });
  });

  it('runs migrations in order', () => {
    const log: string[] = [];
    const migrations: Migration[] = [
      {
        name: '002-second',
        up: () => log.push('002-up'),
        down: () => log.push('002-down'),
      },
      {
        name: '001-first',
        up: () => log.push('001-up'),
        down: () => log.push('001-down'),
      },
    ];

    db.migrate(migrations);
    expect(log).toEqual(['001-up', '002-up']);
  });

  it('skips already-applied migrations', () => {
    const log: string[] = [];
    const migrations: Migration[] = [
      {
        name: '001-first',
        up: () => log.push('001-up'),
        down: () => log.push('001-down'),
      },
    ];

    db.migrate(migrations);
    db.migrate(migrations); // Run again
    expect(log).toEqual(['001-up']); // Only ran once
  });

  it('rollback removes the last migration', () => {
    const migrations: Migration[] = [
      {
        name: '001-test',
        up: (d) => d.exec('CREATE TABLE rollback_test (id INTEGER PRIMARY KEY)'),
        down: (d) => d.exec('DROP TABLE rollback_test'),
      },
    ];

    db.migrate(migrations);
    expect(db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='rollback_test'`)).toBeDefined();

    const rolled = db.rollback(migrations);
    expect(rolled).toBe('001-test');
    expect(db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='rollback_test'`)).toBeUndefined();
  });

  it('rollback returns null when no migrations applied', () => {
    const result = db.rollback([]);
    expect(result).toBeNull();
  });
});

describe('Initial Migration (001)', () => {
  let db: ArvisDatabase;
  let config: ArvisConfig;

  beforeEach(() => {
    config = makeTestConfig();
    db = new ArvisDatabase(config);
    db.migrate([initialMigration]);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(config.dataDir, { recursive: true, force: true });
  });

  it('creates all expected tables', () => {
    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map(r => r.name)
      .filter(n => !n.startsWith('_') && !n.startsWith('sqlite_'));

    expect(tables).toContain('config');
    expect(tables).toContain('accounts');
    expect(tables).toContain('agents');
    expect(tables).toContain('agent_channels');
    expect(tables).toContain('conversations');
    expect(tables).toContain('messages');
    expect(tables).toContain('memory_facts');
    expect(tables).toContain('memory_state');
    expect(tables).toContain('compactions');
    expect(tables).toContain('heartbeat_configs');
    expect(tables).toContain('heartbeat_logs');
    expect(tables).toContain('cron_jobs');
    expect(tables).toContain('clients');
    expect(tables).toContain('charges');
    expect(tables).toContain('webhooks');
    expect(tables).toContain('skills');
    expect(tables).toContain('queue');
    expect(tables).toContain('sessions');
  });

  it('FTS5 tables exist', () => {
    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'")
      .map(r => r.name);

    expect(tables).toContain('messages_fts');
    expect(tables).toContain('memory_facts_fts');
  });

  it('FTS5 triggers sync on insert', () => {
    // Create an agent first (FK constraint)
    db.run(
      "INSERT INTO agents (slug, name, role) VALUES (?, ?, ?)",
      'test-agent', 'Test Agent', 'developer'
    );

    // Create a conversation
    db.run(
      "INSERT INTO conversations (agent_id, platform, channel_id) VALUES (?, ?, ?)",
      1, 'discord', 'chan-1'
    );

    // Insert a message
    db.run(
      "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)",
      1, 'user', 'hello world search test'
    );

    // Search via FTS
    const results = db.all<{ content: string }>(
      "SELECT content FROM messages_fts WHERE messages_fts MATCH 'search'"
    );
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('search test');
  });

  it('FTS5 triggers sync on delete', () => {
    db.run("INSERT INTO agents (slug, name, role) VALUES (?, ?, ?)", 'test', 'Test', 'developer');
    db.run("INSERT INTO conversations (agent_id, platform, channel_id) VALUES (?, ?, ?)", 1, 'discord', 'c1');
    db.run("INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)", 1, 'user', 'deleteme unique');

    let results = db.all("SELECT * FROM messages_fts WHERE messages_fts MATCH 'deleteme'");
    expect(results).toHaveLength(1);

    db.run("DELETE FROM messages WHERE id = ?", 1);

    results = db.all("SELECT * FROM messages_fts WHERE messages_fts MATCH 'deleteme'");
    expect(results).toHaveLength(0);
  });

  it('FTS5 triggers sync on update', () => {
    db.run("INSERT INTO agents (slug, name, role) VALUES (?, ?, ?)", 'test', 'Test', 'developer');
    db.run("INSERT INTO conversations (agent_id, platform, channel_id) VALUES (?, ?, ?)", 1, 'discord', 'c1');
    db.run("INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)", 1, 'user', 'original content');

    db.run("UPDATE messages SET content = ? WHERE id = ?", 'updated content', 1);

    let results = db.all("SELECT * FROM messages_fts WHERE messages_fts MATCH 'original'");
    expect(results).toHaveLength(0);

    results = db.all("SELECT * FROM messages_fts WHERE messages_fts MATCH 'updated'");
    expect(results).toHaveLength(1);
  });

  it('foreign keys are enforced', () => {
    expect(() => {
      db.run("INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)", 999, 'user', 'test');
    }).toThrow();
  });

  it('migration rollback drops all tables', () => {
    db.rollback([initialMigration]);

    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'")
      .map(r => r.name)
      .filter(n => !n.startsWith('_') && !n.startsWith('sqlite_'));

    // Only _migrations should remain
    expect(tables).toHaveLength(0);
  });
});

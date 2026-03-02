import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AccountManager } from '../../src/runner/account-manager.js';
import { setupTestDb, cleanupTestDb } from '../helpers.js';
import type { ArvisDatabase } from '../../src/db/database.js';
import type { ArvisConfig } from '../../src/config.js';

describe('AccountManager', () => {
  let db: ArvisDatabase;
  let config: ArvisConfig;
  let accounts: AccountManager;

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    config = setup.config;
    accounts = new AccountManager(db);
  });

  afterEach(() => cleanupTestDb(db, config));

  it('syncs accounts from config', () => {
    accounts.syncFromConfig([
      { name: 'cli-1', type: 'cli_subscription', homeDir: '/home/user', model: 'claude-sonnet-4-20250514' },
      { name: 'api-1', type: 'api_key', apiKey: 'sk-test', model: 'claude-haiku-4-5-20251001' },
    ]);

    const status = accounts.getStatus();
    expect(status).toHaveLength(2);
    expect(status[0].name).toBe('cli-1');
    expect(status[1].name).toBe('api-1');
  });

  it('getAvailable returns preferred type for mode', () => {
    accounts.syncFromConfig([
      { name: 'cli-1', type: 'cli_subscription', model: 'sonnet' },
      { name: 'api-1', type: 'api_key', apiKey: 'sk-test', model: 'haiku' },
    ]);

    const fast = accounts.getAvailable('fast');
    expect(fast!.type).toBe('api_key');

    const full = accounts.getAvailable('full');
    expect(full!.type).toBe('cli_subscription');
  });

  it('returns null when all accounts rate limited', () => {
    accounts.syncFromConfig([
      { name: 'cli-1', type: 'cli_subscription', model: 'sonnet' },
    ]);

    const acct = accounts.getAvailable('full')!;
    accounts.markRateLimited(acct.id, new Date(Date.now() + 60_000));

    const available = accounts.getAvailable('full');
    expect(available).toBeNull();
  });

  it('rate limit clears after time passes', () => {
    accounts.syncFromConfig([
      { name: 'cli-1', type: 'cli_subscription', model: 'sonnet' },
    ]);

    const acct = accounts.getAvailable('full')!;
    // Simulate rate limit that has expired (set directly in DB to avoid backoff)
    db.run(
      "UPDATE accounts SET status = 'rate_limited', rate_limited_until = ? WHERE id = ?",
      new Date(Date.now() - 1000).toISOString(), acct.id,
    );

    const available = accounts.getAvailable('full');
    expect(available).not.toBeNull();
  });

  it('records usage', () => {
    accounts.syncFromConfig([
      { name: 'cli-1', type: 'cli_subscription', model: 'sonnet' },
    ]);

    const acct = accounts.getAvailable('full')!;
    accounts.recordUsage(acct.id);
    accounts.recordUsage(acct.id);

    const status = accounts.getStatus();
    expect(status[0].totalMessages).toBe(2);
  });

  it('falls back to any available account', () => {
    // Only API account, requesting full mode
    accounts.syncFromConfig([
      { name: 'api-1', type: 'api_key', apiKey: 'sk-test', model: 'haiku' },
    ]);

    const acct = accounts.getAvailable('full');
    expect(acct).not.toBeNull();
    expect(acct!.type).toBe('api_key');
  });
});

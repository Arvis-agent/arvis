import type { ArvisDatabase } from '../db/database.js';
import type { AccountRow } from '../db/schema.js';
import type { AccountStatus, Provider } from './types.js';
import { ProviderRunner } from './provider-runner.js';
import { createLogger } from '../logger.js';

const log = createLogger('account-manager');

const BACKOFF_MINUTES = [1, 5, 25, 60];

export interface Account {
  id: number;
  name: string;
  type: 'cli_subscription' | 'api_key';
  provider: Provider;
  homeDir?: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  priority: number;
  status: 'active' | 'rate_limited' | 'disabled';
}

/**
 * Manages LLM accounts across multiple providers.
 * Handles smooth rotation, rate limit recovery, and usage tracking.
 */
export class AccountManager {
  private retryCounts = new Map<number, number>();

  constructor(private db: ArvisDatabase) {}

  /** Get an available account for the given mode */
  getAvailable(mode: 'fast' | 'full'): Account | null {
    const now = new Date().toISOString();
    const preferredType = mode === 'fast' ? 'api_key' : 'cli_subscription';

    // Try preferred type first
    let row = this.db.get<AccountRow>(
      `SELECT * FROM accounts
       WHERE type = ? AND status != 'disabled'
         AND (rate_limited_until IS NULL OR rate_limited_until < ?)
       ORDER BY priority ASC, total_messages ASC LIMIT 1`,
      preferredType, now,
    );

    // Fallback to any available account
    if (!row) {
      row = this.db.get<AccountRow>(
        `SELECT * FROM accounts
         WHERE status != 'disabled'
           AND (rate_limited_until IS NULL OR rate_limited_until < ?)
         ORDER BY priority ASC, total_messages ASC LIMIT 1`,
        now,
      );
    }

    if (!row) return null;
    return this.hydrate(row);
  }

  /** Get an available account for a specific provider */
  getAvailableForProvider(provider: Provider): Account | null {
    const now = new Date().toISOString();

    const row = this.db.get<AccountRow>(
      `SELECT * FROM accounts
       WHERE provider = ? AND status != 'disabled'
         AND (rate_limited_until IS NULL OR rate_limited_until < ?)
       ORDER BY priority ASC, total_messages ASC LIMIT 1`,
      provider, now,
    );

    if (!row) return null;
    return this.hydrate(row);
  }

  /** Record usage for an account (increments message counter) */
  recordUsage(accountId: number): void {
    this.db.run(
      'UPDATE accounts SET total_messages = total_messages + 1 WHERE id = ?',
      accountId,
    );
  }

  /** Record cost in the usage_log table */
  recordCost(
    accountId: number,
    inputTokens: number,
    outputTokens: number,
    model: string,
    provider: string,
    agentId?: number,
    jobId?: number,
  ): void {
    try {
      const costUsd = ProviderRunner.calculateCost(provider, model, inputTokens, outputTokens);

      this.db.run(
        `INSERT INTO usage_log (account_id, agent_id, job_id, model, provider, input_tokens, output_tokens, cost_usd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        accountId,
        agentId ?? null,
        jobId ?? null,
        model,
        provider,
        inputTokens,
        outputTokens,
        costUsd,
      );
    } catch {
      // usage_log table may not exist yet (pre-migration). Silently skip.
    }
  }

  /** Mark an account as rate limited with exponential backoff */
  markRateLimited(accountId: number, retryAfter?: Date): void {
    const count = (this.retryCounts.get(accountId) || 0) + 1;
    this.retryCounts.set(accountId, count);

    const backoffMinutes = BACKOFF_MINUTES[Math.min(count - 1, BACKOFF_MINUTES.length - 1)];
    const backoffDate = new Date(Date.now() + backoffMinutes * 60_000);
    const effectiveRetry = retryAfter && retryAfter > backoffDate ? retryAfter : backoffDate;

    this.db.run(
      "UPDATE accounts SET status = 'rate_limited', rate_limited_until = ? WHERE id = ?",
      effectiveRetry.toISOString(), accountId,
    );
    log.info({ accountId, retryAfter: effectiveRetry, attempt: count, backoffMinutes }, 'Account temporarily limited, will auto-recover');
  }

  /** Clear rate limit on an account and reset backoff counter */
  clearRateLimit(accountId: number): void {
    this.retryCounts.delete(accountId);
    this.db.run(
      "UPDATE accounts SET status = 'active', rate_limited_until = NULL, retry_count = 0 WHERE id = ?",
      accountId,
    );
  }

  /** Get status of all accounts */
  getStatus(): AccountStatus[] {
    const rows = this.db.all<AccountRow>('SELECT * FROM accounts ORDER BY priority ASC, id ASC');
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      provider: (r.provider || 'anthropic') as Provider,
      status: r.status as AccountStatus['status'],
      rateLimitedUntil: r.rate_limited_until ? new Date(r.rate_limited_until) : null,
      totalMessages: r.total_messages,
    }));
  }

  /** Ensure accounts from config exist in DB, updating home_dir/model if changed */
  syncFromConfig(accounts: {
    name: string;
    type: string;
    provider?: string;
    homeDir?: string;
    apiKey?: string;
    baseUrl?: string;
    model: string;
    priority?: number;
  }[]): void {
    for (const acct of accounts) {
      const existing = this.db.get<AccountRow>('SELECT * FROM accounts WHERE name = ?', acct.name);
      if (!existing) {
        this.db.run(
          `INSERT INTO accounts (name, type, provider, home_dir, api_key, base_url, model, priority)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          acct.name,
          acct.type,
          acct.provider || 'anthropic',
          acct.homeDir ?? null,
          acct.apiKey ?? null,
          acct.baseUrl ?? null,
          acct.model,
          acct.priority ?? 100,
        );
        log.info({ name: acct.name, type: acct.type, provider: acct.provider || 'anthropic' }, 'Account synced from config');
      } else {
        // Update home_dir and model from config so credential rotations take effect on restart
        this.db.run(
          `UPDATE accounts SET home_dir = ?, model = ?, priority = ? WHERE name = ?`,
          acct.homeDir ?? null,
          acct.model,
          acct.priority ?? existing.priority ?? 100,
          acct.name,
        );
      }
    }
  }

  private hydrate(row: AccountRow): Account {
    const validTypes: Account['type'][] = ['cli_subscription', 'api_key'];
    const validStatuses: Account['status'][] = ['active', 'rate_limited', 'disabled'];

    const type = validTypes.includes(row.type as Account['type'])
      ? (row.type as Account['type'])
      : 'api_key';
    const status = validStatuses.includes(row.status as Account['status'])
      ? (row.status as Account['status'])
      : 'active';

    return {
      id: row.id,
      name: row.name,
      type,
      provider: (row.provider || 'anthropic') as Provider,
      homeDir: row.home_dir ?? undefined,
      apiKey: row.api_key ?? undefined,
      baseUrl: row.base_url ?? undefined,
      model: row.model,
      priority: row.priority ?? 100,
      status,
    };
  }
}

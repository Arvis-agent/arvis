import type { ArvisDatabase } from '../db/database.js';
import type { AccountStatus, Provider } from './types.js';
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
export declare class AccountManager {
    private db;
    private retryCounts;
    constructor(db: ArvisDatabase);
    /** Get an available account for the given mode */
    getAvailable(mode: 'fast' | 'full'): Account | null;
    /** Get an available account for a specific provider */
    getAvailableForProvider(provider: Provider): Account | null;
    /** Record usage for an account */
    recordUsage(accountId: number, tokens: number): void;
    /** Record cost in the usage_log table */
    recordCost(accountId: number, inputTokens: number, outputTokens: number, model: string, provider: string, agentId?: number, jobId?: number): void;
    /** Mark an account as rate limited with exponential backoff */
    markRateLimited(accountId: number, retryAfter?: Date): void;
    /** Clear rate limit on an account and reset backoff counter */
    clearRateLimit(accountId: number): void;
    /** Get status of all accounts */
    getStatus(): AccountStatus[];
    /** Ensure accounts from config exist in DB */
    syncFromConfig(accounts: {
        name: string;
        type: string;
        provider?: string;
        homeDir?: string;
        apiKey?: string;
        baseUrl?: string;
        model: string;
        priority?: number;
    }[]): void;
    private hydrate;
}
//# sourceMappingURL=account-manager.d.ts.map
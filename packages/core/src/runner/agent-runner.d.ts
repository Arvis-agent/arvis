import type { CLIRunner } from './cli-runner.js';
import type { ProviderRunner } from './provider-runner.js';
import type { AccountManager } from './account-manager.js';
import type { RunRequest, RunResult } from './types.js';
/**
 * Main runner orchestrator. Classifies messages, selects accounts,
 * and delegates to CLI or API provider runners.
 *
 * Smooth account switching: when one account hits a limit, silently
 * switches to the next available account. The user never sees an error.
 * Conversation context is rebuilt from our DB, so switching accounts
 * doesn't break anything.
 */
export declare class AgentRunner {
    private cliRunner;
    private providerRunner;
    private accountManager;
    private _hasApiAccount;
    constructor(cliRunner: CLIRunner, providerRunner: ProviderRunner, accountManager: AccountManager);
    private get hasApiAccount();
    /**
     * Execute a request with automatic provider selection and smooth failover.
     *
     * Two-stage failover:
     * 1. Try preferred provider accounts (based on agent config or auto-classification)
     * 2. Fall through to any available account across all providers
     *
     * No blocking — if all accounts are exhausted, throws only as last resort.
     */
    execute(request: RunRequest, depth?: number): Promise<RunResult>;
    /** Force a specific mode (used for compaction summaries, etc.) */
    executeWithMode(request: RunRequest, mode: 'fast' | 'full'): Promise<RunResult>;
}
export { AgentRunner as ClaudeRunner };
//# sourceMappingURL=agent-runner.d.ts.map
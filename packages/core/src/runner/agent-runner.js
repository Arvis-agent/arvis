import { RateLimitError } from './types.js';
import { classifyComplexity } from './classifier.js';
import { createLogger } from '../logger.js';
const log = createLogger('agent-runner');
/**
 * Main runner orchestrator. Classifies messages, selects accounts,
 * and delegates to CLI or API provider runners.
 *
 * Smooth account switching: when one account hits a limit, silently
 * switches to the next available account. The user never sees an error.
 * Conversation context is rebuilt from our DB, so switching accounts
 * doesn't break anything.
 */
export class AgentRunner {
    cliRunner;
    providerRunner;
    accountManager;
    _hasApiAccount = null;
    constructor(cliRunner, providerRunner, accountManager) {
        this.cliRunner = cliRunner;
        this.providerRunner = providerRunner;
        this.accountManager = accountManager;
    }
    get hasApiAccount() {
        if (this._hasApiAccount === null) {
            const accounts = this.accountManager.getStatus();
            this._hasApiAccount = accounts.some(a => a.type === 'api_key');
        }
        return this._hasApiAccount;
    }
    /**
     * Execute a request with automatic provider selection and smooth failover.
     *
     * Two-stage failover:
     * 1. Try preferred provider accounts (based on agent config or auto-classification)
     * 2. Fall through to any available account across all providers
     *
     * No blocking — if all accounts are exhausted, throws only as last resort.
     */
    async execute(request, depth = 0) {
        if (depth > 10) {
            throw new Error('All accounts exhausted after retries');
        }
        // Determine the model spec — either from agent config or request override
        const modelSpec = request.model
            || request.agent.modelPrimary
            || request.agent.model;
        const [preferredProvider, preferredModel] = parseModelSpec(modelSpec);
        // Try to get fallback chain from agent config
        const fallbackChain = request.agent.modelFallbacks || [];
        // Stage 1: Try preferred provider
        let account = this.accountManager.getAvailableForProvider(preferredProvider);
        // Stage 2: Try any available account
        if (!account) {
            // Try each fallback model's provider
            for (const fallback of fallbackChain) {
                const [fbProvider] = parseModelSpec(fallback);
                account = this.accountManager.getAvailableForProvider(fbProvider);
                if (account) {
                    log.info({ from: preferredProvider, to: fbProvider }, 'Switched to fallback provider');
                    break;
                }
            }
        }
        // Stage 3: Any available account at all
        if (!account) {
            const mode = classifyComplexity(request.prompt, request.agent, this.hasApiAccount);
            account = this.accountManager.getAvailable(mode);
        }
        if (!account) {
            throw new RateLimitError('All accounts are temporarily unavailable. Switching will resume automatically.');
        }
        // Determine which runner to use
        const useCliRunner = account.type === 'cli_subscription';
        const effectiveModel = preferredModel || account.model;
        const enrichedRequest = {
            ...request,
            account: {
                id: account.id,
                type: account.type,
                provider: account.provider,
                homeDir: account.homeDir,
                apiKey: account.apiKey,
                baseUrl: account.baseUrl,
            },
            model: effectiveModel,
        };
        try {
            const result = useCliRunner
                ? await this.cliRunner.execute(enrichedRequest)
                : await this.providerRunner.execute(enrichedRequest);
            // Ensure result has all required fields
            const fullResult = {
                ...result,
                provider: result.provider || account.provider,
                inputTokens: result.inputTokens || 0,
                outputTokens: result.outputTokens || 0,
                costUsd: result.costUsd || 0,
            };
            // Success — clear any rate limit on this account
            this.accountManager.clearRateLimit(account.id);
            this.accountManager.recordUsage(account.id, fullResult.tokensUsed);
            // Record cost if there's an agent
            this.accountManager.recordCost(account.id, fullResult.inputTokens, fullResult.outputTokens, fullResult.model, account.provider, request.agent.id);
            log.info({
                provider: account.provider,
                model: fullResult.model,
                tokensUsed: fullResult.tokensUsed,
                costUsd: fullResult.costUsd,
                durationMs: fullResult.durationMs,
            }, 'Request completed');
            return fullResult;
        }
        catch (error) {
            if (error instanceof RateLimitError) {
                // Silently switch to next account — user never sees this
                this.accountManager.markRateLimited(account.id, error.retryAfter);
                log.info({ accountId: account.id, provider: account.provider }, 'Account limit reached, switching to next');
                return this.execute(request, depth + 1);
            }
            throw error;
        }
    }
    /** Force a specific mode (used for compaction summaries, etc.) */
    async executeWithMode(request, mode) {
        const account = this.accountManager.getAvailable(mode);
        if (!account) {
            throw new RateLimitError(`No ${mode} accounts available`);
        }
        const enrichedRequest = {
            ...request,
            account: {
                id: account.id,
                type: account.type,
                provider: account.provider,
                homeDir: account.homeDir,
                apiKey: account.apiKey,
                baseUrl: account.baseUrl,
            },
            model: request.model || account.model,
        };
        const result = account.type === 'cli_subscription'
            ? await this.cliRunner.execute(enrichedRequest)
            : await this.providerRunner.execute(enrichedRequest);
        const fullResult = {
            ...result,
            provider: result.provider || account.provider,
            inputTokens: result.inputTokens || 0,
            outputTokens: result.outputTokens || 0,
            costUsd: result.costUsd || 0,
        };
        this.accountManager.recordUsage(account.id, fullResult.tokensUsed);
        return fullResult;
    }
}
/**
 * Parse a model spec string into [provider, model].
 * "anthropic/claude-sonnet-4" → ['anthropic', 'claude-sonnet-4']
 * "claude-sonnet-4" → ['anthropic', 'claude-sonnet-4'] (legacy default)
 * "openai/gpt-4o" → ['openai', 'gpt-4o']
 * "ollama/qwen2.5" → ['ollama', 'qwen2.5']
 */
function parseModelSpec(spec) {
    if (spec.includes('/')) {
        const idx = spec.indexOf('/');
        return [spec.slice(0, idx), spec.slice(idx + 1)];
    }
    // Legacy: bare model name defaults to anthropic
    return ['anthropic', spec];
}
// Re-export for backwards compat
export { AgentRunner as ClaudeRunner };
//# sourceMappingURL=agent-runner.js.map
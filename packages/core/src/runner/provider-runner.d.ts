import type { RunRequest, RunResult } from './types.js';
/**
 * Executes LLM requests across multiple providers.
 * Handles Anthropic direct API and all OpenAI-compatible APIs.
 */
export declare class ProviderRunner {
    execute(request: RunRequest): Promise<RunResult>;
    /** Calculate cost for a request */
    static calculateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number;
    /** Anthropic Messages API */
    private runAnthropic;
    /** OpenAI-compatible API (OpenAI, OpenRouter, Ollama, custom endpoints) */
    private runOpenAICompat;
    /** Google Gemini API */
    private runGoogle;
}
//# sourceMappingURL=provider-runner.d.ts.map
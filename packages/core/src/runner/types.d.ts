import type { Agent } from '../agents/agent.js';
export type Provider = 'anthropic' | 'openai' | 'google' | 'ollama' | 'openrouter' | 'custom';
export type AccountType = 'cli_subscription' | 'api_key';
export interface RunRequest {
    prompt: string;
    agent: Agent;
    model?: string;
    maxTurns?: number;
    allowedTools?: string[];
    sessionId?: string;
    resume?: boolean;
    projectPath?: string;
    systemPrompt?: string;
    messages?: {
        role: string;
        content: string;
    }[];
    account?: {
        id: number;
        type: AccountType;
        provider: Provider;
        homeDir?: string;
        apiKey?: string;
        baseUrl?: string;
    };
}
export interface RunResult {
    content: string;
    model: string;
    provider: Provider;
    inputTokens: number;
    outputTokens: number;
    tokensUsed: number;
    costUsd: number;
    mode: 'fast' | 'full';
    sessionId?: string;
    durationMs: number;
}
export interface AccountStatus {
    id: number;
    name: string;
    type: string;
    provider: Provider;
    status: 'active' | 'rate_limited' | 'disabled';
    rateLimitedUntil: Date | null;
    totalMessages: number;
}
export declare class RateLimitError extends Error {
    retryAfter?: Date;
    constructor(message: string, retryAfter?: Date);
}
//# sourceMappingURL=types.d.ts.map
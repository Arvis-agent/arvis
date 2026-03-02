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
  messages?: { role: string; content: string }[];
  /** Images for vision-capable models (base64 + MIME type) */
  images?: { base64: string; mimeType: string }[];
  /** Built-in tool names to enable for this run (web_search, calculate, get_time, http_fetch) */
  tools?: string[];
  /**
   * Sandbox mode for CLI runner.
   * - 'none' (default): run directly in the host process (no isolation)
   * - 'docker': wrap the claude subprocess inside a Docker container
   *   Requires Docker daemon to be running and ARVIS_SANDBOX_IMAGE env var set
   *   (defaults to 'arvis-sandbox:latest')
   */
  sandbox?: 'none' | 'docker';
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

export class RateLimitError extends Error {
  retryAfter?: Date;

  constructor(message: string, retryAfter?: Date) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

import type { RunRequest, RunResult, Provider } from './types.js';
import { executeToolLoop } from './tool-loop.js';
import { createAnthropicAdapter } from './providers/anthropic.js';
import { createOpenAIAdapter } from './providers/openai.js';
import { createGoogleAdapter } from './providers/google.js';
import { createLogger } from '../logger.js';

const log = createLogger('provider-runner');

const MAX_TOOL_TURNS = 5;

/** Per-token pricing (USD) — provider/model → { input, output } per token */
const PRICE_TABLE: Record<string, { input: number; output: number }> = {
  // Anthropic
  'anthropic/claude-opus-4-6':            { input: 0.000015,    output: 0.000075   },
  'anthropic/claude-sonnet-4-6':          { input: 0.000003,    output: 0.000015   },
  'anthropic/claude-haiku-4-5-20251001':  { input: 0.00000025,  output: 0.00000125 },
  'anthropic/claude-opus-4-5-20251101':   { input: 0.000015,    output: 0.000075   },
  'anthropic/claude-sonnet-4-5-20250929': { input: 0.000003,    output: 0.000015   },
  'anthropic/claude-sonnet-4-20250514':   { input: 0.000003,    output: 0.000015   },
  'anthropic/claude-opus-4-20250514':     { input: 0.000015,    output: 0.000075   },
  // OpenAI
  'openai/gpt-4.1':                       { input: 0.000002,    output: 0.000008   },
  'openai/gpt-4.1-mini':                  { input: 0.0000004,   output: 0.0000016  },
  'openai/gpt-4.1-nano':                  { input: 0.0000001,   output: 0.0000004  },
  'openai/gpt-4o-mini':                   { input: 0.00000015,  output: 0.0000006  },
  'openai/o3':                            { input: 0.00001,     output: 0.00004    },
  'openai/o4-mini':                       { input: 0.0000011,   output: 0.0000044  },
  // Google Gemini
  'google/gemini-2.5-pro':                { input: 0.00000125,  output: 0.00001    },
  'google/gemini-2.5-flash':              { input: 0.0000003,   output: 0.0000025  },
  'google/gemini-2.0-flash':              { input: 0.0000001,   output: 0.0000004  },
};

/**
 * Executes LLM requests across multiple providers.
 * Each provider is a separate adapter in ./providers/ — adding a new provider
 * means adding one new file, not touching this class.
 */
export class ProviderRunner {
  async execute(request: RunRequest): Promise<RunResult> {
    const provider = request.account?.provider || 'anthropic';
    const startTime = Date.now();

    const { adapter, model } = this.createAdapter(request, provider);
    const result = await executeToolLoop(adapter, model, MAX_TOOL_TURNS);

    const durationMs = Date.now() - startTime;
    const costUsd = ProviderRunner.calculateCost(provider, result.finalModel, result.totalInputTokens, result.totalOutputTokens);

    log.debug({
      model: result.finalModel,
      provider,
      inputTokens: result.totalInputTokens,
      outputTokens: result.totalOutputTokens,
      costUsd,
      durationMs,
    }, 'Provider response');

    return {
      content: result.content,
      model: result.finalModel,
      provider,
      inputTokens: result.totalInputTokens,
      outputTokens: result.totalOutputTokens,
      tokensUsed: result.totalInputTokens + result.totalOutputTokens,
      costUsd,
      mode: 'fast',
      durationMs,
    };
  }

  private createAdapter(request: RunRequest, provider: Provider) {
    switch (provider) {
      case 'anthropic':
        return createAnthropicAdapter(request);
      case 'openai':
      case 'openrouter':
      case 'ollama':
      case 'custom':
        return createOpenAIAdapter(request, provider);
      case 'google':
        return createGoogleAdapter(request);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /** Calculate cost for a request */
  static calculateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number {
    const key = `${provider}/${model}`;
    const pricing = PRICE_TABLE[key];
    if (!pricing) return 0;
    return (inputTokens * pricing.input) + (outputTokens * pricing.output);
  }
}

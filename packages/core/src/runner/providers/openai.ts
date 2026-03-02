import type { RunRequest, Provider } from '../types.js';
import { RateLimitError } from '../types.js';
import type { ProviderAdapter, ParsedResponse } from '../tool-loop.js';
import { getEnabledTools } from '../../tools/tool-executor.js';
import { createLogger } from '../../logger.js';

const log = createLogger('openai');

const DEFAULT_BASE_URLS: Partial<Record<Provider, string>> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1',
};

/**
 * Creates a ProviderAdapter for OpenAI-compatible APIs.
 * Covers: OpenAI, OpenRouter, Ollama, and any custom OpenAI-compat endpoint.
 */
export function createOpenAIAdapter(request: RunRequest, provider: Provider): { adapter: ProviderAdapter; model: string } {
  const apiKey = request.account?.apiKey;
  const baseUrl = request.account?.baseUrl || DEFAULT_BASE_URLS[provider];
  if (!baseUrl) throw new Error(`No base URL for provider: ${provider}`);
  if (provider !== 'ollama' && !apiKey) throw new Error(`${provider} provider requires an API key`);

  const model = request.model || request.agent.model || 'gpt-4.1-mini';
  const enabledTools = getEnabledTools(request.tools ?? []);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://arvis.local';
    headers['X-Title'] = 'Arvis Agent Platform';
  }

  // Mutable conversation history
  const messages: { role: string; content: unknown; tool_call_id?: string; tool_calls?: unknown[] }[] = [];
  if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });

  if (request.messages) {
    messages.push(...request.messages.map(m => ({ ...m })));
  } else if (request.images?.length) {
    messages.push({
      role: 'user',
      content: [
        ...request.images.map(img => ({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
        })),
        { type: 'text', text: request.prompt },
      ],
    });
  } else {
    messages.push({ role: 'user', content: request.prompt });
  }

  const adapter: ProviderAdapter = {
    async callApi() {
      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: 4096,
        ...(enabledTools.length > 0 ? {
          tools: enabledTools.map(t => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
          tool_choice: 'auto',
        } : {}),
      };

      log.debug({ model, provider, baseUrl, promptLength: request.prompt.length }, 'API request');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120_000);

      let response: Response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const retryDate = retryAfter
            ? new Date(Date.now() + parseInt(retryAfter, 10) * 1000)
            : new Date(Date.now() + 60_000);
          throw new RateLimitError(`${provider} rate limited: ${errorText}`, retryDate);
        }
        throw new Error(`${provider} API error (${response.status}): ${errorText}`);
      }

      return response.json();
    },

    parseResponse(resp): ParsedResponse {
      const data = resp as {
        choices: {
          message: {
            content: string | null;
            tool_calls?: { id: string; function: { name: string; arguments: string } }[];
          };
          finish_reason: string;
        }[];
        usage?: { prompt_tokens: number; completion_tokens: number };
        model: string;
      };

      const choice = data.choices?.[0];
      const rawToolCalls = choice?.message?.tool_calls || [];

      const toolCalls = rawToolCalls.map(tc => {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.function.arguments) as Record<string, unknown>; } catch { /* empty args */ }
        return { id: tc.id, name: tc.function.name, input };
      });

      return {
        text: choice?.message?.content || '',
        toolCalls,
        usage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
        },
        model: data.model || model,
        raw: rawToolCalls, // raw tool_calls array for appendTurns
      };
    },

    appendTurns(rawToolCalls, toolResults) {
      // Append assistant message with tool_calls
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: rawToolCalls as unknown[],
      });
      // Append one tool message per result
      for (const tr of toolResults) {
        messages.push({ role: 'tool', tool_call_id: tr.id, content: tr.result });
      }
    },
  };

  return { adapter, model };
}

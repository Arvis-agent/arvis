import type { RunRequest } from '../types.js';
import { RateLimitError } from '../types.js';
import type { ProviderAdapter, ParsedResponse } from '../tool-loop.js';
import { getEnabledTools } from '../../tools/tool-executor.js';
import { createLogger } from '../../logger.js';

const log = createLogger('anthropic');

/**
 * Creates a ProviderAdapter for the Anthropic Messages API.
 * The adapter holds mutable message state (conversation history) in a closure.
 */
export function createAnthropicAdapter(request: RunRequest): { adapter: ProviderAdapter; model: string } {
  if (!request.account?.apiKey) throw new Error('Anthropic provider requires an API key');

  const model = request.model || request.agent.model || 'claude-haiku-4-5-20251001';
  const enabledTools = getEnabledTools(request.tools ?? []);

  // Build initial user content (multi-modal if images present)
  let userContent: unknown = request.prompt;
  if (request.images?.length && !request.messages) {
    userContent = [
      ...request.images.map(img => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
      })),
      { type: 'text', text: request.prompt },
    ];
  }

  // Mutable conversation history
  const messages: unknown[] = request.messages
    ? [...request.messages]
    : [{ role: 'user', content: userContent }];

  const adapter: ProviderAdapter = {
    async callApi() {
      const body: Record<string, unknown> = {
        model,
        max_tokens: 4096,
        messages,
        ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
        ...(enabledTools.length > 0 ? {
          tools: enabledTools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters,
          })),
        } : {}),
      };

      log.debug({ model, provider: 'anthropic', promptLength: request.prompt.length }, 'API request');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120_000);

      let response: Response;
      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': request.account!.apiKey!,
            'anthropic-version': '2023-06-01',
          },
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
          throw new RateLimitError(`Anthropic rate limited: ${errorText}`, retryDate);
        }
        throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
      }

      return response.json();
    },

    parseResponse(resp): ParsedResponse {
      const data = resp as {
        content: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[];
        usage: { input_tokens: number; output_tokens: number };
        model: string;
      };

      const toolCalls = data.content
        .filter(c => c.type === 'tool_use')
        .map(c => ({ id: c.id!, name: c.name!, input: c.input ?? {} }));

      const text = data.content
        .filter(c => c.type === 'text')
        .map(c => c.text ?? '')
        .join('\n');

      return {
        text,
        toolCalls,
        usage: {
          inputTokens: data.usage?.input_tokens || 0,
          outputTokens: data.usage?.output_tokens || 0,
        },
        model: data.model,
        raw: data.content, // full content array (for tool_result messages)
      };
    },

    appendTurns(rawAssistant, toolResults) {
      messages.push({ role: 'assistant', content: rawAssistant });
      messages.push({
        role: 'user',
        content: toolResults.map(tr => ({
          type: 'tool_result',
          tool_use_id: tr.id,
          content: tr.result,
        })),
      });
    },
  };

  return { adapter, model };
}

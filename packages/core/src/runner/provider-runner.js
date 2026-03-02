import { RateLimitError } from './types.js';
import { createLogger } from '../logger.js';
const log = createLogger('provider-runner');
/** Default base URLs for known providers */
const DEFAULT_BASE_URLS = {
    openai: 'https://api.openai.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    ollama: 'http://localhost:11434/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta',
};
/** Per-token pricing (USD) — provider/model → { input, output } per token */
const PRICE_TABLE = {
    'anthropic/claude-sonnet-4-20250514': { input: 0.000003, output: 0.000015 },
    'anthropic/claude-haiku-4-5-20251001': { input: 0.00000025, output: 0.00000125 },
    'anthropic/claude-opus-4-6': { input: 0.000015, output: 0.000075 },
    'openai/gpt-4o': { input: 0.0000025, output: 0.00001 },
    'openai/gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
    'openai/gpt-4.1': { input: 0.000002, output: 0.000008 },
    'openai/gpt-4.1-mini': { input: 0.0000004, output: 0.0000016 },
    'openai/o3-mini': { input: 0.0000011, output: 0.0000044 },
};
/**
 * Executes LLM requests across multiple providers.
 * Handles Anthropic direct API and all OpenAI-compatible APIs.
 */
export class ProviderRunner {
    async execute(request) {
        const provider = request.account?.provider || 'anthropic';
        switch (provider) {
            case 'anthropic':
                return this.runAnthropic(request);
            case 'openai':
            case 'openrouter':
            case 'ollama':
            case 'custom':
                return this.runOpenAICompat(request, provider);
            case 'google':
                return this.runGoogle(request);
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }
    /** Calculate cost for a request */
    static calculateCost(provider, model, inputTokens, outputTokens) {
        const key = `${provider}/${model}`;
        const pricing = PRICE_TABLE[key];
        if (!pricing)
            return 0; // Free or unknown — Ollama, local models, etc.
        return (inputTokens * pricing.input) + (outputTokens * pricing.output);
    }
    /** Anthropic Messages API */
    async runAnthropic(request) {
        if (!request.account?.apiKey) {
            throw new Error('Anthropic provider requires an API key');
        }
        const startTime = Date.now();
        const model = request.model || request.agent.model || 'claude-haiku-4-5-20251001';
        const body = {
            model,
            max_tokens: 4096,
            system: request.systemPrompt || undefined,
            messages: request.messages || [
                { role: 'user', content: request.prompt },
            ],
        };
        log.debug({ model, provider: 'anthropic', promptLength: request.prompt.length }, 'API request');
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': request.account.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
        });
        const durationMs = Date.now() - startTime;
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
        const data = await response.json();
        const content = data.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('\n');
        const inputTokens = data.usage?.input_tokens || 0;
        const outputTokens = data.usage?.output_tokens || 0;
        const costUsd = ProviderRunner.calculateCost('anthropic', data.model, inputTokens, outputTokens);
        log.debug({ model: data.model, inputTokens, outputTokens, costUsd, durationMs }, 'Anthropic response');
        return {
            content,
            model: data.model,
            provider: 'anthropic',
            inputTokens,
            outputTokens,
            tokensUsed: inputTokens + outputTokens,
            costUsd,
            mode: 'fast',
            durationMs,
        };
    }
    /** OpenAI-compatible API (OpenAI, OpenRouter, Ollama, custom endpoints) */
    async runOpenAICompat(request, provider) {
        const apiKey = request.account?.apiKey;
        const baseUrl = request.account?.baseUrl || DEFAULT_BASE_URLS[provider];
        if (!baseUrl)
            throw new Error(`No base URL for provider: ${provider}`);
        // Ollama doesn't need API keys
        if (provider !== 'ollama' && !apiKey) {
            throw new Error(`${provider} provider requires an API key`);
        }
        const startTime = Date.now();
        const model = request.model || request.agent.model || 'gpt-4o-mini';
        const messages = [];
        if (request.systemPrompt) {
            messages.push({ role: 'system', content: request.systemPrompt });
        }
        if (request.messages) {
            messages.push(...request.messages);
        }
        else {
            messages.push({ role: 'user', content: request.prompt });
        }
        const body = {
            model,
            messages,
            max_tokens: 4096,
        };
        log.debug({ model, provider, baseUrl, promptLength: request.prompt.length }, 'OpenAI-compat request');
        const headers = {
            'Content-Type': 'application/json',
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        if (provider === 'openrouter') {
            headers['HTTP-Referer'] = 'https://arvis.local';
            headers['X-Title'] = 'Arvis Agent Platform';
        }
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        const durationMs = Date.now() - startTime;
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
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        const inputTokens = data.usage?.prompt_tokens || 0;
        const outputTokens = data.usage?.completion_tokens || 0;
        const costUsd = ProviderRunner.calculateCost(provider, model, inputTokens, outputTokens);
        log.debug({ model: data.model, inputTokens, outputTokens, costUsd, durationMs }, `${provider} response`);
        return {
            content,
            model: data.model || model,
            provider,
            inputTokens,
            outputTokens,
            tokensUsed: inputTokens + outputTokens,
            costUsd,
            mode: 'fast',
            durationMs,
        };
    }
    /** Google Gemini API */
    async runGoogle(request) {
        if (!request.account?.apiKey) {
            throw new Error('Google provider requires an API key');
        }
        const startTime = Date.now();
        const model = request.model || 'gemini-2.0-flash';
        const baseUrl = request.account.baseUrl || DEFAULT_BASE_URLS.google;
        const parts = [];
        if (request.systemPrompt) {
            parts.push({ text: `Instructions: ${request.systemPrompt}\n\n` });
        }
        parts.push({ text: request.prompt });
        const body = {
            contents: [{ parts }],
            generationConfig: { maxOutputTokens: 4096 },
        };
        log.debug({ model, provider: 'google', promptLength: request.prompt.length }, 'Gemini request');
        const response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${request.account.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const durationMs = Date.now() - startTime;
        if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 429) {
                throw new RateLimitError(`Google rate limited: ${errorText}`, new Date(Date.now() + 60_000));
            }
            throw new Error(`Google API error (${response.status}): ${errorText}`);
        }
        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts
            ?.map(p => p.text)
            .join('') || '';
        const inputTokens = data.usageMetadata?.promptTokenCount || 0;
        const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
        log.debug({ model, inputTokens, outputTokens, durationMs }, 'Gemini response');
        return {
            content,
            model,
            provider: 'google',
            inputTokens,
            outputTokens,
            tokensUsed: inputTokens + outputTokens,
            costUsd: 0, // Gemini pricing varies widely
            mode: 'fast',
            durationMs,
        };
    }
}
//# sourceMappingURL=provider-runner.js.map
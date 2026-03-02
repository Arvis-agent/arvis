import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderRunner } from '../../src/runner/provider-runner.js';
import { executeToolLoop } from '../../src/runner/tool-loop.js';
import { createGoogleAdapter } from '../../src/runner/providers/google.js';
import { createAnthropicAdapter } from '../../src/runner/providers/anthropic.js';
import { RateLimitError } from '../../src/runner/types.js';
import type { RunRequest } from '../../src/runner/types.js';
import type { ProviderAdapter } from '../../src/runner/tool-loop.js';
import type { Agent } from '../../src/agents/agent.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAgent(overrides?: Partial<Agent>): Agent {
  return {
    id: 1, slug: 'test', name: 'Test', role: 'developer',
    description: null, model: 'claude-haiku-4-5-20251001',
    modelPrimary: null, modelFallbacks: [],
    allowedTools: [], projectPath: null,
    systemPrompt: null, personality: null, config: null, status: 'active',
    createdBy: null, createdAt: '', updatedAt: '', channels: [],
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<RunRequest>): RunRequest {
  return {
    prompt: 'Hello, world!',
    agent: makeAgent(),
    ...overrides,
  };
}

/** Create a fake fetch response */
function fakeResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: (h: string) => headers[h.toLowerCase()] ?? null },
  } as unknown as Response;
}

// ─── Anthropic response shapes ────────────────────────────────────────────────

const ANTHROPIC_TEXT = {
  id: 'msg_123',
  type: 'message',
  role: 'assistant',
  content: [{ type: 'text', text: 'Hello from Claude!' }],
  model: 'claude-haiku-4-5-20251001',
  stop_reason: 'end_turn',
  usage: { input_tokens: 15, output_tokens: 8 },
};

const OPENAI_TEXT = {
  id: 'chatcmpl-123',
  object: 'chat.completion',
  choices: [{ message: { role: 'assistant', content: 'Hello from GPT!' }, finish_reason: 'stop' }],
  model: 'gpt-4.1-mini',
  usage: { prompt_tokens: 10, completion_tokens: 5 },
};

const GOOGLE_TEXT = {
  candidates: [{
    content: { parts: [{ text: 'Hello from Gemini!' }], role: 'model' },
    finishReason: 'STOP',
  }],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 6 },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProviderRunner', () => {
  let runner: ProviderRunner;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    runner = new ProviderRunner();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── calculateCost ────────────────────────────────────────────────────────────

  describe('calculateCost', () => {
    it('returns correct cost for Anthropic Haiku', () => {
      const cost = ProviderRunner.calculateCost('anthropic', 'claude-haiku-4-5-20251001', 1000, 500);
      // 1000 * 0.00000025 + 500 * 0.00000125
      expect(cost).toBeCloseTo(1000 * 0.00000025 + 500 * 0.00000125, 12);
    });

    it('returns correct cost for OpenAI gpt-4.1', () => {
      // 10000 * 0.000002 + 2000 * 0.000008 = 0.02 + 0.016 = 0.036
      const cost = ProviderRunner.calculateCost('openai', 'gpt-4.1', 10_000, 2_000);
      expect(cost).toBeCloseTo(10_000 * 0.000002 + 2_000 * 0.000008, 8);
    });

    it('returns correct cost for OpenAI gpt-4.1-mini', () => {
      const cost = ProviderRunner.calculateCost('openai', 'gpt-4.1-mini', 5_000, 1_000);
      expect(cost).toBeCloseTo(5_000 * 0.0000004 + 1_000 * 0.0000016, 12);
    });

    it('returns 0 for unknown model', () => {
      expect(ProviderRunner.calculateCost('anthropic', 'unknown-model-xyz', 1000, 500)).toBe(0);
    });

    it('returns 0 for unknown provider', () => {
      expect(ProviderRunner.calculateCost('fakeai', 'some-model', 1000, 500)).toBe(0);
    });
  });

  // ── Anthropic ────────────────────────────────────────────────────────────────

  describe('execute - Anthropic', () => {
    const account = { id: 1, type: 'api_key' as const, provider: 'anthropic' as const, apiKey: 'sk-ant-test' };

    it('executes a simple request and returns content', async () => {
      mockFetch.mockResolvedValueOnce(fakeResponse(ANTHROPIC_TEXT));

      const result = await runner.execute(makeRequest({ account, model: 'claude-haiku-4-5-20251001' }));

      expect(result.content).toBe('Hello from Claude!');
      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-haiku-4-5-20251001');
      expect(result.inputTokens).toBe(15);
      expect(result.outputTokens).toBe(8);
      expect(result.tokensUsed).toBe(23);
      expect(result.costUsd).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('calls the Anthropic messages endpoint', async () => {
      mockFetch.mockResolvedValueOnce(fakeResponse(ANTHROPIC_TEXT));
      await runner.execute(makeRequest({ account, model: 'claude-haiku-4-5-20251001' }));

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('api.anthropic.com/v1/messages');
      expect(JSON.parse(init.body as string)).toMatchObject({
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'Hello, world!' }],
      });
    });

    it('throws RateLimitError on 429', async () => {
      mockFetch.mockResolvedValueOnce(fakeResponse('rate limited', 429, { 'retry-after': '30' }));
      await expect(
        runner.execute(makeRequest({ account })),
      ).rejects.toThrow(RateLimitError);
    });

    it('throws generic error on 500', async () => {
      mockFetch.mockResolvedValueOnce(fakeResponse('Server error', 500));
      await expect(
        runner.execute(makeRequest({ account })),
      ).rejects.toThrow(/Anthropic API error/);
    });

    it('throws when API key is missing', async () => {
      await expect(
        runner.execute(makeRequest({
          account: { id: 1, type: 'api_key', provider: 'anthropic' },
        })),
      ).rejects.toThrow(/API key/);
    });
  });

  // ── OpenAI ────────────────────────────────────────────────────────────────────

  describe('execute - OpenAI', () => {
    const account = { id: 2, type: 'api_key' as const, provider: 'openai' as const, apiKey: 'sk-openai-test' };

    it('executes a simple request and returns content', async () => {
      mockFetch.mockResolvedValueOnce(fakeResponse(OPENAI_TEXT));

      const result = await runner.execute(makeRequest({ account, model: 'gpt-4.1-mini' }));

      expect(result.content).toBe('Hello from GPT!');
      expect(result.provider).toBe('openai');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(5);
      expect(result.tokensUsed).toBe(15);
    });

    it('calls the OpenAI chat completions endpoint', async () => {
      mockFetch.mockResolvedValueOnce(fakeResponse(OPENAI_TEXT));
      await runner.execute(makeRequest({ account, model: 'gpt-4.1-mini' }));

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('api.openai.com/v1/chat/completions');
    });

    it('throws RateLimitError on 429', async () => {
      mockFetch.mockResolvedValueOnce(fakeResponse('rate limited', 429));
      await expect(runner.execute(makeRequest({ account }))).rejects.toThrow(RateLimitError);
    });

    it('includes system prompt in messages', async () => {
      mockFetch.mockResolvedValueOnce(fakeResponse(OPENAI_TEXT));
      await runner.execute(makeRequest({ account, model: 'gpt-4.1-mini', systemPrompt: 'You are helpful.' }));

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.messages[0]).toMatchObject({ role: 'system', content: 'You are helpful.' });
    });
  });

  // ── Google ────────────────────────────────────────────────────────────────────

  describe('execute - Google', () => {
    const account = { id: 3, type: 'api_key' as const, provider: 'google' as const, apiKey: 'AIza-test-key' };

    it('executes a simple request and returns content', async () => {
      mockFetch.mockResolvedValueOnce(fakeResponse(GOOGLE_TEXT));

      const result = await runner.execute(makeRequest({ account, model: 'gemini-2.5-flash' }));

      expect(result.content).toBe('Hello from Gemini!');
      expect(result.provider).toBe('google');
      expect(result.inputTokens).toBe(12);
      expect(result.outputTokens).toBe(6);
    });

    it('calls the Gemini generateContent endpoint', async () => {
      mockFetch.mockResolvedValueOnce(fakeResponse(GOOGLE_TEXT));
      await runner.execute(makeRequest({ account, model: 'gemini-2.5-flash' }));

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('generativelanguage.googleapis.com');
      expect(url).toContain('gemini-2.5-flash:generateContent');
      expect(url).toContain('key=AIza-test-key');
    });

    it('throws RateLimitError on 429', async () => {
      mockFetch.mockResolvedValueOnce(fakeResponse('quota exceeded', 429));
      await expect(runner.execute(makeRequest({ account }))).rejects.toThrow(RateLimitError);
    });

    it('includes systemInstruction for system prompts', async () => {
      // Test the adapter directly to avoid ProviderRunner routing indirection
      const request = makeRequest({
        account: { id: 3, type: 'api_key', provider: 'google', apiKey: 'AIza-test-key' },
        model: 'gemini-2.5-flash',
        systemPrompt: 'Be concise.',
      });
      mockFetch.mockResolvedValueOnce(fakeResponse(GOOGLE_TEXT));

      const { adapter } = createGoogleAdapter(request);
      await adapter.callApi();

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.systemInstruction).toMatchObject({ parts: [{ text: 'Be concise.' }] });
    });
  });

  // ── Tool calling loop ─────────────────────────────────────────────────────────
  // Tests use executeToolLoop directly with a mock adapter to avoid ToolExecutor
  // network dependencies and provider routing complexity.

  describe('executeToolLoop', () => {
    it('runs a single turn with no tool calls', async () => {
      let calls = 0;
      const adapter: ProviderAdapter = {
        callApi: async () => ++calls,
        parseResponse: () => ({
          text: 'Hello!', toolCalls: [],
          usage: { inputTokens: 10, outputTokens: 5 },
          model: 'test-model', raw: null,
        }),
        appendTurns: vi.fn(),
      };

      const result = await executeToolLoop(adapter, 'test-model', 5);
      expect(result.content).toBe('Hello!');
      expect(result.totalInputTokens).toBe(10);
      expect(result.totalOutputTokens).toBe(5);
      expect(calls).toBe(1);
    });

    it('accumulates tokens across multiple tool call turns', async () => {
      let turn = 0;
      const adapter: ProviderAdapter = {
        callApi: async () => ++turn,
        parseResponse: (raw) => {
          if (raw === 1) {
            return {
              text: '', toolCalls: [{ id: 'tc1', name: 'calculate', input: { expression: '2+2' } }],
              usage: { inputTokens: 20, outputTokens: 10 },
              model: 'test-model', raw: 'turn1',
            };
          }
          return {
            text: 'The answer is 4.',
            toolCalls: [],
            usage: { inputTokens: 30, outputTokens: 8 },
            model: 'test-model', raw: 'turn2',
          };
        },
        appendTurns: vi.fn(),
      };

      const result = await executeToolLoop(adapter, 'test-model', 5);
      expect(result.content).toBe('The answer is 4.');
      expect(result.totalInputTokens).toBe(50); // 20 + 30
      expect(result.totalOutputTokens).toBe(18); // 10 + 8
      expect(turn).toBe(2); // called API twice
    });

    it('stops at maxTurns and returns last text', async () => {
      // Every turn returns a tool call — should stop after maxTurns
      let calls = 0;
      const adapter: ProviderAdapter = {
        callApi: async () => ++calls,
        parseResponse: () => ({
          text: 'partial',
          toolCalls: [{ id: 'tc1', name: 'calculate', input: { expression: '1' } }],
          usage: { inputTokens: 5, outputTokens: 2 },
          model: 'test-model', raw: null,
        }),
        appendTurns: vi.fn(),
      };

      const result = await executeToolLoop(adapter, 'test-model', 2);
      // Should exit because turn >= maxTurns (2), with text 'partial'
      expect(result.content).toBe('partial');
      expect(calls).toBe(3); // turns 0, 1, 2
    });

    it('calls appendTurns with tool results after each tool call', async () => {
      let turn = 0;
      const appendTurns = vi.fn();
      const adapter: ProviderAdapter = {
        callApi: async () => ++turn,
        parseResponse: (raw) => raw === 1
          ? { text: '', toolCalls: [{ id: 'tc1', name: 'calculate', input: { expression: '1+1' } }], usage: { inputTokens: 5, outputTokens: 3 }, model: 'm', raw: 'raw1' }
          : { text: 'done', toolCalls: [], usage: { inputTokens: 5, outputTokens: 3 }, model: 'm', raw: 'raw2' },
        appendTurns,
      };

      await executeToolLoop(adapter, 'test-model', 5);
      expect(appendTurns).toHaveBeenCalledOnce();
      const [rawAssistant, results] = appendTurns.mock.calls[0];
      expect(rawAssistant).toBe('raw1');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('calculate');
    });

    it('also tests Anthropic adapter tool message structure via real fetch mock', async () => {
      // Verify the Anthropic adapter correctly builds tool_result messages
      const request = makeRequest({
        account: { id: 1, type: 'api_key', provider: 'anthropic', apiKey: 'sk-test' },
        model: 'claude-haiku-4-5-20251001',
        tools: ['calculate'],
      });

      // Turn 1: tool_use response
      mockFetch.mockResolvedValueOnce(fakeResponse({
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'calculate', input: { expression: '1+1' } }],
        model: 'claude-haiku-4-5-20251001',
        usage: { input_tokens: 15, output_tokens: 8 },
      }));
      // Turn 2: text response
      mockFetch.mockResolvedValueOnce(fakeResponse({
        content: [{ type: 'text', text: '1 plus 1 equals 2.' }],
        model: 'claude-haiku-4-5-20251001',
        usage: { input_tokens: 25, output_tokens: 10 },
      }));

      const { adapter, model } = createAnthropicAdapter(request);
      const result = await executeToolLoop(adapter, model, 5);

      expect(result.content).toBe('1 plus 1 equals 2.');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second API call body should contain tool_result
      const [, init2] = mockFetch.mock.calls[1] as [string, RequestInit];
      const body2 = JSON.parse(init2.body as string) as { messages: unknown[] };
      // user, assistant (tool_use), user (tool_result)
      expect(body2.messages).toHaveLength(3);
    });
  });

  // ── OpenRouter ────────────────────────────────────────────────────────────────

  describe('execute - OpenRouter', () => {
    it('calls OpenRouter endpoint with correct headers', async () => {
      mockFetch.mockResolvedValueOnce(fakeResponse(OPENAI_TEXT));

      await runner.execute(makeRequest({
        account: { id: 4, type: 'api_key', provider: 'openrouter', apiKey: 'sk-or-test' },
        model: 'anthropic/claude-sonnet-4-6',
      }));

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('openrouter.ai/api/v1/chat/completions');
      const headers = init.headers as Record<string, string>;
      expect(headers['HTTP-Referer']).toBe('https://arvis.local');
    });
  });

  // ── Unknown provider ──────────────────────────────────────────────────────────

  describe('execute - unknown provider', () => {
    it('throws for an unrecognized provider', async () => {
      await expect(
        runner.execute(makeRequest({
          account: { id: 99, type: 'api_key', provider: 'fakeai' as never, apiKey: 'key' },
        })),
      ).rejects.toThrow(/Unknown provider/);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRunner } from '../../src/runner/agent-runner.js';
import { AccountManager } from '../../src/runner/account-manager.js';
import { RateLimitError } from '../../src/runner/types.js';
import { AgentRegistry } from '../../src/agents/agent-registry.js';
import { setupTestDb, cleanupTestDb } from '../helpers.js';
import type { ArvisDatabase } from '../../src/db/database.js';
import type { ArvisConfig } from '../../src/config.js';
import type { CLIRunner } from '../../src/runner/cli-runner.js';
import type { ProviderRunner } from '../../src/runner/provider-runner.js';
import type { RunResult } from '../../src/runner/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeResult(overrides?: Partial<RunResult>): RunResult {
  return {
    content: 'OK',
    model: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    inputTokens: 10,
    outputTokens: 5,
    tokensUsed: 15,
    costUsd: 0.000001,
    mode: 'fast',
    durationMs: 50,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AgentRunner', () => {
  let db: ArvisDatabase;
  let config: ArvisConfig;
  let accounts: AccountManager;
  let registry: AgentRegistry;
  let mockCli: { execute: ReturnType<typeof vi.fn> };
  let mockProvider: { execute: ReturnType<typeof vi.fn> };
  let runner: AgentRunner;

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    config = setup.config;
    accounts = new AccountManager(db);
    registry = new AgentRegistry(db);
    mockCli = { execute: vi.fn().mockResolvedValue(makeResult({ mode: 'full', provider: 'anthropic' })) };
    mockProvider = { execute: vi.fn().mockResolvedValue(makeResult()) };
    runner = new AgentRunner(
      mockCli as unknown as CLIRunner,
      mockProvider as unknown as ProviderRunner,
      accounts,
    );
  });

  afterEach(() => {
    cleanupTestDb(db, config);
    vi.restoreAllMocks();
  });

  // ── Provider routing ──────────────────────────────────────────────────────────

  describe('provider routing', () => {
    it('routes to CLI runner for cli_subscription accounts', async () => {
      accounts.syncFromConfig([{
        name: 'claude-cli', type: 'cli_subscription', provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      }]);
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });

      const result = await runner.execute({ prompt: 'hello', agent, model: 'anthropic/claude-sonnet-4-20250514' });

      expect(mockCli.execute).toHaveBeenCalledOnce();
      expect(mockProvider.execute).not.toHaveBeenCalled();
      expect(result.content).toBe('OK');
    });

    it('routes to provider runner for api_key accounts', async () => {
      accounts.syncFromConfig([{
        name: 'openai-key', type: 'api_key', provider: 'openai',
        apiKey: 'sk-test', model: 'gpt-4.1-mini',
      }]);
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });

      const result = await runner.execute({ prompt: 'hello', agent, model: 'openai/gpt-4.1-mini' });

      expect(mockProvider.execute).toHaveBeenCalledOnce();
      expect(mockCli.execute).not.toHaveBeenCalled();
      expect(result.content).toBe('OK');
    });

    it('falls through to getAvailable when no account for preferred provider', async () => {
      // Only have an OpenAI account, but requesting Anthropic model
      accounts.syncFromConfig([{
        name: 'openai-key', type: 'api_key', provider: 'openai',
        apiKey: 'sk-test', model: 'gpt-4.1-mini',
      }]);
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });

      // Should fall through to getAvailable, which returns the OpenAI account
      await runner.execute({ prompt: 'hello', agent, model: 'anthropic/claude-haiku-4-5-20251001' });

      expect(mockProvider.execute).toHaveBeenCalledOnce();
    });
  });

  // ── Request enrichment ────────────────────────────────────────────────────────

  describe('request enrichment', () => {
    it('attaches account info to the enriched request', async () => {
      accounts.syncFromConfig([{
        name: 'api-1', type: 'api_key', provider: 'anthropic',
        apiKey: 'sk-ant-test', model: 'claude-haiku-4-5-20251001',
      }]);
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });

      await runner.execute({ prompt: 'hello', agent, model: 'anthropic/claude-haiku-4-5-20251001' });

      const enriched = mockProvider.execute.mock.calls[0][0];
      expect(enriched.account.apiKey).toBe('sk-ant-test');
      expect(enriched.account.provider).toBe('anthropic');
      expect(enriched.account.type).toBe('api_key');
    });

    it('resolves effective model from account when none specified on agent', async () => {
      accounts.syncFromConfig([{
        name: 'api-1', type: 'api_key', provider: 'anthropic',
        apiKey: 'sk-test', model: 'claude-haiku-4-5-20251001',
      }]);
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });

      await runner.execute({ prompt: 'hello', agent });

      const enriched = mockProvider.execute.mock.calls[0][0];
      // model should be whatever the account has (or the agent's bare model field)
      expect(enriched.model).toBeDefined();
    });
  });

  // ── Success path — side effects ───────────────────────────────────────────────

  describe('success path', () => {
    it('clears rate limit on success', async () => {
      accounts.syncFromConfig([{
        name: 'api-1', type: 'api_key', provider: 'anthropic', apiKey: 'sk-test', model: 'claude-haiku-4-5-20251001',
      }]);
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });
      const clearSpy = vi.spyOn(accounts, 'clearRateLimit');

      await runner.execute({ prompt: 'hello', agent, model: 'anthropic/claude-haiku-4-5-20251001' });

      expect(clearSpy).toHaveBeenCalledOnce();
    });

    it('records usage on success', async () => {
      accounts.syncFromConfig([{
        name: 'api-1', type: 'api_key', provider: 'anthropic', apiKey: 'sk-test', model: 'claude-haiku-4-5-20251001',
      }]);
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });

      await runner.execute({ prompt: 'hello', agent, model: 'anthropic/claude-haiku-4-5-20251001' });

      const status = accounts.getStatus();
      expect(status[0].totalMessages).toBe(1);
    });

    it('fills in missing fields with defaults', async () => {
      accounts.syncFromConfig([{
        name: 'api-1', type: 'api_key', provider: 'anthropic', apiKey: 'sk-test', model: 'claude-haiku-4-5-20251001',
      }]);
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });
      // Return a partial result missing optional fields
      mockProvider.execute.mockResolvedValueOnce({
        content: 'Hi', model: 'claude-haiku-4-5-20251001', mode: 'fast', durationMs: 10,
      } as Partial<RunResult>);

      const result = await runner.execute({ prompt: 'hello', agent, model: 'anthropic/claude-haiku-4-5-20251001' });

      expect(result.provider).toBe('anthropic');
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
      expect(result.costUsd).toBe(0);
    });
  });

  // ── Failover ──────────────────────────────────────────────────────────────────

  describe('silent failover on RateLimitError', () => {
    it('switches to the second account when first is rate-limited', async () => {
      accounts.syncFromConfig([
        { name: 'api-1', type: 'api_key', provider: 'anthropic', apiKey: 'sk-one', model: 'claude-haiku-4-5-20251001', priority: 1 },
        { name: 'api-2', type: 'api_key', provider: 'anthropic', apiKey: 'sk-two', model: 'claude-haiku-4-5-20251001', priority: 2 },
      ]);
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });

      mockProvider.execute
        .mockRejectedValueOnce(new RateLimitError('Throttled', new Date(Date.now() + 60_000)))
        .mockResolvedValueOnce(makeResult({ content: 'From second account' }));

      const result = await runner.execute({ prompt: 'hello', agent, model: 'anthropic/claude-haiku-4-5-20251001' });

      expect(result.content).toBe('From second account');
      expect(mockProvider.execute).toHaveBeenCalledTimes(2);
    });

    it('marks account rate-limited on RateLimitError', async () => {
      accounts.syncFromConfig([
        { name: 'api-1', type: 'api_key', provider: 'anthropic', apiKey: 'sk-one', model: 'claude-haiku-4-5-20251001', priority: 1 },
        { name: 'api-2', type: 'api_key', provider: 'anthropic', apiKey: 'sk-two', model: 'claude-haiku-4-5-20251001', priority: 2 },
      ]);
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });
      const markSpy = vi.spyOn(accounts, 'markRateLimited');

      mockProvider.execute
        .mockRejectedValueOnce(new RateLimitError('Throttled'))
        .mockResolvedValueOnce(makeResult());

      await runner.execute({ prompt: 'hello', agent, model: 'anthropic/claude-haiku-4-5-20251001' });

      expect(markSpy).toHaveBeenCalledOnce();
    });

    it('throws RateLimitError when all accounts are exhausted', async () => {
      accounts.syncFromConfig([{
        name: 'api-1', type: 'api_key', provider: 'anthropic', apiKey: 'sk-test', model: 'claude-haiku-4-5-20251001',
      }]);
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });
      mockProvider.execute.mockRejectedValue(new RateLimitError('Always limited'));

      await expect(
        runner.execute({ prompt: 'hello', agent, model: 'anthropic/claude-haiku-4-5-20251001' }),
      ).rejects.toThrow(RateLimitError);
    });

    it('does NOT retry on non-RateLimitError', async () => {
      accounts.syncFromConfig([{
        name: 'api-1', type: 'api_key', provider: 'anthropic', apiKey: 'sk-test', model: 'claude-haiku-4-5-20251001',
      }]);
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });
      mockProvider.execute.mockRejectedValue(new Error('Invalid API key — check credentials'));

      await expect(
        runner.execute({ prompt: 'hello', agent, model: 'anthropic/claude-haiku-4-5-20251001' }),
      ).rejects.toThrow('Invalid API key');

      // Called exactly once — no retry
      expect(mockProvider.execute).toHaveBeenCalledOnce();
    });
  });

  // ── Depth guard ───────────────────────────────────────────────────────────────

  describe('depth guard', () => {
    it('throws Error (not RateLimitError) when depth > 10', async () => {
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });

      // Bypass all account selection by starting at depth=11
      await expect(
        runner.execute({ prompt: 'hello', agent }, 11),
      ).rejects.toThrow('All accounts exhausted after retries');
    });
  });

  // ── No accounts ───────────────────────────────────────────────────────────────

  describe('no accounts configured', () => {
    it('throws RateLimitError immediately', async () => {
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });

      await expect(
        runner.execute({ prompt: 'hello', agent }),
      ).rejects.toThrow(RateLimitError);
    });
  });

  // ── executeWithMode ───────────────────────────────────────────────────────────

  describe('executeWithMode', () => {
    it('selects a fast (api_key) account for fast mode', async () => {
      accounts.syncFromConfig([{
        name: 'api-1', type: 'api_key', provider: 'anthropic', apiKey: 'sk-test', model: 'claude-haiku-4-5-20251001',
      }]);
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });

      const result = await runner.executeWithMode({ prompt: 'summarise', agent }, 'fast');

      expect(mockProvider.execute).toHaveBeenCalledOnce();
      expect(result.content).toBe('OK');
    });

    it('selects a full (cli_subscription) account for full mode', async () => {
      accounts.syncFromConfig([{
        name: 'cli-1', type: 'cli_subscription', provider: 'anthropic', model: 'claude-sonnet-4-20250514',
      }]);
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });

      await runner.executeWithMode({ prompt: 'complex task', agent }, 'full');

      expect(mockCli.execute).toHaveBeenCalledOnce();
    });

    it('throws RateLimitError when no account available for mode', async () => {
      // No accounts at all
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });

      await expect(
        runner.executeWithMode({ prompt: 'hello', agent }, 'fast'),
      ).rejects.toThrow(RateLimitError);
    });

    it('records usage after executeWithMode success', async () => {
      accounts.syncFromConfig([{
        name: 'api-1', type: 'api_key', provider: 'anthropic', apiKey: 'sk-test', model: 'claude-haiku-4-5-20251001',
      }]);
      const agent = registry.create({ slug: 'test', name: 'Test', role: 'developer' });

      await runner.executeWithMode({ prompt: 'hello', agent }, 'fast');

      const status = accounts.getStatus();
      expect(status[0].totalMessages).toBe(1);
    });
  });
});

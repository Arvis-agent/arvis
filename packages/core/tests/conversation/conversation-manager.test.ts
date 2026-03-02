import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConversationManager } from '../../src/conversation/conversation-manager.js';
import { AgentRegistry } from '../../src/agents/agent-registry.js';
import { setupTestDb, cleanupTestDb, createTestAgent } from '../helpers.js';
import type { ArvisDatabase } from '../../src/db/database.js';
import type { ArvisConfig } from '../../src/config.js';

describe('ConversationManager', () => {
  let db: ArvisDatabase;
  let config: ArvisConfig;
  let convManager: ConversationManager;
  let agentId: number;

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    config = setup.config;
    convManager = new ConversationManager(db);
    const registry = new AgentRegistry(db);
    agentId = createTestAgent(registry).id;
  });

  afterEach(() => cleanupTestDb(db, config));

  it('creates a new conversation', () => {
    const conv = convManager.getOrCreate(agentId, 'discord', 'ch-1', 'user-1');
    expect(conv.id).toBeGreaterThan(0);
    expect(conv.agentId).toBe(agentId);
    expect(conv.platform).toBe('discord');
    expect(conv.channelId).toBe('ch-1');
    expect(conv.status).toBe('active');
  });

  it('returns existing conversation on second call', () => {
    const first = convManager.getOrCreate(agentId, 'discord', 'ch-1');
    const second = convManager.getOrCreate(agentId, 'discord', 'ch-1');
    expect(first.id).toBe(second.id);
  });

  it('stores and retrieves messages', () => {
    const conv = convManager.getOrCreate(agentId, 'discord', 'ch-1');
    const msg = convManager.addMessage(conv.id, 'user', 'Hello agent');

    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello agent');
    expect(msg.tokenEstimate).toBeGreaterThan(0);
  });

  it('messages are ordered chronologically', () => {
    const conv = convManager.getOrCreate(agentId, 'discord', 'ch-1');
    convManager.addMessage(conv.id, 'user', 'First');
    convManager.addMessage(conv.id, 'assistant', 'Second');
    convManager.addMessage(conv.id, 'user', 'Third');

    const history = convManager.getHistory(conv.id);
    expect(history).toHaveLength(3);
    expect(history[0].content).toBe('First');
    expect(history[1].content).toBe('Second');
    expect(history[2].content).toBe('Third');
  });

  it('token estimation is roughly accurate', () => {
    const conv = convManager.getOrCreate(agentId, 'discord', 'ch-1');
    // ~100 chars => ~28 tokens
    convManager.addMessage(conv.id, 'user', 'a'.repeat(100));

    const estimate = convManager.getTokenEstimate(conv.id);
    expect(estimate).toBeGreaterThan(20);
    expect(estimate).toBeLessThan(40);
  });

  it('history respects limit', () => {
    const conv = convManager.getOrCreate(agentId, 'discord', 'ch-1');
    for (let i = 0; i < 10; i++) {
      convManager.addMessage(conv.id, 'user', `Message ${i}`);
    }

    const limited = convManager.getHistory(conv.id, { limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it('history respects maxTokens budget', () => {
    const conv = convManager.getOrCreate(agentId, 'discord', 'ch-1');
    // Each message ~100 chars => ~29 tokens
    for (let i = 0; i < 10; i++) {
      convManager.addMessage(conv.id, 'user', 'x'.repeat(100));
    }

    // Budget for ~3 messages worth of tokens
    const budgeted = convManager.getHistory(conv.id, { maxTokens: 90 });
    expect(budgeted.length).toBeGreaterThan(0);
    expect(budgeted.length).toBeLessThanOrEqual(4);
  });

  it('shouldCompact returns true when over threshold', () => {
    const conv = convManager.getOrCreate(agentId, 'discord', 'ch-1');
    // Add enough messages to exceed 6000 tokens (~21000 chars)
    // Default threshold is now 150k tokens — pass explicit 6000 for this test
    for (let i = 0; i < 40; i++) {
      convManager.addMessage(conv.id, 'user', 'x'.repeat(800));
    }

    expect(convManager.shouldCompact(conv.id, 6000)).toBe(true);
  });

  it('shouldCompact returns false when under threshold', () => {
    const conv = convManager.getOrCreate(agentId, 'discord', 'ch-1');
    convManager.addMessage(conv.id, 'user', 'short message');

    expect(convManager.shouldCompact(conv.id)).toBe(false);
  });

  it('compact summarizes and keeps recent messages', async () => {
    const conv = convManager.getOrCreate(agentId, 'discord', 'ch-1');

    // Add 15 messages
    for (let i = 0; i < 15; i++) {
      convManager.addMessage(conv.id, 'user', `Message number ${i}`);
    }

    const result = await convManager.compact(
      conv.id,
      async (text) => 'Summary of: ' + text.substring(0, 50),
      10,
    );

    expect(result.messagesBefore).toBe(15);
    expect(result.messagesAfter).toBe(10); // 10 kept (summary now in compactions table, not as message)
    expect(result.summary).toContain('Summary of:');
    expect(result.tokensSaved).toBeGreaterThan(0);

    // Check actual messages — only the kept messages remain
    const history = convManager.getHistory(conv.id);
    expect(history).toHaveLength(10);

    // Summary is stored in compactions table, not as a system message
    const summaries = convManager.getRecentSummaries(conv.id);
    expect(summaries.length).toBe(1);
    expect(summaries[0].summary).toContain('Summary of:');
  });

  it('compact with fewer messages than keepCount is a no-op', async () => {
    const conv = convManager.getOrCreate(agentId, 'discord', 'ch-1');
    convManager.addMessage(conv.id, 'user', 'Only message');

    const result = await convManager.compact(conv.id, async () => 'unused', 10);
    expect(result.messagesBefore).toBe(1);
    expect(result.messagesAfter).toBe(1);
  });

  it('FTS5 search works across messages', () => {
    const conv = convManager.getOrCreate(agentId, 'discord', 'ch-1');
    convManager.addMessage(conv.id, 'user', 'deploy the application to production');
    convManager.addMessage(conv.id, 'assistant', 'I will deploy now');
    convManager.addMessage(conv.id, 'user', 'how is the weather');

    const results = convManager.searchMessages(agentId, 'deploy');
    expect(results).toHaveLength(2);
  });

  it('compaction summaries are stored and retrievable', async () => {
    const conv = convManager.getOrCreate(agentId, 'discord', 'ch-1');
    for (let i = 0; i < 15; i++) {
      convManager.addMessage(conv.id, 'user', `Msg ${i}`);
    }

    await convManager.compact(conv.id, async () => 'Test summary', 10);

    const summaries = convManager.getRecentSummaries(conv.id);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].summary).toBe('Test summary');
  });

  it('message count is tracked on conversation', () => {
    const conv = convManager.getOrCreate(agentId, 'discord', 'ch-1');
    convManager.addMessage(conv.id, 'user', 'One');
    convManager.addMessage(conv.id, 'assistant', 'Two');

    const updated = convManager.getById(conv.id)!;
    expect(updated.messageCount).toBe(2);
  });
});

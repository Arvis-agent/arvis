import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextBuilder } from '../../src/conversation/context-builder.js';
import { ConversationManager } from '../../src/conversation/conversation-manager.js';
import { MemoryManager } from '../../src/memory/memory-manager.js';
import { AgentRegistry } from '../../src/agents/agent-registry.js';
import { setupTestDb, cleanupTestDb } from '../helpers.js';
import type { ArvisDatabase } from '../../src/db/database.js';
import type { ArvisConfig } from '../../src/config.js';
import type { IncomingMessage } from '../../src/bus/types.js';
import type { Agent } from '../../src/agents/agent.js';

function makeMsg(): IncomingMessage {
  return {
    id: 'msg-1',
    platform: 'discord',
    channelId: 'ch-1',
    userId: 'user-1',
    userName: 'TestUser',
    content: 'hello',
    timestamp: new Date(),
  };
}

describe('ContextBuilder', () => {
  let db: ArvisDatabase;
  let config: ArvisConfig;
  let contextBuilder: ContextBuilder;
  let convManager: ConversationManager;
  let memoryManager: MemoryManager;
  let agent: Agent;

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    config = setup.config;
    convManager = new ConversationManager(db);
    memoryManager = new MemoryManager(db);
    contextBuilder = new ContextBuilder(db, memoryManager, convManager);

    const registry = new AgentRegistry(db);
    agent = registry.create({
      slug: 'test-dev',
      name: 'Test Developer',
      role: 'developer',
      description: 'Handles web development',
      personality: { voice: 'casual', emoji_level: 'minimal' },
    });
  });

  afterEach(() => cleanupTestDb(db, config));

  it('builds context with all 5 layers', () => {
    // Set up data
    memoryManager.saveFact(agent.id, { category: 'user_preference', content: 'Prefers TypeScript' });
    memoryManager.setState(agent.id, 'current_task', 'Building forms');

    const conv = convManager.getOrCreate(agent.id, 'discord', 'ch-1');
    convManager.addMessage(conv.id, 'user', 'Can you help with forms?');
    convManager.addMessage(conv.id, 'assistant', 'Sure, let me check the code.');

    const context = contextBuilder.build(agent, conv, makeMsg());

    // System prompt (Layer 1) includes identity
    expect(context.systemPrompt).toContain('Test Developer');
    expect(context.systemPrompt).toContain('developer');
    expect(context.systemPrompt).toContain('casual');

    // Facts (Layer 5)
    expect(context.factsText).toContain('Prefers TypeScript');

    // State (Layer 4)
    expect(context.stateText).toContain('current_task');
    expect(context.stateText).toContain('Building forms');

    // Messages (Layer 2)
    expect(context.messages.length).toBeGreaterThan(0);
  });

  it('context fits within budget', () => {
    // Add lots of data
    for (let i = 0; i < 20; i++) {
      memoryManager.saveFact(agent.id, { category: 'project_context', content: `Fact ${i}: ${'x'.repeat(50)}` });
    }
    const conv = convManager.getOrCreate(agent.id, 'discord', 'ch-1');
    for (let i = 0; i < 50; i++) {
      convManager.addMessage(conv.id, 'user', `Message ${i}: ${'y'.repeat(100)}`);
    }

    const context = contextBuilder.build(agent, conv, makeMsg());
    expect(context.totalTokens).toBeLessThanOrEqual(200000); // Budget fits within model context
  });

  it('when budget is tight, messages are trimmed not facts', () => {
    memoryManager.saveFact(agent.id, { category: 'user_preference', content: 'Important pref' });

    const conv = convManager.getOrCreate(agent.id, 'discord', 'ch-1');
    // Add enough messages to exceed the token budget (180k tokens = ~630k chars)
    // 3000 messages * 250 chars = 750k chars = ~214k tokens > 180k budget
    for (let i = 0; i < 3000; i++) {
      convManager.addMessage(conv.id, 'user', 'x'.repeat(250));
    }

    const context = contextBuilder.build(agent, conv, makeMsg());
    // Facts should still be present
    expect(context.factsText).toContain('Important pref');
    // Messages should be trimmed (3000 * 250 chars = 750k chars > budget)
    expect(context.messages.length).toBeLessThan(3000);
  });

  it('empty layers are handled gracefully', () => {
    const conv = convManager.getOrCreate(agent.id, 'discord', 'ch-1');
    const context = contextBuilder.build(agent, conv, makeMsg());

    expect(context.systemPrompt).toContain('Test Developer');
    expect(context.factsText).toBe('');
    expect(context.stateText).toBe('');
    expect(context.summaryText).toBe('');
  });

  it('system prompt includes personality', () => {
    const prompt = contextBuilder.buildSystemPrompt(agent, [], []);
    expect(prompt).toContain('casual');
  });

  it('system prompt includes agent description', () => {
    const prompt = contextBuilder.buildSystemPrompt(agent, [], []);
    expect(prompt).toContain('Handles web development');
  });

  it('system prompt includes custom system prompt', () => {
    const registry = new AgentRegistry(db);
    const customAgent = registry.create({
      slug: 'custom-agent',
      name: 'Custom',
      role: 'custom',
      systemPrompt: 'Always respond in haiku.',
    });

    const prompt = contextBuilder.buildSystemPrompt(customAgent, [], []);
    expect(prompt).toContain('Always respond in haiku.');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryManager } from '../../src/memory/memory-manager.js';
import { AgentRegistry } from '../../src/agents/agent-registry.js';
import { setupTestDb, cleanupTestDb, createTestAgent } from '../helpers.js';
import type { ArvisDatabase } from '../../src/db/database.js';
import type { ArvisConfig } from '../../src/config.js';

describe('MemoryManager', () => {
  let db: ArvisDatabase;
  let config: ArvisConfig;
  let memory: MemoryManager;
  let agentId: number;

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    config = setup.config;
    memory = new MemoryManager(db);
    const registry = new AgentRegistry(db);
    agentId = createTestAgent(registry).id;
  });

  afterEach(() => cleanupTestDb(db, config));

  it('saves and retrieves facts', () => {
    memory.saveFact(agentId, { category: 'user_preference', content: 'Prefers dark mode' });
    memory.saveFact(agentId, { category: 'project_context', content: 'Uses Next.js 14' });

    const facts = memory.getFacts(agentId);
    expect(facts).toHaveLength(2);
    expect(facts.find(f => f.content === 'Prefers dark mode')).toBeDefined();
  });

  it('filters facts by category', () => {
    memory.saveFact(agentId, { category: 'user_preference', content: 'Dark mode' });
    memory.saveFact(agentId, { category: 'project_context', content: 'Next.js' });

    const prefs = memory.getFacts(agentId, { category: 'user_preference' });
    expect(prefs).toHaveLength(1);
    expect(prefs[0].content).toBe('Dark mode');
  });

  it('filters facts by minimum confidence', () => {
    memory.saveFact(agentId, { category: 'user_preference', content: 'High conf', confidence: 0.9 });
    memory.saveFact(agentId, { category: 'user_preference', content: 'Low conf', confidence: 0.3 });

    const high = memory.getFacts(agentId, { minConfidence: 0.5 });
    expect(high).toHaveLength(1);
    expect(high[0].content).toBe('High conf');
  });

  it('respects limit', () => {
    for (let i = 0; i < 10; i++) {
      memory.saveFact(agentId, { category: 'user_preference', content: `Fact ${i}` });
    }
    const limited = memory.getFacts(agentId, { limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it('FTS5 search works on facts', () => {
    memory.saveFact(agentId, { category: 'project_context', content: 'Stack is React and TypeScript' });
    memory.saveFact(agentId, { category: 'project_context', content: 'Database is PostgreSQL' });

    const results = memory.searchFacts(agentId, 'React');
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('React');
  });

  it('KV state CRUD works', () => {
    memory.setState(agentId, 'current_task', 'Building login');
    memory.setState(agentId, 'blocker', 'Waiting on API key');

    const task = memory.getState(agentId, 'current_task') as { key: string; value: string };
    expect(task.value).toBe('Building login');

    const all = memory.getState(agentId) as { key: string; value: string }[];
    expect(all).toHaveLength(2);

    memory.deleteState(agentId, 'blocker');
    const afterDelete = memory.getState(agentId) as { key: string; value: string }[];
    expect(afterDelete).toHaveLength(1);
  });

  it('setState overwrites existing key', () => {
    memory.setState(agentId, 'task', 'Old task');
    memory.setState(agentId, 'task', 'New task');

    const result = memory.getState(agentId, 'task') as { key: string; value: string };
    expect(result.value).toBe('New task');
  });

  it('getState returns undefined for missing key', () => {
    expect(memory.getState(agentId, 'nonexistent')).toBeUndefined();
  });

  it('confidence decay works', () => {
    memory.saveFact(agentId, { category: 'user_preference', content: 'Old fact' });
    // Manually set last_accessed to 60 days ago
    db.run(
      "UPDATE memory_facts SET last_accessed = datetime('now', '-60 days') WHERE agent_id = ?",
      agentId,
    );

    const decayed = memory.decayFacts(agentId, 30);
    expect(decayed).toBe(1);

    const facts = memory.getFacts(agentId);
    expect(facts[0].confidence).toBeLessThan(1.0);
  });

  it('deduplication removes exact duplicates', () => {
    memory.saveFact(agentId, { category: 'user_preference', content: 'Likes tabs' });
    memory.saveFact(agentId, { category: 'user_preference', content: 'Likes tabs' });
    memory.saveFact(agentId, { category: 'user_preference', content: 'Likes tabs' });

    const removed = memory.deduplicateFacts(agentId);
    expect(removed).toBe(2);

    const facts = memory.getFacts(agentId);
    expect(facts).toHaveLength(1);
  });

  it('parseAndSave extracts MEMORY tags', () => {
    const output = `Here's your answer!
[MEMORY:user_preference] User prefers dark mode
[MEMORY:project_context] Stack is Next.js 14
Some more text`;

    const saved = memory.parseAndSave(agentId, output, 0);
    expect(saved).toHaveLength(2);
    expect(saved[0]).toEqual({ type: 'fact', category: 'user_preference', content: 'User prefers dark mode' });
    expect(saved[1]).toEqual({ type: 'fact', category: 'project_context', content: 'Stack is Next.js 14' });

    const facts = memory.getFacts(agentId);
    expect(facts).toHaveLength(2);
  });

  it('parseAndSave extracts STATE tags', () => {
    const output = `Done!
[STATE:current_task] Refactoring auth
[STATE:blockers] None`;

    const saved = memory.parseAndSave(agentId, output, 0);
    expect(saved).toHaveLength(2);
    expect(saved[0]).toEqual({ type: 'state', key: 'current_task', content: 'Refactoring auth' });

    const state = memory.getState(agentId, 'current_task') as { value: string };
    expect(state.value).toBe('Refactoring auth');
  });

  it('stripTags removes MEMORY and STATE tags', () => {
    const output = `Here's the result!
[MEMORY:user_preference] Likes dark mode
[STATE:task] Building login
That's all.`;

    const stripped = memory.stripTags(output);
    expect(stripped).not.toContain('[MEMORY:');
    expect(stripped).not.toContain('[STATE:');
    expect(stripped).toContain("Here's the result!");
    expect(stripped).toContain("That's all.");
  });
});

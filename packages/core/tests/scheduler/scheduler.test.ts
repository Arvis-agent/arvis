import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../../src/scheduler/scheduler.js';
import { QueueManager } from '../../src/queue/queue-manager.js';
import { AgentRegistry } from '../../src/agents/agent-registry.js';
import { setupTestDb, cleanupTestDb, createTestAgent } from '../helpers.js';
import type { ArvisDatabase } from '../../src/db/database.js';
import type { ArvisConfig } from '../../src/config.js';

describe('Scheduler', () => {
  let db: ArvisDatabase;
  let config: ArvisConfig;
  let scheduler: Scheduler;
  let queue: QueueManager;
  let agentId: number;

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    config = setup.config;
    queue = new QueueManager(db);
    scheduler = new Scheduler(db, queue);
    const registry = new AgentRegistry(db);
    agentId = createTestAgent(registry).id;
  });

  afterEach(() => {
    scheduler.stop();
    cleanupTestDb(db, config);
  });

  it('detects due heartbeats', () => {
    // Insert a heartbeat with next_run in the past
    db.run(
      `INSERT INTO heartbeat_configs (agent_id, name, prompt, schedule, next_run, enabled)
       VALUES (?, ?, ?, ?, datetime('now', '-1 hour'), 1)`,
      agentId, 'Test Heartbeat', 'Check status', '*/30 * * * *',
    );

    scheduler.tick();

    const pending = queue.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe('heartbeat');
  });

  it('detects due cron jobs', () => {
    db.run(
      `INSERT INTO cron_jobs (agent_id, name, prompt, schedule, next_run, enabled)
       VALUES (?, ?, ?, ?, datetime('now', '-1 hour'), 1)`,
      agentId, 'Test Cron', 'Run report', '0 * * * *',
    );

    scheduler.tick();

    const pending = queue.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe('cron');
  });

  it('skips disabled tasks', () => {
    db.run(
      `INSERT INTO heartbeat_configs (agent_id, name, prompt, schedule, next_run, enabled)
       VALUES (?, ?, ?, ?, datetime('now', '-1 hour'), 0)`,
      agentId, 'Disabled', 'Skip me', '*/30 * * * *',
    );

    scheduler.tick();
    expect(queue.getPending()).toHaveLength(0);
  });

  it('updates next_run after enqueueing', () => {
    db.run(
      `INSERT INTO heartbeat_configs (agent_id, name, prompt, schedule, next_run, enabled)
       VALUES (?, ?, ?, ?, datetime('now', '-1 hour'), 1)`,
      agentId, 'Test', 'Check', '*/30 * * * *',
    );

    scheduler.tick();

    const row = db.get<{ next_run: string }>('SELECT next_run FROM heartbeat_configs WHERE id = 1');
    expect(row!.next_run).toBeDefined();
    // next_run should be in the future
    expect(new Date(row!.next_run).getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('tick handles empty task list', () => {
    // Should not throw
    scheduler.tick();
    expect(queue.getPending()).toHaveLength(0);
  });

  it('calculateNextRun returns valid date', () => {
    const nextRun = scheduler.calculateNextRun('*/5 * * * *');
    const date = new Date(nextRun);
    expect(date.getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('tasks enqueue with background priority', () => {
    db.run(
      `INSERT INTO heartbeat_configs (agent_id, name, prompt, schedule, next_run, enabled)
       VALUES (?, ?, ?, ?, datetime('now', '-1 hour'), 1)`,
      agentId, 'BG Task', 'Do thing', '*/30 * * * *',
    );

    scheduler.tick();

    const pending = queue.getPending();
    expect(pending[0].priority).toBe(10);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QueueManager } from '../../src/queue/queue-manager.js';
import { AgentRegistry } from '../../src/agents/agent-registry.js';
import { setupTestDb, cleanupTestDb, createTestAgent } from '../helpers.js';
import type { ArvisDatabase } from '../../src/db/database.js';
import type { ArvisConfig } from '../../src/config.js';

describe('QueueManager', () => {
  let db: ArvisDatabase;
  let config: ArvisConfig;
  let queue: QueueManager;
  let agentId: number;

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    config = setup.config;
    queue = new QueueManager(db);
    const registry = new AgentRegistry(db);
    agentId = createTestAgent(registry).id;
  });

  afterEach(() => {
    queue.stop();
    cleanupTestDb(db, config);
  });

  it('enqueues a job', () => {
    const jobId = queue.enqueue({
      agentId,
      type: 'message',
      payload: { content: 'hello' },
      priority: 5,
    });

    expect(jobId).toBeGreaterThan(0);
    const status = queue.getStatus();
    expect(status.pending).toBe(1);
  });

  it('processes jobs in priority order', async () => {
    const processed: number[] = [];
    queue.setProcessor(async (job) => {
      processed.push(job.priority);
      return 'ok';
    });

    // Enqueue in reverse priority order
    queue.enqueue({ agentId, type: 'message', payload: {}, priority: 10 });
    queue.enqueue({ agentId, type: 'message', payload: {}, priority: 1 });
    queue.enqueue({ agentId, type: 'message', payload: {}, priority: 5 });

    await queue.processNext();
    await queue.processNext();
    await queue.processNext();

    expect(processed).toEqual([1, 5, 10]);
  });

  it('failed jobs retry up to max_attempts', async () => {
    let attempts = 0;
    queue.setProcessor(async () => {
      attempts++;
      throw new Error('fail');
    });

    queue.enqueue({ agentId, type: 'message', payload: {} });

    // First attempt processes normally
    await queue.processNext();
    expect(attempts).toBe(1);

    // Subsequent retries have backoff — clear the retryAfter to simulate time passing
    db.run("UPDATE queue SET error = 'fail' WHERE status = 'pending'");
    await queue.processNext();
    expect(attempts).toBe(2);

    db.run("UPDATE queue SET error = 'fail' WHERE status = 'pending'");
    await queue.processNext();
    expect(attempts).toBe(3);

    const job = queue.getJob(1)!;
    expect(job.status).toBe('failed');
    expect(job.attempts).toBe(3);
  });

  it('cancelled jobs do not execute', async () => {
    let processed = false;
    queue.setProcessor(async () => {
      processed = true;
      return 'ok';
    });

    const jobId = queue.enqueue({ agentId, type: 'message', payload: {} });
    queue.cancel(jobId);

    const result = await queue.processNext();
    expect(result).toBeNull(); // No pending jobs
    expect(processed).toBe(false);
  });

  it('cancelByAgent cancels all pending jobs for agent', () => {
    queue.enqueue({ agentId, type: 'message', payload: {} });
    queue.enqueue({ agentId, type: 'message', payload: {} });
    queue.enqueue({ agentId, type: 'message', payload: {} });

    queue.cancelByAgent(agentId);

    const pending = queue.getPending();
    expect(pending).toHaveLength(0);
  });

  it('queue status is accurate', async () => {
    queue.setProcessor(async () => 'ok');

    queue.enqueue({ agentId, type: 'message', payload: {} });
    queue.enqueue({ agentId, type: 'message', payload: {} });

    await queue.processNext(); // completes

    const status = queue.getStatus();
    expect(status.pending).toBe(1);
    expect(status.completed).toBe(1);
  });

  it('completed job stores result', async () => {
    queue.setProcessor(async () => 'the response');

    const jobId = queue.enqueue({ agentId, type: 'message', payload: {} });
    await queue.processNext();

    const job = queue.getJob(jobId)!;
    expect(job.status).toBe('completed');
    expect(job.result).toBe('the response');
  });

  it('processNext returns null when no jobs', async () => {
    queue.setProcessor(async () => 'ok');
    const result = await queue.processNext();
    expect(result).toBeNull();
  });

  it('throws when no processor registered', async () => {
    queue.enqueue({ agentId, type: 'message', payload: {} });
    await expect(queue.processNext()).rejects.toThrow('No processor registered');
  });
});

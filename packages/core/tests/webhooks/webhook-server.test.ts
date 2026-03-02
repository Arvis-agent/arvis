import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebhookServer } from '../../src/webhooks/webhook-server.js';
import { QueueManager } from '../../src/queue/queue-manager.js';
import { AgentRegistry } from '../../src/agents/agent-registry.js';
import { setupTestDb, cleanupTestDb, createTestAgent } from '../helpers.js';
import type { ArvisDatabase } from '../../src/db/database.js';
import type { ArvisConfig } from '../../src/config.js';
import http from 'http';
import crypto from 'crypto';

function makeRequest(port: number, path: string, body: string, headers?: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

describe('WebhookServer', () => {
  let db: ArvisDatabase;
  let config: ArvisConfig;
  let webhookServer: WebhookServer;
  let queue: QueueManager;
  let agentId: number;
  const port = 15050 + Math.floor(Math.random() * 1000);

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    config = setup.config;
    queue = new QueueManager(db);
    webhookServer = new WebhookServer(db, queue);
    const registry = new AgentRegistry(db);
    agentId = createTestAgent(registry).id;
  });

  afterEach(async () => {
    await webhookServer.stop();
    cleanupTestDb(db, config);
  });

  it('triggers webhook and enqueues job', async () => {
    db.run(
      `INSERT INTO webhooks (path, agent_id, prompt_template, enabled) VALUES (?, ?, ?, 1)`,
      '/test-hook', agentId, 'Process webhook: {{payload}}',
    );

    webhookServer.start(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await makeRequest(port, '/test-hook', JSON.stringify({ event: 'push' }));
    expect(res.status).toBe(200);

    const pending = queue.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe('webhook');
  });

  it('returns 404 for unknown path', async () => {
    webhookServer.start(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await makeRequest(port, '/unknown', '{}');
    expect(res.status).toBe(404);
  });

  it('returns 401 for invalid signature', async () => {
    db.run(
      `INSERT INTO webhooks (path, agent_id, prompt_template, secret, enabled) VALUES (?, ?, ?, ?, 1)`,
      '/secure-hook', agentId, 'Secure: {{payload}}', 'my-secret',
    );

    webhookServer.start(port);
    await new Promise(r => setTimeout(r, 100));

    const res = await makeRequest(port, '/secure-hook', '{}', {
      'x-hub-signature-256': 'sha256=invalid',
    });
    expect(res.status).toBe(401);
  });

  it('accepts valid signature', async () => {
    const secret = 'test-secret';
    db.run(
      `INSERT INTO webhooks (path, agent_id, prompt_template, secret, enabled) VALUES (?, ?, ?, ?, 1)`,
      '/signed-hook', agentId, 'Signed: {{payload}}', secret,
    );

    webhookServer.start(port);
    await new Promise(r => setTimeout(r, 100));

    const body = JSON.stringify({ event: 'test' });
    const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

    const res = await makeRequest(port, '/signed-hook', body, {
      'x-hub-signature-256': sig,
    });
    expect(res.status).toBe(200);
  });

  it('increments trigger count', async () => {
    db.run(
      `INSERT INTO webhooks (path, agent_id, prompt_template, enabled) VALUES (?, ?, ?, 1)`,
      '/count-hook', agentId, 'Count: {{payload}}',
    );

    webhookServer.start(port);
    await new Promise(r => setTimeout(r, 100));

    await makeRequest(port, '/count-hook', '{}');
    await makeRequest(port, '/count-hook', '{}');

    const row = db.get<{ trigger_count: number }>('SELECT trigger_count FROM webhooks WHERE path = ?', '/count-hook');
    expect(row!.trigger_count).toBe(2);
  });
});

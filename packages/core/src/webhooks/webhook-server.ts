import http from 'http';
import crypto from 'crypto';
import type { ArvisDatabase } from '../db/database.js';
import type { QueueManager } from '../queue/queue-manager.js';
import type { WebhookRow } from '../db/schema.js';
import { createLogger } from '../logger.js';

const log = createLogger('webhooks');

/**
 * HTTP server that receives webhooks from external services
 * and routes them to agents via the queue.
 */
export class WebhookServer {
  private server: http.Server | null = null;

  constructor(
    private db: ArvisDatabase,
    private queue: QueueManager,
  ) {}

  /** Start the webhook server */
  start(port: number): void {
    this.server = http.createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });

    this.server.listen(port, () => {
      log.info({ port }, 'Webhook server started');
    });
  }

  /** Stop the webhook server */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          log.info('Webhook server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /** Handle an incoming HTTP request */
  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const webhook = this.db.get<WebhookRow>(
      'SELECT * FROM webhooks WHERE path = ? AND enabled = 1',
      req.url,
    );

    if (!webhook) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Webhook not found' }));
      return;
    }

    // Read body
    const body = await this.readBody(req);

    // Validate secret if configured
    if (webhook.secret) {
      const signature = req.headers['x-hub-signature-256'] as string
        || req.headers['x-webhook-signature'] as string;
      if (!this.validateSignature(body, webhook.secret, signature)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid signature' }));
        return;
      }
    }

    // Parse body
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      payload = body;
    }

    // Build prompt from template
    if (!webhook.prompt_template) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Webhook has no prompt template configured' }));
      return;
    }
    const prompt = webhook.prompt_template.replace('{{payload}}', JSON.stringify(payload));

    // Enqueue
    this.queue.enqueue({
      agentId: webhook.agent_id,
      type: 'webhook',
      payload: { prompt, channel: webhook.channel_id, platform: webhook.platform },
      priority: 5,
    });

    // Update trigger count
    this.db.run(
      `UPDATE webhooks SET last_triggered = datetime('now'), trigger_count = trigger_count + 1 WHERE id = ?`,
      webhook.id,
    );

    log.info({ path: webhook.path, agentId: webhook.agent_id }, 'Webhook triggered');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  private validateSignature(body: string, secret: string, signature?: string): boolean {
    if (!signature) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }
}

import http from 'http';
import crypto from 'crypto';
import { createLogger } from '../logger.js';
const log = createLogger('webhooks');
/**
 * HTTP server that receives webhooks from external services
 * and routes them to agents via the queue.
 */
export class WebhookServer {
    db;
    queue;
    server = null;
    constructor(db, queue) {
        this.db = db;
        this.queue = queue;
    }
    /** Start the webhook server */
    start(port) {
        this.server = http.createServer(async (req, res) => {
            await this.handleRequest(req, res);
        });
        this.server.listen(port, () => {
            log.info({ port }, 'Webhook server started');
        });
    }
    /** Stop the webhook server */
    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    log.info('Webhook server stopped');
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }
    /** Handle an incoming HTTP request */
    async handleRequest(req, res) {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
        }
        const webhook = this.db.get('SELECT * FROM webhooks WHERE path = ? AND enabled = 1', req.url);
        if (!webhook) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Webhook not found' }));
            return;
        }
        // Read body
        const body = await this.readBody(req);
        // Validate secret if configured
        if (webhook.secret) {
            const signature = req.headers['x-hub-signature-256']
                || req.headers['x-webhook-signature'];
            if (!this.validateSignature(body, webhook.secret, signature)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid signature' }));
                return;
            }
        }
        // Parse body
        let payload;
        try {
            payload = JSON.parse(body);
        }
        catch {
            payload = body;
        }
        // Build prompt from template
        const prompt = webhook.prompt_template.replace('{{payload}}', JSON.stringify(payload));
        // Enqueue
        this.queue.enqueue({
            agentId: webhook.agent_id,
            type: 'webhook',
            payload: { prompt, channel: webhook.channel_id, platform: webhook.platform },
            priority: 5,
        });
        // Update trigger count
        this.db.run(`UPDATE webhooks SET last_triggered = datetime('now'), trigger_count = trigger_count + 1 WHERE id = ?`, webhook.id);
        log.info({ path: webhook.path, agentId: webhook.agent_id }, 'Webhook triggered');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
    }
    readBody(req) {
        return new Promise((resolve, reject) => {
            let data = '';
            req.on('data', (chunk) => { data += chunk.toString(); });
            req.on('end', () => resolve(data));
            req.on('error', reject);
        });
    }
    validateSignature(body, secret, signature) {
        if (!signature)
            return false;
        const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length)
            return false;
        return crypto.timingSafeEqual(sigBuf, expBuf);
    }
}
//# sourceMappingURL=webhook-server.js.map
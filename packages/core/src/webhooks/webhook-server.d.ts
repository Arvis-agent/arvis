import http from 'http';
import type { ArvisDatabase } from '../db/database.js';
import type { QueueManager } from '../queue/queue-manager.js';
/**
 * HTTP server that receives webhooks from external services
 * and routes them to agents via the queue.
 */
export declare class WebhookServer {
    private db;
    private queue;
    private server;
    constructor(db: ArvisDatabase, queue: QueueManager);
    /** Start the webhook server */
    start(port: number): void;
    /** Stop the webhook server */
    stop(): Promise<void>;
    /** Handle an incoming HTTP request */
    handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
    private readBody;
    private validateSignature;
}
//# sourceMappingURL=webhook-server.d.ts.map
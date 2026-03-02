import http from 'http';
import crypto from 'crypto';
import { URLSearchParams } from 'url';
import type { MessageBus, IncomingMessage, OutgoingMessage } from '@arvis/core';

export interface SmsConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  /** Port for the Twilio webhook HTTP server. Default: 5080 */
  port?: number;
  /** Optional agent ID to route all SMS to a specific agent */
  defaultAgentId?: number | null;
}

/**
 * SMS connector via Twilio.
 *
 * Incoming: HTTP POST webhook from Twilio → bus 'message' event
 * Outgoing: bus 'send' (platform='sms') → Twilio REST API
 *
 * Configure Twilio webhook URL: http://your-host:5080/sms
 */
export class SmsConnector {
  private server: http.Server | null = null;
  private readonly port: number;
  private sendHandler: ((msg: OutgoingMessage) => void) | null = null;

  constructor(
    private bus: MessageBus,
    private config: SmsConfig,
  ) {
    this.port = config.port ?? 5080;
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err: unknown) => {
        console.error('[sms] request error', err);
        res.writeHead(500).end();
      });
    });

    this.sendHandler = (msg: OutgoingMessage) => {
      if (msg.platform !== 'sms') return;
      this.sendSms(msg.channelId, msg.content).catch((err: unknown) => {
        console.error('[sms] send error', err);
        this.bus.emit('error', err instanceof Error ? err : new Error(String(err)));
      });
    };
    this.bus.on('send', this.sendHandler);

    await new Promise<void>((resolve) => {
      this.server!.listen(this.port, resolve);
    });

    console.log(`[sms] Webhook server listening on port ${this.port}`);
  }

  async stop(): Promise<void> {
    if (this.sendHandler) { this.bus.off('send', this.sendHandler); this.sendHandler = null; }
    await new Promise<void>((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
    this.server = null;
  }

  // ─── Incoming webhook ──────────────────────────────────────────────────────

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== 'POST' || req.url !== '/sms') {
      res.writeHead(404).end();
      return;
    }

    const body = await readBody(req);

    // Validate Twilio signature
    if (!this.validateSignature(req, body)) {
      console.warn('[sms] Invalid Twilio signature — rejected');
      res.writeHead(403).end();
      return;
    }

    const params = new URLSearchParams(body);
    const from = params.get('From') ?? '';
    const msgSid = params.get('MessageSid') ?? crypto.randomUUID();
    const text = params.get('Body') ?? '';

    if (!from || !text) {
      res.writeHead(400).end();
      return;
    }

    const incoming: IncomingMessage = {
      id: msgSid,
      platform: 'sms',
      channelId: from,    // The sender's phone number acts as the channel
      userId: from,
      userName: from,
      content: text,
      timestamp: new Date(),
      metadata: {
        ...(this.config.defaultAgentId != null && { assignedAgentId: this.config.defaultAgentId }),
        twilioAccountSid: params.get('AccountSid'),
        toNumber: params.get('To'),
        numMedia: params.get('NumMedia'),
      },
    };

    this.bus.emit('message', incoming);

    // Twilio expects a TwiML response (even empty is fine)
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end('<Response></Response>');
  }

  private validateSignature(req: http.IncomingMessage, body: string): boolean {
    // Skip validation in dev if no auth token provided
    if (!this.config.authToken) return true;

    const signature = req.headers['x-twilio-signature'] as string | undefined;
    if (!signature) return false;

    // Reconstruct the full URL Twilio used
    const host = req.headers['host'] ?? 'localhost';
    const proto = (req.headers['x-forwarded-proto'] as string) ?? 'http';
    const url = `${proto}://${host}/sms`;

    // Build sorted param string from body
    const params = new URLSearchParams(body);
    const sortedKeys = Array.from(params.keys()).sort();
    const paramStr = sortedKeys.map((k) => `${k}${params.get(k) ?? ''}`).join('');

    const expected = crypto
      .createHmac('sha1', this.config.authToken)
      .update(url + paramStr)
      .digest('base64');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  // ─── Outgoing SMS ──────────────────────────────────────────────────────────

  private async sendSms(to: string, text: string): Promise<void> {
    // Split long messages to stay under SMS limits (1600 chars Twilio max)
    const chunks = chunkText(text, 1600);

    for (const chunk of chunks) {
      const body = new URLSearchParams({
        To: to,
        From: this.config.phoneNumber,
        Body: chunk,
      });

      const authHeader = 'Basic ' + Buffer.from(
        `${this.config.accountSid}:${this.config.authToken}`,
      ).toString('base64');

      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        },
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Twilio API error ${res.status}: ${err}`);
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}

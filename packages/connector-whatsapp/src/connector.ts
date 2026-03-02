import http from 'http';
import crypto from 'crypto';
import type { MessageBus } from '@arvis/core';
import type { IncomingMessage, OutgoingMessage } from '@arvis/core';
/** Transcribe audio via OpenAI Whisper. Returns null if key missing or fails. */
async function transcribeAudio(buf: Buffer, filename: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buf)]), filename);
    form.append('model', 'whisper-1');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    if (!res.ok) return null;
    const data = await res.json() as { text?: string };
    return data.text?.trim() || null;
  } catch { return null; }
}

const GRAPH_API = 'https://graph.facebook.com/v21.0';

/**
 * THIN adapter between WhatsApp Business Cloud API and the Message Bus.
 * Uses Meta's Graph API for sending, webhook for receiving.
 *
 * WhatsApp concepts:
 * - channelId = phone number in international format (e.g., "15551234567")
 * - userId = same as channelId (1:1 chats only, no group support in Cloud API)
 * - No threads, no buttons (only quick replies and list messages)
 * - Messages have a 4096 char limit
 * - Media requires separate upload/download via Graph API
 *
 * Setup:
 * 1. Create a Meta Business app at developers.facebook.com
 * 2. Add WhatsApp product, get phone number ID and access token
 * 3. Set webhook URL to your server (uses the main webhook server port)
 * 4. Set WHATSAPP_VERIFY_TOKEN to match webhook configuration
 */
export class WhatsAppConnector {
  private server: http.Server | null = null;
  private sendHandler: ((msg: OutgoingMessage) => void) | null = null;

  constructor(
    private bus: MessageBus,
    private config: {
      accessToken: string;
      phoneNumberId: string;
      verifyToken: string;
      webhookPort?: number;
      webhookPath?: string;
      defaultAgentId?: number | null;
    },
  ) {}

  /** Start the WhatsApp connector */
  async start(): Promise<void> {
    const port = this.config.webhookPort;
    const webhookPath = this.config.webhookPath || '/whatsapp';

    // Outgoing messages — store ref so we can remove it on stop()
    this.sendHandler = async (msg: OutgoingMessage) => {
      if (msg.platform !== 'whatsapp') return;
      try {
        await this.sendToWhatsApp(msg);
      } catch (err) {
        console.error('[whatsapp] send failed:', err instanceof Error ? err.message : err);
      }
    };
    this.bus.on('send', this.sendHandler);

    // If a dedicated webhook port is provided, start our own HTTP server
    // Otherwise, the user should route webhooks to us via the main webhook server
    if (port) {
      this.server = http.createServer((req, res) => {
        if (!req.url?.startsWith(webhookPath)) {
          res.writeHead(404);
          res.end();
          return;
        }

        if (req.method === 'GET') {
          this.handleVerification(req, res);
        } else if (req.method === 'POST') {
          this.handleWebhook(req, res);
        } else {
          res.writeHead(405);
          res.end();
        }
      });

      return new Promise((resolve) => {
        this.server!.listen(port, () => resolve());
      });
    }
  }

  /** Stop the connector — remove bus listeners before closing server */
  async stop(): Promise<void> {
    if (this.sendHandler) { this.bus.off('send', this.sendHandler); this.sendHandler = null; }
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle webhook verification (GET request from Meta).
   * Meta sends hub.mode, hub.verify_token, hub.challenge as query params.
   */
  handleVerification(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === this.config.verifyToken) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
    } else {
      res.writeHead(403);
      res.end();
    }
  }

  /**
   * Handle incoming webhook (POST from Meta).
   * Parses the WhatsApp Cloud API webhook payload.
   */
  handleWebhook(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      // Always respond 200 quickly (Meta requires it within 20s)
      res.writeHead(200);
      res.end();

      try {
        const payload = JSON.parse(body);
        this.processWebhookPayload(payload).catch(() => {});
      } catch {
        // Ignore malformed payloads
      }
    });
  }

  /** Parse WhatsApp Cloud API webhook payload */
  private async processWebhookPayload(payload: Record<string, unknown>): Promise<void> {
    const entry = payload.entry as Array<Record<string, unknown>> | undefined;
    if (!entry?.length) return;

    for (const e of entry) {
      const changes = e.changes as Array<Record<string, unknown>> | undefined;
      if (!changes?.length) continue;

      for (const change of changes) {
        if (change.field !== 'messages') continue;

        const value = change.value as Record<string, unknown>;
        const messages = value.messages as Array<Record<string, unknown>> | undefined;
        const contacts = value.contacts as Array<Record<string, unknown>> | undefined;

        if (!messages?.length) continue;

        for (const waMsg of messages) {
          const contact = contacts?.find(
            (c) => (c as Record<string, unknown>).wa_id === waMsg.from,
          ) as Record<string, unknown> | undefined;

          const profileName = contact?.profile
            ? String((contact.profile as Record<string, unknown>).name || '')
            : '';

          // Extract text content
          let content = '';
          const msgType = String(waMsg.type || '');

          if (msgType === 'text') {
            const textBody = waMsg.text as Record<string, unknown> | undefined;
            content = String(textBody?.body || '');
          } else if (msgType === 'audio') {
            // Attempt Whisper transcription for voice/audio messages
            const media = waMsg.audio as Record<string, unknown> | undefined;
            const mediaId = String(media?.id || '');
            content = String(media?.caption || '[Voice message]');
            if (mediaId) {
              try {
                const mediaUrl = await this.getMediaUrl(mediaId);
                if (mediaUrl) {
                  const res = await fetch(mediaUrl, {
                    headers: { Authorization: `Bearer ${this.config.accessToken}` },
                  });
                  if (res.ok) {
                    const buf = Buffer.from(await res.arrayBuffer());
                    const transcript = await transcribeAudio(buf, 'voice.ogg');
                    if (transcript) content = `[Voice]: "${transcript}"`;
                  }
                }
              } catch {
                // Transcription failed — keep placeholder
              }
            }
          } else if (msgType === 'image') {
            // Download image and embed base64 for vision models
            const media = waMsg.image as Record<string, unknown> | undefined;
            const mediaId = String(media?.id || '');
            content = String(media?.caption || '[Image]');
            let imageData: string | undefined;
            let imageMime = 'image/jpeg';
            if (mediaId) {
              try {
                const mediaUrl = await this.getMediaUrl(mediaId);
                if (mediaUrl) {
                  const res = await fetch(mediaUrl, {
                    headers: { Authorization: `Bearer ${this.config.accessToken}` },
                  });
                  if (res.ok) {
                    imageMime = res.headers.get('content-type') || 'image/jpeg';
                    imageData = Buffer.from(await res.arrayBuffer()).toString('base64');
                  }
                }
              } catch { /* keep placeholder */ }
            }
            const imgMsg: IncomingMessage = {
              id: String(waMsg.id || crypto.randomUUID()),
              platform: 'whatsapp',
              channelId: String(waMsg.from || ''),
              userId: String(waMsg.from || ''),
              userName: profileName || String(waMsg.from || ''),
              content,
              attachments: imageData ? [{
                id: mediaId || 'image',
                filename: 'image.jpg',
                url: '',
                contentType: imageMime,
                data: imageData,
              }] : undefined,
              metadata: {
                isDM: true,
                messageType: msgType,
                assignedAgentId: this.config.defaultAgentId ?? undefined,
              },
              timestamp: waMsg.timestamp
                ? new Date(Number(waMsg.timestamp) * 1000)
                : new Date(),
            };
            this.bus.emit('message', imgMsg);
            continue;
          } else if (msgType === 'document' || msgType === 'video') {
            const media = waMsg[msgType] as Record<string, unknown> | undefined;
            content = String(media?.caption || `[${msgType}]`);
          } else if (msgType === 'reaction') {
            const reaction = waMsg.reaction as Record<string, unknown> | undefined;
            content = `[Reaction: ${reaction?.emoji || ''}]`;
          } else if (msgType === 'interactive') {
            const interactive = waMsg.interactive as Record<string, unknown> | undefined;
            if (interactive?.type === 'button_reply') {
              const btnReply = interactive.button_reply as Record<string, unknown>;
              this.bus.emit('button_click', {
                buttonId: String(btnReply?.id || ''),
                userId: String(waMsg.from || ''),
                userName: profileName || String(waMsg.from || ''),
                channelId: String(waMsg.from || ''),
                platform: 'whatsapp',
                data: { title: btnReply?.title },
                timestamp: new Date(),
              });
              continue; // Don't emit as regular message
            }
            const listReply = interactive?.list_reply as Record<string, unknown> | undefined;
            content = String(listReply?.title || '[interactive]');
          } else {
            content = `[${msgType}]`;
          }

          const msg: IncomingMessage = {
            id: String(waMsg.id || crypto.randomUUID()),
            platform: 'whatsapp',
            channelId: String(waMsg.from || ''),
            userId: String(waMsg.from || ''),
            userName: profileName || String(waMsg.from || ''),
            content,
            metadata: {
              isDM: true, // WhatsApp Cloud API is always 1:1
              messageType: msgType,
              assignedAgentId: this.config.defaultAgentId ?? undefined,
            },
            timestamp: waMsg.timestamp
              ? new Date(Number(waMsg.timestamp) * 1000)
              : new Date(),
          };

          this.bus.emit('message', msg);
        }
      }
    }
  }

  /** Send a message via WhatsApp Cloud API */
  private async sendToWhatsApp(msg: OutgoingMessage): Promise<void> {
    const url = `${GRAPH_API}/${this.config.phoneNumberId}/messages`;

    // Split long messages (WhatsApp limit: 4096 chars)
    const chunks = splitMessage(msg.content, 4096);

    for (const chunk of chunks) {
      const payload: Record<string, unknown> = {
        messaging_product: 'whatsapp',
        to: msg.channelId,
        type: 'text',
        text: { body: chunk },
      };

      // Reply context
      if (msg.replyTo) {
        payload.context = { message_id: msg.replyTo };
      }

      await this.graphApiRequest(url, payload);
    }

    // Send buttons as interactive message (WhatsApp supports max 3 buttons)
    if (msg.buttons?.length) {
      const buttons = msg.buttons.slice(0, 3).map(btn => ({
        type: 'reply',
        reply: {
          id: btn.data ? JSON.stringify(btn.data) : btn.id,
          title: btn.label.substring(0, 20), // WhatsApp button title limit: 20 chars
        },
      }));

      await this.graphApiRequest(url, {
        messaging_product: 'whatsapp',
        to: msg.channelId,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Choose an option:' },
          action: { buttons },
        },
      });
    }
  }

  /** Get download URL for a WhatsApp media object */
  private async getMediaUrl(mediaId: string): Promise<string | null> {
    try {
      const res = await fetch(`${GRAPH_API}/${mediaId}`, {
        headers: { Authorization: `Bearer ${this.config.accessToken}` },
      });
      if (!res.ok) return null;
      const data = await res.json() as { url?: string };
      return data.url ?? null;
    } catch {
      return null;
    }
  }

  /** Make a request to the Graph API */
  private async graphApiRequest(url: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WhatsApp API error ${response.status}: ${errorText}`);
    }
  }
}

/** Split a message at max length, trying to break at newlines */
function splitMessage(content: string, maxLength: number): string[] {
  if (content.length <= maxLength) return [content];

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt === -1 || splitAt < maxLength / 2) {
      splitAt = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitAt === -1 || splitAt < maxLength / 2) {
      splitAt = maxLength;
    }

    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }

  return chunks;
}

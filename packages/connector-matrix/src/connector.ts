import crypto from 'crypto';
import type { MessageBus } from '@arvis/core';
import type { IncomingMessage, OutgoingMessage } from '@arvis/core';

/**
 * THIN adapter between Matrix Client-Server API and the Message Bus.
 * Uses the /sync long-polling endpoint — no external dependencies needed.
 *
 * Matrix concepts:
 * - channelId = room_id (e.g., "!abc123:matrix.org")
 * - userId = Matrix user ID (e.g., "@user:matrix.org")
 * - Everything is an event; messages are m.room.message events
 * - Bot should send m.notice (not m.text) to avoid triggering other bots
 * - Rooms can be E2EE (this connector doesn't handle encryption)
 *
 * Setup:
 * 1. Create a Matrix account for the bot on your homeserver
 * 2. Get an access token via POST /_matrix/client/v3/login
 * 3. Invite the bot to rooms it should monitor
 * 4. The bot auto-joins rooms on invite
 */
export class MatrixConnector {
  private syncToken: string | null = null;
  private running = false;
  private botUserId: string;
  private sendHandler: ((msg: OutgoingMessage) => void) | null = null;

  constructor(
    private bus: MessageBus,
    private config: {
      homeserverUrl: string;
      accessToken: string;
      userId?: string;
      defaultAgentId?: number | null;
    },
  ) {
    // Strip trailing slash from homeserver URL
    this.config.homeserverUrl = config.homeserverUrl.replace(/\/+$/, '');
    this.botUserId = config.userId || '';
  }

  /** Start the Matrix connector */
  async start(): Promise<void> {
    // Resolve bot user ID if not provided
    if (!this.botUserId) {
      const whoami = await this.matrixRequest('GET', '/_matrix/client/v3/account/whoami');
      this.botUserId = String(whoami.user_id);
    }

    // Outgoing messages — store ref so we can remove it on stop()
    this.sendHandler = async (msg: OutgoingMessage) => {
      if (msg.platform !== 'matrix') return;
      try {
        await this.sendToMatrix(msg);
      } catch (err) {
        console.error('[matrix] send failed:', err instanceof Error ? err.message : err);
      }
    };
    this.bus.on('send', this.sendHandler);

    // Start sync loop
    this.running = true;

    // Do an initial sync to get the since token (don't process old messages)
    const initialSync = await this.matrixRequest('GET', '/_matrix/client/v3/sync', {
      timeout: '0',
      filter: JSON.stringify({
        room: { timeline: { limit: 0 } },
      }),
    });
    this.syncToken = String(initialSync.next_batch);

    // Start long-polling loop
    this.syncLoop();
  }

  /** Stop the connector — remove bus listeners before stopping sync loop */
  async stop(): Promise<void> {
    if (this.sendHandler) { this.bus.off('send', this.sendHandler); this.sendHandler = null; }
    this.running = false;
  }

  /** Long-polling sync loop */
  private async syncLoop(): Promise<void> {
    while (this.running) {
      try {
        const params: Record<string, string> = {
          timeout: '30000',
        };
        if (this.syncToken) {
          params.since = this.syncToken;
        }

        const syncRaw = await this.matrixRequest('GET', '/_matrix/client/v3/sync', params);
        const sync = syncRaw as {
          next_batch: string;
          rooms?: {
            join?: Record<string, Record<string, unknown>>;
            invite?: Record<string, unknown>;
          };
        };
        this.syncToken = sync.next_batch;

        // Process joined room events
        const rooms = sync.rooms?.join;
        if (rooms) {
          for (const [roomId, roomData] of Object.entries(rooms)) {
            const timeline = roomData.timeline as { events?: Array<Record<string, unknown>> } | undefined;
            if (!timeline?.events) continue;

            for (const event of timeline.events) {
              if (event.type !== 'm.room.message') continue;
              if (event.sender === this.botUserId) continue; // Skip own messages

              const content = event.content as Record<string, unknown>;
              const msgtype = String(content?.msgtype || '');

              // Only process text messages (skip notices from other bots)
              if (msgtype !== 'm.text') continue;

              const msg: IncomingMessage = {
                id: String(event.event_id || crypto.randomUUID()),
                platform: 'matrix',
                channelId: roomId,
                userId: String(event.sender || ''),
                userName: String(event.sender || '').split(':')[0].replace('@', ''),
                content: String(content?.body || ''),
                metadata: {
                  isDM: false, // Could check room membership count
                  msgtype,
                  roomId,
                  assignedAgentId: this.config.defaultAgentId ?? undefined,
                },
                timestamp: event.origin_server_ts
                  ? new Date(Number(event.origin_server_ts))
                  : new Date(),
              };

              this.bus.emit('message', msg);
            }
          }
        }

        // Auto-join rooms on invite
        const invites = sync.rooms?.invite;
        if (invites) {
          for (const roomId of Object.keys(invites)) {
            try {
              await this.matrixRequest('POST', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/join`);
            } catch {
              // Ignore join failures
            }
          }
        }
      } catch (err) {
        // On sync error, wait a bit before retrying
        if (this.running) {
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }
  }

  /** Send a message to a Matrix room */
  private async sendToMatrix(msg: OutgoingMessage): Promise<void> {
    const roomId = encodeURIComponent(msg.channelId);

    // Split long messages (Matrix has no hard limit but keep reasonable)
    const chunks = splitMessage(msg.content, 8000);

    for (const chunk of chunks) {
      const txnId = crypto.randomUUID();
      await this.matrixRequest(
        'PUT',
        `/_matrix/client/v3/rooms/${roomId}/send/m.room.message/${txnId}`,
        undefined,
        {
          msgtype: 'm.notice', // Use notice to avoid triggering other bots
          body: chunk,
          // Also send formatted HTML for rich text
          format: 'org.matrix.custom.html',
          formatted_body: chunk
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/\n/g, '<br/>'),
        },
      );
    }

    // Send embeds as separate messages
    if (msg.embeds?.length) {
      for (const embed of msg.embeds) {
        let text = '';
        let html = '';

        if (embed.title) {
          text += `${embed.title}\n`;
          html += `<strong>${escapeHtml(embed.title)}</strong><br/>`;
        }
        if (embed.description) {
          text += `${embed.description}\n`;
          html += `${escapeHtml(embed.description)}<br/>`;
        }
        if (embed.fields) {
          for (const f of embed.fields) {
            text += `${f.name}: ${f.value}\n`;
            html += `<strong>${escapeHtml(f.name)}:</strong> ${escapeHtml(f.value)}<br/>`;
          }
        }
        if (embed.footer) {
          text += `\n${embed.footer}`;
          html += `<br/><em>${escapeHtml(embed.footer)}</em>`;
        }

        if (text.trim()) {
          const txnId = crypto.randomUUID();
          await this.matrixRequest(
            'PUT',
            `/_matrix/client/v3/rooms/${roomId}/send/m.room.message/${txnId}`,
            undefined,
            {
              msgtype: 'm.notice',
              body: text.trim(),
              format: 'org.matrix.custom.html',
              formatted_body: html.trim(),
            },
          );
        }
      }
    }
  }

  /** Make a request to the Matrix Client-Server API */
  private async matrixRequest(
    method: string,
    path: string,
    queryParams?: Record<string, string>,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let url = `${this.config.homeserverUrl}${path}`;

    if (queryParams) {
      const params = new URLSearchParams(queryParams);
      url += `?${params.toString()}`;
    }

    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Matrix API error ${response.status}: ${errorText}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

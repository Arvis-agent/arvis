import { App, LogLevel } from '@slack/bolt';
import type { MessageBus } from '@arvis/core';
import type { IncomingMessage, OutgoingMessage, ButtonClick, Attachment } from '@arvis/core';

/**
 * THIN adapter between Slack Bolt and the Message Bus.
 * Uses Socket Mode — no public URL required. Perfect for self-hosted.
 *
 * Slack concepts:
 * - channelId = Slack channel ID (C..., D... for DMs, G... for groups)
 * - userId = Slack user ID (U...)
 * - Threads use ts (timestamp) as thread ID
 * - Messages have a 40,000 char limit (but 4000 recommended for readability)
 * - Markdown uses mrkdwn format (not standard Markdown)
 */
export class SlackConnector {
  private app: App;
  private sendHandler: ((msg: OutgoingMessage) => void) | null = null;

  constructor(
    private bus: MessageBus,
    private config: {
      botToken: string;
      appToken: string;
      signingSecret?: string;
      defaultAgentId?: number | null;
    },
  ) {
    this.app = new App({
      token: config.botToken,
      appToken: config.appToken,
      socketMode: true,
      signingSecret: config.signingSecret || 'not-used-in-socket-mode',
      logLevel: LogLevel.WARN,
    });
  }

  /** Start the Slack connector */
  async start(): Promise<void> {
    // Incoming messages
    this.app.message(async ({ message, say }) => {
      // Skip bot messages and message_changed events
      if (!('user' in message) || ('bot_id' in message)) return;
      if (message.subtype) return;

      const msg = this.parseMessage(message as unknown as Record<string, unknown>);
      this.bus.emit('message', msg);
    });

    // Button/action interactions (Block Kit interactive elements)
    this.app.action(/.*/, async ({ action, body, ack }) => {
      await ack();

      if (body.type !== 'block_actions' || !('user' in body)) return;

      const click: ButtonClick = {
        buttonId: 'action_id' in action ? action.action_id : '',
        userId: body.user.id,
        userName: body.user.name || body.user.id,
        channelId: body.channel?.id || '',
        platform: 'slack',
        data: 'value' in action ? this.tryParseJson(action.value as string) : undefined,
        timestamp: new Date(),
      };

      this.bus.emit('button_click', click);
    });

    // Outgoing messages — store ref so we can remove it on stop()
    this.sendHandler = async (msg: OutgoingMessage) => {
      if (msg.platform !== 'slack') return;
      try {
        await this.sendToSlack(msg);
      } catch (err) {
        console.error('[slack] send failed:', err instanceof Error ? err.message : err);
      }
    };
    this.bus.on('send', this.sendHandler);

    // Typing indicator: Slack bots can't show typing indicators — skip

    await this.app.start();
  }

  /** Stop the connector — remove bus listeners before stopping app */
  async stop(): Promise<void> {
    if (this.sendHandler) { this.bus.off('send', this.sendHandler); this.sendHandler = null; }
    await this.app.stop();
  }

  /** Convert a Slack message to IncomingMessage */
  private parseMessage(message: Record<string, unknown>): IncomingMessage {
    const attachments: Attachment[] = [];

    // Handle file shares
    const files = message.files as Array<Record<string, unknown>> | undefined;
    if (files?.length) {
      for (const file of files) {
        attachments.push({
          id: String(file.id || ''),
          filename: String(file.name || 'file'),
          url: String(file.url_private || ''),
          contentType: String(file.mimetype || ''),
          size: Number(file.size || 0),
        });
      }
    }

    const channelId = String(message.channel || '');
    const isDM = channelId.startsWith('D');

    return {
      id: String(message.ts || Date.now()),
      platform: 'slack',
      channelId,
      userId: String(message.user || ''),
      userName: String(message.user || 'Unknown'), // Resolved by Slack client
      content: String(message.text || ''),
      attachments: attachments.length > 0 ? attachments : undefined,
      replyTo: message.thread_ts ? String(message.thread_ts) : undefined,
      metadata: {
        threadTs: message.thread_ts,
        isDM,
        team: message.team,
        assignedAgentId: this.config.defaultAgentId ?? undefined,
      },
      timestamp: message.ts
        ? new Date(parseFloat(String(message.ts)) * 1000)
        : new Date(),
    };
  }

  /** Convert OutgoingMessage to Slack and send */
  private async sendToSlack(msg: OutgoingMessage): Promise<void> {
    const blocks: Record<string, unknown>[] = [];

    // Main text as a section block
    if (msg.content) {
      // Split long messages (Slack section blocks: 3000 chars max)
      const chunks = splitMessage(msg.content, 3000);
      for (const chunk of chunks) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: chunk },
        });
      }
    }

    // Embeds → Slack attachment blocks
    if (msg.embeds?.length) {
      for (const embed of msg.embeds) {
        const fields: Record<string, unknown>[] = [];
        if (embed.fields) {
          for (const f of embed.fields) {
            fields.push({
              type: 'mrkdwn',
              text: `*${f.name}*\n${f.value}`,
            });
          }
        }

        if (embed.title || embed.description) {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                embed.title ? `*${embed.title}*` : '',
                embed.description || '',
              ].filter(Boolean).join('\n'),
            },
            ...(fields.length > 0 ? { fields } : {}),
          });
        }

        if (embed.footer) {
          blocks.push({
            type: 'context',
            elements: [{ type: 'mrkdwn', text: embed.footer }],
          });
        }
      }
    }

    // Buttons → Slack action blocks
    if (msg.buttons?.length) {
      const STYLE_MAP: Record<string, string | undefined> = {
        primary: 'primary',
        danger: 'danger',
        success: 'primary',
        secondary: undefined,
      };

      blocks.push({
        type: 'actions',
        elements: msg.buttons.map(btn => ({
          type: 'button',
          text: { type: 'plain_text', text: btn.label },
          action_id: btn.id,
          value: btn.data ? JSON.stringify(btn.data) : btn.id,
          ...(STYLE_MAP[btn.style] ? { style: STYLE_MAP[btn.style] } : {}),
        })),
      });
    }

    const payload: Record<string, unknown> = {
      channel: msg.channelId,
      text: msg.content, // Fallback text for notifications
    };

    if (blocks.length > 0) {
      payload.blocks = blocks;
    }

    if (msg.replyTo) {
      payload.thread_ts = msg.replyTo;
    }

    await this.app.client.chat.postMessage(payload as unknown as Parameters<typeof this.app.client.chat.postMessage>[0]);
  }

  private tryParseJson(str: string | undefined): Record<string, unknown> | undefined {
    if (!str) return undefined;
    try {
      return JSON.parse(str);
    } catch {
      return { id: str };
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

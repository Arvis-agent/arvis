import { ImapFlow, type ImapFlowOptions, type FetchMessageObject } from 'imapflow';
import nodemailer, { type Transporter } from 'nodemailer';
import { simpleParser, type ParsedMail } from 'mailparser';
import type { MessageBus, IncomingMessage, OutgoingMessage } from '@arvis/core';

export interface EmailConfig {
  /** IMAP settings for receiving email */
  imap: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
  };
  /** SMTP settings for sending email */
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
  };
  /** Email address displayed as From address */
  fromAddress: string;
  /** IMAP mailbox to monitor. Default: INBOX */
  mailbox?: string;
  /** How often to poll for new mail in ms. Default: 30000 (30s) */
  pollIntervalMs?: number;
  /** Optional agent ID to route all emails to a specific agent */
  defaultAgentId?: number | null;
}

/**
 * Email connector (IMAP poll + SMTP send).
 *
 * Incoming: polls IMAP inbox for unseen messages → bus 'message' event
 * Outgoing: bus 'send' (platform='email') → SMTP via nodemailer
 *
 * The channelId for email messages is the sender's address (reply-to or from).
 * To reply, emit an OutgoingMessage with channelId = sender email address
 * and metadata.subject = subject line.
 */
export class EmailConnector {
  private imap: ImapFlow | null = null;
  private smtp: Transporter | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private sendHandler: ((msg: OutgoingMessage) => void) | null = null;
  private readonly mailbox: string;
  private readonly pollIntervalMs: number;

  constructor(
    private bus: MessageBus,
    private config: EmailConfig,
  ) {
    this.mailbox = config.mailbox ?? 'INBOX';
    this.pollIntervalMs = config.pollIntervalMs ?? 30_000;
  }

  async start(): Promise<void> {
    // Set up SMTP transporter
    this.smtp = nodemailer.createTransport({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: this.config.smtp.secure,
      auth: {
        user: this.config.smtp.user,
        pass: this.config.smtp.password,
      },
    });

    this.sendHandler = (msg: OutgoingMessage) => {
      if (msg.platform !== 'email') return;
      const subject = (msg as OutgoingMessage & { metadata?: { subject?: string } }).metadata?.subject
        ?? 'Message from Arvis';
      this.sendEmail(msg.channelId, subject, msg.content).catch((err: unknown) => {
        console.error('[email] send error', err);
        this.bus.emit('error', err instanceof Error ? err : new Error(String(err)));
      });
    };
    this.bus.on('send', this.sendHandler);

    // Initial poll + set up interval
    await this.poll();
    this.pollTimer = setInterval(() => {
      this.poll().catch((err: unknown) => {
        console.error('[email] poll error', err);
      });
    }, this.pollIntervalMs);

    console.log(`[email] Polling ${this.config.imap.user} every ${this.pollIntervalMs / 1000}s`);
  }

  async stop(): Promise<void> {
    if (this.sendHandler) { this.bus.off('send', this.sendHandler); this.sendHandler = null; }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await this.imap?.logout().catch(() => {});
    this.imap = null;
    this.smtp?.close?.();
    this.smtp = null;
  }

  // ─── IMAP polling ──────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    const imapOptions: ImapFlowOptions = {
      host: this.config.imap.host,
      port: this.config.imap.port,
      secure: this.config.imap.secure,
      auth: {
        user: this.config.imap.user,
        pass: this.config.imap.password,
      },
      logger: false,
    };

    const client = new ImapFlow(imapOptions);

    try {
      await client.connect();
      await client.mailboxOpen(this.mailbox);

      // Fetch all UNSEEN messages
      const messages: FetchMessageObject[] = [];
      for await (const msg of client.fetch({ seen: false }, { envelope: true, source: true })) {
        messages.push(msg);
      }

      for (const raw of messages) {
        if (!raw.source) continue;

        const parsed: ParsedMail = await simpleParser(raw.source);

        const from = parsed.from?.value?.[0];
        const fromAddress = from?.address ?? 'unknown@unknown';
        const fromName = from?.name || fromAddress;
        const subject = parsed.subject ?? '(no subject)';
        const text = parsed.text ?? (typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]+>/g, ' ').trim() : '') ?? '';

        if (!text) continue;

        const incoming: IncomingMessage = {
          id: String(raw.uid ?? raw.seq),
          platform: 'email',
          channelId: fromAddress,    // Reply to sender's address
          userId: fromAddress,
          userName: fromName,
          content: `[Subject: ${subject}]\n\n${text}`,
          timestamp: parsed.date ?? new Date(),
          metadata: {
            ...(this.config.defaultAgentId != null && { assignedAgentId: this.config.defaultAgentId }),
            subject,
            from: fromAddress,
            to: Array.isArray(parsed.to) ? parsed.to.map((a: { text: string }) => a.text).join(', ') : parsed.to?.text,
            messageId: parsed.messageId,
          },
        };

        this.bus.emit('message', incoming);

        // Mark as seen
        if (raw.uid) {
          await client.messageFlagsAdd({ uid: raw.uid }, ['\\Seen']).catch(() => {});
        }
      }
    } catch (err) {
      // Don't crash — log and retry next interval
      console.error('[email] IMAP poll failed:', err instanceof Error ? err.message : err);
    } finally {
      await client.logout().catch(() => {});
    }
  }

  // ─── SMTP sending ──────────────────────────────────────────────────────────

  private async sendEmail(to: string, subject: string, body: string): Promise<void> {
    if (!this.smtp) throw new Error('SMTP not initialized');

    await this.smtp.sendMail({
      from: this.config.fromAddress,
      to,
      subject,
      text: body,
    });
  }
}

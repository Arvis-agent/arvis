import type { ArvisDatabase } from '../db/database.js';
import type { MessageBus } from '../bus/message-bus.js';
import { createLogger } from '../logger.js';

const log = createLogger('connector-manager');

interface BotRow {
  id: number;
  name: string;
  platform: string;
  token: string;
  extra_config: string | null;
  agent_id: number | null;
  enabled: number;
  status: string;
  last_error: string | null;
}

interface RunningConnector {
  stop: () => Promise<void>;
}

/**
 * Manages all bot instances stored in the `bot_instances` DB table.
 *
 * - Starts enabled bots on startup (and any added while running via poll)
 * - Stops bots that are disabled or deleted
 * - Seeds env-var bots into DB on first run (so they appear in the dashboard)
 * - Polls DB every 30s for changes (new bots, toggled enabled, deletions)
 */
interface BotConfig { token: string; agent_id: number | null; extra_config: string | null }

export class ConnectorManager {
  private running = new Map<number, RunningConnector>();
  private runningConfig = new Map<number, BotConfig>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: ArvisDatabase,
    private bus: MessageBus,
  ) {}

  /**
   * Seed env-var-configured bots into the DB if not already present.
   * This ensures existing deployments see their bots in the dashboard immediately.
   */
  seedFromEnv(env: NodeJS.ProcessEnv = process.env): void {
    const upsert = (name: string, platform: string, token: string, extra?: Record<string, string>) => {
      if (!token) return;
      const exists = this.db.get<{ id: number }>(
        'SELECT id FROM bot_instances WHERE platform = ? AND token = ?', platform, token,
      );
      if (!exists) {
        this.db.run(
          `INSERT INTO bot_instances (name, platform, token, extra_config, enabled)
           VALUES (?, ?, ?, ?, 1)`,
          name, platform, token,
          extra ? JSON.stringify(extra) : null,
        );
        log.info({ name, platform }, 'Seeded bot from env var');
      }
    };

    if (env.DISCORD_TOKEN)
      upsert('Discord Bot', 'discord', env.DISCORD_TOKEN);

    if (env.TELEGRAM_BOT_TOKEN)
      upsert('Telegram Bot', 'telegram', env.TELEGRAM_BOT_TOKEN);

    if (env.SLACK_BOT_TOKEN && env.SLACK_APP_TOKEN)
      upsert('Slack Bot', 'slack', env.SLACK_BOT_TOKEN, {
        app_token:      env.SLACK_APP_TOKEN    || '',
        signing_secret: env.SLACK_SIGNING_SECRET || '',
      });

    if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID)
      upsert('WhatsApp Bot', 'whatsapp', env.WHATSAPP_ACCESS_TOKEN, {
        phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID || '',
        verify_token:    env.WHATSAPP_VERIFY_TOKEN    || 'arvis-verify',
      });

    if (env.MATRIX_ACCESS_TOKEN && env.MATRIX_HOMESERVER_URL)
      upsert('Matrix Bot', 'matrix', env.MATRIX_ACCESS_TOKEN, {
        homeserver_url: env.MATRIX_HOMESERVER_URL || '',
        user_id:        env.MATRIX_USER_ID        || '',
      });
  }

  /** Start all enabled bots and begin polling for changes */
  async startAll(): Promise<void> {
    await this.sync();
    this.pollTimer = setInterval(() => {
      this.sync().catch((err) => log.error({ err }, 'Connector poll error'));
    }, 30_000);
  }

  /** Stop all running bots and cancel polling */
  async stopAll(): Promise<void> {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    for (const [id] of this.running) {
      await this.stopOne(id);
    }
  }

  /** Sync running connectors with DB state */
  private async sync(): Promise<void> {
    const rows = this.db.all<BotRow>('SELECT * FROM bot_instances');

    const dbIds = new Set(rows.map((r) => r.id));

    // Stop connectors that were deleted from DB
    for (const [id] of this.running) {
      if (!dbIds.has(id)) await this.stopOne(id);
    }

    for (const row of rows) {
      const isRunning = this.running.has(row.id);

      if (!row.enabled) {
        if (isRunning) await this.stopOne(row.id);
        continue;
      }

      // Restart if config changed (token, agent assignment, extra_config)
      if (isRunning) {
        const prev = this.runningConfig.get(row.id);
        const configChanged =
          prev?.token !== row.token ||
          prev?.agent_id !== row.agent_id ||
          prev?.extra_config !== row.extra_config;
        if (configChanged) {
          log.info({ id: row.id, name: row.name }, 'Config changed — restarting bot');
          await this.stopOne(row.id);
          await this.startOne(row);
        }
      } else {
        await this.startOne(row);
      }
    }
  }

  private async startOne(bot: BotRow): Promise<void> {
    const extra: Record<string, string> = bot.extra_config ? JSON.parse(bot.extra_config) : {};

    try {
      let connector: { start(): Promise<void>; stop(): Promise<void> };

      switch (bot.platform) {
        case 'discord': {
          const { DiscordConnector } = await import('@arvis/connector-discord');
          const allowedChannels = extra.allowed_channels
            ? extra.allowed_channels.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined;
          connector = new DiscordConnector(this.bus, { token: bot.token, defaultAgentId: bot.agent_id, allowedChannels });
          break;
        }
        case 'telegram': {
          const { TelegramConnector } = await import('@arvis/connector-telegram');
          connector = new TelegramConnector(this.bus, { token: bot.token, defaultAgentId: bot.agent_id });
          break;
        }
        case 'slack': {
          const { SlackConnector } = await import('@arvis/connector-slack');
          connector = new SlackConnector(this.bus, {
            botToken:       bot.token,
            appToken:       extra.app_token      || '',
            signingSecret:  extra.signing_secret || '',
            defaultAgentId: bot.agent_id,
          });
          break;
        }
        case 'whatsapp': {
          const { WhatsAppConnector } = await import('@arvis/connector-whatsapp');
          connector = new WhatsAppConnector(this.bus, {
            accessToken:    bot.token,
            phoneNumberId:  extra.phone_number_id || '',
            verifyToken:    extra.verify_token    || 'arvis-verify',
            webhookPath:    extra.webhook_path,
            defaultAgentId: bot.agent_id,
          });
          break;
        }
        case 'matrix': {
          const { MatrixConnector } = await import('@arvis/connector-matrix');
          connector = new MatrixConnector(this.bus, {
            homeserverUrl:  extra.homeserver_url || '',
            accessToken:    bot.token,
            userId:         extra.user_id        || '',
            defaultAgentId: bot.agent_id,
          });
          break;
        }
        case 'sms': {
          const { SmsConnector } = await import('@arvis/connector-sms');
          connector = new SmsConnector(this.bus, {
            accountSid:     bot.token,
            authToken:      extra.auth_token   || '',
            phoneNumber:    extra.phone_number || '',
            port:           extra.port ? parseInt(extra.port, 10) : undefined,
            defaultAgentId: bot.agent_id,
          });
          break;
        }
        case 'email': {
          const { EmailConnector } = await import('@arvis/connector-email');
          connector = new EmailConnector(this.bus, {
            imap: {
              host:     extra.imap_host || '',
              port:     parseInt(extra.imap_port || '993', 10),
              secure:   extra.imap_secure !== 'false',
              user:     extra.imap_user  || '',
              password: bot.token,
            },
            smtp: {
              host:     extra.smtp_host || extra.imap_host || '',
              port:     parseInt(extra.smtp_port || '587', 10),
              secure:   extra.smtp_secure === 'true',
              user:     extra.smtp_user  || extra.imap_user || '',
              password: extra.smtp_pass  || bot.token,
            },
            fromAddress:    extra.from_address || extra.imap_user || '',
            defaultAgentId: bot.agent_id,
          });
          break;
        }
        default:
          throw new Error(`Unknown platform: ${bot.platform}`);
      }

      await connector.start();
      this.running.set(bot.id, { stop: () => connector.stop() });
      this.runningConfig.set(bot.id, { token: bot.token, agent_id: bot.agent_id, extra_config: bot.extra_config });
      this.db.run(
        'UPDATE bot_instances SET status = ?, last_error = NULL WHERE id = ?',
        'running', bot.id,
      );
      log.info({ id: bot.id, name: bot.name, platform: bot.platform }, 'Bot started');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.db.run(
        'UPDATE bot_instances SET status = ?, last_error = ? WHERE id = ?',
        'error', msg, bot.id,
      );
      log.error({ err, id: bot.id, name: bot.name }, 'Failed to start bot');
    }
  }

  private async stopOne(id: number): Promise<void> {
    const inst = this.running.get(id);
    if (!inst) return;
    try {
      await inst.stop();
    } catch (err) {
      log.warn({ err, id }, 'Error stopping bot');
    }
    this.running.delete(id);
    this.runningConfig.delete(id);
    // Only update status if row still exists
    const exists = this.db.get<{ id: number }>('SELECT id FROM bot_instances WHERE id = ?', id);
    if (exists) {
      this.db.run('UPDATE bot_instances SET status = ? WHERE id = ?', 'stopped', id);
    }
    log.info({ id }, 'Bot stopped');
  }

  /** Immediately start a bot by ID (used after dashboard creates one) */
  async startById(id: number): Promise<void> {
    const row = this.db.get<BotRow>('SELECT * FROM bot_instances WHERE id = ?', id);
    if (row && row.enabled) await this.startOne(row);
  }

  /** Immediately stop a bot by ID (used before dashboard deletes one) */
  async stopById(id: number): Promise<void> {
    await this.stopOne(id);
  }

  isRunning(id: number): boolean {
    return this.running.has(id);
  }
}

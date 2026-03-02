import { loadConfig } from './config.js';
import type { ArvisConfig } from './config.js';
import { ArvisDatabase } from './db/database.js';
import initialMigration from './db/migrations/001-initial.js';
import multiProviderMigration from './db/migrations/002-multi-provider.js';
import botInstancesMigration from './db/migrations/003-bot-instances.js';
import { ConnectorManager } from './connectors/connector-manager.js';
import { MessageBus } from './bus/message-bus.js';
import type { IncomingMessage, ButtonClick, Attachment } from './bus/types.js';
import { AgentRegistry } from './agents/agent-registry.js';
import { Router } from './agents/router.js';
import { ConductorParser, CONDUCTOR_SYSTEM_PROMPT } from './agents/conductor.js';
import { ConversationManager } from './conversation/conversation-manager.js';
import { ContextBuilder } from './conversation/context-builder.js';
import { MemoryManager } from './memory/memory-manager.js';
import { AgentRunner } from './runner/agent-runner.js';
import { CLIRunner } from './runner/cli-runner.js';
import { ProviderRunner } from './runner/provider-runner.js';
import { AccountManager } from './runner/account-manager.js';
import { QueueManager } from './queue/queue-manager.js';
import { Scheduler } from './scheduler/scheduler.js';
import { WebhookServer } from './webhooks/webhook-server.js';
import { BillingManager } from './billing/billing-manager.js';
import { SkillLoader } from './skills/skill-loader.js';
import { SkillInjector } from './skills/skill-injector.js';
import { parseDelegations, stripDelegations } from './agents/delegation-parser.js';
import { BUILT_IN_TOOL_NAMES } from './tools/tool-executor.js';
import { loadPlugins } from './plugins/plugin-loader.js';
import type { QueueJob, JobPayload } from './queue/types.js';
import { assertJobPayload } from './queue/types.js';
import { createLogger } from './logger.js';
import path from 'path';
import fs from 'fs';

const log = createLogger('arvis');

/** True if an attachment is an image (by MIME type or file extension) */
function isImage(att: Attachment): boolean {
  if (att.contentType) return att.contentType.startsWith('image/');
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(att.filename);
}

/** Safely extract a string from an unknown value */
function asString(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val : fallback;
}

/**
 * Main orchestrator. Wires everything together.
 * This is the entry point for the Arvis platform.
 */
export class Arvis {
  readonly config: ArvisConfig;
  readonly db: ArvisDatabase;
  readonly bus: MessageBus;
  readonly registry: AgentRegistry;
  readonly router: Router;
  readonly conversationManager: ConversationManager;
  readonly contextBuilder: ContextBuilder;
  readonly memoryManager: MemoryManager;
  readonly runner: AgentRunner;
  readonly queue: QueueManager;
  readonly scheduler: Scheduler;
  readonly webhookServer: WebhookServer;
  readonly billingManager: BillingManager;
  readonly conductorParser: ConductorParser;
  readonly skillLoader: SkillLoader;
  readonly skillInjector: SkillInjector;
  readonly accountManager: AccountManager;
  readonly connectorManager: ConnectorManager;
  private backupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(configPath?: string) {
    this.config = loadConfig(configPath);
    this.db = new ArvisDatabase(this.config);
    this.bus = new MessageBus();

    // Initialize all components
    this.registry = new AgentRegistry(this.db);
    this.router = new Router(this.registry, this.bus, this.config);
    this.memoryManager = new MemoryManager(this.db);
    this.conversationManager = new ConversationManager(this.db);
    this.contextBuilder = new ContextBuilder(this.db, this.memoryManager, this.conversationManager);
    this.accountManager = new AccountManager(this.db);

    const cliRunner = new CLIRunner();
    const providerRunner = new ProviderRunner();
    this.runner = new AgentRunner(cliRunner, providerRunner, this.accountManager);

    this.queue = new QueueManager(this.db);
    this.scheduler = new Scheduler(this.db, this.queue);
    this.webhookServer = new WebhookServer(this.db, this.queue);
    this.billingManager = new BillingManager(this.db);
    this.conductorParser = new ConductorParser();

    const skillsDir = path.join(process.cwd(), 'skills');
    this.skillLoader = new SkillLoader(skillsDir, this.db);
    this.skillInjector = new SkillInjector(this.db);
    this.connectorManager = new ConnectorManager(this.db, this.bus);
  }

  /** Start the Arvis platform */
  async start(): Promise<void> {
    // 1. Run database migrations
    this.db.migrate([initialMigration, multiProviderMigration, botInstancesMigration]);

    // 2. Sync accounts from config
    this.accountManager.syncFromConfig(this.config.accounts);

    // 3. Ensure Conductor agent exists
    this.ensureConductor();

    // 4. Load plugins (custom tools, connectors, etc.)
    const pluginsDir = path.join(process.cwd(), 'plugins');
    await loadPlugins(pluginsDir);

    // 5. Load skills
    this.skillLoader.loadAll();

    // 6. Wire up the message pipeline
    this.bus.on('message', async (msg) => {
      try {
        await this.handleMessage(msg);
      } catch (err) {
        log.error({ err, msgId: msg.id }, 'Failed to handle message');
        // Send error response back to user
        this.bus.emit('send', {
          channelId: msg.channelId,
          platform: msg.platform,
          content: 'Sorry, I encountered an error processing your message. Please try again.',
        });
      }
    });

    this.bus.on('button_click', async (click) => {
      try {
        await this.handleButtonClick(click);
      } catch (err) {
        log.error({ err }, 'Failed to handle button click');
      }
    });

    // 6. Set up queue processor
    this.queue.setProcessor(async (job) => {
      return this.processJob(job);
    });

    // 7. Start queue processor
    this.queue.start();

    // 8. Start scheduler
    this.scheduler.start();

    // 9. Start webhook server
    if (this.config.webhook.port) {
      this.webhookServer.start(this.config.webhook.port);
    }

    // 10. Schedule daily DB backup (runs once immediately then every 24h)
    this.runBackup();
    this.backupInterval = setInterval(() => this.runBackup(), 24 * 60 * 60_000);

    log.info('Arvis is online.');
  }

  /** Create a timestamped backup, keep last 7 */
  private async runBackup(): Promise<void> {
    try {
      const backupDir = path.join(this.config.dataDir, 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

      const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const dest = path.join(backupDir, `arvis-${stamp}.db`);
      await this.db.backup(dest);

      // Prune: keep only the 7 most recent backups
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('arvis-') && f.endsWith('.db'))
        .sort()
        .reverse();
      for (const old of files.slice(7)) {
        fs.unlinkSync(path.join(backupDir, old));
      }
    } catch (err) {
      log.error({ err }, 'DB backup failed');
    }
  }

  /** Stop the Arvis platform gracefully */
  async stop(): Promise<void> {
    log.info('Shutting down...');
    if (this.backupInterval) { clearInterval(this.backupInterval); this.backupInterval = null; }
    this.queue.stop();
    this.scheduler.stop();

    // Drain in-flight jobs (max 30s wait)
    const deadline = Date.now() + 30_000;
    while (this.queue.activeJobs > 0 && Date.now() < deadline) {
      log.info({ activeJobs: this.queue.activeJobs }, 'Waiting for jobs to complete...');
      await new Promise(r => setTimeout(r, 1000));
    }
    if (this.queue.activeJobs > 0) {
      this.db.run("UPDATE queue SET status = 'failed', error = 'Shutdown timeout' WHERE status = 'running'");
      log.warn({ count: this.queue.activeJobs }, 'Force-killed running jobs on shutdown');
    }

    await this.connectorManager.stopAll();
    await this.webhookServer.stop();
    this.db.close();
    log.info('Arvis shut down cleanly.');
  }

  private async handleMessage(msg: IncomingMessage): Promise<void> {
    // 1. Route to agent
    const agent = this.router.route(msg);
    if (!agent) return;

    // 2. Permission check
    if (!this.router.canUserMessage(msg.userId, agent)) {
      log.debug({ userId: msg.userId, agentSlug: agent.slug }, 'Permission denied');
      return;
    }

    // 3. Show typing indicator
    this.bus.emit('typing', { channelId: msg.channelId, platform: msg.platform });

    // 4. Get/create conversation
    const conversation = this.conversationManager.getOrCreate(
      agent.id, msg.platform, msg.channelId, msg.userId, msg.userName,
    );

    // 5. Store user message (capture ID so we can skip it in the history loop below)
    const userMsg = this.conversationManager.addMessage(conversation.id, 'user', msg.content);

    // 6. Check if compaction needed (model-aware threshold)
    const compactionThreshold = this.contextBuilder.getCompactionThreshold(agent.model);
    if (this.conversationManager.shouldCompact(conversation.id, compactionThreshold)) {
      const compactionResult = await this.conversationManager.compact(
        conversation.id,
        // Summarize function
        async (text) => {
          const result = await this.runner.executeWithMode({
            prompt: `Summarize this conversation concisely. Include: decisions made, current state, user preferences, action items, and any context needed to continue naturally.\n\n${text}`,
            agent,
          }, 'fast');
          return result.content;
        },
        10,
        // Pre-compaction memory flush — extract key facts before they're lost
        async (text) => {
          const result = await this.runner.executeWithMode({
            prompt: `Extract the most important facts from this conversation that should be permanently remembered. Output each fact on its own line using tags like:
[MEMORY:sticky] Critical constraint or decision that must never be forgotten
[MEMORY:user_preference] User preference or working style
[MEMORY:project_context] Project detail, architecture decision, or technical context
[MEMORY:learned_pattern] Pattern or lesson learned

Only extract truly important, durable facts. Skip transient chat. Output ONLY the tagged lines, nothing else.

${text}`,
            agent,
          }, 'fast');
          // Parse and save the extracted memories
          this.memoryManager.parseAndSave(agent.id, result.content, conversation.id);
          return result.content;
        },
      );
      log.info({
        conversationId: conversation.id,
        tokensSaved: compactionResult.tokensSaved,
        hadMemoryFlush: !!compactionResult.extractedFacts,
      }, 'Compaction completed');
    }

    // 7. Build context
    const context = this.contextBuilder.build(agent, conversation, msg);

    // 8. Build full prompt with conversation history
    const historyParts: string[] = [];
    if (context.summaryText) {
      historyParts.push(`[Previous conversation summary]\n${context.summaryText}\n`);
    }
    for (const m of context.messages) {
      // Skip the message we just stored (avoid duplicating it at the end)
      if (m.id === userMsg.id) continue;
      historyParts.push(`[${m.role}]: ${m.content}`);
    }
    const fullPrompt = historyParts.length > 0
      ? `${historyParts.join('\n')}\n\n[user]: ${msg.content}`
      : msg.content;

    // 9. Collect images from attachments for vision-capable models
    const images: { base64: string; mimeType: string }[] = [];
    if (msg.attachments) {
      for (const att of msg.attachments) {
        if (!isImage(att)) continue;
        if (att.data) {
          // Pre-fetched by connector (Telegram, WhatsApp)
          images.push({ base64: att.data, mimeType: att.contentType || 'image/jpeg' });
        } else if (att.url.startsWith('http')) {
          // Real URL (Discord CDN) — download now
          try {
            const res = await fetch(att.url);
            if (res.ok) {
              const mimeType = res.headers.get('content-type') || 'image/jpeg';
              const buf = Buffer.from(await res.arrayBuffer());
              images.push({ base64: buf.toString('base64'), mimeType });
            }
          } catch { /* Skip failed downloads */ }
        }
      }
    }

    // 10. Determine priority
    const priority = this.calculatePriority(msg, agent);

    // 11. Enqueue
    this.queue.enqueue({
      agentId: agent.id,
      type: 'message',
      payload: {
        conversationId: conversation.id,
        systemPrompt: context.systemPrompt,
        prompt: fullPrompt,
        channelId: msg.channelId,
        platform: msg.platform,
        messageId: msg.id,
        images: images.length > 0 ? images : undefined,
      },
      priority,
    });
  }

  private async handleButtonClick(click: ButtonClick): Promise<void> {
    // Route button click as a message
    const syntheticMsg: IncomingMessage = {
      id: `btn-${click.buttonId}-${Date.now()}`,
      platform: click.platform as IncomingMessage['platform'],
      channelId: click.channelId,
      userId: click.userId,
      userName: click.userName,
      content: `[Button clicked: ${click.buttonId}]${click.data ? ' ' + JSON.stringify(click.data) : ''}`,
      timestamp: click.timestamp,
    };
    await this.handleMessage(syntheticMsg);
  }

  private async processJob(job: QueueJob): Promise<string> {
    assertJobPayload(job.payload);
    const payload = job.payload;

    const agent = this.registry.getById(job.agentId);
    if (!agent) throw new Error(`Agent ${job.agentId} not found`);

    const prompt = asString(payload.prompt);
    if (!prompt) throw new Error(`Job ${job.id} has no prompt`);

    log.info({ jobId: job.id, agentSlug: agent.slug, prompt: prompt.substring(0, 100) }, 'Processing job');

    // Inject relevant skills into system prompt
    const baseSystemPrompt = payload.systemPrompt;
    let enrichedSystemPrompt = baseSystemPrompt;
    try {
      const skills = this.skillInjector.getRelevantSkills(prompt, agent);
      if (skills.length > 0) {
        const skillText = this.skillInjector.formatForPrompt(skills);
        enrichedSystemPrompt = baseSystemPrompt
          ? `${baseSystemPrompt}\n\n${skillText}`
          : skillText;
        log.debug({ skills: skills.map(s => s.slug) }, 'Skills injected into prompt');
      }
    } catch (err) {
      log.warn({ err }, 'Failed to inject skills');
    }

    // Scheduled jobs (heartbeat/cron): force terse, no-explanation mode.
    // The agent must execute and post the result only — no tutorials, no asking
    // questions, no explaining what tools to use, no listing "options".
    // If truly blocked (missing API key, network error), post a single short error line.
    if (job.type === 'heartbeat' || job.type === 'cron') {
      const scheduledPrefix = `SCHEDULED TASK — EXECUTE ONLY.
Do NOT ask questions. Do NOT explain what you are doing. Do NOT list options or instructions.
Do NOT mention plugins, tools, or code files. Do NOT say you "created" anything.
Just execute the task and post the result as a short message (1-3 lines max).
If you cannot complete the task, post a single line: "Error: [reason]" — nothing else.\n\n`;
      enrichedSystemPrompt = scheduledPrefix + (enrichedSystemPrompt || '');
    }

    // Determine which built-in tools to enable for this agent
    const agentTools = (agent.allowedTools || []).filter(t => BUILT_IN_TOOL_NAMES.includes(t));

    // Use a per-conversation working directory so --continue stays bound to the
    // same conversation. Without this, all conversations for an agent share one CWD
    // and --continue can bleed context across them.
    const convId = payload.conversationId;
    let sessionPath: string | undefined;
    if (convId) {
      sessionPath = path.join(this.config.dataDir, 'sessions', String(convId));
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    let result;
    try {
      result = await this.runner.execute({
        prompt,
        agent,
        systemPrompt: enrichedSystemPrompt,
        images: payload.images,
        tools: agentTools.length > 0 ? agentTools : undefined,
        projectPath: sessionPath,
      });
      log.info({ jobId: job.id, contentLength: result.content.length, mode: result.mode, contentPreview: result.content.substring(0, 300) }, 'Runner returned');
    } catch (err) {
      log.error({ jobId: job.id, err }, 'Runner failed');
      throw err;
    }

    // Parse memory tags
    const savedMemory = this.memoryManager.parseAndSave(
      agent.id,
      result.content,
      payload.conversationId || 0,
    );

    // Parse conductor actions (if this is the conductor)
    if (agent.role === 'conductor') {
      const actions = this.conductorParser.parse(result.content);
      log.info({ actionCount: actions.length, actions: actions.map(a => a.type) }, 'Conductor actions parsed');
      if (actions.length > 0) {
        const results = await this.conductorParser.execute(actions, this.registry, {
          createClient: (data) => {
            this.billingManager.createClient({
              name: data.name as string,
              slug: data.slug as string,
              plan: (data.plan as 'per_task' | 'monthly' | 'prepaid') || 'per_task',
            });
          },
          createCron: (data) => {
            const cronAgentSlug = data.agent as string;
            const cronAgent = this.registry.getBySlug(cronAgentSlug);
            if (!cronAgent) throw new Error(`Agent "${cronAgentSlug}" not found for cron`);
            const channelId = data.channel != null ? String(data.channel) : null;
            const platform = data.platform ? String(data.platform) : 'discord';
            this.db.run(
              `INSERT INTO cron_jobs (agent_id, name, schedule, prompt, channel_id, platform)
               VALUES (?, ?, ?, ?, ?, ?)`,
              cronAgent.id,
              String(data.name || 'Cron Job'),
              String(data.schedule || '* * * * *'),
              String(data.prompt || ''),
              channelId,
              platform,
            );
            log.info({ agentSlug: cronAgentSlug, name: data.name, schedule: data.schedule, channelId, platform }, 'Cron job created');
          },
          createHeartbeat: (data) => {
            const hbAgentSlug = data.agent as string;
            const hbAgent = this.registry.getBySlug(hbAgentSlug);
            if (!hbAgent) throw new Error(`Agent "${hbAgentSlug}" not found for heartbeat`);
            const channelId = data.channel != null ? String(data.channel) : null;
            const platform = data.platform ? String(data.platform) : 'discord';
            log.info({ hbAgentSlug, channelId, platform, data: JSON.stringify(data) }, 'Creating heartbeat with data');
            this.db.run(
              `INSERT INTO heartbeat_configs (agent_id, name, prompt, schedule, channel_id, platform)
               VALUES (?, ?, ?, ?, ?, ?)`,
              hbAgent.id,
              String(data.name || 'Heartbeat'),
              String(data.prompt || ''),
              String(data.schedule || 'every 60s'),
              channelId,
              platform,
            );
            log.info({ agentSlug: hbAgentSlug, name: data.name, schedule: data.schedule, channelId, platform }, 'Heartbeat created');
          },
        });
        for (const r of results) {
          log.info({ type: r.action.type, success: r.success, error: r.error }, 'Conductor action result');
        }
      }
    }

    // Handle delegation markers — spawn sub-jobs for other agents
    const delegations = parseDelegations(result.content);
    for (const delegation of delegations) {
      const targetAgent = this.registry.getBySlug(delegation.agentSlug);
      if (!targetAgent) {
        log.warn({ slug: delegation.agentSlug }, 'Delegation target agent not found');
        continue;
      }

      const targetChannel = payload.channelId || payload.channel;
      const targetPlatform = payload.platform;

      this.queue.enqueue({
        agentId: targetAgent.id,
        type: 'message',
        payload: {
          prompt: delegation.task,
          channelId: targetChannel,
          platform: targetPlatform,
          // No conversationId — starts a fresh context for the sub-task
        },
        priority: 4, // Slightly below normal user messages
      });

      log.info({ fromAgent: agent.slug, toAgent: delegation.agentSlug, task: delegation.task.substring(0, 100) }, 'Delegation spawned');
    }

    // Strip tags from response (memory tags, conductor actions, delegation markers)
    const cleanResponse = this.memoryManager.stripTags(
      stripDelegations(
        agent.role === 'conductor'
          ? this.conductorParser.stripActions(result.content)
          : result.content,
      ),
    );

    // Store assistant message
    if (payload.conversationId) {
      this.conversationManager.addMessage(
        payload.conversationId,
        'assistant',
        cleanResponse,
      );
    }

    // Send response — handle both "channelId" (from messages) and "channel" (from scheduler)
    const targetChannel = payload.channelId || payload.channel;
    const targetPlatform = payload.platform;
    log.info({ targetChannel, targetPlatform, jobType: job.type }, 'Sending response');
    if (targetChannel && targetPlatform) {
      this.bus.emit('send', {
        channelId: targetChannel,
        platform: targetPlatform,
        content: cleanResponse,
        replyTo: payload.messageId,
      });
    } else {
      log.warn({ targetChannel, targetPlatform, payload: JSON.stringify(payload).substring(0, 200) }, 'No target channel/platform for response');
    }

    return cleanResponse;
  }

  private calculatePriority(msg: IncomingMessage, agent: { role: string }): number {
    if (msg.userId === this.config.discord.ownerId) return 1;
    if (agent.role === 'conductor') return 3;
    return 5;
  }

  private ensureConductor(): void {
    // Already have a conductor by role — nothing to do
    try {
      this.registry.getConductor();
      return;
    } catch { /* no conductor by role */ }

    // Slug exists but wrong role (e.g. leftover from previous run) — fix role in-place
    const existing = this.registry.getBySlug('conductor');
    if (existing) {
      this.registry.update('conductor', { role: 'conductor' as import('./agents/agent.js').AgentRole });
      log.info('Conductor agent role corrected');
      return;
    }

    this.registry.create({
      slug: 'conductor',
      name: 'Conductor',
      role: 'conductor',
      description: 'Main agent — manages all other agents and system configuration',
      allowedTools: ['Bash(*)', 'Read', 'Write', 'Edit'],
      systemPrompt: CONDUCTOR_SYSTEM_PROMPT,
      channels: this.config.discord.conductorChannel
        ? [{ platform: 'discord', channelId: this.config.discord.conductorChannel, isPrimary: true, permissions: 'full' as const }]
        : [],
    });
    log.info('Conductor agent created');
  }
}

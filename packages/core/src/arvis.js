import { loadConfig } from './config.js';
import { ArvisDatabase } from './db/database.js';
import initialMigration from './db/migrations/001-initial.js';
import multiProviderMigration from './db/migrations/002-multi-provider.js';
import { MessageBus } from './bus/message-bus.js';
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
import { createLogger } from './logger.js';
import path from 'path';
const log = createLogger('arvis');
/** Safely extract a string from an unknown value */
function asString(val, fallback = '') {
    return typeof val === 'string' ? val : fallback;
}
/**
 * Main orchestrator. Wires everything together.
 * This is the entry point for the Arvis platform.
 */
export class Arvis {
    config;
    db;
    bus;
    registry;
    router;
    conversationManager;
    contextBuilder;
    memoryManager;
    runner;
    queue;
    scheduler;
    webhookServer;
    billingManager;
    conductorParser;
    skillLoader;
    skillInjector;
    accountManager;
    constructor(configPath) {
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
    }
    /** Start the Arvis platform */
    async start() {
        // 1. Run database migrations
        this.db.migrate([initialMigration, multiProviderMigration]);
        // 2. Sync accounts from config
        this.accountManager.syncFromConfig(this.config.accounts);
        // 3. Ensure Conductor agent exists
        this.ensureConductor();
        // 4. Load skills
        this.skillLoader.loadAll();
        // 5. Wire up the message pipeline
        this.bus.on('message', async (msg) => {
            try {
                await this.handleMessage(msg);
            }
            catch (err) {
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
            }
            catch (err) {
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
        log.info('Arvis is online.');
    }
    /** Stop the Arvis platform gracefully */
    async stop() {
        log.info('Shutting down...');
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
        await this.webhookServer.stop();
        this.db.close();
        log.info('Arvis shut down cleanly.');
    }
    async handleMessage(msg) {
        // 1. Route to agent
        const agent = this.router.route(msg);
        if (!agent)
            return;
        // 2. Permission check
        if (!this.router.canUserMessage(msg.userId, agent)) {
            log.debug({ userId: msg.userId, agentSlug: agent.slug }, 'Permission denied');
            return;
        }
        // 3. Show typing indicator
        this.bus.emit('typing', { channelId: msg.channelId, platform: msg.platform });
        // 4. Get/create conversation
        const conversation = this.conversationManager.getOrCreate(agent.id, msg.platform, msg.channelId, msg.userId, msg.userName);
        // 5. Store user message
        this.conversationManager.addMessage(conversation.id, 'user', msg.content);
        // 6. Check if compaction needed (model-aware threshold)
        const compactionThreshold = this.contextBuilder.getCompactionThreshold(agent.model);
        if (this.conversationManager.shouldCompact(conversation.id, compactionThreshold)) {
            const compactionResult = await this.conversationManager.compact(conversation.id, 
            // Summarize function
            async (text) => {
                const result = await this.runner.executeWithMode({
                    prompt: `Summarize this conversation concisely. Include: decisions made, current state, user preferences, action items, and any context needed to continue naturally.\n\n${text}`,
                    agent,
                }, 'fast');
                return result.content;
            }, 10, 
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
            });
            log.info({
                conversationId: conversation.id,
                tokensSaved: compactionResult.tokensSaved,
                hadMemoryFlush: !!compactionResult.extractedFacts,
            }, 'Compaction completed');
        }
        // 7. Build context
        const context = this.contextBuilder.build(agent, conversation, msg);
        // 8. Build full prompt with conversation history
        const historyParts = [];
        if (context.summaryText) {
            historyParts.push(`[Previous conversation summary]\n${context.summaryText}\n`);
        }
        for (const m of context.messages) {
            // Skip the current message (it's already in context.messages as the last user msg)
            if (m.content === msg.content && m.role === 'user')
                continue;
            historyParts.push(`[${m.role}]: ${m.content}`);
        }
        const fullPrompt = historyParts.length > 0
            ? `${historyParts.join('\n')}\n\n[user]: ${msg.content}`
            : msg.content;
        // 9. Determine priority
        const priority = this.calculatePriority(msg, agent);
        // 10. Enqueue
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
            },
            priority,
        });
    }
    async handleButtonClick(click) {
        // Route button click as a message
        const syntheticMsg = {
            id: `btn-${click.buttonId}-${Date.now()}`,
            platform: click.platform,
            channelId: click.channelId,
            userId: click.userId,
            userName: click.userName,
            content: `[Button clicked: ${click.buttonId}]${click.data ? ' ' + JSON.stringify(click.data) : ''}`,
            timestamp: click.timestamp,
        };
        await this.handleMessage(syntheticMsg);
    }
    async processJob(job) {
        const payload = job.payload;
        const agent = this.registry.getAll().find(a => a.id === job.agentId);
        if (!agent)
            throw new Error(`Agent ${job.agentId} not found`);
        const prompt = asString(payload.prompt);
        if (!prompt)
            throw new Error(`Job ${job.id} has no prompt`);
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
        }
        catch (err) {
            log.warn({ err }, 'Failed to inject skills');
        }
        let result;
        try {
            result = await this.runner.execute({
                prompt,
                agent,
                systemPrompt: enrichedSystemPrompt,
            });
            log.info({ jobId: job.id, contentLength: result.content.length, mode: result.mode, contentPreview: result.content.substring(0, 300) }, 'Runner returned');
        }
        catch (err) {
            log.error({ jobId: job.id, err }, 'Runner failed');
            throw err;
        }
        // Parse memory tags
        const savedMemory = this.memoryManager.parseAndSave(agent.id, result.content, payload.conversationId || 0);
        // Parse conductor actions (if this is the conductor)
        if (agent.role === 'conductor') {
            const actions = this.conductorParser.parse(result.content);
            log.info({ actionCount: actions.length, actions: actions.map(a => a.type) }, 'Conductor actions parsed');
            if (actions.length > 0) {
                const results = await this.conductorParser.execute(actions, this.registry, {
                    createClient: (data) => {
                        this.billingManager.createClient({
                            name: data.name,
                            slug: data.slug,
                            plan: data.plan || 'per_task',
                        });
                    },
                    createCron: (data) => {
                        const cronAgentSlug = data.agent;
                        const cronAgent = this.registry.getBySlug(cronAgentSlug);
                        if (!cronAgent)
                            throw new Error(`Agent "${cronAgentSlug}" not found for cron`);
                        const channelId = data.channel != null ? String(data.channel) : null;
                        const platform = data.platform ? String(data.platform) : 'discord';
                        this.db.run(`INSERT INTO cron_jobs (agent_id, name, schedule, prompt, channel_id, platform)
               VALUES (?, ?, ?, ?, ?, ?)`, cronAgent.id, String(data.name || 'Cron Job'), String(data.schedule || '* * * * *'), String(data.prompt || ''), channelId, platform);
                        log.info({ agentSlug: cronAgentSlug, name: data.name, schedule: data.schedule, channelId, platform }, 'Cron job created');
                    },
                    createHeartbeat: (data) => {
                        const hbAgentSlug = data.agent;
                        const hbAgent = this.registry.getBySlug(hbAgentSlug);
                        if (!hbAgent)
                            throw new Error(`Agent "${hbAgentSlug}" not found for heartbeat`);
                        const channelId = data.channel != null ? String(data.channel) : null;
                        const platform = data.platform ? String(data.platform) : 'discord';
                        log.info({ hbAgentSlug, channelId, platform, data: JSON.stringify(data) }, 'Creating heartbeat with data');
                        this.db.run(`INSERT INTO heartbeat_configs (agent_id, name, prompt, schedule, channel_id, platform)
               VALUES (?, ?, ?, ?, ?, ?)`, hbAgent.id, String(data.name || 'Heartbeat'), String(data.prompt || ''), String(data.schedule || 'every 60s'), channelId, platform);
                        log.info({ agentSlug: hbAgentSlug, name: data.name, schedule: data.schedule, channelId, platform }, 'Heartbeat created');
                    },
                });
                for (const r of results) {
                    log.info({ type: r.action.type, success: r.success, error: r.error }, 'Conductor action result');
                }
            }
        }
        // Strip tags from response
        const cleanResponse = this.memoryManager.stripTags(agent.role === 'conductor'
            ? this.conductorParser.stripActions(result.content)
            : result.content);
        // Store assistant message
        if (payload.conversationId) {
            this.conversationManager.addMessage(payload.conversationId, 'assistant', cleanResponse);
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
        }
        else {
            log.warn({ targetChannel, targetPlatform, payload: JSON.stringify(payload).substring(0, 200) }, 'No target channel/platform for response');
        }
        return cleanResponse;
    }
    calculatePriority(msg, agent) {
        if (msg.userId === this.config.discord.ownerId)
            return 1;
        if (agent.role === 'conductor')
            return 3;
        return 5;
    }
    ensureConductor() {
        try {
            this.registry.getConductor();
        }
        catch {
            this.registry.create({
                slug: 'conductor',
                name: 'Conductor',
                role: 'conductor',
                description: 'Main agent — manages all other agents and system configuration',
                allowedTools: ['Bash(*)', 'Read', 'Write', 'Edit'],
                systemPrompt: CONDUCTOR_SYSTEM_PROMPT,
                channels: this.config.discord.conductorChannel
                    ? [{ platform: 'discord', channelId: this.config.discord.conductorChannel, isPrimary: true, permissions: 'full' }]
                    : [],
            });
            log.info('Conductor agent created');
        }
    }
}
//# sourceMappingURL=arvis.js.map
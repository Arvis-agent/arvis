import type { ArvisConfig } from './config.js';
import { ArvisDatabase } from './db/database.js';
import { MessageBus } from './bus/message-bus.js';
import { AgentRegistry } from './agents/agent-registry.js';
import { Router } from './agents/router.js';
import { ConductorParser } from './agents/conductor.js';
import { ConversationManager } from './conversation/conversation-manager.js';
import { ContextBuilder } from './conversation/context-builder.js';
import { MemoryManager } from './memory/memory-manager.js';
import { AgentRunner } from './runner/agent-runner.js';
import { AccountManager } from './runner/account-manager.js';
import { QueueManager } from './queue/queue-manager.js';
import { Scheduler } from './scheduler/scheduler.js';
import { WebhookServer } from './webhooks/webhook-server.js';
import { BillingManager } from './billing/billing-manager.js';
import { SkillLoader } from './skills/skill-loader.js';
import { SkillInjector } from './skills/skill-injector.js';
/**
 * Main orchestrator. Wires everything together.
 * This is the entry point for the Arvis platform.
 */
export declare class Arvis {
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
    constructor(configPath?: string);
    /** Start the Arvis platform */
    start(): Promise<void>;
    /** Stop the Arvis platform gracefully */
    stop(): Promise<void>;
    private handleMessage;
    private handleButtonClick;
    private processJob;
    private calculatePriority;
    private ensureConductor;
}
//# sourceMappingURL=arvis.d.ts.map
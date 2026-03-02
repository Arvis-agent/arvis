import type { ArvisDatabase } from '../db/database.js';
import type { Agent, AgentConfig, AgentRole, ChannelBinding } from './agent.js';
/**
 * CRUD + lookup for agents. SQLite-backed.
 * Manages agents and their channel bindings.
 */
export declare class AgentRegistry {
    private db;
    constructor(db: ArvisDatabase);
    /** Create a new agent with optional channel bindings */
    create(config: AgentConfig): Agent;
    /** Update an existing agent */
    update(slug: string, changes: Partial<AgentConfig>): Agent;
    /** Delete an agent and its channel bindings (cascade) */
    delete(slug: string): void;
    /** Get agent by slug, or null */
    getBySlug(slug: string): Agent | null;
    /** Get agent bound to a specific channel, or null */
    getByChannel(platform: string, channelId: string): Agent | null;
    /** Get all agents with a given role */
    getByRole(role: AgentRole): Agent[];
    /** Get all agents */
    getAll(): Agent[];
    /** Get the Conductor agent. Always returns an agent (throws if not found). */
    getConductor(): Agent;
    /** Bind a channel to an agent */
    bindChannel(agentSlug: string, binding: ChannelBinding): void;
    /** Unbind a channel from an agent */
    unbindChannel(agentSlug: string, platform: string, channelId: string): void;
    private bindChannelInternal;
    private hydrate;
}
//# sourceMappingURL=agent-registry.d.ts.map
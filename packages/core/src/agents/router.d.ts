import type { AgentRegistry } from './agent-registry.js';
import type { Agent } from './agent.js';
import type { MessageBus } from '../bus/message-bus.js';
import type { IncomingMessage } from '../bus/types.js';
import type { ArvisConfig } from '../config.js';
/**
 * Routes incoming messages to the correct agent.
 * Listens to bus 'message' events, determines which agent handles it.
 */
export declare class Router {
    private registry;
    private bus;
    private config;
    constructor(registry: AgentRegistry, bus: MessageBus, config: ArvisConfig);
    /**
     * Determines which agent should handle this message.
     *
     * Logic:
     * 1. Channel is bound to an agent -> route there
     * 2. Message mentions an agent by name -> route there
     * 3. Message is in conductor channel -> route to conductor
     * 4. Message is a DM (channelId starts with "dm-") -> route to conductor
     * 5. No match -> return null (ignore)
     */
    route(msg: IncomingMessage): Agent | null;
    /**
     * Check if a user has permission to message an agent.
     * Owner (from config) can message any agent.
     */
    canUserMessage(userId: string, agent: Agent): boolean;
}
//# sourceMappingURL=router.d.ts.map
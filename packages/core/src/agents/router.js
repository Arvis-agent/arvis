import { createLogger } from '../logger.js';
const log = createLogger('router');
/**
 * Routes incoming messages to the correct agent.
 * Listens to bus 'message' events, determines which agent handles it.
 */
export class Router {
    registry;
    bus;
    config;
    constructor(registry, bus, config) {
        this.registry = registry;
        this.bus = bus;
        this.config = config;
    }
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
    route(msg) {
        // 1. Channel binding
        const byChannel = this.registry.getByChannel(msg.platform, msg.channelId);
        if (byChannel && byChannel.status === 'active') {
            log.debug({ agent: byChannel.slug, reason: 'channel_binding' }, 'Routed message');
            return byChannel;
        }
        // 2. Agent mention by name
        const agents = this.registry.getAll();
        for (const agent of agents) {
            if (agent.status !== 'active')
                continue;
            const mentionPattern = new RegExp(`@${agent.name}\\b`, 'i');
            if (mentionPattern.test(msg.content)) {
                log.debug({ agent: agent.slug, reason: 'mention' }, 'Routed message');
                return agent;
            }
        }
        // 3. Conductor channel
        if (this.config.discord.conductorChannel && msg.channelId === this.config.discord.conductorChannel) {
            try {
                const conductor = this.registry.getConductor();
                log.debug({ reason: 'conductor_channel' }, 'Routed message');
                return conductor;
            }
            catch {
                log.warn('Conductor channel message but no conductor agent found');
                return null;
            }
        }
        // 4. DM -> conductor
        if (msg.channelId.startsWith('dm-') || msg.metadata?.isDM) {
            try {
                const conductor = this.registry.getConductor();
                log.debug({ reason: 'dm' }, 'Routed message');
                return conductor;
            }
            catch {
                return null;
            }
        }
        // 5. No match
        log.debug({ channelId: msg.channelId, platform: msg.platform }, 'No agent matched, ignoring');
        return null;
    }
    /**
     * Check if a user has permission to message an agent.
     * Owner (from config) can message any agent.
     */
    canUserMessage(userId, agent) {
        // Owner bypasses all permissions
        if (userId === this.config.discord.ownerId) {
            return true;
        }
        // Check if user has access through a channel with 'full' or better permissions
        for (const ch of agent.channels) {
            if (ch.permissions === 'full') {
                return true;
            }
        }
        // Conductor is accessible by anyone (if in conductor channel, message already routed)
        if (agent.role === 'conductor') {
            return true;
        }
        return false;
    }
}
//# sourceMappingURL=router.js.map
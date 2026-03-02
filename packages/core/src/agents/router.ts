import type { AgentRegistry } from './agent-registry.js';
import type { Agent } from './agent.js';
import type { MessageBus } from '../bus/message-bus.js';
import type { IncomingMessage } from '../bus/types.js';
import type { ArvisConfig } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('router');

/**
 * Routes incoming messages to the correct agent.
 * Listens to bus 'message' events, determines which agent handles it.
 */
export class Router {
  /** Cached mention RegExp patterns keyed by agent name — avoids recompiling on every message */
  private mentionPatterns = new Map<string, RegExp>();

  constructor(
    private registry: AgentRegistry,
    private bus: MessageBus,
    private config: ArvisConfig,
  ) {}

  /**
   * Determines which agent should handle this message.
   *
   * Logic:
   * 0. Bot has assigned agent (bot_instances.agent_id) -> route there (active only)
   * 1. Channel is bound to an agent -> route there
   * 2. Message mentions an agent by name -> route there
   * 3. Message is in conductor channel -> route to conductor
   * 4. Dashboard direct channel (dashboard-agent-{id}) -> route to that agent
   * 5. Message is a DM (channelId starts with "dm-") -> route to conductor
   * 6. Bot has assigned agent but inactive at step 0 -> route there anyway
   * 7. Fall back to conductor (bot is in this channel, user expects a reply)
   * 8. No match -> return null (ignore)
   */
  route(msg: IncomingMessage): Agent | null {
    // 0. Bot assignment — direct routing from bot_instances.agent_id (highest priority)
    const assignedId = msg.metadata?.assignedAgentId;
    if (assignedId != null) {
      const assigned = this.registry.getById(Number(assignedId));
      if (assigned && assigned.status === 'active') {
        log.debug({ agent: assigned.slug, reason: 'bot_assignment' }, 'Routed message');
        return assigned;
      }
    }

    // 1. Channel binding
    const byChannel = this.registry.getByChannel(msg.platform, msg.channelId);
    if (byChannel && byChannel.status === 'active') {
      log.debug({ agent: byChannel.slug, reason: 'channel_binding' }, 'Routed message');
      return byChannel;
    }

    // 2. Agent mention by name (use cached RegExp to avoid re-compiling on every message)
    const agents = this.registry.getAll();
    for (const agent of agents) {
      if (agent.status !== 'active') continue;
      if (!this.mentionPatterns.has(agent.name)) {
        this.mentionPatterns.set(agent.name, new RegExp(`@${agent.name}\\b`, 'i'));
      }
      if (this.mentionPatterns.get(agent.name)!.test(msg.content)) {
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
      } catch {
        log.warn('Conductor channel message but no conductor agent found');
        return null;
      }
    }

    // 4. Dashboard direct channel — route to the specific agent (bypasses conductor DM fallback)
    if (msg.channelId.startsWith('dashboard-agent-')) {
      const agentId = parseInt(msg.channelId.slice('dashboard-agent-'.length), 10);
      if (!isNaN(agentId)) {
        const agent = this.registry.getById(agentId);
        if (agent && agent.status === 'active') {
          log.debug({ agent: agent.slug, reason: 'dashboard_direct' }, 'Routed message');
          return agent;
        }
      }
    }

    // 5. DM -> conductor
    if (msg.channelId.startsWith('dm-') || msg.metadata?.isDM) {
      try {
        const conductor = this.registry.getConductor();
        log.debug({ reason: 'dm' }, 'Routed message');
        return conductor;
      } catch {
        return null;
      }
    }

    // 6. Bot has an assigned agent but it wasn't active at step 0 — retry without status check
    //    This handles guild channels where the bot is assigned to an agent
    if (assignedId != null) {
      const assigned = this.registry.getById(Number(assignedId));
      if (assigned) {
        log.debug({ agent: assigned.slug, reason: 'bot_assignment_fallback' }, 'Routed message');
        return assigned;
      }
    }

    // 7. Bot has no agent assignment — fall back to conductor for any message the bot received
    //    (bot is listening in this channel, so someone expects a response)
    try {
      const conductor = this.registry.getConductor();
      log.debug({ channelId: msg.channelId, platform: msg.platform, reason: 'conductor_fallback' }, 'Routed message');
      return conductor;
    } catch {
      // No conductor — truly no match
    }

    // 8. No match
    log.debug({ channelId: msg.channelId, platform: msg.platform }, 'No agent matched, ignoring');
    return null;
  }

  /**
   * Check if a user has permission to message an agent.
   * Owner (from config) can message any agent.
   */
  canUserMessage(userId: string, agent: Agent): boolean {
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

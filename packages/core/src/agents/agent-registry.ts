import type { ArvisDatabase } from '../db/database.js';
import type { AgentRow, AgentChannelRow } from '../db/schema.js';
import type { Agent, AgentConfig, AgentRole, ChannelBinding } from './agent.js';
import { createLogger } from '../logger.js';

const log = createLogger('agent-registry');

/**
 * CRUD + lookup for agents. SQLite-backed.
 * Manages agents and their channel bindings.
 */
export class AgentRegistry {
  constructor(private db: ArvisDatabase) {}

  /** Create a new agent with optional channel bindings */
  create(config: AgentConfig): Agent {
    const existing = this.getBySlug(config.slug);
    if (existing) {
      throw new Error(`Failed to create agent: slug "${config.slug}" already exists`);
    }

    const result = this.db.run(
      `INSERT INTO agents (slug, name, role, description, model, model_primary, model_fallbacks, allowed_tools, project_path, system_prompt, personality, config)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      config.slug,
      config.name,
      config.role,
      config.description ?? null,
      config.model ?? 'claude-sonnet-4-6',
      config.modelPrimary ?? null,
      config.modelFallbacks ? JSON.stringify(config.modelFallbacks) : null,
      config.allowedTools ? JSON.stringify(config.allowedTools) : null,
      config.projectPath ?? null,
      config.systemPrompt ?? null,
      config.personality ? JSON.stringify(config.personality) : null,
      null, // config JSON
    );

    const agentId = Number(result.lastInsertRowid);

    // Bind channels
    if (config.channels) {
      for (const ch of config.channels) {
        this.bindChannelInternal(agentId, ch);
      }
    }

    log.info({ slug: config.slug, id: agentId }, 'Agent created');
    return this.getBySlug(config.slug)!;
  }

  /** Update an existing agent */
  update(slug: string, changes: Partial<AgentConfig>): Agent {
    const agent = this.getBySlug(slug);
    if (!agent) {
      throw new Error(`Agent "${slug}" not found`);
    }

    const sets: string[] = [];
    const params: unknown[] = [];

    if (changes.name !== undefined) { sets.push('name = ?'); params.push(changes.name); }
    if (changes.role !== undefined) { sets.push('role = ?'); params.push(changes.role); }
    if (changes.description !== undefined) { sets.push('description = ?'); params.push(changes.description); }
    if (changes.model !== undefined) { sets.push('model = ?'); params.push(changes.model); }
    if (changes.modelPrimary !== undefined) { sets.push('model_primary = ?'); params.push(changes.modelPrimary); }
    if (changes.modelFallbacks !== undefined) { sets.push('model_fallbacks = ?'); params.push(JSON.stringify(changes.modelFallbacks)); }
    if (changes.allowedTools !== undefined) { sets.push('allowed_tools = ?'); params.push(JSON.stringify(changes.allowedTools)); }
    if (changes.projectPath !== undefined) { sets.push('project_path = ?'); params.push(changes.projectPath); }
    if (changes.systemPrompt !== undefined) { sets.push('system_prompt = ?'); params.push(changes.systemPrompt); }
    if (changes.personality !== undefined) { sets.push('personality = ?'); params.push(JSON.stringify(changes.personality)); }

    if (changes.slug !== undefined && changes.slug !== slug) {
      const existing = this.getBySlug(changes.slug);
      if (existing) throw new Error(`Failed to update agent: slug "${changes.slug}" already exists`);
      sets.push('slug = ?');
      params.push(changes.slug);
    }

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')");
      params.push(agent.id);
      this.db.run(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`, ...params);
    }

    const finalSlug = changes.slug ?? slug;
    log.info({ slug: finalSlug }, 'Agent updated');
    return this.getBySlug(finalSlug)!;
  }

  /** Delete an agent and its channel bindings (cascade) */
  delete(slug: string): void {
    const agent = this.getBySlug(slug);
    if (!agent) {
      throw new Error(`Agent "${slug}" not found`);
    }
    if (agent.role === 'conductor') {
      throw new Error('Cannot delete the Conductor agent');
    }
    this.db.run('DELETE FROM agents WHERE slug = ?', slug);
    log.info({ slug }, 'Agent deleted');
  }

  /** Get agent by numeric ID, or null */
  getById(id: number): Agent | null {
    const row = this.db.get<AgentRow>('SELECT * FROM agents WHERE id = ?', id);
    if (!row) return null;
    return this.hydrate(row);
  }

  /** Get agent by slug, or null */
  getBySlug(slug: string): Agent | null {
    const row = this.db.get<AgentRow>('SELECT * FROM agents WHERE slug = ?', slug);
    if (!row) return null;
    return this.hydrate(row);
  }

  /** Get agent bound to a specific channel, or null */
  getByChannel(platform: string, channelId: string): Agent | null {
    const binding = this.db.get<AgentChannelRow>(
      'SELECT * FROM agent_channels WHERE platform = ? AND channel_id = ?',
      platform, channelId,
    );
    if (!binding) return null;

    const row = this.db.get<AgentRow>('SELECT * FROM agents WHERE id = ?', binding.agent_id);
    if (!row) return null;
    return this.hydrate(row);
  }

  /** Get all agents with a given role */
  getByRole(role: AgentRole): Agent[] {
    const rows = this.db.all<AgentRow>('SELECT * FROM agents WHERE role = ?', role);
    return rows.map(r => this.hydrate(r));
  }

  /** Get all agents */
  getAll(): Agent[] {
    const rows = this.db.all<AgentRow>('SELECT * FROM agents ORDER BY id');
    return rows.map(r => this.hydrate(r));
  }

  /** Get the Conductor agent. Always returns an agent (throws if not found). */
  getConductor(): Agent {
    const row = this.db.get<AgentRow>("SELECT * FROM agents WHERE role = 'conductor' LIMIT 1");
    if (!row) {
      throw new Error('Conductor agent not found — database may not be initialized');
    }
    return this.hydrate(row);
  }

  /** Bind a channel to an agent */
  bindChannel(agentSlug: string, binding: ChannelBinding): void {
    const agent = this.getBySlug(agentSlug);
    if (!agent) throw new Error(`Agent "${agentSlug}" not found`);

    // Check if channel is already bound to another agent
    const existing = this.db.get<AgentChannelRow>(
      'SELECT * FROM agent_channels WHERE platform = ? AND channel_id = ?',
      binding.platform, binding.channelId,
    );
    if (existing && existing.agent_id !== agent.id) {
      throw new Error(
        `Channel ${binding.platform}:${binding.channelId} is already bound to another agent`
      );
    }

    this.bindChannelInternal(agent.id, binding);
    log.info({ agentSlug, channel: `${binding.platform}:${binding.channelId}` }, 'Channel bound');
  }

  /** Unbind a channel from an agent */
  unbindChannel(agentSlug: string, platform: string, channelId: string): void {
    const agent = this.getBySlug(agentSlug);
    if (!agent) throw new Error(`Agent "${agentSlug}" not found`);

    this.db.run(
      'DELETE FROM agent_channels WHERE agent_id = ? AND platform = ? AND channel_id = ?',
      agent.id, platform, channelId,
    );
    log.info({ agentSlug, channel: `${platform}:${channelId}` }, 'Channel unbound');
  }

  private bindChannelInternal(agentId: number, binding: ChannelBinding): void {
    this.db.run(
      `INSERT OR REPLACE INTO agent_channels (agent_id, platform, channel_id, is_primary, permissions)
       VALUES (?, ?, ?, ?, ?)`,
      agentId,
      binding.platform,
      binding.channelId,
      binding.isPrimary ? 1 : 0,
      binding.permissions,
    );
  }

  private hydrate(row: AgentRow): Agent {
    const channels = this.db.all<AgentChannelRow>(
      'SELECT * FROM agent_channels WHERE agent_id = ?', row.id,
    );

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      role: row.role as AgentRole,
      description: row.description,
      model: row.model,
      modelPrimary: row.model_primary ?? null,
      modelFallbacks: row.model_fallbacks ? JSON.parse(row.model_fallbacks) : [],
      allowedTools: row.allowed_tools ? JSON.parse(row.allowed_tools) : [],
      projectPath: row.project_path,
      systemPrompt: row.system_prompt,
      personality: row.personality ? JSON.parse(row.personality) : null,
      config: row.config ? JSON.parse(row.config) : null,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      channels: channels.map(ch => ({
        platform: ch.platform,
        channelId: ch.channel_id,
        isPrimary: ch.is_primary === 1,
        permissions: ch.permissions,
      })),
    };
  }
}

import { createLogger } from '../logger.js';
const log = createLogger('conductor');
// Tag patterns
const CREATE_AGENT_RE = /\[CREATE_AGENT\]([\s\S]*?)\[\/CREATE_AGENT\]/g;
const UPDATE_AGENT_RE = /\[UPDATE_AGENT:(\S+)\]([\s\S]*?)\[\/UPDATE_AGENT\]/g;
const CREATE_CLIENT_RE = /\[CREATE_CLIENT\]([\s\S]*?)\[\/CREATE_CLIENT\]/g;
const CREATE_CRON_RE = /\[CREATE_CRON\]([\s\S]*?)\[\/CREATE_CRON\]/g;
const CREATE_HEARTBEAT_RE = /\[CREATE_HEARTBEAT\]([\s\S]*?)\[\/CREATE_HEARTBEAT\]/g;
/**
 * Parses Conductor output for structured action tags and executes them.
 */
export class ConductorParser {
    /** Parse all action tags from Conductor output */
    parse(output) {
        const actions = [];
        // Parse [CREATE_AGENT]
        for (const match of output.matchAll(CREATE_AGENT_RE)) {
            const data = parseYamlLikeBlock(match[1]);
            actions.push({ type: 'create_agent', data });
        }
        // Parse [UPDATE_AGENT:slug]
        for (const match of output.matchAll(UPDATE_AGENT_RE)) {
            const data = parseYamlLikeBlock(match[2]);
            data.slug = match[1];
            actions.push({ type: 'update_agent', data });
        }
        // Parse [CREATE_CLIENT]
        for (const match of output.matchAll(CREATE_CLIENT_RE)) {
            const data = parseYamlLikeBlock(match[1]);
            actions.push({ type: 'create_client', data });
        }
        // Parse [CREATE_CRON]
        for (const match of output.matchAll(CREATE_CRON_RE)) {
            const data = parseYamlLikeBlock(match[1]);
            actions.push({ type: 'create_cron', data });
        }
        // Parse [CREATE_HEARTBEAT]
        for (const match of output.matchAll(CREATE_HEARTBEAT_RE)) {
            const data = parseYamlLikeBlock(match[1]);
            actions.push({ type: 'create_heartbeat', data });
        }
        return actions;
    }
    /** Execute parsed actions against the registry and other managers */
    async execute(actions, registry, deps) {
        const results = [];
        for (const action of actions) {
            try {
                switch (action.type) {
                    case 'create_agent': {
                        const config = this.buildAgentConfig(action.data);
                        registry.create(config);
                        results.push({ action, success: true });
                        log.info({ slug: config.slug }, 'Conductor created agent');
                        break;
                    }
                    case 'update_agent': {
                        const slug = action.data.slug;
                        const changes = this.buildAgentConfig(action.data);
                        registry.update(slug, changes);
                        results.push({ action, success: true });
                        log.info({ slug }, 'Conductor updated agent');
                        break;
                    }
                    case 'create_client': {
                        if (deps?.createClient) {
                            deps.createClient(action.data);
                            results.push({ action, success: true });
                        }
                        else {
                            results.push({ action, success: false, error: 'Client creation not supported' });
                        }
                        break;
                    }
                    case 'create_cron': {
                        if (deps?.createCron) {
                            deps.createCron(action.data);
                            results.push({ action, success: true });
                        }
                        else {
                            results.push({ action, success: false, error: 'Cron creation not supported' });
                        }
                        break;
                    }
                    case 'create_heartbeat': {
                        if (deps?.createHeartbeat) {
                            deps.createHeartbeat(action.data);
                            results.push({ action, success: true });
                        }
                        else {
                            results.push({ action, success: false, error: 'Heartbeat creation not supported' });
                        }
                        break;
                    }
                }
            }
            catch (err) {
                const error = err instanceof Error ? err.message : String(err);
                results.push({ action, success: false, error });
                log.error({ action: action.type, error }, 'Conductor action failed');
            }
        }
        return results;
    }
    /** Strip all action blocks from output before showing to user */
    stripActions(output) {
        return output
            .replace(CREATE_AGENT_RE, '')
            .replace(UPDATE_AGENT_RE, '')
            .replace(CREATE_CLIENT_RE, '')
            .replace(CREATE_CRON_RE, '')
            .replace(CREATE_HEARTBEAT_RE, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
    buildAgentConfig(data) {
        const channels = [];
        if (data.channels) {
            try {
                const parsed = typeof data.channels === 'string' ? JSON.parse(data.channels) : data.channels;
                if (Array.isArray(parsed)) {
                    for (const ch of parsed) {
                        channels.push({
                            platform: ch.platform || 'discord',
                            channelId: ch.channelId || ch.channel_id,
                            isPrimary: ch.isPrimary ?? ch.is_primary ?? true,
                            permissions: ch.permissions || 'full',
                        });
                    }
                }
            }
            catch {
                log.warn('Failed to parse channels from conductor action');
            }
        }
        let personality;
        if (data.personality) {
            const p = typeof data.personality === 'string'
                ? parseYamlLikeBlock(data.personality)
                : data.personality;
            personality = {
                voice: p.voice || 'professional',
                emoji_level: p.emoji_level || 'minimal',
                quirks: p.quirks ? (Array.isArray(p.quirks) ? p.quirks : [p.quirks]) : undefined,
            };
        }
        let allowedTools;
        if (data.allowed_tools) {
            try {
                allowedTools = typeof data.allowed_tools === 'string'
                    ? JSON.parse(data.allowed_tools)
                    : data.allowed_tools;
            }
            catch {
                allowedTools = [data.allowed_tools];
            }
        }
        const slug = String(data.slug || '');
        const name = String(data.name || slug);
        if (!slug)
            throw new Error('Agent config missing required "slug" field');
        return {
            slug,
            name,
            role: data.role || 'custom',
            description: data.description ? String(data.description) : undefined,
            model: data.model ? String(data.model) : undefined,
            projectPath: data.project_path ? String(data.project_path) : data.projectPath ? String(data.projectPath) : undefined,
            allowedTools,
            personality,
            channels: channels.length > 0 ? channels : undefined,
        };
    }
}
/** The Conductor's system prompt */
export const CONDUCTOR_SYSTEM_PROMPT = `You are the Conductor — the central intelligence of the Arvis platform.

CRITICAL: You MUST use the action tags below to create agents, cron jobs, and heartbeats. Describing actions in plain text does NOTHING. The system only executes actions inside the tags. If a user asks you to create something, you MUST output the corresponding tag block — never just talk about it.

YOUR CAPABILITIES:
- Create and manage sub-agents for specific projects or clients
- Configure agent tools, permissions, and channel bindings
- Set up scheduled tasks (cron jobs) and heartbeats
- Manage client billing and accounts

WHEN A USER ASKS YOU TO DO SOMETHING:
- If they want an agent created → output [CREATE_AGENT] block immediately
- If they want scheduled messages → output [CREATE_HEARTBEAT] or [CREATE_CRON] block immediately
- If they want a client → output [CREATE_CLIENT] block immediately
- You can include explanation text ALONGSIDE the tags, but the tags MUST be present
- Do NOT ask unnecessary follow-up questions if the user gave enough info. Just do it.

ACTION TAGS (you MUST use these exact formats):

TO CREATE AN AGENT:
[CREATE_AGENT]
slug: my-agent
name: My Agent
role: custom
description: What this agent does
model: claude-sonnet-4-20250514
allowed_tools: ["Read", "Write"]
channels: [{"platform": "discord", "channelId": "123456", "isPrimary": true}]
[/CREATE_AGENT]

TO UPDATE AN AGENT:
[UPDATE_AGENT:slug]
field: new_value
[/UPDATE_AGENT]

TO CREATE A CLIENT:
[CREATE_CLIENT]
name: Client Name
slug: client-name
plan: per_task
[/CREATE_CLIENT]

TO SET UP A CRON JOB (for complex scheduled tasks):
[CREATE_CRON]
agent: agent-slug
name: Job Name
schedule: */10 * * * * *
prompt: The prompt to run
channel: 123456
platform: discord
[/CREATE_CRON]

TO SET UP A HEARTBEAT (for simple periodic messages):
[CREATE_HEARTBEAT]
agent: agent-slug
name: Heartbeat Name
schedule: */10 * * * * *
prompt: The message to send
channel: 123456
platform: discord
[/CREATE_HEARTBEAT]

Schedule formats:
- "every 10s" = every 10 seconds
- "every 5m" = every 5 minutes
- "every 1h" = every hour
- Standard 5-field cron: "*/5 * * * *" = every 5 minutes
- 6-field cron with seconds: "*/10 * * * * *" = every 10 seconds

RULES:
- ALWAYS output the action tags when the user asks you to create/setup something
- If the user gives you enough info, just create it — don't over-ask
- Create agents with MINIMAL tool access (least privilege)
- Use [MEMORY:] tags to remember user preferences
- You can write explanatory text before or after the tags`;
/**
 * Parse a YAML-like key: value block into a data object.
 * Handles simple key: value pairs and nested indented blocks.
 */
function parseYamlLikeBlock(text) {
    const result = {};
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    let currentKey = '';
    let currentNested = '';
    for (const line of lines) {
        const kvMatch = line.match(/^(\w[\w_]*):\s*(.*)$/);
        if (kvMatch) {
            // Save previous nested block
            if (currentKey && currentNested) {
                result[currentKey] = currentNested.trim();
                currentNested = '';
            }
            const key = kvMatch[1];
            const value = kvMatch[2].trim();
            if (value) {
                // Keep large numbers as strings (Discord IDs, etc. lose precision as JS numbers)
                if (/^\d{15,}$/.test(value)) {
                    result[key] = value;
                }
                else {
                    // Try to parse as JSON for arrays, objects, booleans, small numbers
                    try {
                        result[key] = JSON.parse(value);
                    }
                    catch {
                        result[key] = value;
                    }
                }
                currentKey = '';
            }
            else {
                // Start of nested block
                currentKey = key;
            }
        }
        else if (currentKey) {
            // Part of a nested block
            currentNested += (currentNested ? '\n' : '') + line;
        }
    }
    // Save final nested block
    if (currentKey && currentNested) {
        result[currentKey] = currentNested.trim();
    }
    return result;
}
//# sourceMappingURL=conductor.js.map
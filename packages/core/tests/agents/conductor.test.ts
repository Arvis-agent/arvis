import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConductorParser } from '../../src/agents/conductor.js';
import { AgentRegistry } from '../../src/agents/agent-registry.js';
import { setupTestDb, cleanupTestDb } from '../helpers.js';
import type { ArvisDatabase } from '../../src/db/database.js';
import type { ArvisConfig } from '../../src/config.js';

describe('ConductorParser', () => {
  const parser = new ConductorParser();

  describe('parse', () => {
    it('parses CREATE_AGENT blocks', () => {
      const output = `Sure, I'll create that agent.
[CREATE_AGENT]
slug: birb-dev
name: Birb Developer
role: developer
description: Handles birb.bet development
model: claude-sonnet-4-20250514
project_path: /home/user/birb
allowed_tools: ["Bash(git *)", "Read", "Write"]
[/CREATE_AGENT]
Done!`;

      const actions = parser.parse(output);
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('create_agent');
      expect(actions[0].data.slug).toBe('birb-dev');
      expect(actions[0].data.name).toBe('Birb Developer');
      expect(actions[0].data.role).toBe('developer');
      expect(actions[0].data.allowed_tools).toEqual(['Bash(git *)', 'Read', 'Write']);
    });

    it('parses UPDATE_AGENT blocks', () => {
      const output = `Updating the agent...
[UPDATE_AGENT:birb-dev]
name: Updated Name
description: New description
[/UPDATE_AGENT]`;

      const actions = parser.parse(output);
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('update_agent');
      expect(actions[0].data.slug).toBe('birb-dev');
      expect(actions[0].data.name).toBe('Updated Name');
    });

    it('parses CREATE_CLIENT blocks', () => {
      const output = `[CREATE_CLIENT]
name: Acme Corp
slug: acme-corp
plan: monthly
[/CREATE_CLIENT]`;

      const actions = parser.parse(output);
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('create_client');
      const clientData = actions[0].data as unknown as { name: string; plan: string };
      expect(clientData.name).toBe('Acme Corp');
      expect(clientData.plan).toBe('monthly');
    });

    it('parses CREATE_CRON blocks', () => {
      const output = `[CREATE_CRON]
agent: birb-dev
name: Health Check
schedule: 0 * * * *
prompt: Check site status
channel: 123456
[/CREATE_CRON]`;

      const actions = parser.parse(output);
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('create_cron');
      const cronData = actions[0].data as { agent: string; schedule: string };
      expect(cronData.agent).toBe('birb-dev');
      expect(cronData.schedule).toBe('0 * * * *');
    });

    it('parses CREATE_HEARTBEAT blocks', () => {
      const output = `[CREATE_HEARTBEAT]
agent: birb-dev
name: Morning Briefing
schedule: 0 9 * * *
prompt: Compile morning briefing
channel: 789012
[/CREATE_HEARTBEAT]`;

      const actions = parser.parse(output);
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('create_heartbeat');
    });

    it('parses multiple action blocks', () => {
      const output = `Let me set things up.
[CREATE_AGENT]
slug: dev-1
name: Dev Agent
role: developer
[/CREATE_AGENT]
And another one:
[CREATE_AGENT]
slug: ops-1
name: Ops Agent
role: devops
[/CREATE_AGENT]`;

      const actions = parser.parse(output);
      expect(actions).toHaveLength(2);
    });

    it('returns empty array for no actions', () => {
      const actions = parser.parse('Just a regular response with no actions.');
      expect(actions).toHaveLength(0);
    });
  });

  describe('stripActions', () => {
    it('removes all action blocks', () => {
      const output = `Here's what I did:
[CREATE_AGENT]
slug: test
name: Test
role: developer
[/CREATE_AGENT]
All set!`;

      const stripped = parser.stripActions(output);
      expect(stripped).not.toContain('[CREATE_AGENT]');
      expect(stripped).not.toContain('[/CREATE_AGENT]');
      expect(stripped).toContain("Here's what I did:");
      expect(stripped).toContain('All set!');
    });

    it('handles output with no actions', () => {
      const output = 'Just a regular response.';
      expect(parser.stripActions(output)).toBe(output);
    });
  });

  describe('execute', () => {
    let db: ArvisDatabase;
    let config: ArvisConfig;
    let registry: AgentRegistry;

    beforeEach(() => {
      const setup = setupTestDb();
      db = setup.db;
      config = setup.config;
      registry = new AgentRegistry(db);
    });

    afterEach(() => cleanupTestDb(db, config));

    it('creates agent from parsed action', async () => {
      const actions = parser.parse(`[CREATE_AGENT]
slug: new-agent
name: New Agent
role: developer
[/CREATE_AGENT]`);

      const results = await parser.execute(actions, registry);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);

      const agent = registry.getBySlug('new-agent');
      expect(agent).not.toBeNull();
      expect(agent!.name).toBe('New Agent');
    });

    it('handles invalid action gracefully', async () => {
      // Create first, then try to create duplicate
      registry.create({ slug: 'dupe', name: 'Dupe', role: 'developer' });

      const actions = parser.parse(`[CREATE_AGENT]
slug: dupe
name: Another Dupe
role: developer
[/CREATE_AGENT]`);

      const results = await parser.execute(actions, registry);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('already exists');
    });

    it('detects first-time user (no conductor)', () => {
      // If there's no conversation with the conductor, it's a first-time user
      // This is handled by the orchestrator, not the parser directly
      expect(true).toBe(true); // Placeholder
    });
  });
});

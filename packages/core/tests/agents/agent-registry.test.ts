import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ArvisDatabase } from '../../src/db/database.js';
import { AgentRegistry } from '../../src/agents/agent-registry.js';
import initialMigration from '../../src/db/migrations/001-initial.js';
import multiProviderMigration from '../../src/db/migrations/002-multi-provider.js';
import type { ArvisConfig } from '../../src/config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

function makeTestConfig(): ArvisConfig {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arvis-reg-test-'));
  return {
    dataDir: tmpDir,
    discord: { token: 'test', ownerId: 'owner-1' },
    telegram: {},
    slack: {},
    whatsapp: {},
    matrix: {},
    web: { port: 5070 },
    accounts: [],
    webhook: { port: 5050 },
    dashboard: { port: 5100 },
    logLevel: 'error',
    timezone: 'UTC',
  };
}

describe('AgentRegistry', () => {
  let db: ArvisDatabase;
  let registry: AgentRegistry;
  let config: ArvisConfig;

  beforeEach(() => {
    config = makeTestConfig();
    db = new ArvisDatabase(config);
    db.migrate([initialMigration, multiProviderMigration]);
    registry = new AgentRegistry(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(config.dataDir, { recursive: true, force: true });
  });

  it('creates an agent', () => {
    const agent = registry.create({
      slug: 'test-dev',
      name: 'Test Developer',
      role: 'developer',
      description: 'A test agent',
      allowedTools: ['Read', 'Write'],
    });

    expect(agent.slug).toBe('test-dev');
    expect(agent.name).toBe('Test Developer');
    expect(agent.role).toBe('developer');
    expect(agent.allowedTools).toEqual(['Read', 'Write']);
    expect(agent.id).toBeGreaterThan(0);
  });

  it('prevents duplicate slugs', () => {
    registry.create({ slug: 'dupe', name: 'First', role: 'developer' });
    expect(() => {
      registry.create({ slug: 'dupe', name: 'Second', role: 'developer' });
    }).toThrow('already exists');
  });

  it('updates an agent', () => {
    registry.create({ slug: 'upd', name: 'Original', role: 'developer' });
    const updated = registry.update('upd', { name: 'Updated', description: 'new desc' });
    expect(updated.name).toBe('Updated');
    expect(updated.description).toBe('new desc');
  });

  it('deletes an agent', () => {
    registry.create({ slug: 'del-me', name: 'Delete', role: 'developer' });
    registry.delete('del-me');
    expect(registry.getBySlug('del-me')).toBeNull();
  });

  it('cannot delete conductor', () => {
    registry.create({ slug: 'conductor', name: 'Conductor', role: 'conductor' });
    expect(() => registry.delete('conductor')).toThrow('Cannot delete the Conductor');
  });

  it('getBySlug returns null for missing agent', () => {
    expect(registry.getBySlug('nonexistent')).toBeNull();
  });

  it('getByChannel routes correctly', () => {
    registry.create({
      slug: 'chan-agent',
      name: 'Channel Agent',
      role: 'developer',
      channels: [{ platform: 'discord', channelId: 'ch-100', isPrimary: true, permissions: 'full' }],
    });

    const found = registry.getByChannel('discord', 'ch-100');
    expect(found).not.toBeNull();
    expect(found!.slug).toBe('chan-agent');
  });

  it('getByChannel returns null for unbound channel', () => {
    expect(registry.getByChannel('discord', 'unknown')).toBeNull();
  });

  it('getByRole returns matching agents', () => {
    registry.create({ slug: 'dev1', name: 'Dev 1', role: 'developer' });
    registry.create({ slug: 'dev2', name: 'Dev 2', role: 'developer' });
    registry.create({ slug: 'ops', name: 'Ops', role: 'devops' });

    const devs = registry.getByRole('developer');
    expect(devs).toHaveLength(2);
    const ops = registry.getByRole('devops');
    expect(ops).toHaveLength(1);
  });

  it('getAll returns all agents', () => {
    registry.create({ slug: 'a1', name: 'A1', role: 'developer' });
    registry.create({ slug: 'a2', name: 'A2', role: 'devops' });

    const all = registry.getAll();
    expect(all).toHaveLength(2);
  });

  it('getConductor returns conductor', () => {
    registry.create({ slug: 'conductor', name: 'Conductor', role: 'conductor' });
    const conductor = registry.getConductor();
    expect(conductor.role).toBe('conductor');
  });

  it('getConductor throws when no conductor exists', () => {
    expect(() => registry.getConductor()).toThrow('Conductor agent not found');
  });

  it('bindChannel adds a new binding', () => {
    registry.create({ slug: 'bind-test', name: 'Bind Test', role: 'developer' });
    registry.bindChannel('bind-test', { platform: 'discord', channelId: 'ch-200', isPrimary: false, permissions: 'full' });

    const found = registry.getByChannel('discord', 'ch-200');
    expect(found!.slug).toBe('bind-test');
  });

  it('prevents binding same channel to two agents', () => {
    registry.create({ slug: 'a1', name: 'A1', role: 'developer' });
    registry.create({ slug: 'a2', name: 'A2', role: 'developer' });

    registry.bindChannel('a1', { platform: 'discord', channelId: 'shared-ch', isPrimary: true, permissions: 'full' });
    expect(() => {
      registry.bindChannel('a2', { platform: 'discord', channelId: 'shared-ch', isPrimary: true, permissions: 'full' });
    }).toThrow('already bound');
  });

  it('unbindChannel removes binding', () => {
    registry.create({
      slug: 'unbind-test',
      name: 'Unbind',
      role: 'developer',
      channels: [{ platform: 'discord', channelId: 'ch-300', isPrimary: true, permissions: 'full' }],
    });

    registry.unbindChannel('unbind-test', 'discord', 'ch-300');
    expect(registry.getByChannel('discord', 'ch-300')).toBeNull();
  });

  it('agent channels are loaded with the agent', () => {
    registry.create({
      slug: 'multi-ch',
      name: 'Multi Channel',
      role: 'developer',
      channels: [
        { platform: 'discord', channelId: 'ch-a', isPrimary: true, permissions: 'full' },
        { platform: 'telegram', channelId: 'ch-b', isPrimary: false, permissions: 'read_only' },
      ],
    });

    const agent = registry.getBySlug('multi-ch')!;
    expect(agent.channels).toHaveLength(2);
    expect(agent.channels.find(c => c.platform === 'discord')!.isPrimary).toBe(true);
    expect(agent.channels.find(c => c.platform === 'telegram')!.permissions).toBe('read_only');
  });

  it('personality is stored and loaded', () => {
    registry.create({
      slug: 'pers-test',
      name: 'Personality',
      role: 'developer',
      personality: { voice: 'casual', emoji_level: 'moderate', quirks: ['uses puns'] },
    });

    const agent = registry.getBySlug('pers-test')!;
    expect(agent.personality).toEqual({
      voice: 'casual',
      emoji_level: 'moderate',
      quirks: ['uses puns'],
    });
  });
});

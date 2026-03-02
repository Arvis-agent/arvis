import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ArvisDatabase } from '../../src/db/database.js';
import { AgentRegistry } from '../../src/agents/agent-registry.js';
import { Router } from '../../src/agents/router.js';
import { MessageBus } from '../../src/bus/message-bus.js';
import initialMigration from '../../src/db/migrations/001-initial.js';
import multiProviderMigration from '../../src/db/migrations/002-multi-provider.js';
import type { ArvisConfig } from '../../src/config.js';
import type { IncomingMessage } from '../../src/bus/types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

function makeTestConfig(conductorChannel?: string): ArvisConfig {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arvis-router-test-'));
  return {
    dataDir: tmpDir,
    discord: { token: 'test', ownerId: 'owner-1', conductorChannel },
    telegram: {},
    web: { port: 5070 },
    accounts: [],
    webhook: { port: 5050 },
    dashboard: { port: 5100 },
    logLevel: 'error',
    timezone: 'UTC',
  };
}

function makeMsg(overrides?: Partial<IncomingMessage>): IncomingMessage {
  return {
    id: 'msg-1',
    platform: 'discord',
    channelId: 'some-channel',
    userId: 'user-1',
    userName: 'TestUser',
    content: 'hello',
    timestamp: new Date(),
    ...overrides,
  };
}

describe('Router', () => {
  let db: ArvisDatabase;
  let registry: AgentRegistry;
  let router: Router;
  let bus: MessageBus;
  let config: ArvisConfig;

  beforeEach(() => {
    config = makeTestConfig('conductor-channel');
    db = new ArvisDatabase(config);
    db.migrate([initialMigration, multiProviderMigration]);
    registry = new AgentRegistry(db);
    bus = new MessageBus();
    router = new Router(registry, bus, config);

    // Create conductor
    registry.create({
      slug: 'conductor',
      name: 'Conductor',
      role: 'conductor',
      channels: [{ platform: 'discord', channelId: 'conductor-channel', isPrimary: true, permissions: 'full' }],
    });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(config.dataDir, { recursive: true, force: true });
  });

  it('routes by channel binding', () => {
    registry.create({
      slug: 'dev-agent',
      name: 'Dev Agent',
      role: 'developer',
      channels: [{ platform: 'discord', channelId: 'dev-channel', isPrimary: true, permissions: 'full' }],
    });

    const result = router.route(makeMsg({ channelId: 'dev-channel' }));
    expect(result).not.toBeNull();
    expect(result!.slug).toBe('dev-agent');
  });

  it('routes by agent mention', () => {
    registry.create({ slug: 'birb-dev', name: 'BirdDev', role: 'developer' });

    const result = router.route(makeMsg({ content: 'hey @BirdDev can you fix this?' }));
    expect(result).not.toBeNull();
    expect(result!.slug).toBe('birb-dev');
  });

  it('routes conductor channel messages to conductor', () => {
    const result = router.route(makeMsg({ channelId: 'conductor-channel' }));
    expect(result).not.toBeNull();
    expect(result!.role).toBe('conductor');
  });

  it('routes DMs to conductor', () => {
    const result = router.route(makeMsg({ channelId: 'dm-user123' }));
    expect(result).not.toBeNull();
    expect(result!.role).toBe('conductor');
  });

  it('routes DMs via metadata.isDM to conductor', () => {
    const result = router.route(makeMsg({ metadata: { isDM: true } }));
    expect(result).not.toBeNull();
    expect(result!.role).toBe('conductor');
  });

  it('returns null for unknown channel', () => {
    const result = router.route(makeMsg({ channelId: 'random-channel' }));
    expect(result).toBeNull();
  });

  it('owner can message any agent', () => {
    const agent = registry.create({ slug: 'private', name: 'Private', role: 'developer' });
    expect(router.canUserMessage('owner-1', agent)).toBe(true);
  });

  it('non-owner can message agents with full channels', () => {
    const agent = registry.create({
      slug: 'pub-agent',
      name: 'Public Agent',
      role: 'developer',
      channels: [{ platform: 'discord', channelId: 'pub-ch', isPrimary: true, permissions: 'full' }],
    });
    expect(router.canUserMessage('random-user', agent)).toBe(true);
  });

  it('non-owner can always message conductor', () => {
    const conductor = registry.getConductor();
    expect(router.canUserMessage('random-user', conductor)).toBe(true);
  });

  it('does not route to paused agents via channel', () => {
    registry.create({
      slug: 'paused-agent',
      name: 'Paused',
      role: 'developer',
      channels: [{ platform: 'discord', channelId: 'paused-ch', isPrimary: true, permissions: 'full' }],
    });
    // Manually set status to paused
    db.run("UPDATE agents SET status = 'paused' WHERE slug = ?", 'paused-agent');

    const result = router.route(makeMsg({ channelId: 'paused-ch' }));
    // The channel binding still returns the agent, but status check filters it
    expect(result).toBeNull();
  });
});

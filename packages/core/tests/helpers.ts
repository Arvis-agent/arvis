import { ArvisDatabase } from '../src/db/database.js';
import { AgentRegistry } from '../src/agents/agent-registry.js';
import initialMigration from '../src/db/migrations/001-initial.js';
import multiProviderMigration from '../src/db/migrations/002-multi-provider.js';
import type { ArvisConfig } from '../src/config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

export function makeTestConfig(overrides?: Partial<ArvisConfig>): ArvisConfig {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arvis-test-'));
  return {
    dataDir: tmpDir,
    discord: { token: 'test', ownerId: 'owner-1' },
    telegram: {},
    web: { port: 5060 },
    accounts: [],
    webhook: { port: 5050 },
    dashboard: { port: 5100 },
    logLevel: 'error',
    timezone: 'UTC',
    ...overrides,
  };
}

export function setupTestDb(config?: ArvisConfig) {
  const cfg = config ?? makeTestConfig();
  const db = new ArvisDatabase(cfg);
  db.migrate([initialMigration, multiProviderMigration]);
  return { db, config: cfg };
}

export function createTestAgent(registry: AgentRegistry, slug = 'test-agent', role = 'developer' as const) {
  return registry.create({
    slug,
    name: slug.replace(/-/g, ' '),
    role,
  });
}

export function cleanupTestDb(db: ArvisDatabase, config: ArvisConfig) {
  db.close();
  fs.rmSync(config.dataDir, { recursive: true, force: true });
}

import {
  ArvisDatabase,
  AgentRegistry,
  ConversationManager,
  MemoryManager,
  QueueManager,
  BillingManager,
  AccountManager,
  initialMigration,
  multiProviderMigration,
  botInstancesMigration,
} from '@arvis/core';
import type { ArvisConfig } from '@arvis/core';

let _db: ArvisDatabase | null = null;

function getDb(): ArvisDatabase {
  if (!_db) {
    // Minimal config — dashboard only needs dataDir for DB access
    const config = {
      dataDir: process.env.ARVIS_DATA_DIR || './data',
      discord: { token: '', ownerId: '' },
      telegram: {},
      slack: {},
      whatsapp: {},
      matrix: {},
      web: { port: 5070 },
      accounts: [],
      webhook: { port: 5080 },
      dashboard: { port: 5100 },
      logLevel: 'info' as const,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    } satisfies ArvisConfig;

    _db = new ArvisDatabase(config);
    _db.migrate([initialMigration, multiProviderMigration, botInstancesMigration]);
  }
  return _db;
}

export const db = getDb();
export const registry = new AgentRegistry(db);
export const conversations = new ConversationManager(db);
export const memory = new MemoryManager(db);
export const queue = new QueueManager(db);
export const billing = new BillingManager(db);
export const accounts = new AccountManager(db);

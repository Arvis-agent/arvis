import type { Migration } from '../database.js';

const migration: Migration = {
  name: '003-bot-instances',

  up(db) {
    db.exec(`
      -- Stores all bot instances (one row per bot token per platform).
      -- ConnectorManager reads this table and starts/stops connectors dynamically.
      CREATE TABLE IF NOT EXISTS bot_instances (
        id           INTEGER PRIMARY KEY,
        name         TEXT NOT NULL,
        platform     TEXT NOT NULL CHECK(platform IN ('discord','telegram','slack','whatsapp','matrix')),
        token        TEXT NOT NULL,
        extra_config TEXT,           -- JSON: platform-specific extras (app_token, phone_number_id, etc.)
        agent_id     INTEGER REFERENCES agents(id) ON DELETE SET NULL,
        enabled      INTEGER DEFAULT 1,
        status       TEXT DEFAULT 'stopped', -- 'running' | 'stopped' | 'error'
        last_error   TEXT,
        created_at   TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_bot_instances_platform ON bot_instances(platform, enabled);
    `);
  },

  down(db) {
    db.exec('DROP TABLE IF EXISTS bot_instances');
  },
};

export default migration;

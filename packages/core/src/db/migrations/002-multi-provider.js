const migration = {
    name: '002-multi-provider',
    up(db) {
        // Extend accounts table for multi-provider support
        db.exec(`
      ALTER TABLE accounts ADD COLUMN provider TEXT DEFAULT 'anthropic';
      ALTER TABLE accounts ADD COLUMN base_url TEXT;
      ALTER TABLE accounts ADD COLUMN retry_count INTEGER DEFAULT 0;
      ALTER TABLE accounts ADD COLUMN priority INTEGER DEFAULT 100;
    `);
        // Extend agents table with model fallback chain
        db.exec(`
      ALTER TABLE agents ADD COLUMN model_primary TEXT;
      ALTER TABLE agents ADD COLUMN model_fallbacks TEXT;
    `);
        // Usage/cost tracking per request
        db.exec(`
      CREATE TABLE IF NOT EXISTS usage_log (
        id INTEGER PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        agent_id INTEGER REFERENCES agents(id),
        job_id INTEGER REFERENCES queue(id),
        model TEXT NOT NULL,
        provider TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        duration_ms INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_usage_log_account ON usage_log(account_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_usage_log_agent ON usage_log(agent_id, created_at);
    `);
    },
    down(db) {
        db.exec('DROP TABLE IF EXISTS usage_log');
        // SQLite doesn't support DROP COLUMN in older versions, so this is best-effort
    },
};
export default migration;
//# sourceMappingURL=002-multi-provider.js.map
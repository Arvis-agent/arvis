import type { Migration } from '../database.js';

const migration: Migration = {
  name: '001-initial',

  up(db) {
    db.exec(`
      -- ============================================================
      -- CORE TABLES
      -- ============================================================

      CREATE TABLE config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        home_dir TEXT,
        api_key TEXT,
        model TEXT DEFAULT 'claude-sonnet-4-20250514',
        status TEXT DEFAULT 'active',
        rate_limited_until TEXT,
        total_messages INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE agents (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        description TEXT,
        model TEXT DEFAULT 'claude-sonnet-4-20250514',
        allowed_tools TEXT,
        project_path TEXT,
        system_prompt TEXT,
        personality TEXT,
        config TEXT,
        status TEXT DEFAULT 'active',
        created_by INTEGER REFERENCES agents(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE agent_channels (
        agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        is_primary INTEGER DEFAULT 0,
        permissions TEXT DEFAULT 'full',
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (platform, channel_id)
      );

      CREATE INDEX idx_agent_channels_agent ON agent_channels(agent_id);

      -- ============================================================
      -- CONVERSATIONS & MESSAGES
      -- ============================================================

      CREATE TABLE conversations (
        id INTEGER PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agents(id),
        platform TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        user_id TEXT,
        user_name TEXT,
        status TEXT DEFAULT 'active',
        total_tokens_estimate INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        started_at TEXT DEFAULT (datetime('now')),
        last_message_at TEXT DEFAULT (datetime('now')),
        metadata TEXT
      );

      CREATE INDEX idx_conversations_agent ON conversations(agent_id);
      CREATE INDEX idx_conversations_channel ON conversations(platform, channel_id);

      CREATE TABLE messages (
        id INTEGER PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        token_estimate INTEGER DEFAULT 0,
        attachments TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX idx_messages_created ON messages(created_at);

      -- Full-text search on messages
      CREATE VIRTUAL TABLE messages_fts USING fts5(
        content,
        content=messages,
        content_rowid=id
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
      END;

      CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.id, old.content);
      END;

      CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.id, old.content);
        INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
      END;

      -- ============================================================
      -- MEMORY SYSTEM
      -- ============================================================

      CREATE TABLE memory_facts (
        id INTEGER PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        source_conversation_id INTEGER REFERENCES conversations(id),
        created_at TEXT DEFAULT (datetime('now')),
        last_accessed TEXT DEFAULT (datetime('now')),
        access_count INTEGER DEFAULT 0
      );

      CREATE INDEX idx_memory_facts_agent ON memory_facts(agent_id);
      CREATE INDEX idx_memory_facts_category ON memory_facts(agent_id, category);

      CREATE VIRTUAL TABLE memory_facts_fts USING fts5(
        content,
        content=memory_facts,
        content_rowid=id
      );

      CREATE TRIGGER memory_facts_ai AFTER INSERT ON memory_facts BEGIN
        INSERT INTO memory_facts_fts(rowid, content) VALUES (new.id, new.content);
      END;

      CREATE TRIGGER memory_facts_ad AFTER DELETE ON memory_facts BEGIN
        INSERT INTO memory_facts_fts(memory_facts_fts, rowid, content) VALUES ('delete', old.id, old.content);
      END;

      CREATE TABLE memory_state (
        agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (agent_id, key)
      );

      CREATE TABLE compactions (
        id INTEGER PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id),
        agent_id INTEGER NOT NULL REFERENCES agents(id),
        summary TEXT NOT NULL,
        messages_before INTEGER NOT NULL,
        messages_after INTEGER NOT NULL,
        tokens_saved INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- ============================================================
      -- SCHEDULING & AUTOMATION
      -- ============================================================

      CREATE TABLE heartbeat_configs (
        id INTEGER PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        schedule TEXT NOT NULL,
        channel_id TEXT,
        platform TEXT,
        enabled INTEGER DEFAULT 1,
        run_condition TEXT,
        last_run TEXT,
        next_run TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE heartbeat_logs (
        id INTEGER PRIMARY KEY,
        config_id INTEGER NOT NULL REFERENCES heartbeat_configs(id),
        agent_id INTEGER NOT NULL,
        trigger_type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        result TEXT,
        actions_taken TEXT,
        duration_ms INTEGER,
        status TEXT DEFAULT 'success',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE cron_jobs (
        id INTEGER PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        schedule TEXT NOT NULL,
        prompt TEXT NOT NULL,
        channel_id TEXT,
        platform TEXT,
        enabled INTEGER DEFAULT 1,
        created_by_user INTEGER DEFAULT 0,
        last_run TEXT,
        next_run TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- ============================================================
      -- CLIENTS & BILLING
      -- ============================================================

      CREATE TABLE clients (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        contact_info TEXT,
        plan TEXT DEFAULT 'per_task',
        plan_config TEXT,
        balance REAL DEFAULT 0.0,
        status TEXT DEFAULT 'active',
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE charges (
        id INTEGER PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        agent_id INTEGER REFERENCES agents(id),
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        conversation_id INTEGER REFERENCES conversations(id),
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_charges_client ON charges(client_id);

      -- ============================================================
      -- WEBHOOKS
      -- ============================================================

      CREATE TABLE webhooks (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        agent_id INTEGER NOT NULL REFERENCES agents(id),
        prompt_template TEXT NOT NULL,
        channel_id TEXT,
        platform TEXT,
        secret TEXT,
        enabled INTEGER DEFAULT 1,
        last_triggered TEXT,
        trigger_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- ============================================================
      -- SKILLS
      -- ============================================================

      CREATE TABLE skills (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        file_path TEXT NOT NULL,
        trigger_patterns TEXT,
        required_tools TEXT,
        category TEXT,
        enabled INTEGER DEFAULT 1,
        version TEXT DEFAULT '1.0.0',
        author TEXT,
        install_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- ============================================================
      -- QUEUE
      -- ============================================================

      CREATE TABLE queue (
        id INTEGER PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agents(id),
        priority INTEGER DEFAULT 5,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        account_id INTEGER REFERENCES accounts(id),
        result TEXT,
        error TEXT,
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        created_at TEXT DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT
      );

      CREATE INDEX idx_queue_status ON queue(status, priority, created_at);

      -- ============================================================
      -- SESSIONS
      -- ============================================================

      CREATE TABLE sessions (
        id INTEGER PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agents(id),
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        cli_session_id TEXT,
        status TEXT DEFAULT 'active',
        messages_in_session INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        last_used TEXT DEFAULT (datetime('now')),
        expires_at TEXT
      );

      CREATE INDEX idx_sessions_agent ON sessions(agent_id);
    `);
  },

  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS queue;
      DROP TABLE IF EXISTS skills;
      DROP TABLE IF EXISTS webhooks;
      DROP TABLE IF EXISTS charges;
      DROP TABLE IF EXISTS clients;
      DROP TABLE IF EXISTS cron_jobs;
      DROP TABLE IF EXISTS heartbeat_logs;
      DROP TABLE IF EXISTS heartbeat_configs;
      DROP TABLE IF EXISTS compactions;
      DROP TABLE IF EXISTS memory_state;
      DROP TRIGGER IF EXISTS memory_facts_ad;
      DROP TRIGGER IF EXISTS memory_facts_ai;
      DROP TABLE IF EXISTS memory_facts_fts;
      DROP TABLE IF EXISTS memory_facts;
      DROP TRIGGER IF EXISTS messages_au;
      DROP TRIGGER IF EXISTS messages_ad;
      DROP TRIGGER IF EXISTS messages_ai;
      DROP TABLE IF EXISTS messages_fts;
      DROP TABLE IF EXISTS messages;
      DROP TABLE IF EXISTS conversations;
      DROP TABLE IF EXISTS agent_channels;
      DROP TABLE IF EXISTS agents;
      DROP TABLE IF EXISTS accounts;
      DROP TABLE IF EXISTS config;
    `);
  },
};

export default migration;

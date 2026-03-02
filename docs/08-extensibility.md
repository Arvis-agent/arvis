# 08 — Extensibility
> Adding custom tools, connectors, skills, and plugins. How to make Arvis do anything.

---

## The 4 Extension Points

```
┌────────────────────────────────────────────────────────────────┐
│  1. PLUGINS     — Custom tools and connectors (TypeScript)      │
│     plugins/my-tool.ts                                         │
│     → registerTool() call                                      │
│     → Auto-loaded on startup                                   │
├────────────────────────────────────────────────────────────────┤
│  2. SKILLS      — Agent knowledge files (Markdown)             │
│     skills/my-skill.md                                         │
│     → Injected into agent prompts when keywords match          │
│     → Import from URL via dashboard                            │
├────────────────────────────────────────────────────────────────┤
│  3. CONNECTORS  — New messaging platforms                       │
│     packages/connector-myplatform/                             │
│     → Implements send/receive via MessageBus                   │
├────────────────────────────────────────────────────────────────┤
│  4. MIGRATIONS  — Database schema changes                       │
│     packages/core/src/db/migrations/00N-name.ts                │
│     → Type-safe SQL migrations run on startup                  │
└────────────────────────────────────────────────────────────────┘
```

---

## 1. Custom Tools (Plugins)

Create a file in `plugins/` — it's auto-loaded on startup.

### Minimal Example
```ts
// plugins/my-tool.ts
import { registerTool } from '@arvis/core';

registerTool(
  {
    name: 'get_weather',
    description: 'Get weather for a city',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
      },
      required: ['city'],
    },
  },
  async (input) => {
    const res = await fetch(`https://wttr.in/${input.city}?format=3`);
    return await res.text();
  }
);
```

Then in dashboard → Agent → Config → Allowed Tools, add `get_weather`.

### Built-in Tools Available
```
web_search     — DuckDuckGo search
http_fetch     — Fetch any URL (HTML stripped, 3000 char limit)
calculate      — Safe math evaluation
get_time       — Current ISO datetime
```

### Plugin Load Order
Files are loaded alphabetically. Use numeric prefixes for specific order:
```
plugins/01-database-tools.ts   ← loads first
plugins/02-github-tool.ts
plugins/03-slack-tool.ts
```

---

## 2. Skills (Agent Knowledge)

Skills are `.md` files with YAML frontmatter. They get injected into the agent's prompt when the user's message matches the triggers.

### Skill File Format
```markdown
---
slug: solana-price
name: Solana Price Monitor
description: How to check Solana (SOL) price
category: crypto
author: you
triggers:
  keywords: [solana, SOL, sol, crypto, price, token]
  patterns: [".*price.*", ".*how much.*"]
---

# Checking Solana Price

Use the http_fetch tool to get the current SOL price:

Fetch: https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true

Response format:
{"solana":{"usd":142.30,"usd_24h_change":2.5}}

Format the response as: "SOL is currently $XXX.XX (▲/▼ X.XX% in 24h)"
```

### Adding Skills
**Via dashboard:**
1. Go to Skills page
2. Click "Import" to paste markdown
3. Click "Import from URL" to fetch from GitHub/URL

**Via filesystem:**
Drop `.md` files in the `skills/` directory — they're loaded on startup.

**Via SQL:**
```sql
INSERT INTO skills (slug, name, file_path, trigger_patterns)
VALUES ('my-skill', 'My Skill', 'skills/my-skill.md', '{"keywords":["keyword1","keyword2"]}');
```

### Importing from GitHub
You can share skills as GitHub Gists or repo files:
```
Dashboard → Skills → Import from URL
URL: https://raw.githubusercontent.com/user/repo/main/skills/my-skill.md
```

---

## 3. Custom Connectors

A connector bridges a messaging platform to Arvis's `MessageBus`.

### Connector Structure
```
packages/connector-myplatform/
  package.json
  src/
    index.ts        ← MyPlatformConnector class
```

### Minimal Connector
```ts
// packages/connector-myplatform/src/index.ts
import type { MessageBus, IncomingMessage } from '@arvis/core';

export class MyPlatformConnector {
  constructor(
    private bus: MessageBus,
    private config: { apiKey: string },
  ) {}

  async start(): Promise<void> {
    // Connect to your platform and listen for messages
    mySDK.on('message', (msg) => {
      // Normalize to Arvis IncomingMessage format
      const normalized: IncomingMessage = {
        id: msg.id,
        platform: 'myplatform',
        channelId: msg.channelId,
        userId: msg.userId,
        userName: msg.userName,
        content: msg.text,
        timestamp: new Date(),
        metadata: {},
      };
      this.bus.emit('message', normalized);
    });

    // Send responses back to the platform
    this.bus.on('send', async ({ platform, channelId, content }) => {
      if (platform !== 'myplatform') return;
      await mySDK.send(channelId, content);
    });
  }

  async stop(): Promise<void> {
    // Cleanup
  }
}
```

### Register in ConnectorManager
Edit `packages/core/src/connectors/connector-manager.ts` to add your connector.

---

## 4. Database Migrations

When you need to add a table or column, create a new migration:

```ts
// packages/core/src/db/migrations/004-my-feature.ts
import type { Migration } from '../database.js';

const migration: Migration = {
  version: 4,
  name: '004-my-feature',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS my_table (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id    INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        data        TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_my_table_agent ON my_table(agent_id);
    `);
  },
};

export default migration;
```

Then in `arvis.ts`:
```ts
import myMigration from './db/migrations/004-my-feature.js';

// In start():
this.db.migrate([
  initialMigration,
  multiProviderMigration,
  botInstancesMigration,
  myMigration,   // ← add here
]);
```

Migrations run once in order. Already-run migrations are skipped (tracked in `migrations` table).

---

## Conductor Action Tags (Extending The Conductor)

The conductor uses special tags to create/update things. You can add new tag types by modifying `ConductorParser`:

Existing tags:
```
[CREATE_AGENT] ... [/CREATE_AGENT]
[UPDATE_AGENT:slug] ... [/UPDATE_AGENT]
[CREATE_HEARTBEAT] ... [/CREATE_HEARTBEAT]
[CREATE_CRON] ... [/CREATE_CRON]
[CREATE_CLIENT] ... [/CREATE_CLIENT]
[DELEGATE:agent-slug] task [/DELEGATE]
```

To add a new tag:
1. Add the tag pattern to `ConductorParser.parse()` in `packages/core/src/agents/conductor.ts`
2. Add the handler in `ConductorParser.execute()`
3. Document it in `CONDUCTOR_SYSTEM_PROMPT` so the conductor knows to use it

---

## Available APIs In Plugins

```ts
import {
  // Tool registration
  registerTool,           // Register a custom tool
  getAllToolNames,         // Get all tool names (built-in + plugins)
  ToolDefinition,         // Type for tool schema
  ToolParam,              // Type for parameter schema

  // Messaging
  MessageBus,             // Event bus
  IncomingMessage,        // Normalized incoming message type

  // Data access
  ArvisDatabase,          // SQLite database wrapper
  AgentRegistry,          // CRUD for agents
  ConversationManager,    // Conversations + messages
  MemoryManager,          // Agent memory (facts + state)
  QueueManager,           // Job queue

  // Runner
  AgentRunner,            // LLM execution
  RateLimitError,         // Rate limit error type

  // Utilities
  createLogger,           // Pino logger factory
} from '@arvis/core';
```

# 01 — Architecture Overview
> Every process, every port, every module and what it does.

---

## The Two Processes

Arvis runs as **two separate Node.js processes** that share a SQLite database:

```
┌─────────────────────────────────────────────────────────────────┐
│  PROCESS 1: Arvis Core  (node src/main.ts)                      │
│                                                                  │
│  - The "brain" — handles all actual agent work                  │
│  - Connects to Discord, Telegram, Slack, etc.                   │
│  - Runs the LLM (Claude CLI or direct API)                      │
│  - Manages the job queue                                        │
│  - Runs scheduled tasks                                         │
│  - Exposes WebSocket on :5070 (for dashboard chat)              │
│  - Exposes HTTP on :5050 (for external webhooks)               │
└─────────────────────────────────────────────────────────────────┘
                        │
                        │ Both read/write same file:
                        │ data/arvis.db (SQLite, WAL mode)
                        │
┌─────────────────────────────────────────────────────────────────┐
│  PROCESS 2: Dashboard  (next dev --port 5100)                   │
│                                                                  │
│  - The "eyes" — admin UI for monitoring and configuration       │
│  - Next.js 15 app, imports @arvis/core to read DB directly      │
│  - NO separate API server — DB reads happen in API route        │
│    handlers that import from packages/core                      │
│  - Dashboard chat goes through :5070 (Process 1's WebSocket)    │
└─────────────────────────────────────────────────────────────────┘
```

### Why WAL Mode For SQLite?
WAL (Write-Ahead Logging) allows multiple readers AND one writer simultaneously. This means both processes can read/write the same DB file without locking each other out.

---

## Ports

| Port | Service | Used By |
|------|---------|---------|
| **5100** | Dashboard (Next.js) | Your browser |
| **5070** | Web Connector (WebSocket + REST) | Dashboard chat, external REST calls |
| **5050** | Webhook Server | GitHub, Zapier, or any HTTP caller |

---

## Full Module Map

```
packages/core/src/
│
├── arvis.ts                 ← MAIN ORCHESTRATOR
│   Wires everything together. The class you instantiate.
│   start() → connects all modules, starts queue, connects bots
│
├── config.ts                ← CONFIG LOADER
│   Reads .env, detects CLI accounts (HOME dirs), API keys
│   Returns ArvisConfig with all settings
│
├── logger.ts                ← STRUCTURED LOGGER
│   Pino-based JSON logger. LOG_LEVEL env var.
│   Used as: const log = createLogger('module-name')
│
├── db/
│   ├── database.ts          ← DB WRAPPER
│   │   Wraps better-sqlite3. Adds run(), get(), all(), transaction()
│   │   WAL mode, foreign keys ON, busy timeout 5s
│   ├── schema.ts            ← TS INTERFACES FOR DB ROWS
│   │   ConversationRow, MessageRow, AgentRow, etc.
│   └── migrations/
│       ├── 001-initial.ts   ← BASE SCHEMA (all core tables)
│       └── 002-multi-provider.ts ← accounts, usage_log tables
│
├── agents/
│   ├── agent.ts             ← AGENT TYPE DEFINITION
│   │   AgentConfig interface: id, slug, name, role, model,
│   │   allowedTools, systemPrompt, personality, etc.
│   ├── agent-registry.ts    ← AGENT CRUD
│   │   getAll(), getById(), getBySlug(), create(), update(), delete()
│   │   Also manages channel bindings (agent_channels table)
│   ├── conductor.ts         ← CONDUCTOR SYSTEM
│   │   CONDUCTOR_SYSTEM_PROMPT constant
│   │   ConductorParser: parses [CREATE_AGENT], [CREATE_CRON] etc.
│   │   execute() runs parsed actions against the registry
│   ├── router.ts            ← MESSAGE ROUTER
│   │   route(msg) → Agent | null
│   │   6-step priority logic (see 03-routing.md)
│   └── delegation-parser.ts ← DELEGATION TAGS
│       parseDelegations() → finds [DELEGATE:slug] blocks
│       stripDelegations() → removes them from response text
│
├── conversation/
│   ├── conversation-manager.ts ← CONVERSATION CRUD
│   │   getOrCreate() → finds or creates for (agent+platform+channel)
│   │   addMessage() → stores message, updates token estimate
│   │   compact() → two-phase: memory flush + summarize
│   │   getHistory() → with token budget trimming
│   ├── context-builder.ts   ← PROMPT ASSEMBLY
│   │   build() → assembles full LLM context (6 layers)
│   │   getCompactionThreshold() → 75% of model's context window
│   └── types.ts             ← Conversation, Message TS types
│
├── runner/
│   ├── agent-runner.ts      ← RUNNER ORCHESTRATOR
│   │   execute() → picks best account, handles failover
│   │   3-stage: preferred → fallback chain → any account
│   ├── cli-runner.ts        ← CLAUDE CLI SUBPROCESS
│   │   Spawns: claude --print --continue (in conversation CWD)
│   │   Prompt via stdin, response from stdout
│   │   180s timeout
│   ├── provider-runner.ts   ← DIRECT API RUNNER
│   │   Supports: Anthropic, OpenAI, OpenRouter, Google, Ollama, custom
│   │   Multi-turn tool loop (up to 5 tool calls per response)
│   ├── account-manager.ts   ← ACCOUNT POOL
│   │   getAvailable(), markRateLimited(), clearRateLimit()
│   │   recordUsage(), recordCost()
│   ├── classifier.ts        ← COMPLEXITY CLASSIFIER
│   │   classifyComplexity(prompt) → 'fast' | 'full'
│   │   'fast' = short/simple → use haiku/mini
│   │   'full' = complex → use sonnet/opus
│   └── types.ts             ← RunRequest, RunResult, Provider types
│
├── memory/
│   ├── memory-manager.ts    ← MEMORY SYSTEM
│   │   parseAndSave() → extracts [MEMORY:*] [STATE:*] tags from output
│   │   getFacts() → retrieves facts for agent (FTS5 search)
│   │   stripTags() → removes memory tags from response
│   └── types.ts             ← MemoryFact, KVPair types
│
├── queue/
│   ├── queue-manager.ts     ← JOB QUEUE
│   │   enqueue() → adds job, calls setImmediate(processNext) instantly
│   │   processNext() → marks running, executes, handles retry
│   │   recoverStuckJobs() → marks 5min+ running jobs as failed
│   └── types.ts             ← QueueJob, QueueStatus types
│
├── scheduler/
│   └── scheduler.ts         ← CRON + HEARTBEAT RUNNER
│       Polls every 10s. Flood guard prevents duplicate jobs.
│       Supports: "every 5m", "0 9 * * *", "*/10 * * * * *"
│
├── bus/
│   ├── message-bus.ts       ← EVENT BUS
│   │   EventEmitter. 'message', 'send', 'typing' events.
│   │   Connectors and core talk through here, never directly.
│   └── types.ts             ← IncomingMessage, OutgoingMessage types
│
├── skills/
│   ├── skill-loader.ts      ← LOADS .md SKILL FILES
│   │   Reads skills/*.md, inserts into skills DB table
│   └── skill-injector.ts    ← INJECTS RELEVANT SKILLS
│       Scores skills by keyword match to current message
│       Only injects skills with score > 0 (prevents prompt bloat)
│
├── tools/
│   └── tool-executor.ts     ← BUILT-IN TOOLS
│       web_search  → DuckDuckGo Instant Answers
│       calculate   → Safe math eval (whitelisted operations)
│       get_time    → Current datetime
│       http_fetch  → Fetches URL, strips HTML, 3000 char limit
│
├── billing/
│   └── billing-manager.ts   ← CLIENT BILLING
│       Clients, charges, balances. Used if you bill clients.
│
├── webhooks/
│   └── webhook-server.ts    ← EXTERNAL HTTP TRIGGERS
│       HTTP server on :5050
│       Validates HMAC signature, enqueues job for agent
│
└── connectors/
    └── connector-manager.ts ← BOT INSTANCE MANAGER
        Reads bot_instances table, starts/stops connectors
        Polls DB every 30s for changes (hot-reload)
        seedFromEnv() → imports env-var bots to DB on first run
```

---

## Data Directories

```
data/
├── arvis.db          ← Main SQLite database (all state lives here)
├── arvis.db-shm      ← SQLite WAL shared memory (auto-managed)
├── arvis.db-wal      ← SQLite WAL journal (auto-managed)
├── sessions/
│   ├── 1/            ← Claude CLI working dir for conversation #1
│   ├── 2/            ← Claude CLI working dir for conversation #2
│   └── ...           ← One dir per conversation = no context bleed
└── backups/
    ├── arvis-2026-03-01.db
    └── arvis-2026-03-02.db  ← Daily backup, last 7 kept
```

---

## Environment Variables

```bash
# Core
ARVIS_DATA_DIR=./data         # Where DB and sessions live

# LLM — at least one required
CLAUDE_CLI_HOME=~/.claude     # CLI subscription (Max plan)
ANTHROPIC_API_KEY=sk-ant-...  # Direct Anthropic API
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
GOOGLE_API_KEY=AIza...
OLLAMA_BASE_URL=http://localhost:11434

# Multiple accounts (add _1 _2 ... _50)
ANTHROPIC_API_KEY_1=sk-ant-...
ANTHROPIC_API_KEY_2=sk-ant-...
CLAUDE_CLI_HOME_1=~/.claude-work
CLAUDE_CLI_HOME_2=~/.claude-personal

# Platform bots
DISCORD_TOKEN=...
DISCORD_OWNER_ID=123456789
TELEGRAM_BOT_TOKEN=...
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
EMAIL_IMAP_HOST=imap.gmail.com
EMAIL_IMAP_USER=you@gmail.com
EMAIL_IMAP_PASS=app-password

# Dashboard
DASHBOARD_PASSWORD=           # If set, login gate activates
WEB_CONNECTOR_PORT=5070
```

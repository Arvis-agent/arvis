# Arvis v3 — Complete System Design
> Every flow, every component, every decision. With OpenClaw comparison.
> Last updated: 2026-03-02

---

## 1. What Is Arvis?

Arvis is a **self-hosted AI agent platform**. You run it on your own machine or VPS. It connects your AI agents (Claude, GPT-4, Gemini, Ollama, etc.) to messaging platforms (Discord, Telegram, Slack, WhatsApp, etc.) and manages all the hard parts: conversation history, memory, scheduling, multi-agent coordination, and cost tracking.

**Core philosophy:** The LLM provides intelligence. Arvis provides the execution environment — sessions, routing, context budgets, memory, scheduling, failover.

---

## 2. Big Picture — Every Process & Port

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           YOUR MACHINE / VPS                                │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     ARVIS CORE PROCESS                               │   │
│  │                   (Node.js, always running)                          │   │
│  │                                                                      │   │
│  │   MessageBus ──── Router ──── QueueManager ──── AgentRunner         │   │
│  │       │              │              │                │               │   │
│  │   ConnectorMgr   Conductor     Scheduler       CLIRunner             │   │
│  │                              (cron/heartbeat)  ProviderRunner        │   │
│  │                                                AccountManager        │   │
│  │  Webhook Server (:5050)                                              │   │
│  │  Web Connector  (:5070)  ◄── WebSocket for dashboard chat           │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                 DASHBOARD PROCESS                                    │   │
│  │              (Next.js 15, port 5100)                                 │   │
│  │   Reads/writes same SQLite DB as core via @arvis/core imports        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────┐    ┌───────────────┐    ┌──────────────────────────┐     │
│  │  arvis.db    │    │  /data/       │    │  ~/.claude/              │     │
│  │  (SQLite,    │    │  sessions/    │    │  (Claude CLI subscription │     │
│  │   WAL mode)  │    │  <convId>/    │    │   sessions, ONE per HOME) │     │
│  └──────────────┘    └───────────────┘    └──────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
   Discord API         Telegram API         Slack API       (etc.)
```

### Ports At A Glance

| Port | Service | What Uses It |
|------|---------|--------------|
| **5100** | Dashboard (Next.js) | Your browser |
| **5070** | Web Connector (WebSocket + HTTP) | Dashboard chat |
| **5050** | Webhook Server | External triggers (GitHub, Zapier, etc.) |

---

## 3. Core Components — What Each One Does

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ARVIS CORE MODULES                          │
├─────────────────┬───────────────────────────────────────────────────┤
│ MODULE          │ WHAT IT DOES                                      │
├─────────────────┼───────────────────────────────────────────────────┤
│ MessageBus      │ EventEmitter. Connectors emit 'message', core     │
│                 │ emits 'send'. Nobody talks to each other directly. │
├─────────────────┼───────────────────────────────────────────────────┤
│ Router          │ Decides WHICH AGENT handles each message.         │
│                 │ 6-step priority (see Section 5).                  │
├─────────────────┼───────────────────────────────────────────────────┤
│ ConversationMgr │ Stores messages in SQLite. One conversation per   │
│                 │ (agent + platform + channel). Handles compaction. │
├─────────────────┼───────────────────────────────────────────────────┤
│ ContextBuilder  │ Builds the actual prompt sent to the LLM.        │
│                 │ 6 layers, token-aware budget. (See Section 8)     │
├─────────────────┼───────────────────────────────────────────────────┤
│ QueueManager    │ SQLite job queue. All LLM calls go through here. │
│                 │ Priority, retries, exponential backoff.           │
├─────────────────┼───────────────────────────────────────────────────┤
│ AgentRunner     │ Selects which account/provider to use. Handles   │
│                 │ rate limit failover silently. (See Section 6)     │
├─────────────────┼───────────────────────────────────────────────────┤
│ CLIRunner       │ Spawns `claude --print` subprocess. Used for     │
│                 │ Claude Max subscription accounts.                 │
├─────────────────┼───────────────────────────────────────────────────┤
│ ProviderRunner  │ Direct HTTP API calls. Anthropic, OpenAI,        │
│                 │ OpenRouter, Google, Ollama, custom. Tool loops.  │
├─────────────────┼───────────────────────────────────────────────────┤
│ AccountManager  │ Tracks all LLM accounts. Rotates on rate limits. │
│                 │ Records usage and cost per request.               │
├─────────────────┼───────────────────────────────────────────────────┤
│ MemoryManager   │ Parses [MEMORY:*] tags from LLM output. Stores  │
│                 │ facts + KV state in SQLite. FTS5 search.         │
├─────────────────┼───────────────────────────────────────────────────┤
│ ConductorParser │ Parses [CREATE_AGENT], [CREATE_CRON], etc. tags  │
│                 │ from conductor responses and executes them.       │
├─────────────────┼───────────────────────────────────────────────────┤
│ Scheduler       │ Runs heartbeat + cron jobs. Checks every 10s.   │
│                 │ Flood guard: skips if job already pending/running.│
├─────────────────┼───────────────────────────────────────────────────┤
│ ConnectorMgr    │ Starts/stops bot instances from bot_instances DB. │
│                 │ Polls every 30s for config changes.               │
├─────────────────┼───────────────────────────────────────────────────┤
│ SkillInjector   │ Scores .md skill files by keyword relevance to   │
│                 │ the current message. Injects only relevant ones.  │
└─────────────────┴───────────────────────────────────────────────────┘
```

---

## 4. Complete Message Flow — From User to Response

This is the main flow. Every user message goes through ALL these steps.

```
USER sends message
  │
  │  (e.g. Discord, Telegram, WhatsApp, Dashboard chat, Webhook)
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  CONNECTOR (e.g. connector-discord, connector-telegram)         │
│  - Receives platform event                                      │
│  - Normalizes to IncomingMessage:                               │
│    { id, platform, channelId, userId, userName, content,       │
│      timestamp, attachments? }                                  │
│  - Downloads any media (photos/voice) if needed                 │
└─────────────────────────────────────────────────────────────────┘
  │
  │  bus.emit('message', msg)
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  ROUTER — finds which agent handles this message                │
│  Step 0: metadata.assignedAgentId?  → that agent               │
│  Step 1: channel in agent_channels? → that agent               │
│  Step 2: @agent-name mention?       → that agent               │
│  Step 3: conductor channel?         → conductor agent           │
│  Step 4: dashboard-agent-{id}?      → that specific agent      │
│  Step 5: DM or isDM metadata?       → conductor agent           │
│  → No match = drop message                                      │
└─────────────────────────────────────────────────────────────────┘
  │
  │  Permission check: canUserMessage(userId, agent)
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  bus.emit('typing', { channelId, platform })                    │
│  → Shows "..." indicator to user immediately                    │
└─────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  ConversationManager.getOrCreate()                              │
│  - Finds or creates conversation for (agent + platform + channel)│
│  - One conversation = one chat thread                           │
│  - Stores user message in messages table                        │
└─────────────────────────────────────────────────────────────────┘
  │
  │  Should compact?  (token estimate > 75% of model's context window)
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  COMPACTION (if needed)                                         │
│  Phase 1: Pre-compaction memory flush                           │
│    - Send old messages to LLM: "extract key facts"             │
│    - Save [MEMORY:*] tagged facts to memory_facts              │
│  Phase 2: Summarize                                             │
│    - Send old messages to LLM: "summarize this"                │
│    - Delete old messages from DB                                │
│    - Save summary in compactions table                          │
│    - Token count resets to recent messages only                 │
└─────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  ContextBuilder.build()  →  builds the full prompt              │
│  (See Section 8 for the 6-layer breakdown)                      │
│                                                                 │
│  Output: { systemPrompt, messages[], summaryText }              │
└─────────────────────────────────────────────────────────────────┘
  │
  │  Handle image attachments (download/base64 encode)
  │  Calculate priority (1=urgent, 10=background)
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  QueueManager.enqueue({                                         │
│    agentId, type: 'message',                                    │
│    payload: { conversationId, systemPrompt, prompt,             │
│               channelId, platform, images? }                    │
│  })                                                             │
│  → Stored in queue table as status='pending'                    │
│  → setImmediate(processNext) fires immediately (no 1s wait)     │
└─────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  QueueManager.processNext()                                     │
│  - Marks job status='running'                                   │
│  - Calls processJob(job)                                        │
└─────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  processJob()                                                   │
│  1. Look up agent from registry                                 │
│  2. Inject relevant skills into system prompt                   │
│  3. Filter agent's allowedTools to BUILT_IN_TOOL_NAMES          │
│  4. Create per-conversation working dir:                        │
│     data/sessions/{conversationId}/                             │
│     (isolates Claude CLI session per conversation)              │
│  5. Call AgentRunner.execute(request)                           │
└─────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  AgentRunner — selects account, handles failover                │
│  (See Section 6 for full failover logic)                        │
│                                                                 │
│  → If CLI account: CLIRunner.execute()                          │
│    - Spawns: claude --print --continue (in conversation CWD)    │
│    - Prompt piped via stdin                                     │
│    - Output read from stdout                                    │
│                                                                 │
│  → If API account: ProviderRunner.execute()                     │
│    - Direct HTTP to Anthropic/OpenAI/Google/Ollama              │
│    - Multi-turn tool loop (up to 5 tool calls)                  │
│    - Handles tool_use → tool_result protocol                    │
└─────────────────────────────────────────────────────────────────┘
  │
  │  LLM returns response text
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  RESPONSE PROCESSING                                            │
│                                                                 │
│  MemoryManager.parseAndSave()                                   │
│  - Extracts [MEMORY:category:content] → memory_facts table      │
│  - Extracts [STATE:key:value] → memory_state table              │
│                                                                 │
│  IF conductor agent:                                            │
│  ConductorParser.parse() + execute()                            │
│  - [CREATE_AGENT] → inserts into agents table                   │
│  - [CREATE_CRON] → inserts into cron_jobs table                 │
│  - [CREATE_HEARTBEAT] → inserts into heartbeat_configs          │
│  - [UPDATE_AGENT:slug] → updates agent record                   │
│  - [CREATE_CLIENT] → creates billing client                     │
│                                                                 │
│  DelegationParser.parseDelegations()                            │
│  - [DELEGATE:agent-slug] task [/DELEGATE]                       │
│  - Finds target agent by slug                                   │
│  - Enqueues sub-job at priority 4 (non-blocking, fire-and-forget)│
│                                                                 │
│  stripDelegations() + stripActions() + memoryManager.stripTags()│
│  - Removes all tag blocks from final response text              │
└─────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  Store assistant message in messages table                      │
└─────────────────────────────────────────────────────────────────┘
  │
  │  bus.emit('send', { channelId, platform, content })
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  CONNECTOR sends response back to platform                      │
│  User sees the message                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Router Priority Logic

```
Incoming message
│
├─── Has metadata.assignedAgentId?
│    └─ YES → Route to that bot's assigned agent
│             (e.g. Telegram bot linked to "sol-price-monitor")
│
├─── Channel in agent_channels table?
│    └─ YES → Route to bound agent
│             (e.g. #general channel bound to "support-agent")
│
├─── Message contains "@agent-name"?
│    └─ YES → Route to that named agent
│
├─── Channel is conductor's designated channel?
│    └─ YES → Route to conductor agent
│
├─── Channel ID matches "dashboard-agent-{id}"?
│    └─ YES → Route to that specific agent
│             (dashboard chat page uses this pattern)
│
└─── DM channel or metadata.isDM = true?
     └─ YES → Route to conductor agent
              NO MATCH → Drop message (silent ignore)
```

---

## 6. Account Failover — How Rate Limits Are Handled Silently

The user NEVER sees a rate limit error. Here's how:

```
AgentRunner.execute(request, depth=0)
│
├─── Parse model spec from agent config
│    "anthropic/claude-sonnet-4-6" → [anthropic, claude-sonnet-4-6]
│    "claude-sonnet-4-6" → [anthropic, claude-sonnet-4-6] (legacy)
│    "openai/gpt-4.1" → [openai, gpt-4.1]
│
├─── Stage 1: Try preferred provider
│    accountManager.getAvailableForProvider('anthropic')
│    → Picks active account with lowest usage (not rate-limited)
│
├─── Stage 2: Try fallback providers from agent.modelFallbacks[]
│    e.g. ["openrouter/claude-sonnet-4-6", "openai/gpt-4.1-mini"]
│    → For each fallback, try its provider
│
├─── Stage 3: Any available account at all
│    classifyComplexity(prompt) → 'fast' or 'full'
│    accountManager.getAvailable(mode) → first non-limited account
│
├─── No account found?
│    → throw RateLimitError("All accounts temporarily unavailable")
│
└─── Account found, determine runner:
     account.type === 'cli_subscription'?
       → CLIRunner.execute(enrichedRequest)
     account.type === 'api_key'?
       → ProviderRunner.execute(enrichedRequest)

     On RateLimitError:
       accountManager.markRateLimited(account.id, retryAfter)
       → Recursive call: execute(request, depth+1)
       (tries again with different account, user sees nothing)

     On success:
       accountManager.clearRateLimit(account.id)
       accountManager.recordUsage(account.id)
       accountManager.recordCost(account.id, inputTokens, outputTokens, ...)
```

---

## 7. Queue System — Every LLM Call Is a Job

```
┌─────────────────────────────────────────────────────────────┐
│                    QUEUE TABLE (SQLite)                     │
│                                                             │
│  id | agent_id | type     | status  | priority | attempts  │
│  ───┼──────────┼──────────┼─────────┼──────────┼──────────  │
│  1  | 1        | message  | running | 5        | 1         │
│  2  | 2        | message  | pending | 5        | 0         │
│  3  | 1        | heartbeat| pending | 10       | 0         │
│  4  | 3        | cron     | failed  | 10       | 3         │
└─────────────────────────────────────────────────────────────┘

Priority: 1=urgent → 10=background
  1 = system critical
  4 = delegation sub-jobs
  5 = normal user messages  (default)
  10 = scheduled tasks (heartbeats, cron)

Job lifecycle:
  pending → running → completed
                    → failed (if attempts >= max_attempts=3)
                    → pending again (retry with exponential backoff)

Retry backoff: 2^attempts minutes
  Attempt 1 fails → retry after 2 min
  Attempt 2 fails → retry after 4 min
  Attempt 3 fails → PERMANENT FAILURE (status=failed)

Stuck job recovery:
  On startup + every 5min:
  Any job in 'running' for >5 minutes → forced to 'failed'
  (handles process crashes)

Instant dispatch:
  enqueue() calls setImmediate(processNext)
  → Job starts within ms, not waiting for 1s poll
```

---

## 8. Context Building — 6-Layer Prompt Assembly

This is what the LLM actually receives for every message.

```
┌─────────────────────────────────────────────────────────────────┐
│               FULL CONTEXT = SYSTEM PROMPT + HISTORY            │
│               (Token budget: model.contextWindow - 20K reserve) │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 1: SYSTEM PROMPT (assembled):                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ [Base system prompt]  ← agent.systemPrompt from DB        │  │
│  │   OR conductor prompt ← CONDUCTOR_SYSTEM_PROMPT           │  │
│  │                                                           │  │
│  │ [Sticky facts]        ← memory_facts WHERE confidence=1   │  │
│  │  "User's name is X"                                       │  │
│  │  "Always use metric units"                                │  │
│  │                                                           │  │
│  │ [Regular facts]       ← recent memory_facts               │  │
│  │  "User prefers dark mode"                                 │  │
│  │                                                           │  │
│  │ [State KV pairs]      ← memory_state                      │  │
│  │  "last_project=arvis-v3"                                  │  │
│  │                                                           │  │
│  │ [Compaction summaries] ← last 3 compactions               │  │
│  │  "Previous conversation: user asked about X..."           │  │
│  │                                                           │  │
│  │ [Skills] (if relevant) ← skill_injector scored content    │  │
│  │  Injected only if keyword score > 0                       │  │
│  │                                                           │  │
│  │ [Tools hint]  ← if agent has allowedTools                 │  │
│  │ [Delegation hint] ← for non-conductor agents              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  LAYER 2: CONVERSATION HISTORY                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ [Previous summary]  ← if compaction happened              │  │
│  │ [user]: message 1                                         │  │
│  │ [assistant]: response 1                                   │  │
│  │ [user]: message 2                                         │  │
│  │ ...                                                       │  │
│  │ [user]: CURRENT MESSAGE  ← new message                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Token budget enforcement:                                       │
│  - History is trimmed from oldest → newest to fit budget        │
│  - System prompt layers have own budget (min reserved)          │
│  - Sticky facts NEVER trimmed                                   │
└─────────────────────────────────────────────────────────────────┘

Model context windows (from context-builder.ts):
  claude-opus-4-6           200,000 tokens
  claude-sonnet-4-6         200,000 tokens
  claude-haiku-4-5          200,000 tokens
  gpt-4.1 / gpt-4.1-mini   1,048,576 tokens (1M!)
  gemini-2.5-pro            2,097,152 tokens (2M!)
  gemini-2.5-flash          1,048,576 tokens
  llama-4                   10,485,760 tokens
  default                   200,000 tokens

Budget = contextWindow × 0.75 (compaction threshold)
Reserve = 20,000 tokens (for response headroom)
```

---

## 9. CLI Session Isolation (Per-Conversation CWDs)

**The problem before this fix:**
All messages for Agent A used the same working directory. `--continue` picks up the last session in that CWD. So conversation #42 and conversation #43 could bleed into each other.

**The fix:**
Each conversation gets its own CWD. `--continue` always refers to that specific conversation.

```
data/
└── sessions/
    ├── 1/          ← Conversation #1's Claude CLI session lives here
    ├── 2/          ← Conversation #2's Claude CLI session lives here
    ├── 42/         ← Conversation #42 (your Conductor chat)
    └── 43/         ← Conversation #43 (SOL Price Monitor chat)

When account switches (HOME changes):
  Same CWD + different HOME = new CLI session
  But Arvis's history injection keeps context intact
  (conversation history is in the prompt, not Claude's session memory)
```

---

## 10. Scheduler — How Automated Tasks Work

```
Scheduler polls every 10 seconds
│
├─── For each enabled heartbeat_config:
│    Parse schedule: "every 5m", "every 30s", "0 9 * * *"
│    next_run <= now?
│    │
│    ├── YES: Is there already a pending/running job for this configId?
│    │        FLOOD GUARD → skip if yes (prevents duplicate jobs)
│    │        → QueueManager.enqueue({ priority: 10, type: 'heartbeat' })
│    │        → Update last_run, next_run in DB
│    │
│    └── NO: Skip (not due yet)
│
└─── For each enabled cron_job:
     Same logic with cronId flood guard
```

Supported schedule formats:
- `"every 5m"` → every 5 minutes
- `"every 30s"` → every 30 seconds
- `"every 2h"` → every 2 hours
- `"0 9 * * *"` → standard 5-field cron (9am daily)
- `"*/10 * * * * *"` → 6-field cron with seconds

---

## 11. Dashboard WebSocket Chat Flow

```
BROWSER (dashboard /chat page)
│
│  1. Mount AgentChat component (key={agentId} ensures fresh mount per agent)
│  2. useWebSocket({ agentId }) runs
│  3. Connect to ws://localhost:5070
│  4. Send auth message:
│     { type:'auth', userId:'dashboard-user', userName:'You',
│       channelId:'dashboard-agent-{agentId}' }
│
│  5. Wait for { type:'auth_ok' }
│
│  6. Load history: GET /api/agents/{id}/history
│     → Shows past messages (only user/assistant roles, not system)
│
USER types and sends
│  7. Send: { type:'message', content:'hello' }
│
CONNECTOR-WEB (port 5070)
│  8. Receives WS message
│  9. bus.emit('message', {
│       platform: 'web',
│       channelId: 'dashboard-agent-{agentId}',
│       metadata: { source:'websocket', isDM:true }
│     })
│
ARVIS CORE processes (full flow from Section 4)
│  (Router step 4 matches 'dashboard-agent-{id}' → routes to that agent)
│
│  10. bus.emit('typing', { channelId, platform:'web' })
│      → Connector-web broadcasts: { type:'typing' }
│      → Dashboard shows typing dots (3-dot animation)
│
│  11. LLM responds
│      bus.emit('send', { channelId, platform:'web', content:'...' })
│
CONNECTOR-WEB
│  12. Finds all WS clients in this channelId
│  13. Broadcasts: { type:'message', content:'...', role:'assistant' }
│
BROWSER
│  14. useWebSocket receives message
│  15. Adds to messages[] with isNew:true
│  16. StreamText component runs typewriter animation → swaps to markdown
│  17. Auto-scrolls to bottom (double-RAF after React paint)
```

---

## 12. Connector System — How Bots Are Managed

```
ConnectorManager (polls DB every 30s)
│
├─── On startup: seedFromEnv()
│    Reads env vars (DISCORD_TOKEN, TELEGRAM_BOT_TOKEN, etc.)
│    Inserts into bot_instances table if not already there
│
├─── Compares running Map vs enabled bot_instances rows
│
├─── For each new enabled bot → start it
│    if (platform === 'discord')   → new DiscordConnector(bus, token, agentId)
│    if (platform === 'telegram')  → new TelegramConnector(bus, token, agentId)
│    if (platform === 'slack')     → new SlackConnector(bus, ...)
│    if (platform === 'whatsapp')  → new WhatsAppConnector(bus, ...)
│    if (platform === 'matrix')    → new MatrixConnector(bus, ...)
│    if (platform === 'web')       → new WebConnector(bus, port)
│    if (platform === 'sms')       → new SmsConnector(bus, ...)
│    if (platform === 'email')     → new EmailConnector(bus, ...)
│
└─── For each stopped/disabled bot → stop it
     connector.stop() → disconnects, cleans up handlers

Bot instance linking:
  bot_instances.agent_id → routes all messages from this bot
  to the assigned agent (Router step 0)

  e.g. Telegram bot linked to "sol-price-monitor" agent:
  Every Telegram message → directly to sol-price-monitor (bypasses conductor)
```

---

## 13. Memory System — How Agents Remember Things

```
MEMORY SOURCES:
│
├─── [MEMORY:category:content] tags in LLM output
│    Parsed by MemoryManager.parseAndSave() after every response
│    Stored in memory_facts table
│    Categories: sticky, user_preference, project_context, learned_pattern
│
├─── [STATE:key:value] tags in LLM output
│    Stored in memory_state table (key-value pairs per agent)
│
└─── Pre-compaction memory flush
     Before old messages are deleted:
     "Extract key facts from this conversation..."
     → LLM outputs [MEMORY:*] tags
     → Saved to memory_facts BEFORE messages are deleted

MEMORY RETRIEVAL:
  ContextBuilder reads from DB:
  - memory_facts (FTS5 search by relevance to current message)
  - memory_state (all KV pairs for agent)
  - Sticky facts (confidence=1.0) ALWAYS included, never trimmed

MEMORY DEDUP:
  Before saving a new fact:
  - FTS5 search for similar existing facts
  - If similarity > threshold → skip (don't duplicate)

MEMORY IN THE PROMPT:
  Sticky facts → top of system prompt (cache-friendly, always there)
  Regular facts → after sticky, trimmed if over budget
  State KV → human-readable list
  Compaction summaries → after facts (last 3)
```

---

## 14. Agent Tags Reference — What Agents Can Output

The LLM can include special tags in its response. Arvis parses and executes them, then strips them from the final user-visible response.

```
MEMORY TAGS (any agent):
  [MEMORY:sticky] Critical fact never to forget [/MEMORY]
  [MEMORY:user_preference] User likes concise answers [/MEMORY]
  [MEMORY:project_context] Architecture decision X [/MEMORY]
  [STATE:key] value [/STATE]

CONDUCTOR TAGS (conductor agent only):
  [CREATE_AGENT]
  slug: my-agent
  name: My Agent
  role: custom
  model: claude-sonnet-4-6
  [/CREATE_AGENT]

  [UPDATE_AGENT:my-agent]
  system_prompt: New prompt here
  [/UPDATE_AGENT]

  [CREATE_CRON]
  agent: my-agent
  schedule: */10 * * * *
  prompt: Run this task
  channel: 123456
  platform: discord
  [/CREATE_CRON]

  [CREATE_HEARTBEAT]
  agent: my-agent
  schedule: every 1h
  prompt: Send hourly update
  [/CREATE_HEARTBEAT]

  [CREATE_CLIENT]
  name: Client Name
  slug: client-slug
  plan: per_task
  [/CREATE_CLIENT]

DELEGATION TAGS (any agent):
  [DELEGATE:agent-slug]
  Full task description for the sub-agent.
  [/DELEGATE]
  → Spawns async sub-job at priority 4
  → Sub-agent posts result independently to same channel
```

---

## 15. Arvis vs OpenClaw — Detailed Comparison

Both are self-hosted AI agent platforms. Both independently solved the same problems. Here's exactly how they differ:

```
┌──────────────────────────┬─────────────────────────┬────────────────────────────┐
│ DIMENSION                │ OPENCLAW                │ ARVIS v3                   │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Process model            │ Single daemon always    │ Start/stop service         │
│                          │ running (Gateway)       │ (node arvis.js)            │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Agent runtime default    │ Pi SDK embedded in      │ Claude CLI subprocess       │
│                          │ process (in-memory)     │ (claude --print)            │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ API access               │ Direct API (primary)    │ CLI subscription (primary) │
│                          │ CLI proxy (optional)    │ Direct API (fallback)      │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Multi-provider failover  │ Model config fallback   │ 3-stage failover: preferred│
│                          │ list, no auto-rotation  │ → fallback chain → any acct│
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Session storage          │ JSONL files per session │ SQLite (conversations +    │
│                          │ (portable, git-friendly)│ messages tables)           │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Memory storage           │ Markdown files + vector │ SQLite FTS5 memory_facts   │
│                          │ index (semantic search) │ (keyword search)           │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Memory search quality    │ Hybrid vector + BM25    │ SQLite FTS5 keyword-only   │
│                          │ (much better fuzzy recall│ (fast, no embedding model) │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Multi-agent routing      │ Config bindings only    │ Config bindings +          │
│                          │ (static, deterministic) │ conductor LLM routing      │
│                          │                         │ (dynamic delegation)       │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Agent delegation         │ Subagent session flag   │ [DELEGATE:slug] markers    │
│                          │ (minimal prompt mode)   │ → async queue sub-jobs     │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Compaction               │ JSONL summary entry     │ compactions table          │
│                          │ + pre-flush to MEMORY.md│ + pre-flush to memory_facts│
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Skills system            │ SKILL.md files          │ .md files in /skills/      │
│                          │ ClawHub registry (5400+)│ manual or custom           │
│                          │ keyword-score injection │ keyword-score injection    │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Tool sandboxing          │ Docker containers for   │ None (trust model:         │
│                          │ non-main sessions       │ homeserver, you own it)    │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ WS auth                  │ Cryptographic device    │ JWT cookie (HTTP layer)    │
│                          │ identity (signed nonce) │                            │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Config format            │ openclaw.json           │ SQLite config table        │
│                          │ (hot-reloaded)          │ + env vars                 │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Supported platforms      │ Discord, Telegram,      │ Discord, Telegram, Slack,  │
│                          │ Slack, Signal, iMessage │ WhatsApp, Matrix, Web,     │
│                          │ WhatsApp, Web, CLI      │ SMS (Twilio), Email (IMAP) │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Dashboard                │ Web UI via WS protocol  │ Next.js 15 + SQLite reads  │
│                          │ (operator/node roles)   │ + dedicated WS chat        │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Scheduling               │ Cron + heartbeat        │ Cron + heartbeat           │
│                          │ Standard cron only      │ + "every 5m" shorthand     │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ Cost tracking            │ Token counters per      │ usage_log table: per-agent │
│                          │ session (counters only) │ per-account cost in USD    │
├──────────────────────────┼─────────────────────────┼────────────────────────────┤
│ GitHub stars (2026)      │ 145,000+                │ yours only 😄              │
└──────────────────────────┴─────────────────────────┴────────────────────────────┘
```

### Where OpenClaw Is Better
- **Vector memory search** — semantic recall is much better for natural language ("what did we discuss about the project?")
- **Session storage** — JSONL files are portable, diffable, easy to backup/restore
- **Tool sandboxing** — Docker containers protect the host for untrusted agents
- **Community skills** — 5,400+ shared skills on ClawHub
- **Always-on daemon** — Gateway stays running even when idle, reconnects automatically

### Where Arvis Is Better
- **Multi-provider failover** — 3-stage silent rotation across 50+ accounts/providers
- **Dynamic delegation** — conductor LLM decides routing at content level (more flexible than config bindings)
- **Multi-platform** — SMS, Email connectors that OpenClaw doesn't have
- **Dashboard** — full Next.js admin UI (OpenClaw has a simpler web UI)
- **SQL queries** — SQLite lets you query everything relationally (conversations, costs, usage)
- **Billing system** — built-in client/charge tracking (OpenClaw has none)
- **Webhook server** — external HTTP triggers (OpenClaw has no equivalent)

### The Core Insight They Share
> "An LLM's context window is like RAM. Long-term memory is disk. When RAM fills up, you page old content to disk (compaction + summary) and page relevant content back in (memory injection). The LLM provides intelligence; the platform provides virtual memory for cognition."

Both Arvis and OpenClaw independently converged on this exact design pattern.

---

## 16. Database Schema — Every Table

```
AGENTS & ROUTING:
  agents (id, slug, name, role, model, status, system_prompt,
          allowed_tools, project_path, created_by)
  agent_channels (agent_id, platform, channel_id, is_primary, permissions)
  bot_instances (id, name, platform, token, agent_id, enabled, status)

CONVERSATIONS & MESSAGES:
  conversations (id, agent_id, platform, channel_id, user_id,
                 total_tokens_estimate, status, started_at, last_message_at)
  messages (id, conversation_id, role, content, token_estimate, created_at)
  messages_fts (FTS5 virtual table — full-text search on messages)
  compactions (id, conversation_id, summary, messages_before, messages_after,
               tokens_saved, created_at)

MEMORY:
  memory_facts (id, agent_id, category, content, confidence,
                last_accessed, access_count)
  memory_facts_fts (FTS5 virtual table — full-text search on facts)
  memory_state (agent_id, key, value, updated_at) ← KV pairs

QUEUE:
  queue (id, agent_id, type, payload, status, priority,
         attempts, max_attempts, started_at, completed_at, error)

SCHEDULING:
  heartbeat_configs (id, agent_id, name, prompt, schedule,
                     channel_id, platform, enabled, last_run, next_run)
  cron_jobs (id, agent_id, name, schedule, prompt,
             channel_id, platform, enabled, last_run, next_run)

ACCOUNTS & USAGE:
  accounts (id, name, type, provider, api_key, model,
            status, rate_limited_until, total_messages)
  usage_log (id, account_id, agent_id, model, provider,
             input_tokens, output_tokens, cost_usd, created_at)

BILLING:
  clients (id, name, slug, plan, balance, status)
  charges (id, client_id, agent_id, amount, type, description,
           conversation_id, status)

SKILLS & WEBHOOKS:
  skills (id, slug, name, file_path, trigger_patterns, enabled, category)
  webhooks (id, path, agent_id, prompt_template, channel_id, secret,
            enabled, last_triggered, trigger_count)

SETTINGS:
  config (key, value, updated_at) ← KV: conductor_agent_id, etc.
  _migrations (id, name, applied_at)
```

---

## 17. Why The Conductor Sometimes Said "I'm Claude"

The conductor's system prompt is injected as:
```
<instructions>
{CONDUCTOR_SYSTEM_PROMPT}
</instructions>

Respond to the following...

{conversation history}
[user]: your message here
```

When Claude is asked "who are you?", its default self-identity ("I'm Claude, made by Anthropic") could override the persona in `<instructions>`.

**Fix applied:** `CONDUCTOR_SYSTEM_PROMPT` now starts with:
```
IDENTITY: You are the Conductor — the central orchestrator of the Arvis agent platform.
You are NOT Claude and you do NOT identify as Claude.
If anyone asks who you are, say you are the Conductor.
Never say "I'm Claude" or "I'm an AI assistant made by Anthropic".
```

Putting identity override at the very top of the prompt and using explicit "you are NOT X" language is the most reliable way to override Claude's default self-identification.

---

## 18. Conductor: What It Can Do vs. Can't Do

```
CAN DO (has action tags):
  ✓ Create new agents
  ✓ Update existing agents (system prompt, model, etc.)
  ✓ Create cron jobs (scheduled tasks)
  ✓ Create heartbeats (periodic messages)
  ✓ Create billing clients
  ✓ Delegate tasks to specific agents
  ✓ Remember facts about users (MEMORY tags)

CAN'T DO (no action tag = nothing happens):
  ✗ Delete agents (no [DELETE_AGENT] tag)
  ✗ Start/stop connectors
  ✗ Read files or execute code directly
  ✗ Create accounts/API keys
  ✗ Modify existing cron jobs (only create)

The conductor is an LLM acting as an orchestrator — it outputs structured
tags that the system parses and executes. If it doesn't use a tag,
nothing happens. "I'll create an agent for that" in plain text = nothing.
The CRITICAL line in the conductor prompt enforces this.
```

---

## 19. Quick Reference: What To Check When Something Breaks

```
PROBLEM: Agent not responding
  → Check queue page (/queue) — is there a failed job?
  → Check logs page (/logs) — job error message
  → Is the account rate-limited? → Usage page (/usage)

PROBLEM: Wrong agent responding
  → Check agent_channels table — which agent owns that channel?
  → Check bot_instances table — which agent is the bot assigned to?
  → Router priority order: botAssignment > channelBinding > @mention > conductor

PROBLEM: Agent "forgot" context
  → Check if compaction happened (logs page, filter by agent)
  → Check memory_facts — were facts saved before compaction?
  → Context window may be exceeded — check usage tokens

PROBLEM: Conductor created nothing
  → Action tags were missing in response (check session history)
  → Check exact tag format: slug must be kebab-case, no spaces in values
  → Check logs for ConductorParser output

PROBLEM: Scheduled task not running
  → Check heartbeat_configs.enabled = 1
  → Check next_run timestamp — is it in the past?
  → Check if flood guard is blocking (pending job already exists)

PROBLEM: Dashboard chat shows old messages when switching agents
  → Should be fixed (key={agentId} forces remount)
  → Clear browser cache if still happening

PROBLEM: CLI runner context bleed between conversations
  → Should be fixed (per-conversation CWD at data/sessions/{convId}/)
  → Delete data/sessions/ to force fresh sessions for all conversations
```

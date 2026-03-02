# 02 — Complete Message Flow
> Every single step from "user sends message" to "user receives response".

---

## The Full Flow (Step By Step)

```
═══════════════════════════════════════════════════════════════
  STEP 1: INCOMING MESSAGE
═══════════════════════════════════════════════════════════════

  User sends message on Discord / Telegram / Slack / etc.

  Connector receives the platform event:
  - Discord: client.on('messageCreate', ...)
  - Telegram: bot.on('message', ...)
  - Web: WebSocket message received on port 5070

  Connector normalizes to IncomingMessage:
  {
    id:          "msg-abc123"         ← unique ID
    platform:    "discord"            ← where it came from
    channelId:   "1234567890"         ← which channel
    userId:      "987654321"          ← who sent it
    userName:    "John"               ← their display name
    content:     "What's the price?"  ← the actual message
    timestamp:   Date                 ← when
    attachments: [...]                ← images, files (optional)
    metadata:    { isDM: false, ... } ← platform-specific extras
  }

  Special handling before emit:
  - Telegram voice: downloads OGG → Whisper transcription → content = "[Voice]: ..."
  - Telegram photo: downloads → base64 → stored in attachment.data
  - WhatsApp audio: downloads via Graph API → transcribes
  - Discord images: real CDN URLs stored (downloaded later during job processing)

  bus.emit('message', msg)
  → Core picks it up

═══════════════════════════════════════════════════════════════
  STEP 2: ROUTING
═══════════════════════════════════════════════════════════════

  arvis.ts handles the 'message' event:
    this.bus.on('message', async (msg) => { await this.handleMessage(msg) })

  handleMessage() calls: Router.route(msg)

  Router checks 6 conditions in priority order:
  (See 03-routing.md for full details)

  Result: Agent object OR null (drop message)

  If null → silent drop, no response
  If agent found → permission check: canUserMessage(userId, agent)
  If no permission → silent drop

═══════════════════════════════════════════════════════════════
  STEP 3: TYPING INDICATOR
═══════════════════════════════════════════════════════════════

  IMMEDIATELY after routing (before any DB work):
  bus.emit('typing', { channelId, platform })

  Connector sees 'typing' event:
  - Discord: channel.sendTyping()  ← "Bot is typing..."
  - Telegram: bot.sendChatAction(chatId, 'typing')
  - Web: WebSocket broadcasts { type: 'typing' } to dashboard

  This happens BEFORE the LLM call, so user sees it quickly.

═══════════════════════════════════════════════════════════════
  STEP 4: CONVERSATION MANAGEMENT
═══════════════════════════════════════════════════════════════

  ConversationManager.getOrCreate(
    agentId, platform, channelId, userId, userName
  )

  SQL: SELECT * FROM conversations
       WHERE agent_id=? AND platform=? AND channel_id=? AND status='active'
       ORDER BY last_message_at DESC LIMIT 1

  If found → reuse existing conversation
  If not found → INSERT new conversation row, return it

  Then: store the incoming user message:
  ConversationManager.addMessage(conversation.id, 'user', msg.content)

  This inserts into messages table + updates:
    conversations.total_tokens_estimate += tokens
    conversations.message_count += 1
    conversations.last_message_at = now

═══════════════════════════════════════════════════════════════
  STEP 5: COMPACTION CHECK (may be skipped)
═══════════════════════════════════════════════════════════════

  shouldCompact(conversationId, threshold)?
  threshold = agent.model's context window × 0.75

  e.g. claude-sonnet-4-6 = 200k tokens → threshold = 150k tokens

  If total_tokens_estimate > threshold → COMPACT

  Compaction is a two-phase process:
  ┌─────────────────────────────────────────────────────────┐
  │  PHASE 1: Pre-compaction memory flush                   │
  │  Take the old messages (about to be deleted)            │
  │  Send to LLM: "Extract key facts from this..."          │
  │  LLM outputs [MEMORY:*] tags                            │
  │  MemoryManager saves them to memory_facts table         │
  │  → Facts survive compaction even though messages die    │
  └─────────────────────────────────────────────────────────┘
  ┌─────────────────────────────────────────────────────────┐
  │  PHASE 2: Summarize + Delete                            │
  │  Send old messages to LLM: "Summarize this convo..."    │
  │  LLM returns summary text                               │
  │  DELETE old messages from messages table                │
  │  INSERT into compactions table:                         │
  │    { summary, messages_before, messages_after, ... }    │
  │  UPDATE conversations.total_tokens_estimate = new total │
  └─────────────────────────────────────────────────────────┘

  After compaction: token count reset to recent messages only.
  The compaction summary is injected in the next context build.

═══════════════════════════════════════════════════════════════
  STEP 6: CONTEXT BUILDING
═══════════════════════════════════════════════════════════════

  ContextBuilder.build(agent, conversation, msg)

  Assembles the full prompt (system prompt + history).
  See 05-context-memory.md for the 6-layer breakdown.

  Returns:
  {
    systemPrompt: "IDENTITY: You are the Conductor...",
    messages: [ {role, content, tokenEstimate}, ... ],
    summaryText: "Previous conversation summary: ..."
  }

═══════════════════════════════════════════════════════════════
  STEP 7: IMAGE HANDLING
═══════════════════════════════════════════════════════════════

  Check msg.attachments for images:

  For pre-fetched images (Telegram, WhatsApp):
    att.data is already base64 → push to images[]

  For URL-only images (Discord CDN):
    fetch(att.url) → Buffer → base64 → push to images[]

  images[] passed as payload so LLM can see them.

═══════════════════════════════════════════════════════════════
  STEP 8: ENQUEUE JOB
═══════════════════════════════════════════════════════════════

  calculatePriority(msg, agent) → 1-10 (5 = normal)

  QueueManager.enqueue({
    agentId: agent.id,
    type: 'message',
    priority: 5,
    payload: {
      conversationId: conversation.id,
      systemPrompt: context.systemPrompt,
      prompt: "[user]: prev msg\n[assistant]: prev response\n[user]: current",
      channelId: msg.channelId,
      platform: msg.platform,
      messageId: msg.id,
      images: [...] or undefined
    }
  })

  INSERT INTO queue (...) VALUES (...)
  setImmediate(() => processNext())  ← fires instantly, no 1s wait

═══════════════════════════════════════════════════════════════
  STEP 9: JOB PROCESSING
═══════════════════════════════════════════════════════════════

  QueueManager.processNext():
    SELECT highest priority pending job
    UPDATE queue SET status='running', started_at=now, attempts+=1
    activeJobs++
    call processJob(job)

  processJob():
    1. Look up agent by agentId
    2. Inject relevant skills into system prompt
       skillInjector.getRelevantSkills(prompt, agent)
       → keyword-scored, only injects score > 0 skills
    3. Filter agent tools: agent.allowedTools ∩ BUILT_IN_TOOL_NAMES
    4. Create per-conversation CWD:
       data/sessions/{conversationId}/ (mkdir -p)
       → Isolates Claude CLI sessions per conversation
    5. Call AgentRunner.execute(request)

═══════════════════════════════════════════════════════════════
  STEP 10: LLM EXECUTION
═══════════════════════════════════════════════════════════════

  AgentRunner picks account + runner (see 04-llm-providers.md)

  ┌─ CLI Runner (for Max subscription accounts) ─────────────┐
  │  const args = ['--print', '--model', '...', '--continue'] │
  │  spawn('claude', args, { cwd: data/sessions/{convId}/ })  │
  │  child.stdin.write(fullPrompt)  ← prompt via stdin        │
  │  stdout = response text                                   │
  │  stderr = logged as warnings                              │
  │  timeout: 180 seconds                                     │
  └───────────────────────────────────────────────────────────┘

  ┌─ Provider Runner (for API accounts) ──────────────────────┐
  │  Build messages array: [system, ...history, user]         │
  │  POST to provider's API endpoint                          │
  │  Handle tool_use → execute tool → tool_result loop        │
  │  Up to 5 tool turns before forcing final response         │
  │                                                           │
  │  Anthropic: /messages endpoint, tool_use content blocks   │
  │  OpenAI:    /chat/completions, function_call format       │
  │  Google:    /generateContent, functionCall format         │
  │  Ollama:    /api/chat, OpenAI-compatible format           │
  └───────────────────────────────────────────────────────────┘

  Returns RunResult:
  {
    content: "The price of SOL is $142.30...",
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    inputTokens: 1240,
    outputTokens: 89,
    costUsd: 0.000045,
    durationMs: 3420
  }

═══════════════════════════════════════════════════════════════
  STEP 11: RESPONSE PROCESSING
═══════════════════════════════════════════════════════════════

  Raw LLM response may contain special tags.
  These are processed in order, then STRIPPED before sending to user.

  ┌─ Memory Tags ─────────────────────────────────────────────┐
  │  [MEMORY:sticky] Never forget this fact [/MEMORY]         │
  │  [MEMORY:user_preference] User likes X [/MEMORY]          │
  │  [STATE:key] value [/STATE]                               │
  │                                                           │
  │  MemoryManager.parseAndSave(agentId, content, convId)     │
  │  → Extracts all [MEMORY:*] → INSERT into memory_facts     │
  │  → Extracts all [STATE:*] → UPSERT into memory_state      │
  │  → Fuzzy dedup: skip if similar fact already exists       │
  └───────────────────────────────────────────────────────────┘

  ┌─ Conductor Tags (only if agent.role === 'conductor') ─────┐
  │  ConductorParser.parse(content) → ConductorAction[]       │
  │  ConductorParser.execute(actions, registry, ...)          │
  │                                                           │
  │  [CREATE_AGENT] → INSERT into agents table                │
  │  [UPDATE_AGENT:slug] → UPDATE agents WHERE slug=?         │
  │  [CREATE_CRON] → INSERT into cron_jobs                    │
  │  [CREATE_HEARTBEAT] → INSERT into heartbeat_configs       │
  │  [CREATE_CLIENT] → INSERT into clients                    │
  └───────────────────────────────────────────────────────────┘

  ┌─ Delegation Tags ──────────────────────────────────────────┐
  │  [DELEGATE:sol-price-monitor]                             │
  │  Check the current SOL price                              │
  │  [/DELEGATE]                                              │
  │                                                           │
  │  parseDelegations(content) → [{agentSlug, task}]          │
  │  For each: find target agent by slug                      │
  │  queue.enqueue({ agentId: target.id, priority: 4, ... })  │
  │  → Target agent picks up job asynchronously               │
  │  → Posts result independently to same channel             │
  └───────────────────────────────────────────────────────────┘

  Clean response = strip all tags:
  memoryManager.stripTags(
    stripDelegations(
      agent.role === 'conductor'
        ? conductorParser.stripActions(content)
        : content
    )
  )

═══════════════════════════════════════════════════════════════
  STEP 12: STORE ASSISTANT MESSAGE
═══════════════════════════════════════════════════════════════

  ConversationManager.addMessage(
    payload.conversationId,
    'assistant',
    cleanResponse
  )

  INSERT into messages table
  UPDATE conversations (tokens, message_count, last_message_at)

═══════════════════════════════════════════════════════════════
  STEP 13: SEND RESPONSE
═══════════════════════════════════════════════════════════════

  bus.emit('send', {
    channelId: msg.channelId,
    platform: msg.platform,
    content: cleanResponse
  })

  Connector receives 'send' event:
  - Discord: channel.send(content)
  - Telegram: bot.sendMessage(chatId, content)
  - Web WS: socket.send(JSON.stringify({ type:'message', content }))

  User sees the response. Flow complete.

═══════════════════════════════════════════════════════════════
  STEP 14: QUEUE CLEANUP
═══════════════════════════════════════════════════════════════

  On success:
    UPDATE queue SET status='completed', result=?, completed_at=now

  On error (< max_attempts):
    backoff = 2^attempts minutes
    retryAfter = now + backoff
    UPDATE queue SET status='pending', error={retryAfter, message}
    → Job becomes eligible again after backoff period

  On error (>= max_attempts = 3):
    UPDATE queue SET status='failed', error=message, completed_at=now
    → Shows in /queue page as failed, can retry manually
```

---

## Scheduled Task Flow (Different From Above)

```
Scheduler polls every 10 seconds
  ↓
For each enabled heartbeat/cron that is due:
  ↓
Flood guard check: pending/running job already exists for this task?
  → YES: skip (prevents duplicate jobs)
  → NO: continue
  ↓
QueueManager.enqueue({
  agentId, type: 'heartbeat' or 'cron',
  priority: 10,
  payload: { prompt, channelId, platform, configId/cronId }
})
  ↓
(Same queue processing as above from Step 9 onwards)
  ↓
But: NO conversationId in payload
  → No conversation context loaded
  → Fresh message each time
  → Response sent to channel/platform in payload
```

---

## Error Recovery

```
Process crash while job is running:
  On next startup → recoverStuckJobs()
  → SELECT * FROM queue WHERE status='running' AND started_at < 5min ago
  → UPDATE SET status='failed', error='Job timed out — process likely crashed'
  → These appear in /queue as failed, can be retried

Rate limit during execution:
  AgentRunner catches RateLimitError
  → accountManager.markRateLimited(accountId, retryAfter)
  → Recursive: execute(request, depth+1) with next account
  → User never sees "rate limited" — they just get a slightly slower response

All accounts exhausted:
  throw RateLimitError('All accounts temporarily unavailable')
  → Job fails, retries with exponential backoff (2min, 4min, 8min)
```

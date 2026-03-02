# 04 — LLM Providers & Account Management
> All 6 providers, how failover works, CLI vs API, cost tracking.

---

## The Two Ways Arvis Calls The LLM

```
┌─────────────────────────────────────────────────────────────────┐
│  CLI RUNNER  (for Claude Max subscription)                      │
│                                                                 │
│  Spawns: claude --print --model claude-sonnet-4-6 --continue    │
│  Pipe prompt via stdin                                          │
│  Read response from stdout                                      │
│                                                                 │
│  Pros: Uses your $20/month Max plan, no per-token cost          │
│  Cons: Slower (subprocess overhead), only Claude models         │
│  Rate limits: Claude CLI has usage limits on Max                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PROVIDER RUNNER  (for API key accounts)                        │
│                                                                 │
│  Direct HTTP request to provider's API                         │
│  Supports: Anthropic, OpenAI, OpenRouter, Google, Ollama        │
│  Handles: tool calls, multi-turn tool loops, streaming          │
│                                                                 │
│  Pros: Fast, supports all models, full tool support             │
│  Cons: Costs money per token                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Supported Providers

### Anthropic (Direct API)
```env
ANTHROPIC_API_KEY=sk-ant-...
```
Models: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`

Agent model spec: `claude-sonnet-4-6` or `anthropic/claude-sonnet-4-6`

### Claude CLI (Max Subscription)
```env
CLAUDE_CLI_HOME=/home/user/.claude
```
The HOME directory for your Claude account. Has `~/.claude/` with your session.
Arvis sets `HOME` env var to this before spawning the claude subprocess.

Agent model spec: Any claude model — `claude-sonnet-4-6`

### OpenAI
```env
OPENAI_API_KEY=sk-...
```
Models: `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `o4-mini`, `o3`

Agent model spec: `openai/gpt-4.1-mini`

### OpenRouter (All models via one key)
```env
OPENROUTER_API_KEY=sk-or-...
```
Access to: GPT-4.1, Claude Sonnet, Gemini Flash, Llama 4, DeepSeek R1, Qwen3, Mistral, etc.

Agent model spec: `openrouter/claude-sonnet-4-6` or `openrouter/meta-llama/llama-4-maverick`

### Google Gemini
```env
GOOGLE_API_KEY=AIza...
```
Models: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash-lite`

Agent model spec: `google/gemini-2.5-flash`

### Ollama (Local Models)
```env
OLLAMA_BASE_URL=http://localhost:11434
```
Any model you have installed locally: `llama3`, `mistral`, `qwen2`, etc.

Agent model spec: `ollama/llama3` or just configure `OLLAMA_BASE_URL`

### Custom OpenAI-Compatible
```env
CUSTOM_BASE_URL=https://api.your-provider.com/v1
CUSTOM_API_KEY=your-key
```

---

## Multiple Accounts Per Provider

Add numbers to the env var to create multiple accounts:

```env
# CLI accounts (up to 50)
CLAUDE_CLI_HOME=/home/me/.claude
CLAUDE_CLI_HOME_1=/home/work/.claude
CLAUDE_CLI_HOME_2=/home/alt/.claude

# API keys (up to 50)
ANTHROPIC_API_KEY=sk-ant-main
ANTHROPIC_API_KEY_1=sk-ant-backup
ANTHROPIC_API_KEY_2=sk-ant-team
OPENAI_API_KEY=sk-main
OPENAI_API_KEY_1=sk-backup
```

Arvis manages all of these as a pool. When one hits a rate limit, the next one takes over instantly.

---

## The 3-Stage Failover Chain

```
Request comes in for agent with model="claude-sonnet-4-6"
│
├─── STAGE 1: Try preferred provider (anthropic)
│    accountManager.getAvailableForProvider('anthropic')
│    → Returns account with lowest usage that isn't rate-limited
│    → If found: use it. Done.
│    → If not found (all anthropic accounts limited): go to stage 2
│
├─── STAGE 2: Try fallback chain from agent config
│    agent.modelFallbacks = ["openrouter/claude-sonnet-4-6", "openai/gpt-4.1"]
│    → Try openrouter → if available: use it. Done.
│    → Try openai → if available: use it. Done.
│    → All fallbacks unavailable: go to stage 3
│
└─── STAGE 3: Any account at all
     classifyComplexity(prompt) → 'fast' or 'full'
     accountManager.getAvailable(mode)
     → Returns first non-limited account of appropriate complexity
     → If found: use it. Done.
     → If nothing: throw RateLimitError (retried by queue with backoff)

On success:
  accountManager.clearRateLimit(account.id)  ← reset if it was limited
  accountManager.recordUsage(account.id)     ← increment message count
  accountManager.recordCost(...)             ← log to usage_log table

On RateLimitError during execution:
  accountManager.markRateLimited(account.id, retryAfter)
  → Recursive: execute(request, depth+1)
  → Tries again with different account
  → User sees nothing, just a slightly delayed response
```

---

## Complexity Classification

When going to Stage 3 (any account), Arvis classifies the message complexity:

```
classifyComplexity(prompt, agent, hasApiAccount)
│
├─ Short prompt (<100 chars) or keywords [hello, hi, what, is, when]
│   → 'fast' → use haiku/mini/flash (cheap, quick)
│
└─ Long prompt or complex keywords [analyze, implement, design, debug]
    → 'full' → use sonnet/opus/pro (capable, slower, pricier)
```

This prevents using expensive models for simple "hi" messages.

---

## Configuring Models Per Agent

Set in dashboard → Agents → [Agent] → Config tab:

```
Primary model: anthropic/claude-sonnet-4-6
Fallbacks: openrouter/claude-sonnet-4-6, openai/gpt-4.1-mini
```

Or in the DB:
```sql
UPDATE agents SET model = 'anthropic/claude-sonnet-4-6' WHERE slug = 'my-agent';
```

---

## Cost Tracking

Every API call is logged to the `usage_log` table:
```
account_id | agent_id | model                 | input_tokens | output_tokens | cost_usd
-----------+----------+-----------------------+-------------+---------------+---------
1          | 2        | claude-sonnet-4-6     | 1240        | 89            | 0.000045
3          | 1        | gpt-4.1-mini          | 850         | 210           | 0.000021
```

View in dashboard → Usage page.

CLI accounts always have `cost_usd = 0` (subscription model, no per-token cost).

---

## Per-Provider API Details

### Anthropic
- Endpoint: `https://api.anthropic.com/v1/messages`
- Auth: `x-api-key` header
- Tool format: `tool_use` content blocks + `tool_result` user messages
- System prompt: top-level `system` field (cache-friendly)

### OpenAI (and OpenRouter, Ollama, Custom)
- Endpoint: `/v1/chat/completions`
- Auth: `Authorization: Bearer` header
- Tool format: `function_call` + assistant role + tool role messages
- System prompt: first message with role=system

### Google Gemini
- Endpoint: `https://generativelanguage.googleapis.com/...`
- Auth: `key=` query param
- Tool format: `functionCall` + `functionResponse`
- System prompt: `systemInstruction` field (separate from messages)

---

## Tool Call Loop (Provider Runner)

When the LLM wants to use a tool (web_search, http_fetch, etc.):

```
ProviderRunner.execute():
  │
  ├─ Send messages to LLM
  │
  ├─ Response contains tool_call?
  │   → Execute the tool (ToolExecutor)
  │   → Append tool_result to messages
  │   → Send to LLM again (with result)
  │   → Repeat up to MAX_TOOL_TURNS = 5
  │
  └─ No tool_call OR MAX_TOOL_TURNS reached
      → Return final text response
```

The CLI runner does NOT support the tool loop — tool use with CLI is handled by Claude Code's internal mechanism (bash, file tools, etc. that Claude Code natively supports).

---

## Price Table (from provider-runner.ts)

Approximate costs per 1M tokens (input/output):

| Model | Input | Output |
|-------|-------|--------|
| claude-opus-4-6 | $15 | $75 |
| claude-sonnet-4-6 | $3 | $15 |
| claude-haiku-4-5 | $0.80 | $4 |
| gpt-4.1 | $2 | $8 |
| gpt-4.1-mini | $0.40 | $1.60 |
| gemini-2.5-pro | $1.25 | $10 |
| gemini-2.5-flash | $0.30 | $2.50 |
| ollama/* | $0 | $0 |
| cli/* | $0 | $0 |

# 05 — Context & Memory System
> How agents remember things, what goes in every prompt, and how context is kept under the token limit.

---

## What Gets Put In Every Prompt

When the LLM is called, `ContextBuilder` assembles the full context from 6 layers (in order):

```
LAYER 1: IDENTITY + ROLE (always included)
─────────────────────────────────────────
"You are [Agent Name]. [agent.personality]"
"Your job: [agent.description]"
"Today is [date]. User: [userName]."

LAYER 2: TOOLS HINT (if agent has tools enabled)
──────────────────────────────────────────────────
"You have access to: web_search, http_fetch, calculate, get_time"
"Use them when you need current data or math."

LAYER 3: STICKY MEMORY FACTS (never expire)
─────────────────────────────────────────────
From memory_facts WHERE type='sticky' ORDER BY created_at:
"[STICKY] User's name is John"
"[STICKY] User always wants responses in bullet points"

LAYER 4: RELEVANT MEMORY (from recent conversations)
──────────────────────────────────────────────────────
From memory_facts WHERE type != 'sticky'
Sorted by recency, up to token budget
"[MEMORY] User prefers Python 3.12"
"[MEMORY] Current project is arvis-v3"

LAYER 5: SKILLS (injected based on message keywords)
──────────────────────────────────────────────────────
SkillInjector.getRelevantSkills(prompt, agent)
→ keyword/pattern matching against skill trigger_patterns
→ only injects skills with score > 0
"# How To Check SOL Price\nUse http_fetch to fetch: https://..."

LAYER 6: CONVERSATION HISTORY
───────────────────────────────
Recent messages from messages table
[user]: "What's solana at?"
[assistant]: "SOL is $142.30..."
[user]: "Compare to yesterday"  ← current message

LAYER 7: COMPACTION SUMMARY (if conversation was compacted)
─────────────────────────────────────────────────────────────
"Previous conversation summary: User was asking about SOL price.
You explained the current price is $142. User asked about fees..."
```

---

## Memory Types

| Type | When Used | Expires? | Example |
|------|-----------|----------|---------|
| `sticky` | Every prompt, forever | Never | "User's name is John" |
| `user_preference` | Included in context | After 90 days | "Prefers short answers" |
| `project_context` | Included in context | After 30 days | "Working on arvis-v3" |
| `learned_pattern` | Included in context | After 30 days | "User codes in TypeScript" |
| `state` | Available as key/value | Until overwritten | `last_price: $142.30` |

### How Agents Save Memory

Agents include special tags in their responses. Arvis strips these before showing the user:

```
[MEMORY:sticky] User's name is John, always greet him by name [/MEMORY]
[MEMORY:user_preference] User likes bullet points, not paragraphs [/MEMORY]
[MEMORY:project_context] Current project: my-app in /home/user/projects [/MEMORY]
[STATE:last_topic] solana price [/STATE]
```

These are parsed by `MemoryManager.parseAndSave()` and stored in `memory_facts` table.

**Fuzzy dedup:** Before saving, Arvis checks if a similar fact already exists (word overlap > 70%). If so, it skips the duplicate. This prevents memory bloat from repeated similar facts.

---

## Context Token Budget

Each model has a different context window. Arvis uses **75% of the window** as the target:

| Model | Context Window | Compaction Threshold |
|-------|---------------|---------------------|
| claude-sonnet-4-6 | 200,000 tokens | 150,000 tokens |
| claude-opus-4-6 | 200,000 tokens | 150,000 tokens |
| claude-haiku-4-5 | 200,000 tokens | 150,000 tokens |
| gpt-4.1 | 128,000 tokens | 96,000 tokens |
| gpt-4.1-mini | 128,000 tokens | 96,000 tokens |
| gemini-2.5-pro | 1,048,576 tokens | 786,432 tokens |
| gemini-2.5-flash | 1,048,576 tokens | 786,432 tokens |
| ollama/* | 8,192 tokens | 6,144 tokens |

The `total_tokens_estimate` in the `conversations` table tracks current usage. Token counts are estimated (4 chars ≈ 1 token) since exact counts require the API.

---

## Compaction — When Conversations Get Too Long

When `total_tokens_estimate` exceeds the threshold, compaction runs **before** the next LLM call:

```
Phase 1: Memory Extraction
  Take oldest messages (about to be deleted)
  Send to LLM: "Extract important facts as [MEMORY:*] tags"
  LLM extracts facts → stored in memory_facts
  Facts survive even though messages die

Phase 2: Summarize + Delete
  Send oldest messages to LLM: "Summarize this conversation chunk"
  LLM returns summary text
  DELETE old messages from messages table
  INSERT into compactions table: { summary, timestamp, tokens_before }
  UPDATE conversations.total_tokens_estimate = remaining tokens

On next request:
  Compaction summary injected into context:
  "Previous conversation summary: [summary text]"
  → Agent has full context even though old messages are gone
```

This means conversations can run **indefinitely** without hitting the context limit.

---

## Memory Viewer (Dashboard)

In Dashboard → Agents → [Agent] → Memory tab:
- View all memory facts (grouped by type)
- See state key/value pairs
- Delete individual facts
- See which facts are sticky (gold star)

---

## State vs Memory

**Memory** (`[MEMORY:type]`) — Free-text facts stored long-term:
```
[MEMORY:sticky] User's timezone is UTC+8 [/MEMORY]
```

**State** (`[STATE:key]`) — Key/value pairs for simple data:
```
[STATE:last_price] $142.30 [/STATE]
[STATE:alert_threshold] $150 [/STATE]
```

State is useful when an agent needs to remember a specific value (like a price threshold) rather than a descriptive fact.

---

## Skill Injection — How It Works

Skills are `.md` files in the `skills/` folder. Each has YAML frontmatter:
```yaml
---
slug: sol-price
name: Solana Price Monitor
triggers:
  keywords: [solana, SOL, sol, crypto, price]
  patterns: [".*price.*", ".*token.*"]
---
```

**Injection logic:**
1. For each skill, `SkillInjector` scores the incoming prompt
2. Score = number of keyword matches + pattern matches
3. If score > 0: skill content appended to system prompt
4. If score = 0: skill not included (saves tokens)

This means agents don't always get every skill — only the ones relevant to the current message.

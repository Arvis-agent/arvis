# 10 — Troubleshooting
> Common problems, how to debug them, and how to fix them.

---

## Quick Debug Checklist

```
□ Is Arvis core running? → Check terminal for errors
□ Is dashboard running? → Open http://localhost:5100
□ Database exists? → ls data/*.db
□ At least one LLM account configured? → Dashboard → Settings → Accounts
□ Bot tokens valid? → Dashboard → Channels → check status
□ Agent enabled? → Dashboard → Agents → check status badge
□ Check logs → Dashboard → Logs page (or terminal output)
```

---

## Common Problems

### "No route found" — Messages Not Getting Responses

The message was received but no agent was selected to handle it.

**Debug:**
1. Dashboard → Logs → look for `Route: null`
2. Check the routing rules in order (see [03-routing.md](./03-routing.md))

**Common causes:**
- Message came from a channel not bound to any agent
- Message isn't a DM and there's no conductor channel configured
- Channel binding was set up for the wrong platform

**Fix:**
```
Option 1: Go to Dashboard → Agents → [Agent] → Config → Channel Bindings → Add channel
Option 2: Ask conductor: "Bind Discord channel [channel-id] to the [agent-name] agent"
Option 3: Set a conductor channel in Settings so all unrouted messages go to conductor
```

---

### Agent Responds "I'm Claude" / "I'm an AI assistant made by Anthropic"

The agent isn't using the correct identity.

**Fix for Conductor:** The IDENTITY override in the system prompt should prevent this. If it's still happening, check `packages/core/src/agents/conductor.ts` — the first line should be:
```
IDENTITY: You are the Conductor — ...You are NOT Claude...
```

**Fix for sub-agents:** Add an identity note to their personality/system prompt in the dashboard:
```
You are [Agent Name]. You are an AI assistant on the Arvis platform.
Do not refer to yourself as "Claude" — you are [Agent Name].
```

---

### CLI Runner: "Failed to start CLI" / "claude not found"

The `claude` CLI isn't installed or isn't in PATH.

**Fix:**
```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

On Windows, may need to restart terminal for PATH to update.

---

### CLI Runner: Conversations Mixing Up

Different users' conversations are bleeding into each other.

**Root cause:** All CLI sessions sharing the same working directory.

**Fix:** Per-conversation CWD is implemented in `arvis.ts` — each conversation gets `data/sessions/{conversationId}/`. If this is happening, verify that:
1. The conversation is stored correctly (each user/channel combo has unique `conversationId`)
2. `data/sessions/` directory exists and has subdirectories per conversation

---

### Provider API: "Invalid API key" or 401 Errors

**Fix:**
1. Dashboard → Settings → Accounts → check the account is configured
2. Verify the API key works: `curl -H "x-api-key: $ANTHROPIC_API_KEY" https://api.anthropic.com/v1/models`
3. Check for extra spaces in the `.env` value

---

### Rate Limit Errors Appearing In Chat

Should be invisible to users — Arvis silently switches accounts.

**If errors are appearing:**
1. Check Dashboard → Settings → Accounts — are multiple accounts configured?
2. Check Dashboard → Logs — look for `RateLimitError`
3. If only one account: add more accounts to rotate between

---

### Dashboard Login Not Working

**Symptom:** Password always shows "Invalid password"

**Check:**
1. Is `DASHBOARD_PASSWORD` set in `.env`?
2. No leading/trailing spaces in the `.env` value?
3. After changing `.env`, did you restart the dashboard process?

**Reset:** Just change `DASHBOARD_PASSWORD` in `.env` and restart.

---

### WebSocket Chat Not Connecting

**Symptom:** Chat shows "Disconnected" or messages don't send.

**Check:**
1. Is the web connector running? Port 5070 should be open.
   ```bash
   netstat -an | grep 5070
   ```
2. Is `WEB_CONNECTOR_PORT` set correctly in `.env`?
3. Check browser console for WebSocket errors.

---

### Memory Growing Unboundedly / High DB Size

**Check:**
```sql
-- Check conversation token estimates
SELECT id, total_tokens_estimate, message_count FROM conversations ORDER BY total_tokens_estimate DESC LIMIT 10;

-- Check memory facts count
SELECT agent_id, COUNT(*) as count FROM memory_facts GROUP BY agent_id;
```

**Fix:**
1. Compaction should run automatically at 75% of context window. If it's not: check if the agent's model is in `MODEL_CONTEXT_WINDOWS` in `context-builder.ts`
2. Clear old memory facts: Dashboard → Agents → [Agent] → Memory → delete old facts

---

### Queue Jobs Getting Stuck in "Running"

**Symptom:** Dashboard → Queue shows jobs in "Running" state that haven't completed.

**Fix:**
1. Jobs older than 5 minutes are automatically recovered on restart
2. To force recovery: restart Arvis core (it calls `recoverStuckJobs()` on start)
3. To manually cancel: Dashboard → Queue → Cancel button on the job

---

### Skills Not Being Injected

**Symptom:** Agent doesn't use the skill even when keywords are mentioned.

**Debug:**
1. Dashboard → Skills → check the skill is enabled (toggle on)
2. Check trigger keywords — are they matching the user's message?
3. Add a specific keyword that's definitely in the user's message
4. Check skill file exists on disk at the `file_path` shown

---

### Discord Bot Not Coming Online

**Check:**
1. Is `DISCORD_TOKEN` valid? Test: `curl -H "Authorization: Bot $DISCORD_TOKEN" https://discord.com/api/v10/users/@me`
2. Is the bot invited to the server with correct permissions?
3. Is "Message Content Intent" enabled in the Discord developer portal?

---

## Log Levels

Set `LOG_LEVEL` in `.env`:
- `error` — only errors
- `warn` — errors + warnings
- `info` — normal operation logs (default)
- `debug` — verbose, includes all tool calls, routing decisions, etc.

For debugging specific issues, set to `debug` temporarily.

---

## Useful SQL Queries

```sql
-- See recent messages for a conversation
SELECT role, content, created_at FROM messages
WHERE conversation_id = 5
ORDER BY created_at DESC LIMIT 20;

-- Check agent status
SELECT id, slug, name, enabled FROM agents;

-- See recent queue jobs and their status
SELECT id, type, status, attempts, error, created_at
FROM queue ORDER BY created_at DESC LIMIT 20;

-- Check active conversations
SELECT c.id, a.name as agent, c.platform, c.channel_id, c.message_count, c.last_message_at
FROM conversations c JOIN agents a ON a.id = c.agent_id
WHERE c.status = 'active'
ORDER BY c.last_message_at DESC;

-- Memory facts for an agent
SELECT type, key, content, created_at FROM memory_facts
WHERE agent_id = 1 ORDER BY created_at DESC;

-- Usage/cost last 24h
SELECT a.name, sum(ul.cost_usd) as total_cost, sum(ul.input_tokens + ul.output_tokens) as tokens
FROM usage_log ul JOIN agents a ON a.id = ul.agent_id
WHERE ul.created_at > datetime('now', '-24 hours')
GROUP BY a.id ORDER BY total_cost DESC;
```

---

## Getting Help

1. Check the logs page in dashboard first — most errors show up there
2. Run with `LOG_LEVEL=debug` for verbose output
3. Check the SQLite database directly — it's at `data/arvis.db`
4. Review the docs in the `docs/` folder

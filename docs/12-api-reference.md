# 12 — REST API Reference
> Complete reference for the Arvis dashboard REST API. All endpoints are served by the Next.js dashboard on port **5100** (default).

---

## Authentication

When `DASHBOARD_PASSWORD` is set, all routes except `/api/health` and `/api/auth/login` require a valid session.

Two ways to authenticate:

### 1 — Cookie (browser / dashboard)

```bash
POST /api/auth/login
Content-Type: application/json

{ "password": "your-dashboard-password" }
```

Returns a JWT in the `arvis-token` cookie. Valid for 7 days.

### 2 — API Key (programmatic)

Set `DASHBOARD_API_KEY` in `.env`, then pass it on every request:

```bash
curl -H "X-API-Key: your-api-key" http://localhost:5100/api/agents
# OR
curl -H "Authorization: Bearer your-api-key" http://localhost:5100/api/agents
```

---

## Base URL

```
http://localhost:5100/api
```

All responses are `application/json`. All request bodies must be `application/json`.

---

## Health

### `GET /api/health`

No auth required. Returns system status.

```json
{
  "status": "ok",
  "uptime": 3600,
  "version": "3.0.0"
}
```

---

## Agents

### `GET /api/agents`

List all agents.

```json
[
  {
    "id": 1,
    "slug": "support",
    "name": "Support Bot",
    "role": "specialist",
    "model": "anthropic/claude-haiku-4-5-20251001",
    "systemPrompt": "You are a helpful support agent.",
    "allowedTools": ["web_search", "calculate"],
    "temperature": 0.7,
    "maxTokens": 4096,
    "isActive": true,
    "createdBy": null
  }
]
```

### `POST /api/agents`

Create an agent.

```json
{
  "slug": "support",
  "name": "Support Bot",
  "role": "specialist",
  "model": "anthropic/claude-haiku-4-5-20251001",
  "systemPrompt": "You are a helpful support agent.",
  "allowedTools": ["web_search"],
  "temperature": 0.7,
  "maxTokens": 4096
}
```

`slug` must be unique. `role` is one of: `conductor`, `specialist`, `analyst`, `creative`, `technical`.

### `PATCH /api/agents/[id]`

Update any agent field. Send only the fields you want to change.

```json
{ "isActive": false }
```

### `DELETE /api/agents/[id]`

Delete an agent. Cannot delete the active conductor.

---

### `GET /api/agents/[id]/history`

Get message history for a specific agent's dashboard chat session.

```json
[
  { "role": "user", "content": "Hello", "createdAt": "2025-03-01T12:00:00Z" },
  { "role": "assistant", "content": "Hi there!", "createdAt": "2025-03-01T12:00:01Z" }
]
```

### `POST /api/agents/[id]/chat`

Send a message to a specific agent via the dashboard (WebSocket alternative for scripting).

```json
{ "message": "What is the current queue depth?" }
```

Response:
```json
{ "content": "There are 3 jobs in the queue..." }
```

---

## Accounts (LLM Providers)

### `GET /api/accounts`

List all configured LLM accounts.

```json
[
  {
    "name": "anthropic-main",
    "type": "api_key",
    "provider": "anthropic",
    "model": "claude-haiku-4-5-20251001",
    "priority": 1,
    "isActive": true,
    "rateLimitedUntil": null
  }
]
```

`apiKey` is never returned.

### `PATCH /api/accounts/[id]`

Update account settings (priority, isActive, model). Cannot update credentials via API — edit `.env` directly.

---

## Bot Instances

### `GET /api/bots`

List all bot instances (connector configs with assigned agents).

```json
[
  {
    "id": 1,
    "name": "Main Discord Bot",
    "platform": "discord",
    "token": "DISCORD_BOT_TOKEN",
    "defaultAgentId": 2,
    "channelBindings": [{ "channelId": "123456789", "agentId": 3 }],
    "isEnabled": true
  }
]
```

### `POST /api/bots`

Create a bot instance.

```json
{
  "name": "Main Discord Bot",
  "platform": "discord",
  "token": "DISCORD_BOT_TOKEN",
  "defaultAgentId": 1
}
```

### `PATCH /api/bots/[id]`

Update bot (enable/disable, change agent assignment, add channel bindings).

### `DELETE /api/bots/[id]`

Delete a bot instance. The connector will stop when Arvis restarts.

---

## Conversations / Sessions

### `GET /api/sessions`

List recent conversations. Supports pagination.

Query params:
- `limit` — number of results (default 50)
- `offset` — pagination offset

```json
[
  {
    "id": "conv_abc123",
    "agentId": 2,
    "agentName": "Support Bot",
    "platform": "discord",
    "channelId": "123456789",
    "messageCount": 14,
    "startedAt": "2025-03-01T10:00:00Z",
    "lastMessageAt": "2025-03-01T10:22:00Z",
    "lastMessage": "Thanks for your help!"
  }
]
```

### `GET /api/conversations/[id]`

Get full message thread for a conversation.

```json
{
  "id": "conv_abc123",
  "agentName": "Support Bot",
  "messages": [
    { "role": "user", "content": "Hello", "createdAt": "2025-03-01T10:00:00Z" },
    { "role": "assistant", "content": "Hi there! How can I help?", "createdAt": "2025-03-01T10:00:02Z" }
  ]
}
```

---

## Memory

### `GET /api/memory`

List memory entries (sticky facts). Query: `?agentId=2` to filter by agent.

```json
[
  {
    "id": 1,
    "agentId": 2,
    "conversationId": "conv_abc123",
    "key": "user_name",
    "value": "Alice",
    "createdAt": "2025-03-01T10:00:00Z"
  }
]
```

### `DELETE /api/memory/[id]`

Delete a specific memory entry.

---

## Job Queue

### `GET /api/queue`

Get jobs by status.

Query params:
- `status` — `pending`, `running`, `completed`, `failed` (default: all active)

```json
[
  {
    "id": 42,
    "agentId": 2,
    "agentName": "Support Bot",
    "priority": 5,
    "status": "running",
    "payload": { "conversationId": "conv_abc123", "prompt": "Hello" },
    "attempts": 1,
    "maxAttempts": 3,
    "createdAt": "2025-03-01T12:00:00Z"
  }
]
```

### `PATCH /api/queue/[id]`

Retry a failed job.

```json
{ "action": "retry" }
```

### `DELETE /api/queue/[id]`

Cancel a pending job.

---

## Skills

### `GET /api/skills`

List all skills (builtin + community).

```json
[
  {
    "id": 1,
    "name": "bitcoin-price",
    "displayName": "Bitcoin Price",
    "description": "Fetches current BTC/USD price",
    "triggerKeywords": ["bitcoin", "btc", "price"],
    "triggerPatterns": [],
    "isEnabled": true,
    "source": "community"
  }
]
```

### `POST /api/skills`

Create a skill (saves to `skills/community/`).

```json
{
  "name": "my-skill",
  "displayName": "My Skill",
  "description": "Does something useful",
  "triggerKeywords": ["keyword1", "keyword2"],
  "content": "# My Skill\nDo X when triggered."
}
```

### `PATCH /api/skills/[id]`

Update a skill. Editable: `isEnabled`, `displayName`, `triggerKeywords`, `triggerPatterns`, `content`.

### `DELETE /api/skills/[id]`

Delete a community skill. Builtin skills cannot be deleted.

### `POST /api/skills/import`

Import a skill from a URL (GitHub raw, Gist, etc.).

```json
{ "url": "https://raw.githubusercontent.com/..." }
```

---

## Workflows (Cron / Heartbeat)

### `GET /api/workflows`

List all scheduled workflows.

```json
[
  {
    "id": 1,
    "name": "Daily Digest",
    "agentId": 2,
    "agentName": "Reporter",
    "schedule": "0 9 * * *",
    "prompt": "Generate today's summary.",
    "isEnabled": true,
    "lastRunAt": "2025-03-01T09:00:00Z"
  }
]
```

### `POST /api/workflows`

Create a workflow.

```json
{
  "name": "Daily Digest",
  "agentId": 2,
  "schedule": "0 9 * * *",
  "prompt": "Generate a daily digest and post to #updates."
}
```

`schedule` is a standard cron expression (5 fields).

### `PATCH /api/workflows/[id]`

Update or enable/disable a workflow.

### `DELETE /api/workflows/[id]`

Delete a workflow.

---

## Webhooks

### `GET /api/webhooks`

List all configured webhooks.

```json
[
  {
    "id": 1,
    "name": "GitHub Issues",
    "url": "/webhook/github-issues",
    "secret": "hmac-secret-here",
    "agentId": 3,
    "isEnabled": true
  }
]
```

### `POST /api/webhooks`

Create a webhook. Secret is auto-generated if not provided.

```json
{
  "name": "GitHub Issues",
  "agentId": 3
}
```

### `PATCH /api/webhooks/[id]`

Update a webhook (rename, enable/disable, change agent).

### `DELETE /api/webhooks/[id]`

Delete a webhook.

---

## Connectors

### `GET /api/connectors`

Returns config status for all supported connectors. Shows which env vars are set.

```json
[
  { "platform": "discord",   "configured": true,  "vars": ["DISCORD_BOT_TOKEN"] },
  { "platform": "telegram",  "configured": false, "vars": ["TELEGRAM_BOT_TOKEN"] },
  { "platform": "slack",     "configured": false, "vars": ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"] },
  { "platform": "whatsapp",  "configured": false, "vars": [] },
  { "platform": "matrix",    "configured": false, "vars": [] },
  { "platform": "sms",       "configured": false, "vars": ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"] },
  { "platform": "email",     "configured": false, "vars": [] }
]
```

---

## Usage / Analytics

### `GET /api/usage`

Usage breakdown. Query params:
- `period` — `day`, `week`, `month` (default `week`)

```json
{
  "totalRequests": 1240,
  "totalInputTokens": 850000,
  "totalOutputTokens": 120000,
  "totalCostUsd": 4.28,
  "byAgent": [
    {
      "agentId": 2,
      "agentName": "Support Bot",
      "requests": 900,
      "inputTokens": 620000,
      "outputTokens": 90000,
      "costUsd": 3.10,
      "avgDurationMs": 1842
    }
  ],
  "byProvider": [
    {
      "provider": "anthropic",
      "requests": 900,
      "costUsd": 3.10
    }
  ],
  "byModel": [
    {
      "model": "claude-haiku-4-5-20251001",
      "requests": 900,
      "costUsd": 3.10
    }
  ]
}
```

### `GET /api/metrics`

Real-time metrics snapshot (queue depth, uptime, active jobs).

```json
{
  "queueDepth": 3,
  "runningJobs": 1,
  "uptimeSeconds": 7200,
  "totalAgents": 5,
  "activeAgents": 4
}
```

---

## Logs

### `GET /api/logs`

Recent log entries.

Query params:
- `level` — `debug`, `info`, `warn`, `error`
- `limit` — number of entries (default 100)

```json
[
  {
    "level": "info",
    "msg": "Job completed",
    "agentId": 2,
    "jobId": 42,
    "durationMs": 1200,
    "time": "2025-03-01T12:00:02Z"
  }
]
```

---

## Settings

### `GET /api/settings`

Get current settings.

```json
{
  "conductorAgentId": 1,
  "defaultModel": "anthropic/claude-haiku-4-5-20251001"
}
```

### `PATCH /api/settings`

Update settings.

```json
{ "conductorAgentId": 2 }
```

---

## WebSocket Chat (port 5070)

The dashboard chat uses a separate WebSocket server provided by `connector-web`, NOT the dashboard API.

**Connect:**
```
ws://localhost:5070
```

**Send a message:**
```json
{ "type": "message", "content": "Hello", "agentId": 2 }
```

**Receive a response:**
```json
{ "type": "message", "content": "Hi there!", "role": "assistant" }
```

Authentication: pass `X-API-Key` header (if `WEB_API_KEY` is set in `.env`).

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Human-readable error message"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request — missing or invalid fields |
| 401 | Unauthorized — bad or missing credentials |
| 404 | Not found |
| 409 | Conflict — e.g., duplicate slug |
| 500 | Internal server error |

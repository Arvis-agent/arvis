# Arvis v3 — Documentation

> Start here. Every file covers one topic in depth.

---

## Files In This Folder

| File | What It Covers |
|------|---------------|
| [00-user-guide.md](00-user-guide.md) | Plain English: connect socials, create agents, account switching |
| [01-architecture.md](01-architecture.md) | Big picture — every process, port, and module |
| [02-message-flow.md](02-message-flow.md) | Complete step-by-step flow: user message → LLM → response |
| [03-routing.md](03-routing.md) | How messages get assigned to the right agent |
| [04-llm-providers.md](04-llm-providers.md) | Accounts, providers, failover, CLI vs API runners |
| [05-context-memory.md](05-context-memory.md) | How context is built, memory system, compaction |
| [06-queue-scheduler.md](06-queue-scheduler.md) | Job queue, priorities, retries, scheduled tasks |
| [07-security.md](07-security.md) | Auth, VPS setup, API keys, Docker sandbox, secure credentials |
| [08-extensibility.md](08-extensibility.md) | Custom tools, skills, connectors, plugins |
| [09-connectors.md](09-connectors.md) | Discord, Telegram, Slack, WhatsApp, SMS, Email, Web |
| [10-troubleshooting.md](10-troubleshooting.md) | What to check when things break, SQL debug queries |
| [11-deployment.md](11-deployment.md) | Docker, VPS bare metal, systemd, nginx, backups |
| [12-api-reference.md](12-api-reference.md) | Complete REST API reference — all endpoints, auth, responses |

---

## The 30-Second Overview

```
You send a message on Discord / Telegram / etc.
          ↓
     Connector receives it, emits on MessageBus
          ↓
     Router decides which Agent handles it
          ↓
     Conversation history loaded, context built
          ↓
     Job added to SQLite queue
          ↓
     AgentRunner picks best account (rate limit failover built-in)
          ↓
     CLIRunner (Claude CLI) OR ProviderRunner (API) calls the LLM
          ↓
     Response parsed: memory tags saved, conductor actions executed
          ↓
     Clean response sent back to you on the platform
```

---

## Quick Links By Task

**"I want to connect Discord / Telegram"**
- Full setup guide → [00-user-guide.md](00-user-guide.md)
- Platform details → [09-connectors.md](09-connectors.md)

**"I want to understand how X works"**
- How routing works → [03-routing.md](03-routing.md)
- How context/history works → [05-context-memory.md](05-context-memory.md)
- How accounts switch on rate limits → [04-llm-providers.md](04-llm-providers.md)

**"I want to add custom functionality"**
- Custom tools (plugins) → [08-extensibility.md](08-extensibility.md)
- Adding skills → [08-extensibility.md](08-extensibility.md)
- Custom connectors → [08-extensibility.md](08-extensibility.md)

**"How do I deploy on a VPS securely?"**
- Security guide → [07-security.md](07-security.md)
- Passing credentials to agents → [07-security.md](07-security.md#passing-credentials-to-agents)

**"Something is broken"**
- Troubleshooting → [10-troubleshooting.md](10-troubleshooting.md)
- Wrong agent responding → [03-routing.md](03-routing.md)
- Context seems wrong → [05-context-memory.md](05-context-memory.md)

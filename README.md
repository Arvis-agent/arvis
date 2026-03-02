<p align="center">
  <img src="packages/website/public/logo.svg" alt=">_< arvis" width="220" />
</p>

<p align="center">
  <strong>Self-hosted AI agent platform.</strong><br/>
  Route every message from Discord, Telegram, Slack, and WhatsApp to teams of specialized AI agents.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8B5CF6?style=flat-square" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/self--hosted-100%25-8B5CF6?style=flat-square" alt="Self-hosted" />
</p>

<p align="center">
  <a href="docs/00-user-guide.md">Docs</a> · <a href="docs/11-deployment.md">Deploy</a> · <a href="docs/12-api-reference.md">API</a>
</p>

---

```
>_< arvis v3

  ✓ Core started
  ✓ Discord connector        online
  ✓ Telegram connector       online
  ✓ 4 agents loaded          support · analyst · coder · conductor
  ✓ Dashboard ready          http://localhost:5100
```

---

## What is Arvis?

Arvis is a **multi-agent orchestration platform** you run on your own server. Connect it to Discord, Telegram, Slack, WhatsApp, or any platform — and it routes every message to the right AI agent, manages conversation history, handles rate limits silently, and shows everything in a modern dashboard.

Think of it as the layer between your messaging apps and your LLMs.

---

## Quick Start

**Requirements:** Node.js 20+, one LLM key (or Claude subscription)

```bash
# 1. Clone
git clone https://github.com/Arvis-agent/arvis
cd arvis && npm install

# 2. Configure
cp .env.example .env
# Fill in at least one LLM key:
# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# CLAUDE_CLI_HOME=/home/you/.claude   ← run on subscription, zero per-token cost

# 3. Start
npm start
# Dashboard → http://localhost:5100

# Or Docker (easiest for VPS)
docker-compose up -d
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Multi-platform routing** | Discord, Telegram, Slack, WhatsApp, Matrix, Web, SMS, Email |
| **Multi-provider LLM** | Anthropic, OpenAI, Google, Ollama, OpenRouter + custom |
| **Claude subscription support** | Run agents on your Claude Pro/Max — zero per-token cost |
| **Silent failover** | Rate limit hit → switch account instantly, users never see errors |
| **Conversation memory** | Sticky facts persist across sessions, auto-compaction |
| **Cost tracking** | Per-agent, per-provider, per-model breakdown |
| **Job queue** | Priority queue with retry, all jobs visible in dashboard |
| **Scheduler** | Cron and heartbeat workflows |
| **Agent delegation** | Agents spawn sub-agents for parallel work |
| **Skill injection** | Context-aware prompt enhancement from keyword-matched `.md` files |
| **Plugin tools** | Drop a `.ts` file in `plugins/` — auto-loaded on startup |
| **Dashboard** | Real-time chat, queue monitor, session browser, cost analytics |

---

## LLM Providers

| Provider | Notes |
|----------|-------|
| **Claude CLI** ⭐ | Use your Claude Pro/Max subscription — flat $20–100/mo, no per-token cost |
| **Anthropic API** | claude-haiku-4, sonnet-4, opus-4 |
| **OpenAI** | gpt-4.1, gpt-4.1-mini, o4-mini |
| **Google** | gemini-2.5-pro, gemini-2.5-flash |
| **Ollama** | Any local model, zero cost |
| **OpenRouter** | 50+ models, one key |
| **Custom** | Any OpenAI-compatible URL |

Multiple accounts per provider. Arvis rotates automatically on rate limits.

---

## Architecture

```
Discord / Telegram / Slack / WhatsApp / Web / SMS / Email
                        ↓
                  MessageBus
                        ↓
                  Router → selects agent
                        ↓
            ConversationManager → context
                        ↓
              Queue (SQLite, priority + retry)
                        ↓
             AgentRunner → picks best account
                        ↓
        ProviderRunner (API) / CLIRunner (Claude CLI)
                        ↓
             MemoryManager → extracts facts
                        ↓
                  Response → user
```

```
packages/
  core/               Business logic, database, runners
  dashboard/          Next.js 15 admin dashboard
  connector-discord/
  connector-telegram/
  connector-slack/
  connector-whatsapp/
  connector-matrix/
  connector-web/
  connector-sms/
  connector-email/
plugins/              Drop .ts files here — auto-loaded
skills/               Context injection .md files
docs/                 Full documentation (13 files)
```

---

## Extending Arvis

**Custom tool** — drop a file in `plugins/`:

```ts
// plugins/bitcoin-price.ts
import { registerTool } from '@arvis/core';

registerTool({
  name: 'get_bitcoin_price',
  description: 'Get current Bitcoin price in USD',
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async () => {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    const data = await res.json();
    return `$${data.bitcoin.usd}`;
  }
});
```

**Skill injection** — keyword-matched prompt context:

```markdown
<!-- skills/community/bitcoin.md -->
---
trigger_keywords: ["bitcoin", "btc", "price"]
---
Use the `get_bitcoin_price` tool to fetch the current BTC/USD price.
```

---

## Documentation

| File | Topic |
|------|-------|
| [00-user-guide.md](docs/00-user-guide.md) | Getting started, connecting platforms |
| [01-architecture.md](docs/01-architecture.md) | System overview, ports, modules |
| [04-llm-providers.md](docs/04-llm-providers.md) | Accounts, failover, CLI vs API |
| [07-security.md](docs/07-security.md) | Auth, VPS setup, credentials |
| [11-deployment.md](docs/11-deployment.md) | Docker, VPS, systemd, nginx |
| [12-api-reference.md](docs/12-api-reference.md) | REST API reference |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  <strong>>_&lt; arvis</strong> — self-hosted, no lock-in, runs anywhere.
</p>

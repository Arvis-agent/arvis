# 09 — Connectors & Platform Integration
> How each platform connects to Arvis, what media types are supported, and how to add new platforms.

---

## Supported Platforms

| Platform | Text | Images | Voice/Audio | Files | Outbound Media |
|----------|------|--------|-------------|-------|----------------|
| Discord | ✓ | ✓ (CDN URLs downloaded) | ✓ (planned) | ✓ (planned) | Text only* |
| Telegram | ✓ | ✓ (base64 embedded) | ✓ (Whisper transcription) | ✓ (planned) | Text only* |
| Slack | ✓ | Partial | - | - | Text only* |
| WhatsApp | ✓ | ✓ (Graph API download) | ✓ (Whisper transcription) | - | Text only* |
| Matrix | ✓ | - | - | - | Text only* |
| Web/Dashboard | ✓ | - | - | - | Text + Markdown |
| SMS | ✓ | - | - | - | Text only |
| Email | ✓ | - | - | - | Text only |
| Webhooks | ✓ | - | - | - | - |

*Sending images/files back is a planned feature (Phase 10)

---

## How Connectors Work

Each connector implements the same simple interface:
1. **Listen** for incoming messages from the platform
2. **Normalize** them into `IncomingMessage` format
3. **Emit** them on the `MessageBus`
4. **Listen** for `send` events on the bus
5. **Forward** responses back to the platform

```
Platform SDK → Connector → bus.emit('message') → Arvis core
Arvis core → bus.emit('send') → Connector → Platform SDK
```

---

## Discord Connector

**Token env vars:** `DISCORD_TOKEN`, `DISCORD_TOKEN_1`, ..., `DISCORD_TOKEN_50`

**What it handles:**
- Text messages (`messageCreate` event)
- Image attachments (stored as CDN URLs, downloaded in `arvis.ts` before LLM call)
- Mentions (`@BotName message`)
- DMs (routed to conductor)
- Typing indicator (`channel.sendTyping()`)

**Channel IDs:** 18-digit snowflakes. Right-click → Copy Channel ID (enable Developer Mode).

**Bot permissions required:**
- Read Messages / View Channels
- Send Messages
- Read Message History
- Message Content Intent (enable in Bot settings on developer portal)

**Rate limiting:** Discord's default rate limit is ~50 messages/second. Arvis serializes sends so you won't hit it with normal usage.

---

## Telegram Connector

**Token env vars:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN_1`, ...

**What it handles:**
- Text messages
- Photos → downloaded via Bot API → base64 embedded in `attachment.data`
- Voice messages → downloaded OGG → transcribed via OpenAI Whisper → content = `[Voice]: "transcription"`
- Commands (`/start`, `/help`, etc.)
- Inline keyboard button clicks

**Voice transcription:**
Requires `OPENAI_API_KEY` to be set. If not set, voice messages are silently dropped.
```
message:voice event
  → bot.getFile(file_id) → download OGG
  → OpenAI Whisper API (model: whisper-1)
  → content = '[Voice]: "What is the price of BTC?"'
  → Emitted as normal text message
```

**Photo handling:**
```
message:photo event
  → bot.getFile(largest_size) → download JPEG
  → base64 encode
  → attachment.data = base64 string
  → attachment.mimeType = 'image/jpeg'
  → Passed to LLM as vision input
```

---

## Slack Connector

**Token env vars:** `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_SIGNING_SECRET`

Uses Socket Mode (no public URL needed).

**What it handles:**
- Channel messages
- DMs
- Mentions (`@BotName`)
- Typing indicator (`users.setPresence` + `conversations.typing`)

**Setup:**
1. Create Slack app at api.slack.com/apps
2. Enable Socket Mode
3. Add scopes: `chat:write`, `channels:history`, `im:history`, `app_mentions:read`
4. Get Bot Token (xoxb-...) and App Token (xapp-...)

---

## WhatsApp Connector

**Token env vars:** `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`

Uses Meta's WhatsApp Business Cloud API. Requires:
- A Meta Business account
- A verified phone number in WhatsApp Business
- A webhook URL accessible from the internet

**What it handles:**
- Text messages
- Images → downloaded via Graph API → base64 embedded
- Audio → downloaded via Graph API → Whisper transcription
- Reactions, read receipts (ignored)

**Webhook setup:**
1. Set `WHATSAPP_WEBHOOK_PATH=/whatsapp` in .env
2. Point Meta's webhook to: `https://your-domain.com/whatsapp`
3. Verification token: same as `WHATSAPP_VERIFY_TOKEN` in .env

---

## Matrix Connector

**Token env vars:** `MATRIX_HOMESERVER_URL`, `MATRIX_ACCESS_TOKEN`, `MATRIX_USER_ID`

**What it handles:**
- Text messages in rooms the bot has joined
- DMs

**Setup:**
1. Create a Matrix account for your bot on your homeserver
2. Get the access token from Element → Settings → Help & About → Access Token
3. Set homeserver URL, access token, and user ID in .env

---

## Web/Dashboard Connector

Built into the dashboard. Always available on port 5070 (configurable via `WEB_CONNECTOR_PORT`).

**What it handles:**
- Browser-based real-time chat via WebSocket
- Dashboard → Chat page
- Dashboard → Agents → [Agent] → Chat tab

**Protocol:**
```
Client connects to ws://localhost:5070
Client sends: { type: 'auth', apiKey: 'WEB_API_KEY' }
Server responds: { type: 'auth_ok' }
Client sends: { type: 'message', channelId: 'dashboard-agent-3', content: 'Hello' }
Server sends: { type: 'typing', channelId: '...' }
Server sends: { type: 'message', content: 'Hello! How can I help?' }
```

---

## SMS Connector

**Token env vars:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

HTTP server on port 5080 receives Twilio webhooks.

**Signature verification:** Validates Twilio HMAC-SHA1 signature on every request.

**Long message handling:** SMS has a 160-character limit. Responses >160 chars are chunked automatically.

**Setup:**
1. Get a Twilio phone number
2. Set webhook URL in Twilio console: `https://your-domain.com/sms`
3. Set your .env credentials

---

## Email Connector

**Token env vars:** `EMAIL_IMAP_HOST`, `EMAIL_IMAP_PORT`, `EMAIL_IMAP_USER`, `EMAIL_IMAP_PASS`, `EMAIL_SMTP_HOST`, etc.

Polls IMAP inbox every 30 seconds for new messages. Sends responses via SMTP.

**What it handles:**
- Plain text emails
- HTML emails (stripped to text)
- Reply-to threading (basic)

**Channel ID format:** Email address of the sender (e.g., `john@example.com`)

---

## Image Understanding (Vision)

When images are attached to messages, they're passed to the LLM as vision input:

```
ConnectorReceives image
  ↓
Downloads image (if URL) or reads base64 (if already embedded)
  ↓
Stored in attachment.data (base64) + attachment.mimeType
  ↓
arvis.ts handleMessage() collects all images[]
  ↓
Passed in JobPayload.images
  ↓
Provider runner builds multi-modal content:
  Anthropic: content: [{ type: 'image', source: { type: 'base64', ... }}, { type: 'text', text: prompt }]
  OpenAI:    content: [{ type: 'image_url', ... }, { type: 'text', text: prompt }]
  Google:    parts: [{ inlineData: { mimeType, data } }, { text: prompt }]
```

**Which models support vision:**
- Anthropic: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5
- OpenAI: gpt-4.1, gpt-4.1-mini, gpt-4o
- Google: gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash-lite

---

## Multi-Bot Setup

You can run multiple bots for the same platform, each linked to a different agent:

```
DISCORD_TOKEN=token-for-conductor-bot
DISCORD_TOKEN_1=token-for-sol-price-bot
DISCORD_TOKEN_2=token-for-support-bot
```

In Dashboard → Channels → Bot Instances:
- `DISCORD_TOKEN` → linked to Conductor
- `DISCORD_TOKEN_1` → linked to SOL Price Monitor
- `DISCORD_TOKEN_2` → linked to Support Agent

Messages to each bot are routed directly to the assigned agent (Router Step 0).

---

## Platform Limitations By Feature

| Feature | Discord | Telegram | Slack | WhatsApp |
|---------|---------|----------|-------|----------|
| Message length | 2000 chars | 4096 chars | 40k chars | 4096 chars |
| Markdown | Partial (bold, code) | Full HTML | Mrkdwn | None |
| Typing indicator | ✓ | ✓ | ✓ | ✓ |
| Message edit | Planned | Planned | - | - |
| Thread reply | Planned | - | Planned | - |
| Button/keyboard | - | ✓ (inline) | ✓ (blocks) | ✓ |
| Voice | Planned | ✓ (Whisper) | - | ✓ (Whisper) |
| Image send | Planned | Planned | - | Planned |

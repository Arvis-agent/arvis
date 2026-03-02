# 03 — Message Routing
> How Arvis decides which agent handles each message.

---

## The 6-Step Priority Chain

When a message arrives, the Router checks conditions in order. **First match wins.**

```
Incoming message { platform, channelId, metadata, content, userId }
│
│
├─── STEP 0: Bot has an assigned agent?
│    Check: bot_instances WHERE (platform=? AND token=?) → agent_id
│    This is set when you link a bot to a specific agent in the dashboard.
│
│    Example: Your Telegram bot "@SolanaBot" is linked to "sol-price-monitor"
│    → Every message from this bot → sol-price-monitor (ignores all other rules)
│
│    ✓ MATCH → route to assigned agent
│    ✗ NO MATCH → continue to step 1
│
│
├─── STEP 1: Channel is bound to an agent?
│    Check: agent_channels WHERE platform=? AND channel_id=?
│
│    Example: Discord channel #support is bound to "support-agent"
│    → All messages in #support → support-agent
│
│    ✓ MATCH → route to bound agent
│    ✗ NO MATCH → continue to step 2
│
│
├─── STEP 2: Message mentions an agent by @name?
│    Check: does msg.content match /@agent-slug/i ?
│    Uses cached RegExp patterns per agent to avoid recompilation
│
│    Example: "Hey @researcher what is the latest AI news?"
│    → Mentions "researcher" → route to researcher agent
│
│    ✓ MATCH → route to mentioned agent
│    ✗ NO MATCH → continue to step 3
│
│
├─── STEP 3: Channel is the conductor's designated channel?
│    Check: config table for "conductor_channel_id"
│    This is a channel where ALL messages go to conductor.
│
│    Example: Discord #commands channel set as conductor channel
│    → Every message there → conductor
│
│    ✓ MATCH → route to conductor
│    ✗ NO MATCH → continue to step 4
│
│
├─── STEP 4: Channel is a dashboard agent channel?
│    Check: channelId.startsWith('dashboard-agent-')
│    The dashboard chat page uses channelId = 'dashboard-agent-{agentId}'
│
│    Example: You open the chat for agent #3 in dashboard
│    → channelId = 'dashboard-agent-3'
│    → Route directly to agent #3 (NOT conductor)
│
│    ✓ MATCH → route to that specific agent
│    ✗ NO MATCH → continue to step 5
│
│
└─── STEP 5: Is it a DM or isDM metadata?
     Check: channelId.startsWith('dm-') OR metadata.isDM === true
     DMs go to conductor by default (you're talking to the "main" AI)

     ✓ MATCH → route to conductor
     ✗ NO MATCH → DROP (no route found, message ignored silently)
```

---

## Permission Check

After routing, there's a permission check:

```
canUserMessage(userId, agent)
  │
  ├─ Is this the owner? (config.discord.ownerId)
  │   → YES: always allowed
  │
  ├─ Does agent have allow_users set?
  │   → YES: userId must be in the list
  │
  └─ Default: allow everyone
```

If permission denied → message silently dropped (no error sent back).

---

## Setting Up Channel Bindings

### Via Dashboard
1. Go to Agents → click an agent
2. In the Config tab → Channel Bindings section
3. Add: platform + channel ID

### Via the Conductor (chat command)
"Bind Discord channel 123456 to the support agent"

The conductor outputs:
```
[UPDATE_AGENT:support-agent]
channels: [{"platform":"discord","channelId":"123456","isPrimary":true}]
[/UPDATE_AGENT]
```

### Via Database (direct)
```sql
INSERT INTO agent_channels (agent_id, platform, channel_id, is_primary)
VALUES (2, 'discord', '123456789', 1);
```

---

## How Channel IDs Work Per Platform

| Platform | Channel ID Format | How To Find It |
|----------|------------------|----------------|
| Discord | 18-digit number | Right-click channel → Copy Channel ID (Developer Mode on) |
| Telegram | `-100` + chat ID (groups) or just user ID | Use @userinfobot |
| Slack | `C` + alphanumeric | Channel URL or API |
| WhatsApp | Phone number + `@s.whatsapp.net` | From connector logs |
| Web | `dashboard-agent-{id}` | Auto-generated |
| SMS | Phone number | From Twilio webhook |
| Email | Email address | From IMAP config |

---

## What Happens When No Route Is Found

Message is silently dropped. No response sent to user. This is intentional — if you message a bot in a random channel it's not set up for, nothing happens.

To debug: check the logs page in the dashboard. You'll see `Route: null` in the logs if routing failed.

---

## The Conductor Channel vs Agent Channels

**Conductor channel:** A single channel where EVERYTHING goes to the conductor. The conductor then decides what to do (answer directly or delegate to sub-agents).

**Agent channels:** Specific bindings like "this Discord channel → this specific agent." Messages go directly to that agent, bypassing the conductor.

**Best practice:**
- Use one `#commands` channel as the conductor channel
- Use specific channels for specific agents (e.g. `#sol-monitor` → SOL price agent)
- DMs always go to conductor

---

## Multi-Bot Setup (Different Bots For Different Agents)

You can run multiple Discord/Telegram bots, each linked to a different agent:

```
Discord Bot A (DISCORD_TOKEN_1) → linked to Conductor
Discord Bot B (DISCORD_TOKEN_2) → linked to SOL Price Monitor
Telegram Bot A (TELEGRAM_BOT_TOKEN_1) → linked to Support Agent
```

Set this up in dashboard → Channels → Create Bot Instance → Assign Agent.

This way:
- Messages to Bot A → Conductor
- Messages to Bot B → SOL Price Monitor directly (no conductor involvement)

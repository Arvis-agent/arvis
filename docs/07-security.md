# 07 — Security
> How Arvis protects itself, how to expose it safely on a VPS, and how to pass credentials securely to agents.

---

## Security Model Overview

```
┌───────────────────────────────────────────────────────┐
│  HOMESERVER MODE (no DASHBOARD_PASSWORD set)           │
│  → No login required                                   │
│  → Only expose on localhost (127.0.0.1:5100)          │
│  → Don't put behind a public URL without a password   │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│  VPS / PUBLIC MODE (DASHBOARD_PASSWORD set)            │
│  → Login gate activates                               │
│  → PBKDF2 password hashing (120k iterations)          │
│  → JWT cookie (24h, httpOnly, Secure, SameSite=Lax)   │
│  → API key for programmatic access                    │
│  → Security headers (CSP, X-Frame-Options, etc.)      │
└───────────────────────────────────────────────────────┘
```

---

## Dashboard Authentication

### Setting Up Auth (VPS)

In `.env`:
```env
DASHBOARD_PASSWORD=your-strong-password-here
JWT_SECRET=$(openssl rand -hex 32)   # pin this so sessions survive restarts
```

That's all. Auth activates automatically when `DASHBOARD_PASSWORD` is set.

### How It Works

1. User POSTs `/api/auth/login` with password
2. Server runs PBKDF2(password, jwt_secret_derived_salt, 120000 iterations)
3. Timing-safe comparison against PBKDF2(stored_password, ...)
4. If match: issue JWT cookie (HS256, 24h expiry, httpOnly, Secure)
5. All pages + API routes verify JWT on every request

### Brute Force Protection

10 failed login attempts per 15 minutes per IP address.
After 10 failures: `429 Too Many Requests` for 15 minutes.
Counter resets on successful login.

---

## API Key Access (VPS / Programmatic)

For scripts, bots, or external integrations that need to call the dashboard API without a browser cookie:

```env
# Generate: openssl rand -hex 32
DASHBOARD_API_KEY=abc123def456...
```

Then in requests:
```bash
# Option 1: Bearer token
curl -H "Authorization: Bearer abc123def456..." http://localhost:5100/api/agents

# Option 2: X-API-Key header
curl -H "X-API-Key: abc123def456..." http://localhost:5100/api/agents
```

This is **separate from the browser password**. You can have:
- `DASHBOARD_PASSWORD` for humans logging in via browser
- `DASHBOARD_API_KEY` for scripts/bots calling the API

---

## Security Headers

Every response includes:
```
X-Frame-Options: DENY                       ← no iframe embedding (clickjacking)
X-Content-Type-Options: nosniff             ← no MIME sniffing
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Content-Security-Policy: default-src 'self'; ...
```

---

## Webhook Security (HMAC-SHA256)

All incoming webhooks (from GitHub, Stripe, etc.) are verified:
1. Each webhook has a unique secret generated at creation time
2. Webhook sender signs the body with HMAC-SHA256 using the secret
3. Arvis verifies the signature on every request
4. Wrong/missing signature → 401 rejected immediately

---

## Passing Credentials to Agents (Without Exposing Them)

### The Problem
Your agent needs to access GitHub, Stripe, your database, etc. But you can't put secrets in the agent's system prompt (they'd appear in logs).

### Solution 1: Environment Variables (Recommended)
Store credentials in `.env`, then write a custom tool plugin that uses them:

```ts
// plugins/github-tool.ts
import { registerTool } from '@arvis/core';

registerTool(
  {
    name: 'github_search',
    description: 'Search your GitHub repos, issues, and PRs',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        type: { type: 'string', enum: ['repos', 'issues', 'prs'], description: 'What to search' },
      },
      required: ['query'],
    },
  },
  async (input) => {
    const token = process.env.GITHUB_TOKEN;  // ← stored in .env, never exposed to LLM
    if (!token) return 'Error: GITHUB_TOKEN not configured';

    const query = encodeURIComponent(String(input.query));
    const res = await fetch(`https://api.github.com/search/repositories?q=${query}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });
    const data = await res.json();
    return JSON.stringify(data.items?.slice(0, 5).map((r: { full_name: string; description: string; stargazers_count: number }) => ({
      name: r.full_name,
      description: r.description,
      stars: r.stargazers_count,
    })));
  }
);
```

The agent calls `github_search` and gets results. **The token never enters the LLM prompt.**

### Solution 2: Skills File
Put the credential-using logic in a skill `.md` file:
```markdown
---
slug: github-access
name: GitHub Access
triggers:
  keywords: [github, repo, issue, PR, pull request, commit]
---

# Accessing GitHub

Use the http_fetch tool to query GitHub API:
- Search repos: GET https://api.github.com/search/repositories?q=QUERY
- View issues: GET https://api.github.com/repos/OWNER/REPO/issues

Note: You have read access via a token configured in the system.
Always prefer searching over browsing to minimize API calls.
```

The token itself stays in `.env` — the skill just describes how to use the tool.

### Solution 3: Agent System Prompt (Only for Non-Sensitive Info)
For non-secret config (like your GitHub username, or which repos to monitor):
```
# In dashboard → Agent → Config → System Prompt:
You monitor the GitHub repo "myorg/myrepo".
When checking issues, focus on labels: bug, urgent.
```

This is fine for non-credentials. **Never put API keys, tokens, or passwords in system prompts.**

---

## Protecting Sensitive Data in Memory

Agents store facts in memory automatically. To prevent sensitive data from being stored:

1. **Don't tell agents secrets directly** — use tools (solution 1 above) so secrets never enter conversation context
2. **Delete sensitive memories** — Dashboard → Agent → Memory tab → delete any accidentally stored sensitive facts
3. **Use [STATE:*] for temporary data** — state can be overwritten; [MEMORY:*] persists longer

---

## Docker Sandboxing (Optional, Advanced)

For agents that run untrusted code or have elevated access:

```env
ARVIS_SANDBOX_IMAGE=arvis-sandbox:latest
```

Build the sandbox image:
```bash
docker build -t arvis-sandbox:latest docker/sandbox/
```

This wraps the Claude CLI subprocess in a Docker container with:
- No network access (`--network none`)
- CPU limit: 1 core
- Memory limit: 512 MB
- Only the session directory mounted (not the full filesystem)

See [docker/sandbox/README.md](../docker/sandbox/README.md) for full details.

---

## VPS Deployment Checklist

```
□ Set DASHBOARD_PASSWORD in .env
□ Set JWT_SECRET in .env (pin it for persistent sessions)
□ Optionally set DASHBOARD_API_KEY for script access
□ Put dashboard behind nginx/Caddy with HTTPS
□ Bind Arvis to 127.0.0.1 (not 0.0.0.0) if using a reverse proxy
□ Use fail2ban to block repeated login failures at nginx level
□ Keep .env file permissions at 600 (chmod 600 .env)
□ Never commit .env to git
```

### Nginx Config Example
```nginx
server {
  listen 443 ssl;
  server_name arvis.yourdomain.com;

  ssl_certificate     /etc/letsencrypt/live/.../fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/.../privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:5100;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # WebSocket support (for real-time chat)
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

---

## What Arvis Does NOT Have

- **No Docker sandboxing by default** — agents run with your OS user permissions unless you enable the sandbox
- **No multi-user auth** — single admin account only (you)
- **No secrets vault** — credentials live in `.env` (use 1Password/Vault for enterprise setups)

This is intentional. Arvis is a personal platform. You trust your own agents.

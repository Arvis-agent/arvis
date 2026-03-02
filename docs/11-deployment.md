# 11 — Deployment
> Getting Arvis running in production: Docker, VPS (bare metal), systemd, nginx.

---

## Option 1 — Docker Compose (Recommended)

The fastest path to a working production deployment.

### Setup

```bash
# 1. Clone and configure
git clone https://github.com/your-username/arvis-v3
cd arvis-v3
cp .env.example .env
nano .env     # Fill in your API keys

# 2. Start
docker-compose up -d

# 3. Check logs
docker-compose logs -f arvis
docker-compose logs -f dashboard
```

Services started:
- `arvis` — core engine on ports 5050 (webhook) + 5070 (WebSocket chat)
- `dashboard` — Next.js dashboard on port 5100

Data persists in `./data/` on the host (SQLite DB + backups).

### Updating

```bash
git pull
docker-compose build
docker-compose up -d
```

### Environment in Docker

Pass `.env` via volume mount (already configured in `docker-compose.yml`). Never bake secrets into the image.

---

## Option 2 — Bare Metal (Node.js directly)

For when you want more control or lighter resource usage.

### Install Node.js 18+

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version   # 18+
```

### Deploy

```bash
git clone https://github.com/your-username/arvis-v3
cd arvis-v3
npm install
cp .env.example .env
nano .env

# Build
npm run build

# Start
npm start
```

---

## Keeping It Running — systemd

Create a systemd service so Arvis restarts on crash and starts on boot.

```ini
# /etc/systemd/system/arvis.service
[Unit]
Description=Arvis AI Agent Platform
After=network.target

[Service]
Type=simple
User=arvis
WorkingDirectory=/opt/arvis-v3
EnvironmentFile=/opt/arvis-v3/.env
ExecStart=/usr/bin/node node_modules/.bin/tsx src/cli.ts
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable arvis
sudo systemctl start arvis
sudo systemctl status arvis
```

For the dashboard separately:

```ini
# /etc/systemd/system/arvis-dashboard.service
[Unit]
Description=Arvis Dashboard
After=network.target arvis.service

[Service]
Type=simple
User=arvis
WorkingDirectory=/opt/arvis-v3/packages/dashboard
ExecStart=/usr/bin/node .next/standalone/server.js
Environment=PORT=5100
Environment=HOSTNAME=0.0.0.0
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## Nginx Reverse Proxy

Put Nginx in front so you get HTTPS + a clean domain.

```nginx
# /etc/nginx/sites-available/arvis
server {
    server_name arvis.yourdomain.com;

    # Dashboard
    location / {
        proxy_pass http://localhost:5100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket chat (path must match connector-web config)
    location /ws {
        proxy_pass http://localhost:5070;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }

    # Webhook endpoint
    location /webhook {
        proxy_pass http://localhost:5050;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable HTTPS with Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d arvis.yourdomain.com
```

---

## Ports Reference

| Port | Service | Notes |
|------|---------|-------|
| 5050 | Webhook server | Receives Discord/Slack/WhatsApp webhooks |
| 5060 | Web connector API | REST API + auth |
| 5070 | WebSocket chat | Dashboard real-time chat |
| 5080 | SMS webhook | Twilio webhooks (if enabled) |
| 5100 | Dashboard | Next.js admin UI |

All ports are configurable via `.env`.

---

## Security Hardening

### Firewall

Only expose ports users need:

```bash
# UFW example
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirect to HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw deny 5050       # Block direct webhook access (use nginx)
sudo ufw deny 5070       # Block direct WebSocket access (use nginx)
sudo ufw deny 5100       # Block direct dashboard access (use nginx)
sudo ufw enable
```

### Dashboard Auth

```bash
# Always set a password for any internet-facing deployment
DASHBOARD_PASSWORD=use-a-strong-password-here
DASHBOARD_API_KEY=your-api-key-for-programmatic-access
```

Without `DASHBOARD_PASSWORD`, the dashboard is open to anyone who can reach it.

### Run as Non-Root

```bash
sudo useradd -m -s /bin/bash arvis
sudo chown -R arvis:arvis /opt/arvis-v3
```

### API Key Rotation

API keys live in `.env`. To rotate:
1. Update the key in `.env`
2. `sudo systemctl restart arvis`
3. The old key is immediately invalid

---

## Backups

Arvis auto-backs up the SQLite database daily to `data/backups/arvis-YYYY-MM-DD.db` (keeps last 7).

To back up manually:

```bash
cp data/arvis.db data/backups/arvis-manual-$(date +%Y%m%d).db
```

To restore:

```bash
sudo systemctl stop arvis
cp data/backups/arvis-2024-01-15.db data/arvis.db
sudo systemctl start arvis
```

---

## Minimum VPS Specs

| Use case | RAM | CPU | Storage |
|----------|-----|-----|---------|
| Personal (1-3 agents) | 512MB | 1 vCPU | 5GB |
| Small team (5-10 agents) | 1GB | 1 vCPU | 10GB |
| Production (many agents) | 2GB | 2 vCPU | 20GB |

SQLite handles hundreds of concurrent conversations fine. Only scale up if you're running heavy LLM workloads locally (Ollama).

---

## Updating in Production

```bash
# 1. Pull latest
git pull

# 2. Install new dependencies (if any)
npm install

# 3. Build
npm run build

# 4. Restart
sudo systemctl restart arvis
sudo systemctl restart arvis-dashboard
```

Database migrations run automatically on startup.

---

## Logs

```bash
# systemd
sudo journalctl -u arvis -f
sudo journalctl -u arvis-dashboard -f

# Docker
docker-compose logs -f arvis
docker-compose logs -f dashboard

# File logs (if configured)
tail -f data/logs/arvis.log
```

Set `LOG_LEVEL=debug` in `.env` for verbose output.

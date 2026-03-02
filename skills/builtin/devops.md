---
slug: devops
name: DevOps & Infrastructure
description: Docker, CI/CD, Linux server management, nginx, deployment, monitoring, and cloud infrastructure.
category: coding
triggers:
  keywords: [docker, kubernetes, k8s, nginx, linux, server, deploy, deployment, ci, cd, github actions, pipeline, vps, cloud, aws, gcp, azure, ssl, https, cert, systemd, pm2, monitoring, logs, bash, shell, cron]
  patterns: [".*deploy.*", ".*server.*setup.*", ".*docker.*", ".*nginx.*config.*"]
---

# DevOps & Infrastructure

## Docker
- Use multi-stage builds to keep final images small
- Don't run containers as root — create a non-root user
- Pin base image versions (e.g. `node:22-slim` not `node:latest`)
- Use `.dockerignore` to exclude node_modules, .env, .git
- Use named volumes for persistent data, not bind mounts in production

## Nginx (Reverse Proxy)
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # WebSocket support:
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Linux Server Basics
- Keep the system updated: `apt update && apt upgrade`
- Use `ufw` for firewall: allow only 22, 80, 443
- Use SSH keys, not passwords; disable root login
- `systemd` for process management: `systemctl enable|start|stop|status`
- `journalctl -u service-name -f` to tail service logs

## Process Management (PM2 / systemd)
```bash
# PM2
pm2 start dist/main.js --name arvis
pm2 save && pm2 startup

# systemd
systemctl start arvis
systemctl enable arvis   # start on boot
journalctl -u arvis -f   # tail logs
```

## Security Hardening
- Disable password SSH: `PasswordAuthentication no` in sshd_config
- Use fail2ban to block brute force attempts
- Run apps as non-root system users
- Set file permissions: `.env` should be `chmod 600`
- Rotate logs with logrotate

## SSL Certificates (Let's Encrypt)
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com
# Auto-renew (added by certbot):
# 0 12 * * * /usr/bin/certbot renew --quiet
```

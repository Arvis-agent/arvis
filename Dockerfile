# ── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app

# Copy workspace manifests first (cache layer)
COPY package.json package-lock.json* ./
COPY packages/core/package.json ./packages/core/
COPY packages/connector-discord/package.json ./packages/connector-discord/
COPY packages/connector-telegram/package.json ./packages/connector-telegram/
COPY packages/connector-slack/package.json ./packages/connector-slack/
COPY packages/connector-whatsapp/package.json ./packages/connector-whatsapp/
COPY packages/connector-matrix/package.json ./packages/connector-matrix/
COPY packages/connector-web/package.json ./packages/connector-web/
COPY packages/connector-sms/package.json ./packages/connector-sms/
COPY packages/connector-email/package.json ./packages/connector-email/

RUN npm ci --workspaces --include-workspace-root --ignore-scripts

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-slim
WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules 2>/dev/null || true

# Copy source code
COPY package.json ./
COPY tsconfig*.json ./
COPY src/ ./src/
COPY packages/core/ ./packages/core/
COPY packages/connector-discord/ ./packages/connector-discord/
COPY packages/connector-telegram/ ./packages/connector-telegram/
COPY packages/connector-slack/ ./packages/connector-slack/
COPY packages/connector-whatsapp/ ./packages/connector-whatsapp/
COPY packages/connector-matrix/ ./packages/connector-matrix/
COPY packages/connector-web/ ./packages/connector-web/
COPY packages/connector-sms/ ./packages/connector-sms/
COPY packages/connector-email/ ./packages/connector-email/

# Data directory (mounted as volume in production)
RUN mkdir -p /app/data

EXPOSE 5050 5070

ENV NODE_ENV=production
ENV DATA_DIR=/app/data

CMD ["node_modules/.bin/tsx", "src/cli.ts"]

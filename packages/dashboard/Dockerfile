# ── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/core/package.json ./packages/core/
COPY packages/dashboard/package.json ./packages/dashboard/

RUN npm ci --workspaces=packages/core,packages/dashboard --include-workspace-root --ignore-scripts

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules 2>/dev/null || true
COPY --from=deps /app/packages/dashboard/node_modules ./packages/dashboard/node_modules 2>/dev/null || true

COPY package.json tsconfig*.json ./
COPY packages/core/ ./packages/core/
COPY packages/dashboard/ ./packages/dashboard/

RUN npm run dashboard:build

# ── Stage 3: Runtime ─────────────────────────────────────────────────────────
FROM node:22-slim
WORKDIR /app

COPY --from=builder /app/packages/dashboard/.next ./packages/dashboard/.next
COPY --from=builder /app/packages/dashboard/public ./packages/dashboard/public 2>/dev/null || true
COPY --from=builder /app/packages/dashboard/package.json ./packages/dashboard/
COPY --from=deps /app/node_modules ./node_modules

EXPOSE 5100

ENV NODE_ENV=production
ENV PORT=5100

WORKDIR /app/packages/dashboard
CMD ["node_modules/.bin/next", "start", "--port", "5100"]

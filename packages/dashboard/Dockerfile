# ── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/core/package.json ./packages/core/
COPY packages/dashboard/package.json ./packages/dashboard/

RUN npm ci --workspace=@arvis/core --workspace=@arvis/dashboard --include-workspace-root --ignore-scripts && \
    npm rebuild better-sqlite3

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

# Copy core source (API routes import from @arvis/core at runtime)
COPY --from=builder /app/packages/core/ ./packages/core/
COPY --from=builder /app/packages/dashboard/.next ./packages/dashboard/.next
COPY --from=builder /app/packages/dashboard/public ./packages/dashboard/public 2>/dev/null || true
COPY --from=builder /app/packages/dashboard/package.json ./packages/dashboard/
COPY --from=builder /app/package.json ./
COPY --from=deps /app/node_modules ./node_modules

# Run as non-root user
RUN groupadd -r arvis && useradd -r -g arvis arvis && \
    mkdir -p /app/data && chown -R arvis:arvis /app
USER arvis

EXPOSE 5100

ENV NODE_ENV=production
ENV PORT=5100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:5100/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

WORKDIR /app/packages/dashboard
CMD ["../../node_modules/.bin/next", "start", "--port", "5100"]

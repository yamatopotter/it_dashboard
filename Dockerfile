# ── Stage 1: install all dependencies ─────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci && npx prisma generate

# ── Stage 2: build Next.js ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Dummy secrets so fail-fast validators in lib/auth.ts, lib/crypto.ts, and
# lib/webhook.ts don't throw during Next.js page-data collection at build time.
# These values are never used at runtime — real secrets come from the environment.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ARG NEXTAUTH_SECRET=build-placeholder-secret-32-chars-min
ARG ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
ARG WEBHOOK_SECRET=build-placeholder-webhook-secret-here
ENV DATABASE_URL=${DATABASE_URL} \
    NEXTAUTH_SECRET=${NEXTAUTH_SECRET} \
    ENCRYPTION_KEY=${ENCRYPTION_KEY} \
    WEBHOOK_SECRET=${WEBHOOK_SECRET}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Regenerate with full source present (path aliases resolution)
RUN npx prisma generate && npm run build

# ── Stage 3: production runtime ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

# Next.js
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./
COPY --from=builder /app/SECURITY_REPORT.md ./

# Worker, scripts and shared libs
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/worker ./worker
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/app/api ./app/api
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/tsconfig.json ./

# Node modules (prod + tsx for worker runtime)
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /app/data && chown -R app:app /app
USER app
EXPOSE 3000

CMD ["npm", "run", "start"]

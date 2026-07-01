# ── Stage 1: install ALL dependencies (needed for build) ──────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci && npx prisma generate

# ── Stage 2: install PRODUCTION-ONLY dependencies ─────────────────────────────
FROM node:20-alpine AS prod-deps
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Excludes devDependencies: jest, playwright, typescript, eslint, tailwindcss, etc.
RUN npm ci --omit=dev && npx prisma generate

# ── Stage 3: build Next.js ─────────────────────────────────────────────────────
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

# ── Stage 4: production runtime ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/data && chown app:app /app/data

# Copy files with --chown to avoid a separate RUN chown layer that duplicates all files
COPY --chown=app:app --from=builder /app/public ./public
COPY --chown=app:app --from=builder /app/.next ./.next
COPY --chown=app:app --from=builder /app/package.json ./
COPY --chown=app:app --from=builder /app/SECURITY_REPORT.md ./

# Worker, scripts and shared libs
COPY --chown=app:app --from=builder /app/scripts ./scripts
COPY --chown=app:app --from=builder /app/worker ./worker
COPY --chown=app:app --from=builder /app/lib ./lib
COPY --chown=app:app --from=builder /app/app/api ./app/api
COPY --chown=app:app --from=builder /app/prisma ./prisma
COPY --chown=app:app --from=builder /app/prisma.config.ts ./
COPY --chown=app:app --from=builder /app/tsconfig.json ./

# Production-only node_modules (no jest, playwright, typescript, eslint, etc.)
COPY --chown=app:app --from=prod-deps /app/node_modules ./node_modules

USER app
EXPOSE 3000

CMD ["npm", "run", "start"]

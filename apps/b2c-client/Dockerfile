# =============================================================================
# B2C Client (Next.js) — Multi-stage Dockerfile
# Build context: monorepo root  (docker-compose sets context: .)
# =============================================================================
#
# PREREQUISITE — add this to apps/b2c-client/next.config.js:
#
#   const path = require('path')
#   module.exports = {
#     output: 'standalone',
#     experimental: {
#       outputFileTracingRoot: path.join(__dirname, '../../'),
#     },
#   }
#
# =============================================================================

ARG NODE_VERSION=20
ARG ALPINE_VERSION=3.20

# ── Stage 1: dependency installer ────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS deps
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable pnpm

# Copy workspace manifests (pnpm needs the full workspace graph to resolve)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/database/package.json     ./packages/database/
COPY apps/b2c-client/package.json       ./apps/b2c-client/

# Install ALL workspace deps (production + dev, needed for build)
RUN pnpm install --no-frozen-lockfile

# ── Stage 2: builder ─────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS builder
WORKDIR /app

RUN corepack enable pnpm

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules         ./node_modules
COPY --from=deps /app/apps/b2c-client/node_modules ./apps/b2c-client/node_modules

# Copy full source (needed for cross-package imports)
COPY . .

# Build args passed from docker-compose (injected at build time, not runtime)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

RUN pnpm --filter @nearbit/b2c-client run build

# ── Stage 3: production runner ────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# Principle of least privilege — do not run as root
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Static assets
COPY --from=builder /app/apps/b2c-client/public ./public

# Standalone bundle (mirrors monorepo path due to outputFileTracingRoot)
COPY --from=builder --chown=nextjs:nodejs \
     /app/apps/b2c-client/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs \
     /app/apps/b2c-client/.next/static     ./apps/b2c-client/.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# server.js is placed by Next.js at the monorepo-relative path
CMD ["node", "apps/b2c-client/server.js"]

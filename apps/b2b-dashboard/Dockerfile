# =============================================================================
# B2B Dashboard (Next.js) — Multi-stage Dockerfile
# Build context: monorepo root  (docker-compose sets context: .)
# =============================================================================
#
# PREREQUISITE — add this to apps/b2b-dashboard/next.config.js:
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
RUN corepack enable pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/database/package.json     ./packages/database/
COPY apps/b2b-dashboard/package.json    ./apps/b2b-dashboard/

RUN pnpm install --no-frozen-lockfile

# ── Stage 2: builder ─────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS builder
WORKDIR /app

RUN corepack enable pnpm

COPY --from=deps /app/node_modules            ./node_modules
COPY --from=deps /app/apps/b2b-dashboard/node_modules ./apps/b2b-dashboard/node_modules

COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_B2B_APP_URL

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    NEXT_PUBLIC_B2B_APP_URL=${NEXT_PUBLIC_B2B_APP_URL}

RUN pnpm --filter @nearbit/b2b-dashboard run build

# ── Stage 3: production runner ────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs \
     /app/apps/b2b-dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs \
     /app/apps/b2b-dashboard/.next/static     ./apps/b2b-dashboard/.next/static

USER nextjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "apps/b2b-dashboard/server.js"]

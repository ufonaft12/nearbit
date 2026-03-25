# Nearbit Platform

Polyglot monorepo hosting the B2C storefront, B2B dashboard, and a 3-stage market-data ingestion pipeline.

```
nearbit/
├── apps/
│   ├── b2c-client/          Next.js — consumer storefront  (port 3000)
│   └── b2b-dashboard/       Next.js — merchant dashboard   (port 3001)
├── services/
│   ├── market-parser/       Python entrypoint for the parser container (main.py only)
│   └── price-sync/          Python — diffs CSVs vs Redis, upserts to Supabase
├── packages/
│   ├── shared-types/        TypeScript types shared by both Next.js apps
│   └── database/            Supabase SQL migrations
├── docker-compose.yml       Master orchestrator
├── Makefile                 Convenience commands
└── .env.example             Environment variable template
```

---

## Pipeline Overview

The market-data pipeline runs every 6 hours via Ofelia scheduler:

```
:00  market-scraper   — downloads XML from supermarket servers → dumps/
:20  market-parser    — converts XML dumps → price CSVs        → outputs/
:40  price-sync       — diffs CSVs vs Redis, upserts changes   → Supabase
```

All three pipeline containers use `profiles: pipeline` — they are **not** started on `make up`, only created. Ofelia triggers them on schedule.

---

## Prerequisites

| Tool | Min version | Install |
|------|-------------|---------|
| Node.js | 20 | https://nodejs.org |
| pnpm | 9 | `npm i -g pnpm` |
| Docker Desktop | 25 | https://docker.com |

---

## Quick Start

```bash
# 1. Copy environment config
cp .env.example .env.local
# Fill in Supabase URL, keys, Upstash Redis URL/token in .env.local

# 2. Build and start web apps + create pipeline containers
make up

# 3. (Optional) Run the full pipeline once manually
make pipeline-run
```

Services:
- B2C: http://localhost:3000
- B2B: http://localhost:3001
- Pipeline runs internally on schedule (no public port)

Stop everything: `make down`

---

## Local Development (without Docker)

```bash
# Install all workspace dependencies
pnpm install

# Run both apps in parallel
pnpm --parallel -r --filter './apps/*' run dev

# Or run individually
pnpm --filter @nearbit/b2c-client dev     # http://localhost:3000
pnpm --filter @nearbit/b2b-dashboard dev  # http://localhost:3001
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Used by | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | B2C, B2B, price-sync | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | B2C, B2B | Supabase anon key (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | B2B, price-sync | Full DB access — keep secret |
| `DATABASE_URL` | Migrations | Direct Postgres URL for schema changes |
| `OPENAI_API_KEY` | B2C | Intent detection for search |
| `UPSTASH_REDIS_REST_URL` | price-sync | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | price-sync | Upstash Redis REST token |
| `LANGFUSE_SECRET_KEY` | B2C | LLM observability (optional) |
| `LANGFUSE_PUBLIC_KEY` | B2C | LLM observability (optional) |
| `ENABLED_SCRAPERS` | market-scraper | Comma-separated chains to scrape |
| `ENABLED_PARSERS` | market-parser | Comma-separated chains to parse |
| `ENABLED_FILE_TYPES` | scraper, parser | e.g. `PRICE_FILE,STORE_FILE` |
| `SCRAPER_LIMIT` | market-scraper | Files per chain per run (1 = fast test) |
| `PARSER_LIMIT` | market-parser | Files per chain per run |
| `KAGGLE_API_TOKEN` | market-scraper | Kaggle API token (format: `KGAT_...`) |

---

## Docker Architecture

```
nearbit-net (bridge)
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌──────────────┐      ┌──────────────────┐             │
│  │  b2c-client  │      │  b2b-dashboard   │             │
│  │   :3000      │      │     :3001        │             │
│  └──────────────┘      └──────────────────┘             │
│                                                         │
│  pipeline (profile=pipeline, triggered by Ofelia)       │
│  ┌────────────────┐  dumps/  ┌───────────────┐          │
│  │ market-scraper │ ──────►  │ market-parser │          │
│  └────────────────┘          └───────┬───────┘          │
│                               outputs/│                  │
│                         ┌────────────▼──────┐           │
│                         │    price-sync     │           │
│                         └────────────┬──────┘           │
│                                      │                  │
│            ┌─────────────────────────┼──────────┐       │
│            │  Upstash Redis          │ Supabase │       │
│            │  (price state cache)    │ (DB)     │       │
│            └─────────────────────────┴──────────┘       │
└─────────────────────────────────────────────────────────┘
```

---

## Makefile Commands

```bash
# Docker
make up              # Build web apps + create pipeline containers
make up-d            # Same, detached
make down            # Stop all services
make down-v          # Stop and remove volumes
make restart         # down + up
make logs            # Tail all logs
make logs-b2c        # Tail B2C logs
make logs-b2b        # Tail B2B logs
make ps              # Show container status
make clean           # Remove containers, volumes, images

# Pipeline (manual runs)
make scraper-run     # Run scraper once
make parser-run      # Run parser once
make sync-run        # Run price-sync once
make pipeline-run    # Run all 3 stages sequentially

# Debug shells
make scraper-shell   # bash into scraper container
make parser-shell    # bash into parser container

# Local dev
make install         # pnpm install
make dev             # Run B2C + B2B in parallel
make dev-b2c         # Run B2C only
make dev-b2b         # Run B2B only

# Tests
make test            # Run all JS tests
make test-parser     # Run Python parser tests in Docker
```

---

## Database Migrations

SQL migrations live in `packages/database/migrations/`. To apply:

```bash
# Apply all migrations to Supabase
psql $DATABASE_URL -f packages/database/migrations/0001_initial_schema.sql
psql $DATABASE_URL -f packages/database/migrations/0002_market_sync.sql
```

After schema changes, regenerate TypeScript types:

```bash
npx supabase gen types typescript --project-id <project-id> \
  > packages/shared-types/src/supabase.ts
```

---

## Supported Supermarket Chains

`BAREKET`, `YAYNO_BITAN_AND_CARREFOUR`, `SHUFERSAL`, `RAMI_LEVY`, `VICTORY`, `HAZI_HINAM`, `TIV_TAAM`, `OSHER_AD`, `SUPER_PHARM`, `COFIX`

Configure via `ENABLED_SCRAPERS` / `ENABLED_PARSERS` in `.env.local`.

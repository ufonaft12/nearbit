# Nearbit Platform

Polyglot monorepo hosting the B2C storefront, B2B dashboard, and market-data ingestion pipeline.

```
nearbit-platform/
├── apps/
│   ├── b2c-client/        Next.js — consumer storefront  (port 3000)
│   └── b2b-dashboard/     Next.js — merchant dashboard   (port 3001)
├── services/
│   └── market-parser/     Python  — Israeli supermarket price scraper
├── packages/
│   ├── shared-types/      TypeScript types shared by both Next.js apps
│   └── database/          Supabase SQL migrations + type generator
├── docker-compose.yml     Master orchestrator
├── migrate.sh             One-time history-preserving monorepo migration
└── .env.example           Environment variable template
```

---

## Prerequisites

| Tool | Min version | Install |
|------|-------------|---------|
| Node.js | 20 | https://nodejs.org |
| pnpm | 9 | `npm i -g pnpm` |
| Python | 3.11 | https://python.org |
| Poetry | 1.8 | `curl -sSL https://install.python-poetry.org \| python3 -` |
| Docker Desktop | 25 | https://docker.com |
| git-filter-repo | any | `pip install git-filter-repo` (migration only) |

---

## Quick Start — one command

```bash
# 1. Copy environment config
cp .env.example .env
# Fill in your Supabase URL, anon key, and service role key in .env

# 2. Start the entire platform
docker compose up --build
```

Services will be available at:
- B2C: http://localhost:3000
- B2B: http://localhost:3001
- Market parser runs internally (no public port)

Stop everything: `docker compose down`

---

## Local Development (without Docker)

### Node.js apps

```bash
# Install all workspace dependencies
pnpm install

# Run both apps in parallel
pnpm dev

# Or run individually
pnpm dev:b2c    # http://localhost:3000
pnpm dev:b2b    # http://localhost:3001
```

### Python market-parser

```bash
cd services/market-parser

# Install dependencies (first time)
poetry install

# Run the scheduler
poetry run python -m market_parser.scheduler

# Or run a one-off parse
poetry run python -m market_parser.run --chain shufersal
```

---

## Monorepo Migration (one-time)

If you are migrating from the three separate source repositories for the first time:

```bash
# Check prerequisites
bash migrate.sh --dry-run

# Execute — rewrites commit history and merges all three repos
bash migrate.sh

# Verify history was preserved
git log --oneline -- apps/b2c-client/
git log --oneline -- apps/b2b-dashboard/
git log --oneline -- services/market-parser/

# Push to remote
git remote add origin https://github.com/ufonaft12/nearbit.git
git push -u origin main
```

**How history is preserved:** `migrate.sh` uses `git filter-repo --to-subdirectory-filter` to rewrite every commit of each source repo so all paths are prefixed with the target folder. The rewritten histories are then merged into this repo with `--allow-unrelated-histories`. This means `git log -- apps/b2c-client/` shows the original Shoppy commit history, not a single squash commit.

---

## Next.js Standalone Output

Both Next.js apps must have `output: 'standalone'` enabled for the Docker images to work correctly. Add to each `next.config.js`:

```js
const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    // Required so standalone knows where the monorepo root is
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
}

module.exports = nextConfig
```

---

## Keeping Python and TypeScript Types in Sync

Both the Next.js apps and the Python parser read/write the **same Supabase database**. The strategy for keeping data shapes consistent:

### Source of truth: SQL migrations

`packages/database/migrations/` contains the authoritative schema. All table definitions, constraints, and RLS policies live here. Neither the TypeScript types nor the Python models are the source of truth — the SQL is.

### TypeScript side

After any schema change, regenerate types from the live Supabase instance:

```bash
pnpm db:types
# Writes to: packages/shared-types/src/supabase.ts
# Commit the generated file — it becomes part of the build
```

Both `@nearbit/b2c-client` and `@nearbit/b2b-dashboard` import from `@nearbit/shared-types`:

```ts
import type { Product, PriceComparisonResult } from '@nearbit/shared-types'
import type { Database } from '@nearbit/shared-types/supabase'
```

### Python side

`services/market-parser/market_parser/models.py` contains Pydantic models that mirror the same tables. Keep them in sync manually by reviewing the migration file whenever the SQL schema changes. Example Pydantic model:

```python
from pydantic import BaseModel
from datetime import datetime

class Product(BaseModel):
    id: str
    barcode: str
    name: str
    category: str | None
    price_agorot: int
    currency: str = 'ILS'
    supermarket_chain: str
    branch_id: str
    scraped_at: datetime
```

### Change workflow

1. Write a new SQL migration in `packages/database/migrations/`
2. Apply it: `pnpm --filter @nearbit/database migrate`
3. Regenerate TS types: `pnpm db:types`
4. Update the matching Pydantic model in `services/market-parser/market_parser/models.py`
5. Commit all three together in one PR

---

## Environment Variables

| Variable | Used by | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | B2C, B2B | Supabase project URL (public, baked at build time) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | B2C, B2B | Supabase anon key (public, browser-safe) |
| `SUPABASE_URL` | Parser | Supabase project URL (server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | B2B, Parser | Full DB access — keep secret |
| `DATABASE_URL` | Migrations | Direct Postgres URL for schema changes |
| `MARKET_PARSER_INTERNAL_URL` | B2B | Internal Docker DNS to call the parser |
| `PARSER_SCHEDULE_CRON` | Parser | Cron expression for scrape schedule |

---

## Docker Architecture

```
┌─────────────────────────────────────────────────┐
│  nearbit-net (bridge network)                   │
│                                                 │
│  ┌──────────────┐    ┌──────────────┐           │
│  │ b2c-client   │    │ b2b-dashboard│           │
│  │ :3000        │    │ :3001        │           │
│  └──────────────┘    └──────┬───────┘           │
│                             │ HTTP               │
│                      ┌──────▼───────┐           │
│                      │market-parser │           │
│                      │ (no public   │           │
│                      │  port)       │           │
│                      └──────┬───────┘           │
│                             │                   │
└─────────────────────────────┼───────────────────┘
                              │ Supabase client
                         ┌────▼────┐
                         │Supabase │
                         │(managed)│
                         └─────────┘
```

All three services connect to the same Supabase instance. The parser and B2B dashboard communicate over the internal `nearbit-net` network using Docker's built-in DNS (`http://market-parser:8000`).

---

## Useful Commands

```bash
# Docker
docker compose up --build -d          # start detached
docker compose logs -f market-parser  # tail parser logs
docker compose exec b2b-dashboard sh  # shell into B2B container
docker compose down -v                # stop and remove volumes

# pnpm workspace
pnpm --filter @nearbit/b2c-client add <pkg>    # add dep to B2C only
pnpm --filter @nearbit/shared-types build      # build shared types
pnpm -r run lint                               # lint all packages

# Database
pnpm --filter @nearbit/database migrate        # push migrations to Supabase
pnpm db:types                                  # regenerate TS types

# Python
cd services/market-parser
poetry add <pkg>                               # add a dependency
poetry run pytest                              # run tests
poetry run ruff check .                        # lint
```

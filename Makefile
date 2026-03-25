# =============================================================================
# Nearbit Platform — Makefile
# =============================================================================
# Usage:
#   make            → same as make up
#   make up         → build & start all services (Docker)
#   make down       → stop all services
#   make dev        → local dev mode (pnpm, no Docker)
#   make logs       → tail all logs
#   make ps         → show running containers
# =============================================================================

.DEFAULT_GOAL := up

# ── Docker ────────────────────────────────────────────────────────────────────

.PHONY: up
up:
	docker compose --env-file .env.local up --build
	docker compose --env-file .env.local --profile pipeline up --no-start

.PHONY: up-d
up-d:
	docker compose --env-file .env.local up --build -d
	docker compose --env-file .env.local --profile pipeline up --no-start

.PHONY: down
down:
	docker compose down

.PHONY: down-v
down-v:
	docker compose down -v

.PHONY: restart
restart: down up

.PHONY: logs
logs:
	docker compose logs -f

.PHONY: logs-b2c
logs-b2c:
	docker compose logs -f b2c-client

.PHONY: logs-b2b
logs-b2b:
	docker compose logs -f b2b-dashboard

.PHONY: logs-parser
logs-parser:
	docker compose logs -f market-parser

.PHONY: ps
ps:
	docker compose ps

# ── Local Dev (pnpm, no Docker) ───────────────────────────────────────────────

.PHONY: install
install:
	pnpm install

.PHONY: dev
dev:
	pnpm --parallel -r --filter './apps/*' run dev

.PHONY: dev-b2c
dev-b2c:
	pnpm --filter @nearbit/b2c-client dev

.PHONY: dev-b2b
dev-b2b:
	pnpm --filter @nearbit/b2b-dashboard dev

# ── Build ─────────────────────────────────────────────────────────────────────

.PHONY: build
build:
	pnpm -r run build

.PHONY: build-b2c
build-b2c:
	pnpm --filter @nearbit/b2c-client build

.PHONY: build-b2b
build-b2b:
	pnpm --filter @nearbit/b2b-dashboard build

# ── Tests ─────────────────────────────────────────────────────────────────────

.PHONY: test
test:
	pnpm -r run test

.PHONY: test-b2c
test-b2c:
	pnpm --filter @nearbit/b2c-client test

.PHONY: test-b2b
test-b2b:
	pnpm --filter @nearbit/b2b-dashboard test

.PHONY: test-parser
test-parser:
	docker compose run --rm market-parser python -m pytest .

# ── Parser (Python) ───────────────────────────────────────────────────────────

.PHONY: scraper-run
scraper-run:
	docker compose --env-file .env.local run --rm market-scraper

.PHONY: parser-run
parser-run:
	docker compose --env-file .env.local run --rm market-parser

.PHONY: sync-run
sync-run:
	docker compose --env-file .env.local run --rm price-sync

.PHONY: pipeline-run
pipeline-run: scraper-run parser-run sync-run

.PHONY: scraper-shell
scraper-shell:
	docker compose --env-file .env.local run --rm market-scraper bash

.PHONY: parser-shell
parser-shell:
	docker compose --env-file .env.local run --rm market-parser bash

# ── Utilities ─────────────────────────────────────────────────────────────────

.PHONY: clean
clean:
	docker compose down -v --remove-orphans
	docker image rm -f nearbit/b2c-client nearbit/b2b-dashboard nearbit/market-parser 2>/dev/null || true

.PHONY: help
help:
	@echo ""
	@echo "  Nearbit Platform — available commands"
	@echo ""
	@echo "  Docker:"
	@echo "    make up           Build & start all services"
	@echo "    make up-d         Same, detached (background)"
	@echo "    make down         Stop all services"
	@echo "    make down-v       Stop and remove volumes"
	@echo "    make restart      down + up"
	@echo "    make logs         Tail all logs"
	@echo "    make logs-b2c     Tail B2C logs"
	@echo "    make logs-b2b     Tail B2B logs"
	@echo "    make logs-parser  Tail parser logs"
	@echo "    make ps           Show container status"
	@echo "    make clean        Remove containers, volumes, images"
	@echo ""
	@echo "  Local dev:"
	@echo "    make install      pnpm install"
	@echo "    make dev          Run B2C + B2B in parallel"
	@echo "    make dev-b2c      Run B2C only (localhost:3000)"
	@echo "    make dev-b2b      Run B2B only (localhost:3001)"
	@echo ""
	@echo "  Build:"
	@echo "    make build        Build all apps"
	@echo "    make build-b2c    Build B2C only"
	@echo "    make build-b2b    Build B2B only"
	@echo ""
	@echo "  Tests:"
	@echo "    make test         Run all tests"
	@echo "    make test-parser  Run Python parser tests in Docker"
	@echo ""

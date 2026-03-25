-- =============================================================================
-- Migration: 0001_initial_schema
-- Nearbit Platform — core tables
-- =============================================================================
-- Run via: pnpm --filter @nearbit/database migrate
-- =============================================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";       -- for fast text search on product names

-- ── Supermarket branches ─────────────────────────────────────────────────────
create table if not exists supermarket_branches (
  id          uuid primary key default uuid_generate_v4(),
  chain       text not null,
  name        text not null,
  city        text,
  address     text,
  lat         numeric(9,6),
  lng         numeric(9,6),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Products ──────────────────────────────────────────────────────────────────
create table if not exists products (
  id                  uuid primary key default uuid_generate_v4(),
  barcode             text not null,
  name                text not null,
  category            text,
  supermarket_chain   text not null,
  branch_id           uuid references supermarket_branches(id),
  price_agorot        integer not null check (price_agorot >= 0),
  currency            char(3) not null default 'ILS',
  scraped_at          timestamptz not null,
  updated_at          timestamptz not null default now(),
  -- A product-branch combo should appear once per scrape
  unique (barcode, branch_id, scraped_at)
);

create index if not exists products_barcode_idx  on products (barcode);
create index if not exists products_chain_idx    on products (supermarket_chain);
create index if not exists products_name_trgm    on products using gin (name gin_trgm_ops);

-- ── Price history ─────────────────────────────────────────────────────────────
create table if not exists price_history (
  id            uuid primary key default uuid_generate_v4(),
  product_id    uuid not null references products(id) on delete cascade,
  price_agorot  integer not null check (price_agorot >= 0),
  recorded_at   timestamptz not null default now()
);

create index if not exists price_history_product_idx on price_history (product_id, recorded_at desc);

-- ── Row-level security (Supabase) ─────────────────────────────────────────────
alter table products             enable row level security;
alter table price_history        enable row level security;
alter table supermarket_branches enable row level security;

-- Public read access (anon key can SELECT)
create policy "products_public_read"
  on products for select using (true);

create policy "branches_public_read"
  on supermarket_branches for select using (true);

create policy "price_history_public_read"
  on price_history for select using (true);

-- Service role can INSERT/UPDATE/DELETE (market-parser uses service_role key)
create policy "products_service_write"
  on products for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "price_history_service_write"
  on price_history for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

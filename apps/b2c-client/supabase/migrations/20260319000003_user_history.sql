-- ============================================================
-- Nearbit – User History (Phase 2)
-- Tables: search_history, purchase_log
-- ============================================================

-- ── Search History ────────────────────────────────────────────────────────────
-- Records every search query a logged-in user submits.

create table if not exists public.search_history (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  query         text        not null,
  locale        text        not null default 'he',
  results_count int         not null default 0,
  searched_at   timestamptz not null default now()
);

comment on table public.search_history is
  'Search queries made by authenticated users. Used for history display and search suggestions.';

-- Index for fast per-user chronological lookup (most common query pattern)
create index if not exists idx_search_history_user_time
  on public.search_history(user_id, searched_at desc);

-- ── Purchase Log ──────────────────────────────────────────────────────────────
-- Records products that a user explicitly marks as "purchased".

create table if not exists public.purchase_log (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  product_id    uuid        references public.products(id) on delete set null,
  -- Denormalized for display even if the product is later deleted
  product_name  text        not null,
  store_id      uuid        references public.stores(id) on delete set null,
  store_name    text        not null,
  price_paid    numeric(12, 2),   -- nullable: user may not remember the price
  purchased_at  timestamptz not null default now()
);

comment on table public.purchase_log is
  'Products explicitly marked as purchased by a user. Enables price-over-time analytics.';

-- Index for fast per-user purchase lookups
create index if not exists idx_purchase_log_user_time
  on public.purchase_log(user_id, purchased_at desc);

-- Index for per-product price history analytics
create index if not exists idx_purchase_log_product
  on public.purchase_log(product_id, purchased_at desc)
  where product_id is not null;

-- ── Row-Level Security ────────────────────────────────────────────────────────

alter table public.search_history enable row level security;
alter table public.purchase_log   enable row level security;

-- Users can only read/write their own rows
create policy "Users own their search history"
  on public.search_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users own their purchase log"
  on public.purchase_log for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

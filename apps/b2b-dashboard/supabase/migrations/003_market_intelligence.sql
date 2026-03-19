-- ============================================================
-- Nearbit B2B — Market Intelligence (Migration 003)
-- Adds competitor price data + cached AI product matching.
-- Requires: pgvector extension already enabled (from B2C schema).
-- Safe to re-run: all statements use IF NOT EXISTS guards.
-- ============================================================

-- ============================================================
-- 1. GLOBAL_MARKET_PRICES
--    Populated by the B2C scraper for chains like Rami Levy,
--    Shufersal, Victory, etc. This table is read-only for B2B.
-- ============================================================
create table if not exists public.global_market_prices (
  id          bigserial       primary key,
  store_id    uuid            not null references public.stores(id) on delete cascade,
  barcode     text,
  name_he     text            not null,
  name_en     text,
  price       numeric(12, 2)  not null,
  chain       text,           -- 'Rami Levy' | 'Shufersal' | 'Victory' | ...
  city        text,           -- 'Beer Sheva' | 'Tel Aviv' | ...
  lat         double precision,
  lng         double precision,
  scraped_at  timestamptz     not null default now(),
  -- OpenAI text-embedding-3-small (1536 dims) for vector similarity matching
  embedding   vector(1536)
);

create index if not exists idx_gmp_barcode
  on public.global_market_prices(barcode)
  where barcode is not null;

create index if not exists idx_gmp_city
  on public.global_market_prices(city);

create index if not exists idx_gmp_store_id
  on public.global_market_prices(store_id);

-- IVFFlat index for ANN vector search (tune lists = sqrt(row_count))
create index if not exists idx_gmp_embedding
  on public.global_market_prices using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ============================================================
-- 2. PRODUCT_MATCHES
--    Caches the result of each AI/barcode matching operation.
--    "Heavy" vector/LLM search runs once per new product;
--    subsequent page loads read from this cache.
-- ============================================================
create table if not exists public.product_matches (
  id                    bigserial   primary key,
  merchant_product_id   uuid        not null references public.products(id) on delete cascade,
  market_price_id       bigint      not null references public.global_market_prices(id) on delete cascade,
  match_method          text        not null check (match_method in ('barcode', 'vector', 'llm')),
  confidence            float       check (confidence between 0 and 1),
  matched_at            timestamptz not null default now(),
  unique (merchant_product_id, market_price_id)
);

create index if not exists idx_pm_merchant_product
  on public.product_matches(merchant_product_id);

-- ============================================================
-- 3. RPC — get_market_comparison
--    Returns best price, market average, and top-3 competitor
--    details for every product of a given store.
--
--    Priority:
--      1. Barcode exact match (inline join)
--      2. Cached AI match via product_matches
--
--    p_city: optional city filter (Beer Sheva, Tel Aviv, …)
-- ============================================================
create or replace function public.get_market_comparison(
  p_store_id  uuid,
  p_city      text  default null,
  p_limit     int   default 200
)
returns table (
  product_id        uuid,
  best_price        numeric,
  best_chain        text,
  market_avg        numeric,
  competitor_count  int,
  competitors       jsonb   -- [{chain, city, price}, …] up to 3
)
language sql
stable
as $$
  with
  -- All active products for this merchant store
  merchant as (
    select id, barcode, name_he
    from   public.products
    where  store_id = p_store_id
      and  is_available = true
  ),

  -- Barcode-based market candidates
  barcode_matches as (
    select
      m.id   as product_id,
      gmp.id as gmp_id,
      gmp.price,
      gmp.chain,
      gmp.city
    from merchant m
    join public.global_market_prices gmp
      on  gmp.barcode = m.barcode
      and gmp.barcode is not null
      and (p_city is null or lower(gmp.city) = lower(p_city))
  ),

  -- Cached AI / vector matches (LLM or pgvector, stored in product_matches)
  ai_matches as (
    select
      pm.merchant_product_id as product_id,
      gmp.id                 as gmp_id,
      gmp.price,
      gmp.chain,
      gmp.city
    from public.product_matches pm
    join public.global_market_prices gmp
      on  gmp.id = pm.market_price_id
      and (p_city is null or lower(gmp.city) = lower(p_city))
    where pm.merchant_product_id in (select id from merchant)
  ),

  -- Union both sources; barcode matches take priority (dedup by product+gmp_id)
  all_matches as (
    select product_id, gmp_id, price, chain, city from barcode_matches
    union
    select product_id, gmp_id, price, chain, city from ai_matches
  ),

  -- Aggregate per merchant product
  agg as (
    select
      product_id,
      min(price)                          as best_price,
      (array_agg(chain order by price))[1] as best_chain,
      round(avg(price)::numeric, 2)       as market_avg,
      count(distinct gmp_id)::int         as competitor_count,
      -- Collect all competitor details, keep cheapest per chain, limit 3
      (
        select jsonb_agg(row_data order by (row_data->>'price')::numeric)
        from (
          select distinct on (sub.chain)
            jsonb_build_object(
              'chain', sub.chain,
              'city',  sub.city,
              'price', sub.price
            ) as row_data
          from (
            select chain, city, price
            from all_matches am2
            where am2.product_id = am.product_id
            order by chain, price
          ) sub
          limit 3
        ) top3
      ) as competitors
    from all_matches am
    group by product_id
  )

  select
    product_id,
    best_price,
    best_chain,
    market_avg,
    competitor_count,
    coalesce(competitors, '[]'::jsonb) as competitors
  from agg
  limit p_limit;
$$;

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

-- global_market_prices: read-only for all authenticated users
alter table public.global_market_prices enable row level security;

drop policy if exists "Authenticated users can read market prices" on public.global_market_prices;
create policy "Authenticated users can read market prices"
  on public.global_market_prices for select
  using (auth.role() = 'authenticated');

-- product_matches: each store owner manages their own matches
alter table public.product_matches enable row level security;

drop policy if exists "Owner can read own product matches" on public.product_matches;
create policy "Owner can read own product matches"
  on public.product_matches for select
  using (
    exists (
      select 1
      from   public.products p
      join   public.stores   s on s.id = p.store_id
      where  p.id  = product_matches.merchant_product_id
        and  s.owner_id = auth.uid()
    )
  );

drop policy if exists "Owner can insert own product matches" on public.product_matches;
create policy "Owner can insert own product matches"
  on public.product_matches for insert
  with check (
    exists (
      select 1
      from   public.products p
      join   public.stores   s on s.id = p.store_id
      where  p.id  = product_matches.merchant_product_id
        and  s.owner_id = auth.uid()
    )
  );

drop policy if exists "Owner can update own product matches" on public.product_matches;
create policy "Owner can update own product matches"
  on public.product_matches for update
  using (
    exists (
      select 1
      from   public.products p
      join   public.stores   s on s.id = p.store_id
      where  p.id  = product_matches.merchant_product_id
        and  s.owner_id = auth.uid()
    )
  );

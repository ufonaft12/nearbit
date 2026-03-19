-- ============================================================
-- Nearbit B2B — Market Intelligence (Migration 003) [v2]
-- Uses the EXISTING products table for competitor prices.
-- No separate global_market_prices needed — the B2C scraper
-- already populates products for all chains (Rami Levy,
-- Shufersal, Victory, etc.) with store_id references.
-- ============================================================

-- ============================================================
-- 1. PRODUCT_MATCHES — cached AI/vector match results
--    Maps merchant product → closest competitor product.
--    Heavy matching (LLM / pgvector) runs ONCE per new product
--    (only for products with no barcode); all subsequent page
--    loads read from this cache.
-- ============================================================
create table if not exists public.product_matches (
  id                      bigserial   primary key,
  merchant_product_id     uuid        not null references public.products(id) on delete cascade,
  competitor_product_id   uuid        not null references public.products(id) on delete cascade,
  match_method            text        not null check (match_method in ('barcode', 'vector', 'llm')),
  confidence              float       check (confidence between 0 and 1),
  matched_at              timestamptz not null default now(),
  unique (merchant_product_id, competitor_product_id)
);

create index if not exists idx_pm_merchant_product
  on public.product_matches(merchant_product_id);

-- ============================================================
-- 2. RPC — get_market_comparison
--
--    For every product of the merchant's store, returns:
--      best_price, best_chain, market_avg, competitor_count,
--      up to 3 competitor details [{chain, city, price}]
--
--    Match strategy (in priority order):
--      FAST PATH  — barcode exact join against competitor stores
--      LAZY PATH  — pre-cached matches from product_matches
--                   (populated by the TS matcher utility;
--                    only used for products that have NO barcode)
--
--    p_city: optional filter — e.g. 'Beer Sheva'
--            NULL = all active competitor stores in DB
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
  competitors       jsonb
)
language sql
stable
as $$
  with
  -- Merchant's own active products
  merchant as (
    select id, barcode, name_he
    from   public.products
    where  store_id    = p_store_id
      and  is_available = true
  ),

  -- Active competitor stores (same city when filter provided)
  competitor_stores as (
    select id, chain, city
    from   public.stores
    where  id        != p_store_id
      and  is_active  = true
      and  (p_city is null or lower(city) = lower(p_city))
  ),

  -- ── FAST PATH: barcode exact match ──────────────────────────
  -- Covers ~80 % of products with barcodes. Pure index scan,
  -- zero tokens, runs in milliseconds for 3 000 products.
  barcode_hits as (
    select
      m.id           as product_id,
      cp.price,
      cs.chain,
      cs.city,
      cp.updated_at  as price_updated_at   -- for staleness display in UI
    from   merchant m
    join   public.products cp
      on   cp.barcode    = m.barcode
      and  m.barcode     is not null
      and  cp.store_id  != p_store_id
      and  cp.is_available = true
    join   competitor_stores cs on cs.id = cp.store_id
  ),

  -- ── LAZY PATH: cached AI / pgvector matches ─────────────────
  -- Only used for products WITHOUT a barcode.
  -- The TypeScript utility (market-matcher.ts) populates this
  -- table asynchronously; the RPC just reads the cache.
  cached_hits as (
    select
      pm.merchant_product_id as product_id,
      cp.price,
      cs.chain,
      cs.city,
      cp.updated_at          as price_updated_at
    from   public.product_matches pm
    join   public.products cp
      on   cp.id = pm.competitor_product_id
      and  cp.is_available = true
    join   competitor_stores cs on cs.id = cp.store_id
    -- Guard: only apply cached matches to products that truly lack a barcode
    where  exists (
      select 1 from merchant m
      where  m.id      = pm.merchant_product_id
        and  m.barcode is null
    )
  ),

  -- Union both paths (barcode_hits already deduplicated by join semantics)
  all_hits as (
    select product_id, price, chain, city, price_updated_at from barcode_hits
    union
    select product_id, price, chain, city, price_updated_at from cached_hits
  ),

  -- Aggregate per merchant product
  agg as (
    select
      product_id,
      min(price)                           as best_price,
      (array_agg(chain order by price))[1] as best_chain,
      round(avg(price)::numeric, 2)        as market_avg,
      count(distinct (chain, city))::int   as competitor_count,
      -- Top-3 competitors: one row per chain, cheapest first
      -- Includes price_updated_at so UI can show "2 hours ago"
      (
        select jsonb_agg(row_data order by (row_data->>'price')::numeric)
        from (
          select distinct on (sub.chain)
            jsonb_build_object(
              'chain',             sub.chain,
              'city',              sub.city,
              'price',             sub.price,
              'price_updated_at',  sub.price_updated_at
            ) as row_data
          from (
            select chain, city, price, price_updated_at
            from   all_hits h2
            where  h2.product_id = a.product_id
            order  by chain, price
          ) sub
          limit 3
        ) top3
      ) as competitors
    from all_hits a
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
-- 3. RPC — find_competitor_matches
--    pgvector ANN search scoped to competitor stores only.
--    Used by market-matcher.ts Step 2.
--
--    Advantages over the generic search_products() RPC:
--      • Excludes the merchant's own store at DB level
--      • Optionally filters by city (Beersheba-factor)
--      • Returns chain / city / unit so the LLM can validate volume
--      • Supports a configurable similarity threshold
-- ============================================================
create or replace function public.find_competitor_matches(
  p_query_embedding    vector(1536),
  p_merchant_store_id  uuid,
  p_city               text    default null,
  p_threshold          float   default 0.60,
  p_count              int     default 5
)
returns table (
  id          uuid,
  store_id    uuid,
  chain       text,
  city        text,
  name_he     text,
  name_en     text,
  name_ru     text,
  price       numeric,
  unit        text,
  updated_at  timestamptz,
  similarity  float
)
language sql
stable
as $$
  select
    p.id,
    p.store_id,
    s.chain,
    s.city,
    p.name_he,
    p.name_en,
    p.name_ru,
    p.price,
    p.unit,
    p.updated_at,
    1 - (p.embedding <=> p_query_embedding) as similarity
  from   public.products p
  join   public.stores   s on s.id = p.store_id
  where  p.store_id        != p_merchant_store_id
    and  p.is_available     = true
    and  s.is_active        = true
    and  p.embedding        is not null
    and  (p_city is null or lower(s.city) = lower(p_city))
    and  1 - (p.embedding <=> p_query_embedding) > p_threshold
  order  by p.embedding <=> p_query_embedding
  limit  p_count;
$$;

-- ============================================================
-- 4. RLS for product_matches
-- ============================================================
alter table public.product_matches enable row level security;

drop policy if exists "Owner can read own product matches" on public.product_matches;
create policy "Owner can read own product matches"
  on public.product_matches for select
  using (
    exists (
      select 1
      from   public.products p
      join   public.stores   s on s.id = p.store_id
      where  p.id = product_matches.merchant_product_id
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
      where  p.id = product_matches.merchant_product_id
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
      where  p.id = product_matches.merchant_product_id
        and  s.owner_id = auth.uid()
    )
  );

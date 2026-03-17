-- ============================================================
-- Nearbit MVP – Initial Schema
-- Requires: pg_vector extension (available in Supabase by default)
-- ============================================================

-- Enable pgvector
create extension if not exists vector with schema extensions;

-- ============================================================
-- STORES
-- Represents a physical retail location (makolet / small shop)
-- ============================================================
create table if not exists public.stores (
  id           uuid primary key default gen_random_uuid(),
  name         text        not null,
  slug         text        not null unique,               -- URL-friendly identifier
  owner_id     uuid        references auth.users(id) on delete set null,
  address      text,
  city         text,
  phone        text,
  -- POS integration
  pos_provider text        check (pos_provider in ('morning', 'green_invoice', 'manual', 'other')),
  pos_store_id text,                                      -- External ID from the POS system
  -- Metadata
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.stores is
  'Retail stores (makolot) integrated with Nearbit. Each store belongs to an owner and is connected to a POS system.';

-- ============================================================
-- PRODUCTS
-- Normalized product catalog per store with vector embeddings
-- ============================================================
create table if not exists public.products (
  id                uuid        primary key default gen_random_uuid(),
  store_id          uuid        not null references public.stores(id) on delete cascade,
  -- Raw POS data (preserved as-is for auditing)
  pos_item_id       text        not null,                 -- ID from the POS system
  raw_name          text        not null,                 -- Original name from POS
  raw_price         numeric(12, 2),                       -- Price as received
  raw_quantity      numeric(12, 3),                       -- Stock quantity as received
  raw_unit          text,                                 -- Unit string from POS (kg, pcs, etc.)
  raw_barcode       text,
  -- Normalized / LLM-enriched data
  name_he           text,                                 -- Normalized Hebrew name
  name_ru           text,                                 -- Russian transliteration / name
  name_en           text,                                 -- English transliteration / name
  normalized_name   text generated always as (
                      coalesce(name_he, name_en, raw_name)
                    ) stored,                             -- Primary display name (computed)
  category          text,                                 -- LLM-assigned category
  price             numeric(12, 2),                       -- Canonical price (ILS)
  quantity          numeric(12, 3),                       -- Canonical stock
  unit              text        check (unit in ('kg', 'g', 'liter', 'ml', 'pcs', 'pack', 'other')),
  barcode           text,
  -- Vector embedding (text-embedding-3-small → 1536 dims)
  embedding         vector(1536),
  -- Sync tracking
  last_synced_at    timestamptz not null default now(),
  sync_hash         text,                                 -- SHA-256 of raw payload to detect changes
  is_available      boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- One product record per POS item per store
  unique (store_id, pos_item_id)
);

comment on table public.products is
  'Product catalog synced from POS systems. Each row contains raw POS data, LLM-normalized multilingual names, and a pgvector embedding for semantic search.';

comment on column public.products.embedding is
  'text-embedding-3-small (1536-dim) vector generated from: "{normalized_name} {category} {unit}"';

-- ============================================================
-- INDEXES
-- ============================================================

-- Fast store lookups
create index if not exists idx_products_store_id   on public.products(store_id);
create index if not exists idx_products_barcode    on public.products(barcode) where barcode is not null;
create index if not exists idx_products_available  on public.products(store_id, is_available);

-- IVFFlat index for approximate nearest-neighbor search on embeddings
-- lists = sqrt(expected_row_count); tune after data grows
create index if not exists idx_products_embedding
  on public.products
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ============================================================
-- UPDATED_AT TRIGGER (reusable function)
-- ============================================================
create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_stores_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
alter table public.stores   enable row level security;
alter table public.products enable row level security;

-- Public read access for active stores and their products
create policy "Public can read active stores"
  on public.stores for select
  using (is_active = true);

create policy "Public can read available products"
  on public.products for select
  using (
    is_available = true
    and exists (
      select 1 from public.stores s
      where s.id = store_id and s.is_active = true
    )
  );

-- Owners can manage their own store
create policy "Store owner full access"
  on public.stores for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Owners can manage products in their store
create policy "Store owner manages products"
  on public.products for all
  using (
    exists (
      select 1 from public.stores s
      where s.id = store_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.stores s
      where s.id = store_id and s.owner_id = auth.uid()
    )
  );

-- ============================================================
-- SEMANTIC SEARCH FUNCTION
-- Returns products ordered by cosine similarity to a query vector
-- ============================================================
create or replace function public.search_products(
  query_embedding  vector(1536),
  store_id_filter  uuid     default null,
  match_threshold  float    default 0.3,
  match_count      int      default 20
)
returns table (
  id              uuid,
  store_id        uuid,
  normalized_name text,
  name_he         text,
  name_ru         text,
  name_en         text,
  category        text,
  price           numeric,
  quantity        numeric,
  unit            text,
  barcode         text,
  similarity      float
)
language sql stable
as $$
  select
    p.id,
    p.store_id,
    p.normalized_name,
    p.name_he,
    p.name_ru,
    p.name_en,
    p.category,
    p.price,
    p.quantity,
    p.unit,
    p.barcode,
    1 - (p.embedding <=> query_embedding) as similarity
  from public.products p
  join public.stores s on s.id = p.store_id
  where
    p.is_available = true
    and s.is_active  = true
    and p.embedding  is not null
    and (store_id_filter is null or p.store_id = store_id_filter)
    and 1 - (p.embedding <=> query_embedding) > match_threshold
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

comment on function public.search_products is
  'Semantic nearest-neighbor search over product embeddings using cosine distance. Pass store_id_filter to restrict to a single store.';

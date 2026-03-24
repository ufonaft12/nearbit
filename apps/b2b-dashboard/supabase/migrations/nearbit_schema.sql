-- ============================================================
-- Nearbit – Complete Schema (B2C + B2B)
-- Single source of truth. Safe to re-run on any state:
--   • Fresh DB      → creates everything from scratch
--   • B2C DB only   → adds B2B tables / columns, skips existing ones
--   • Fully migrated → all IF NOT EXISTS / DROP IF EXISTS guards are no-ops
-- ============================================================

-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
create extension if not exists vector with schema extensions;

-- ============================================================
-- 1. STORES
-- ============================================================
create table if not exists public.stores (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  slug         text        not null unique,
  owner_id     uuid        references auth.users(id) on delete set null,
  address      text,
  city         text,
  phone        text,
  pos_provider text        check (pos_provider in ('morning', 'green_invoice', 'manual', 'other')),
  pos_store_id text,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Add columns that may not exist yet (safe on existing DB, no-op if already present)
alter table public.stores add column if not exists lat      double precision;
alter table public.stores add column if not exists lng      double precision;
alter table public.stores add column if not exists name_heb text;
alter table public.stores add column if not exists chain    text;
alter table public.stores add column if not exists logo_url text;

-- Comments run after ALTER so columns are guaranteed to exist
comment on table  public.stores          is 'Retail stores (makolot) integrated with Nearbit.';
comment on column public.stores.lat      is 'WGS-84 latitude  (decimal degrees)';
comment on column public.stores.lng      is 'WGS-84 longitude (decimal degrees)';
comment on column public.stores.name_heb is 'Hebrew display name set by the merchant via the B2B dashboard.';
comment on column public.stores.chain    is 'Supermarket chain the store belongs to (optional).';

-- ============================================================
-- 2. CATEGORIES (B2B)
-- Global categories have store_id IS NULL.
-- Store owners can add custom categories scoped to their store.
-- ============================================================
create table if not exists public.categories (
  id         serial      primary key,
  name_heb   text        not null,
  name_ru    text,
  name_en    text        not null,
  icon       text,
  store_id   uuid        references public.stores(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Seed global categories — skipped if any global rows already exist
insert into public.categories (name_heb, name_ru, name_en, icon)
select * from (values
  ('פירות וירקות',   'Фрукты и овощи',    'Fruits & Vegetables', '🥦'),
  ('מוצרי חלב',      'Молочные продукты',  'Dairy',               '🥛'),
  ('בשר ועוף',       'Мясо и птица',       'Meat & Poultry',      '🥩'),
  ('לחם ומאפים',     'Хлеб и выпечка',     'Bread & Bakery',      '🍞'),
  ('משקאות',         'Напитки',            'Beverages',           '🧃'),
  ('שימורים',        'Консервы',           'Canned Goods',        '🥫'),
  ('חטיפים וממתקים', 'Снеки и סלדостי',   'Snacks & Sweets',     '🍫'),
  ('ניקיון',         'Чистящие средства',  'Cleaning',            '🧹'),
  ('טיפוח אישי',    'Личная гигиена',     'Personal Care',       '🧴'),
  ('קפואים',         'Замороженные',       'Frozen',              '🧊'),
  ('אחר',            'Другое',             'Other',               '📦')
) as v(name_heb, name_ru, name_en, icon)
where not exists (select 1 from public.categories where store_id is null);

-- ============================================================
-- 3. PRODUCTS
-- ============================================================
create table if not exists public.products (
  id              uuid        primary key default gen_random_uuid(),
  store_id        uuid        not null references public.stores(id) on delete cascade,
  -- Raw POS data
  pos_item_id     text        not null,
  raw_name        text        not null,
  raw_price       numeric(12, 2),
  raw_quantity    numeric(12, 3),
  raw_unit        text,
  raw_barcode     text,
  -- Normalized / LLM-enriched
  name_he         text,
  name_ru         text,
  name_en         text,
  normalized_name text generated always as (coalesce(name_he, name_en, raw_name)) stored,
  category        text,
  price           numeric(12, 2),
  quantity        numeric(12, 3),
  unit            text check (unit in ('kg', 'g', 'liter', 'ml', 'pcs', 'pack', 'other')),
  barcode         text,
  -- Vector embedding
  embedding       vector(1536),
  -- Sync tracking
  last_synced_at  timestamptz not null default now(),
  sync_hash       text,
  is_available    boolean     not null default true,
  -- B2B additions
  category_id     integer     references public.categories(id),
  sale_price      numeric(12, 2),
  sale_until      date,
  image_url       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (store_id, pos_item_id)
);

-- Add columns that may not exist yet (safe on existing DB, no-op if already present)
alter table public.products add column if not exists category_id integer references public.categories(id);
alter table public.products add column if not exists sale_price  numeric(12, 2);
alter table public.products add column if not exists sale_until  date;
alter table public.products add column if not exists image_url   text;

-- Comments run after ALTER so columns are guaranteed to exist
comment on table  public.products              is 'Product catalog synced from POS + managed via B2B dashboard.';
comment on column public.products.embedding    is 'text-embedding-3-small (1536-dim) from "{normalized_name} {category} {unit}"';
comment on column public.products.category_id  is 'B2B category FK — supplements the free-text `category` set by the LLM.';
comment on column public.products.sale_price   is 'Promotional price set by the merchant. NULL = no active sale.';
comment on column public.products.sale_until   is 'Date after which sale_price is no longer valid.';

-- ============================================================
-- 4. INDEXES
-- ============================================================
create index if not exists idx_products_store_id      on public.products(store_id);
create index if not exists idx_products_barcode       on public.products(barcode)      where barcode is not null;
create index if not exists idx_products_available     on public.products(store_id, is_available);
create index if not exists idx_products_category_id   on public.products(category_id);

-- Partial unique index used by B2B CSV upserts keyed on barcode
create unique index if not exists idx_products_store_barcode
  on public.products(store_id, barcode)
  where barcode is not null;

-- IVFFlat for approximate nearest-neighbor search on embeddings
create index if not exists idx_products_embedding
  on public.products
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ============================================================
-- 5. SHOPPING LISTS (B2C)
-- Stores user shopping lists. user_id is text (supports anonymous sessions).
-- ============================================================
create table if not exists public.shopping_lists (
  id         uuid        primary key default gen_random_uuid(),
  user_id    text        null,
  name       text        not null,
  items      jsonb       not null,
  created_at timestamptz default now()
);

-- ============================================================
-- 6. PRICE HISTORY (B2B)
-- Immutable audit log for price changes made via the B2B dashboard.
-- POS sync changes are handled by the B2C app and are not logged here.
-- ============================================================
create table if not exists public.price_history (
  id          bigserial   primary key,
  product_id  uuid        not null references public.products(id) on delete cascade,
  store_id    uuid        not null references public.stores(id)   on delete cascade,
  old_price   numeric(12, 2),
  new_price   numeric(12, 2) not null,
  changed_by  uuid        references auth.users(id),
  source      text        not null default 'b2b_manual',  -- 'b2b_manual' | 'b2b_csv'
  recorded_at timestamptz not null default now()
);

create index if not exists idx_price_history_product_id  on public.price_history(product_id);
create index if not exists idx_price_history_store_id    on public.price_history(store_id);
create index if not exists idx_price_history_recorded_at on public.price_history(recorded_at desc);

-- ============================================================
-- 7. TRIGGERS
-- ============================================================

-- Reusable updated_at stamper
create or replace function public.set_updated_at()
  returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stores_updated_at   on public.stores;
drop trigger if exists trg_products_updated_at on public.products;

create trigger trg_stores_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- Price-change audit trigger
-- Runs AFTER UPDATE OF price — only when the price column actually changes.
-- SECURITY DEFINER lets the function insert into price_history even though
-- RLS on that table restricts direct inserts to store owners only.
-- auth.uid() inside a trigger returns the authenticated user who triggered
-- the UPDATE (i.e. the merchant via the Server Action / Supabase client).
-- For upserts from the Excel upload action the source will be 'trigger_auto';
-- the Server Action itself never writes to price_history directly.

-- Drop the old function name if it exists (renamed in this migration)
drop trigger if exists trg_b2b_price_change    on public.products;
drop function if exists public.b2b_log_price_change();

create or replace function public.log_price_change()
  returns trigger language plpgsql security definer
as $$
begin
  -- IS DISTINCT FROM handles NULL correctly (NULL → value is a change)
  if new.price is distinct from old.price then
    insert into public.price_history
      (product_id, store_id, old_price, new_price, changed_by, source)
    values
      (new.id, new.store_id, old.price, new.price, auth.uid(), 'trigger_auto');
  end if;
  return new;
end;
$$;

-- Drop old trigger name guard (idempotent re-runs)
drop trigger if exists trigger_log_price_change on public.products;

create trigger trigger_log_price_change
  after update of price on public.products
  for each row execute function public.log_price_change();

-- ============================================================
-- 8. ROW-LEVEL SECURITY
-- ============================================================
alter table public.stores          enable row level security;
alter table public.products        enable row level security;
alter table public.categories      enable row level security;
alter table public.price_history   enable row level security;
alter table public.shopping_lists  enable row level security;

-- SHOPPING LISTS — owners read/write their own lists (matched by user_id text)
drop policy if exists "User can manage own shopping lists" on public.shopping_lists;
create policy "User can manage own shopping lists"
  on public.shopping_lists for all
  using     (user_id = coalesce(auth.uid()::text, user_id))
  with check (user_id = coalesce(auth.uid()::text, user_id));

-- STORES
drop policy if exists "Public can read active stores"  on public.stores;
drop policy if exists "Store owner full access"        on public.stores;

create policy "Public can read active stores"
  on public.stores for select
  using (is_active = true);

create policy "Store owner full access"
  on public.stores for all
  using     (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- PRODUCTS
drop policy if exists "Public can read available products" on public.products;
drop policy if exists "Store owner manages products"       on public.products;

create policy "Public can read available products"
  on public.products for select
  using (
    is_available = true
    and exists (
      select 1 from public.stores s
      where s.id = store_id and s.is_active = true
    )
  );

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

-- CATEGORIES
drop policy if exists "Public can read global categories" on public.categories;
drop policy if exists "Owner can manage store categories" on public.categories;

create policy "Public can read global categories"
  on public.categories for select
  using (store_id is null);

create policy "Owner can manage store categories"
  on public.categories for all
  using (
    store_id is null
    or exists (
      select 1 from public.stores
      where stores.id = categories.store_id
        and stores.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.stores
      where stores.id = categories.store_id
        and stores.owner_id = auth.uid()
    )
  );

-- PRICE HISTORY (append-only for owners)
drop policy if exists "Store owner can view price history"   on public.price_history;
drop policy if exists "Store owner can insert price history" on public.price_history;

create policy "Store owner can view price history"
  on public.price_history for select
  using (
    exists (
      select 1 from public.stores
      where stores.id = price_history.store_id
        and stores.owner_id = auth.uid()
    )
  );

create policy "Store owner can insert price history"
  on public.price_history for insert
  with check (
    exists (
      select 1 from public.stores
      where stores.id = price_history.store_id
        and stores.owner_id = auth.uid()
    )
  );

-- ============================================================
-- 9. SEMANTIC SEARCH FUNCTIONS (B2C)
-- ============================================================
create or replace function public.search_products(
  query_embedding  vector(1536),
  store_id_filter  uuid    default null,
  match_threshold  float   default 0.3,
  match_count      int     default 20
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
language sql stable as $$
  select
    p.id, p.store_id, p.normalized_name,
    p.name_he, p.name_ru, p.name_en,
    p.category, p.price, p.quantity, p.unit, p.barcode,
    1 - (p.embedding <=> query_embedding) as similarity
  from public.products p
  join public.stores   s on s.id = p.store_id
  where
    p.is_available = true
    and s.is_active = true
    and p.embedding is not null
    and (store_id_filter is null or p.store_id = store_id_filter)
    and 1 - (p.embedding <=> query_embedding) > match_threshold
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

comment on function public.search_products is
  'Semantic nearest-neighbor search over product embeddings. Pass store_id_filter to restrict to a single store.';

-- Supabase RPC alias (no store filter) — for JS client usage
create or replace function public.match_products(
  query_embedding  vector(1536),
  match_threshold  float  default 0.3,
  match_count      int    default 20
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
language sql stable as $$
  select
    p.id, p.store_id, p.normalized_name,
    p.name_he, p.name_ru, p.name_en,
    p.category, p.price, p.quantity, p.unit, p.barcode,
    1 - (p.embedding <=> query_embedding) as similarity
  from public.products p
  join public.stores   s on s.id = p.store_id
  where
    p.is_available = true
    and s.is_active = true
    and p.embedding is not null
    and 1 - (p.embedding <=> query_embedding) > match_threshold
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

comment on function public.match_products is
  'Supabase RPC-compatible cosine similarity search. Use via supabase.rpc(''match_products'', {...}).';

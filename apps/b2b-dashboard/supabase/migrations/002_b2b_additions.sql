-- ============================================================
-- Nearbit B2B Merchant Dashboard – Additive Migration
-- Runs AFTER the B2C base schema (stores + products already exist).
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS guards.
-- ============================================================

-- ============================================================
-- 1. STORES — add B2B-specific columns
-- ============================================================
alter table public.stores
  add column if not exists name_heb  text,        -- Hebrew store name (B2B display)
  add column if not exists chain     text,         -- e.g. "Shufersal", "Rami Levy"
  add column if not exists logo_url  text;

comment on column public.stores.name_heb is 'Hebrew display name for the store, set by the merchant via the B2B dashboard.';
comment on column public.stores.chain   is 'Supermarket chain the store belongs to (optional).';

-- ============================================================
-- 2. CATEGORIES — B2B taxonomy table
-- Stores can use global categories (store_id IS NULL) or add custom ones.
-- ============================================================
create table if not exists public.categories (
  id          serial primary key,
  name_heb    text not null,
  name_ru     text,
  name_en     text not null,
  icon        text,
  store_id    uuid references public.stores(id) on delete cascade, -- null = global
  created_at  timestamptz not null default now()
);

-- Seed global categories (only if table is empty)
insert into public.categories (name_heb, name_ru, name_en, icon)
select * from (values
  ('פירות וירקות',   'Фрукты и овощи',    'Fruits & Vegetables', '🥦'),
  ('מוצרי חלב',      'Молочные продукты',  'Dairy',               '🥛'),
  ('בשר ועוף',       'Мясо и птица',       'Meat & Poultry',      '🥩'),
  ('לחם ומאפים',     'Хлеб и выпечка',     'Bread & Bakery',      '🍞'),
  ('משקאות',         'Напитки',            'Beverages',           '🧃'),
  ('שימורים',        'Консервы',           'Canned Goods',        '🥫'),
  ('חטיפים וממתקים', 'Снеки и сладости',   'Snacks & Sweets',     '🍫'),
  ('ניקיון',         'Чистящие средства',  'Cleaning',            '🧹'),
  ('טיפוח אישי',    'Личная гигиена',     'Personal Care',       '🧴'),
  ('קפואים',         'Замороженные',       'Frozen',              '🧊'),
  ('אחר',            'Другое',             'Other',               '📦')
) as v(name_heb, name_ru, name_en, icon)
where not exists (select 1 from public.categories where store_id is null);

-- RLS
alter table public.categories enable row level security;

-- Anyone can read global categories
drop policy if exists "Public can read global categories" on public.categories;
create policy "Public can read global categories"
  on public.categories for select
  using (store_id is null);

-- Store owners can read + manage their store's custom categories
drop policy if exists "Owner can manage store categories" on public.categories;
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

-- ============================================================
-- 3. PRODUCTS — add B2B-specific columns
-- B2C columns already present: name_he, name_ru, name_en, price,
--   pos_item_id, raw_name, raw_price, barcode, is_available, etc.
-- ============================================================
alter table public.products
  add column if not exists category_id  integer references public.categories(id),
  add column if not exists sale_price   numeric(12, 2),
  add column if not exists sale_until   date,
  add column if not exists image_url    text;

comment on column public.products.category_id is 'B2B category FK. Supplements the free-text `category` column set by the LLM in B2C.';
comment on column public.products.sale_price  is 'Promotional price set by the merchant. NULL = no active sale.';
comment on column public.products.sale_until  is 'Date after which sale_price is no longer valid.';

-- Partial unique index on barcode for B2B upserts
-- (The base unique constraint is on (store_id, pos_item_id); barcode is
--  supplementary — used when the merchant uploads CSV without a pos_item_id.)
create unique index if not exists idx_products_store_barcode
  on public.products(store_id, barcode)
  where barcode is not null;

-- Index for category lookups
create index if not exists idx_products_category_id
  on public.products(category_id);

-- ============================================================
-- 4. PRICE HISTORY — immutable audit log (B2B-managed)
-- Tracks manual price changes made through the B2B dashboard.
-- B2C POS sync changes are NOT recorded here (handled by the B2C app).
-- ============================================================
create table if not exists public.price_history (
  id          bigserial primary key,
  product_id  uuid        not null references public.products(id) on delete cascade,
  store_id    uuid        not null references public.stores(id)   on delete cascade,
  old_price   numeric(12, 2),
  new_price   numeric(12, 2) not null,
  changed_by  uuid        references auth.users(id),
  source      text        not null default 'b2b_manual',  -- 'b2b_manual' | 'b2b_csv'
  recorded_at timestamptz not null default now()
);

create index if not exists idx_price_history_product_id   on public.price_history(product_id);
create index if not exists idx_price_history_store_id     on public.price_history(store_id);
create index if not exists idx_price_history_recorded_at  on public.price_history(recorded_at desc);

alter table public.price_history enable row level security;

-- Store owners can view their history (append-only: no update/delete)
drop policy if exists "Store owner can view price history" on public.price_history;
create policy "Store owner can view price history"
  on public.price_history for select
  using (
    exists (
      select 1 from public.stores
      where stores.id = price_history.store_id
        and stores.owner_id = auth.uid()
    )
  );

drop policy if exists "Store owner can insert price history" on public.price_history;
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
-- 5. TRIGGER — auto-log price changes from the B2B dashboard
-- Uses a separate function name to avoid conflicts with B2C triggers.
-- ============================================================
create or replace function public.b2b_log_price_change()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only log if the canonical `price` column actually changed
  if new.price is distinct from old.price then
    insert into public.price_history
      (product_id, store_id, old_price, new_price, changed_by, source)
    values
      (new.id, new.store_id, old.price, new.price, auth.uid(), 'b2b_manual');
  end if;
  return new;
end;
$$;

-- Drop and recreate so it's idempotent
drop trigger if exists trg_b2b_price_change on public.products;

create trigger trg_b2b_price_change
  after update of price on public.products
  for each row
  execute function public.b2b_log_price_change();

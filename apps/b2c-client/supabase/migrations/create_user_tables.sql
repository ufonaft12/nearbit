-- ============================================================
-- Migration: Create user-facing tables for B2C auth features
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Tables:
--   profiles       — optional user address/city, upserted on save
--   search_history — every search query with result count
--   purchase_log   — user-recorded basket purchases for price analytics
--
-- All tables have RLS enabled: users see only their own rows.
-- ============================================================


-- ── 1. profiles ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  address    text        CHECK (char_length(address) <= 500),
  city       text        CHECK (char_length(city) <= 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: user sees own row"    ON public.profiles;
DROP POLICY IF EXISTS "profiles: user upserts own row" ON public.profiles;
DROP POLICY IF EXISTS "profiles: user updates own row" ON public.profiles;

CREATE POLICY "profiles: user sees own row"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "profiles: user upserts own row"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles: user updates own row"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);


-- ── 2. search_history ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.search_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query           text        NOT NULL,
  intent_confirmed bool       NOT NULL DEFAULT true,
  results_count   int         NOT NULL DEFAULT 0 CHECK (results_count >= 0),
  locale          text        NOT NULL DEFAULT 'he' CHECK (locale IN ('he', 'ru', 'en')),
  searched_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_history_user_searched
  ON public.search_history (user_id, searched_at DESC);

ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "search_history: user sees own rows"    ON public.search_history;
DROP POLICY IF EXISTS "search_history: user inserts own rows" ON public.search_history;

CREATE POLICY "search_history: user sees own rows"
  ON public.search_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "search_history: user inserts own rows"
  ON public.search_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ── 3. purchase_log ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.purchase_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id   uuid        REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text        NOT NULL,
  store_id     uuid        REFERENCES public.stores(id) ON DELETE SET NULL,
  store_name   text        NOT NULL,
  price_paid   numeric(10, 2),
  purchased_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_log_user_purchased
  ON public.purchase_log (user_id, purchased_at ASC);

ALTER TABLE public.purchase_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_log: user sees own rows"    ON public.purchase_log;
DROP POLICY IF EXISTS "purchase_log: user inserts own rows" ON public.purchase_log;

CREATE POLICY "purchase_log: user sees own rows"
  ON public.purchase_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "purchase_log: user inserts own rows"
  ON public.purchase_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);
